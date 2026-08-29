"""FastAPI frontend for VACARE.

Deliberately small: server-rendered HTML, no JavaScript build step, no client
framework. Run it with:

    python -m src.web        (or: uvicorn src.web:app --reload)

Every page is a thin view over the same modules the CLI uses.
"""

from __future__ import annotations

import tempfile
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
)
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from src import evidence_rules, gemini, intake_chat, lanes, packet as packet_view
from src.claim_intake import ClaimIntake
from src.models import (
    Branch,
    Claim,
    ClaimStatus,
    DischargeType,
    EvidenceType,
    LaneContext,
    Veteran,
)
from src.formfill import fill_526ez
from src.storage import DEFAULT_DB_PATH, ClaimStore

app = FastAPI(title="VACARE")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

DB_PATH = Path(DEFAULT_DB_PATH)


def store() -> ClaimStore:
    return ClaimStore(DB_PATH)


def parse_date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def checked(value: Optional[str]) -> bool:
    return value is not None


def claim_view(request: Request, claim: Claim, message: str = "") -> HTMLResponse:
    """Everything the claim dashboard needs, assembled in one place."""
    session = ClaimIntake(claim)
    session.evaluate_readiness()
    with store() as db:
        db.save_claim(claim)

    lane = lanes.determine_lane(claim.context)
    return templates.TemplateResponse(request, "claim.html", {
        "claim": claim,
        "message": message,
        "lane": lane,
        "lane_title": lanes.LANE_TITLES[lane],
        "lane_blurb": lanes.LANE_BLURBS[lane],
        "steps": lanes.build_sequence(claim),
        "deadlines": lanes.deadlines(claim),
        "third_party": lanes.third_party_dependencies(claim),
        "missing": session.missing_items(),
        "warnings": session.linkage_warnings(),
        "blockers": session.blockers(),
        "score": session.readiness_score(),
        "evidence_types": [e for e in EvidenceType if e is not EvidenceType.OTHER],
        "friendly": evidence_rules.friendly,
        "held": {item.evidence_type for item in claim.evidence},
    })


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    with store() as db:
        rows = db.list_claims()
    return templates.TemplateResponse(request, "home.html", {"claims": rows})


@app.get("/intake", response_class=HTMLResponse)
def intake_form(request: Request, error: str = "") -> HTMLResponse:
    return templates.TemplateResponse(request, "intake.html", {
        "error": error,
        "branches": [b.value for b in Branch],
        "discharges": [d.value for d in DischargeType],
        "today": date.today().isoformat(),
    })


@app.post("/intake")
async def submit_intake(request: Request) -> RedirectResponse:
    """One long form in, one claim out. Kept as raw form data so adding a
    question to the template does not require touching a signature here."""
    data = await request.form()

    def text(name: str) -> str:
        return str(data.get(name, "")).strip()

    def flag(name: str) -> bool:
        return data.get(name) is not None

    try:
        veteran = Veteran(
            first_name=text("first_name"),
            last_name=text("last_name"),
            dob=parse_date(text("dob")),
            email=text("email") or None,
            phone=text("phone") or None,
            branch=text("branch") or None,
            service_start=parse_date(text("service_start")),
            service_end=parse_date(text("service_end")),
            discharge_type=text("discharge_type") or DischargeType.UNKNOWN,
        )
    except (ValidationError, TypeError) as error:
        return RedirectResponse(f"/intake?error={_first_error(error)}", status_code=303)

    context = LaneContext(
        still_serving=flag("still_serving"),
        separation_date=parse_date(text("separation_date")),
        meb_referral=flag("meb_referral"),
        guard_or_reserve=flag("guard_or_reserve"),
        has_filed_before=flag("has_filed_before"),
        has_existing_rating=flag("has_existing_rating"),
        combined_rating=int(text("combined_rating")) if text("combined_rating").isdigit() else None,
        claiming_worse=flag("claiming_worse"),
        claiming_new=flag("claiming_new"),
        caused_by_rated_condition=flag("caused_by_rated_condition"),
        disagrees_with_decision=flag("disagrees_with_decision"),
        decision_date=parse_date(text("decision_date")),
        has_new_evidence=flag("has_new_evidence"),
        wants_judge=flag("wants_judge"),
        unemployable=flag("unemployable"),
        private_treatment=flag("private_treatment"),
        has_dependents=flag("has_dependents"),
        has_witness=flag("has_witness"),
        itf_filed_on=parse_date(text("itf_filed_on")),
        poa_filed_on=parse_date(text("poa_filed_on")),
        records_auth_signed_on=parse_date(text("records_auth_signed_on")),
    )

    session = ClaimIntake()
    claim = session.start_claim(veteran)
    claim.context = context

    event_id = None
    if text("event_title") and text("event_description"):
        try:
            event = session.add_service_event(
                title=text("event_title"),
                description=text("event_description"),
                event_date=parse_date(text("event_date")),
                location=text("event_location") or None,
                witnesses=text("event_witnesses") or None,
                documented_in_service_records=flag("event_documented"),
            )
            event_id = event.id
        except ValidationError as error:
            return RedirectResponse(f"/intake?error={_first_error(error)}", status_code=303)

    # Up to three conditions, numbered in the template.
    for index in range(1, 4):
        name = text(f"condition_{index}_name")
        if not name:
            continue
        try:
            session.add_condition(
                name=name,
                current_symptoms=text(f"condition_{index}_symptoms"),
                diagnosis=text(f"condition_{index}_diagnosis") or None,
                onset_date=parse_date(text(f"condition_{index}_onset")),
                started_in_service=flag(f"condition_{index}_started"),
                worsened_in_service=flag(f"condition_{index}_worsened"),
                currently_treated=flag(f"condition_{index}_treated"),
                service_event_id=event_id,
            )
        except ValidationError as error:
            return RedirectResponse(f"/intake?error={_first_error(error)}", status_code=303)

    if not claim.conditions:
        return RedirectResponse("/intake?error=Add at least one condition.", status_code=303)

    for evidence_type in EvidenceType:
        if flag(f"have_{evidence_type.value}"):
            session.add_evidence(evidence_type=evidence_type, source="veteran")

    session.evaluate_readiness()
    with store() as db:
        db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim.id}", status_code=303)


def _first_error(error: Exception) -> str:
    if isinstance(error, ValidationError):
        problem = error.errors()[0]
        field = str(problem["loc"][0]).replace("_", " ") if problem["loc"] else "input"
        return f"{field}: {problem['msg'].replace('Value error, ', '')}"
    return "Please check the dates - they must be YYYY-MM-DD."


@app.get("/claim/{claim_id}", response_class=HTMLResponse)
def claim_page(request: Request, claim_id: str, message: str = "") -> HTMLResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
    if claim is None:
        return RedirectResponse("/", status_code=303)
    return claim_view(request, claim, message)


@app.post("/claim/{claim_id}/evidence")
def add_evidence(claim_id: str, evidence_type: str = Form(...)) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim:
            ClaimIntake(claim).add_evidence(evidence_type=EvidenceType(evidence_type), source="veteran")
            ClaimIntake(claim).evaluate_readiness()
            db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Added+document", status_code=303)


@app.post("/claim/{claim_id}/status")
def set_status(claim_id: str, status: str = Form(...), note: str = Form("")) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim:
            claim.set_status(ClaimStatus(status), note or None)
            db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Status+updated", status_code=303)


@app.get("/claim/{claim_id}/packet", response_class=PlainTextResponse)
def packet(claim_id: str) -> str:
    with store() as db:
        claim = db.load_claim(claim_id)
    return packet_view.vso_packet(claim) if claim else "Claim not found."


@app.get("/forms", response_class=HTMLResponse)
def form_library(request: Request) -> HTMLResponse:
    from src.forms import all_forms
    return templates.TemplateResponse(request, "forms.html", {"forms": all_forms()})




# ---------------------------------------------------------------------------
# Conversational intake
# ---------------------------------------------------------------------------

# In-memory sessions, keyed by a cookie. Fine for a single-user MVP; a real
# deployment would put these in the database alongside the claim.
CHAT_SESSIONS: dict = {}
SESSION_COOKIE = "vacare_chat"


def _session_for(request: Request) -> tuple:
    """Return (session_id, Session), creating one if the cookie is new."""
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id or session_id not in CHAT_SESSIONS:
        session_id = uuid.uuid4().hex[:12]
        CHAT_SESSIONS[session_id] = intake_chat.new_session()
    return session_id, CHAT_SESSIONS[session_id]


@app.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request) -> HTMLResponse:
    session_id, session = _session_for(request)
    if not session.transcript:
        session.say("bot", intake_chat.next_question(session).text)
    response = templates.TemplateResponse(request, "chat.html", {})
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax")
    return response




# ---------------------------------------------------------------------------
# JSON API behind the single-page chat
# ---------------------------------------------------------------------------


def _state_payload(session) -> dict:
    """Everything the chat page needs to render, in one object."""
    claim = session.claim
    question = intake_chat.next_question(session)
    veteran = claim.veteran
    has_facts = bool(claim.conditions or veteran.dob or veteran.service_start)
    lane = lanes.determine_lane(claim.context) if claim.conditions else None

    intake_session = ClaimIntake(claim)

    return {
        "messages": [
            {"role": message.role, "text": message.text} for message in session.transcript
        ],
        "question": {
            "slot": question.slot.value,
            "text": question.text,
            "help": question.help_text,
            "accepts_upload": question.accepts_upload,
            "options": question.options,
            "multiline": question.slot == intake_chat.Slot.STORY,
        },
        "done": question.slot == intake_chat.Slot.DONE,
        "have_key": gemini.available(),
        "model": gemini.model_name(),
        "claim_id": claim.id,
        "facts": {
            "has_any": has_facts,
            "name": veteran.full_name if veteran.first_name != "Unknown" else None,
            "dob": str(veteran.dob) if veteran.dob else None,
            "branch": veteran.branch.value.replace("_", " ") if veteran.branch else None,
            "service": (
                f"{veteran.service_start} to {veteran.service_end or 'present'}"
                if veteran.service_start else None
            ),
            "discharge": veteran.discharge_type.value.replace("_", " "),
            "lane": lanes.LANE_TITLES[lane] if lane else None,
            "rating": claim.context.combined_rating,
            "conditions": [
                {
                    "name": condition.name,
                    "symptoms": condition.current_symptoms,
                    "onset": str(condition.onset_date) if condition.onset_date else None,
                    "link": (
                        "began in service" if condition.started_in_service
                        else "worsened in service" if condition.worsened_in_service
                        else "not established"
                    ),
                }
                for condition in claim.conditions
            ],
            "documents": [
                item.evidence_type.value.replace("_", " ") for item in claim.evidence
            ],
            "deadlines": [
                {"label": deadline.label, "days": deadline.days_left,
                 "urgency": deadline.urgency, "due": str(deadline.due)}
                for deadline in lanes.deadlines(claim)
            ],
            "missing": [
                {
                    "label": item.label,
                    "required": item.required,
                    "scope": item.condition_name,
                }
                for item in intake_session.missing_items()
            ] if claim.conditions else [],
        },
    }


def _ask_next(session) -> None:
    """Append the next question, unless the bot just asked exactly that."""
    question = intake_chat.next_question(session)
    if question.slot == intake_chat.Slot.DONE:
        return
    for message in reversed(session.transcript):
        if message.role == "bot":
            if message.text == question.text:
                return
            break
    session.say("bot", question.text)


def _json_with_cookie(payload: dict, session_id: str) -> JSONResponse:
    response = JSONResponse(payload)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax")
    return response


@app.get("/api/chat")
def api_state(request: Request) -> JSONResponse:
    session_id, session = _session_for(request)
    if not session.transcript:
        session.say("bot", intake_chat.next_question(session).text)
    return _json_with_cookie(_state_payload(session), session_id)


@app.post("/api/chat/message")
async def api_message(request: Request) -> JSONResponse:
    session_id, session = _session_for(request)
    body = await request.json()
    text = str(body.get("message", "")).strip()

    if text:
        try:
            session.say("bot", intake_chat.apply_answer(session, text))
        except gemini.GeminiError as error:
            session.say("bot", f"I hit a problem reading that: {error}")

        _ask_next(session)

    return _json_with_cookie(_state_payload(session), session_id)


@app.post("/api/chat/upload")
async def api_upload(request: Request) -> JSONResponse:
    session_id, session = _session_for(request)
    form = await request.form()
    upload = form.get("document")

    if upload is not None and getattr(upload, "filename", ""):
        data = await upload.read()
        if len(data) > gemini.MAX_INLINE_BYTES:
            session.say("bot", f"{upload.filename} is too large - 18MB is the limit.")
        else:
            try:
                session.say("bot", intake_chat.apply_document(
                    session, intake_chat.Attachment(upload.filename, data)))
            except gemini.GeminiError as error:
                session.say("bot", f"I couldn't read {upload.filename}: {error}")

        _ask_next(session)

    return _json_with_cookie(_state_payload(session), session_id)


@app.post("/api/chat/finish")
def api_finish(request: Request) -> JSONResponse:
    session_id, session = _session_for(request)
    claim = session.claim
    ClaimIntake(claim).evaluate_readiness()
    with store() as db:
        db.save_claim(claim)
    return _json_with_cookie({"claim_id": claim.id, "url": f"/claim/{claim.id}"}, session_id)


@app.post("/api/chat/reset")
def api_reset(request: Request) -> JSONResponse:
    CHAT_SESSIONS.pop(request.cookies.get(SESSION_COOKIE), None)
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/claim/{claim_id}/526ez")
def download_526ez(claim_id: str):
    """The filled 21-526EZ, generated on demand."""
    with store() as db:
        claim = db.load_claim(claim_id)
    if claim is None:
        return RedirectResponse("/", status_code=303)

    output = Path(tempfile.gettempdir()) / f"21-526EZ-{claim.id}.pdf"
    fill_526ez(claim, output)
    return FileResponse(output, media_type="application/pdf",
                        filename=f"21-526EZ-{claim.veteran.last_name}.pdf")


def main() -> None:
    import uvicorn
    uvicorn.run("src.web:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
