"""FastAPI frontend for VACARE.

Deliberately small: server-rendered HTML, no JavaScript build step, no client
framework. Run it with:

    python -m src.web        (or: uvicorn src.web:app --reload)

Every page reads and writes claims through the same service layer as /api.
"""

from __future__ import annotations

import tempfile
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from src import evidence_rules, gemini, intake_chat, lanes, packet as packet_view
from src.api import service, ui_bridge
from src.api.routes import router as api_router
from src import collaboration
from src import lifecycle as lifecycle_helpers
from src.claim_intake import ClaimIntake
from src.forms import CATALOG
from src import itf as itf_helpers
from src import poa as poa_helpers
from src import decision as decision_helpers
from src import appeal as appeal_helpers
from src.document_ingest import ingest_document
from src.models import (
    Branch,
    Claim,
    ClaimStatus,
    DischargeType,
    EvidenceType,
    MessageAuthor,
)
from src.formfill import fill_526ez
from src.storage import DEFAULT_DB_PATH, ClaimStore
from src.va.client import VaClientError

app = FastAPI(title="VACARE")
app.include_router(api_router, prefix="/api")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
templates.env.filters["msg_veteran"] = collaboration.message_text_for_veteran
templates.env.filters["msg_vso"] = collaboration.message_text_for_vso
templates.env.filters["upload_notice"] = collaboration.is_upload_notice

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


def claim_ready_view(
    request: Request,
    claim: Claim,
    message: str = "",
    *,
    case_messages: Optional[list] = None,
) -> HTMLResponse:
    """Simple veteran-facing summary — no VSO jargon."""
    readiness = intake_chat.submit_readiness(claim)
    if case_messages is None:
        with store() as db:
            case_messages = db.list_messages(claim.id)
    itf = itf_helpers.itf_status(claim)
    itf_form = CATALOG.get("21-0966")
    poa = poa_helpers.poa_status(claim)
    poa_form = CATALOG.get("21-22")
    tracker = decision_helpers.tracker_status(claim)
    appeal = appeal_helpers.appeal_status(claim)
    page_subtitle = "Your claim summary"
    if tracker.decision.has_decision:
        page_subtitle = "Decision received — see next steps below"
    elif tracker.submitted_on:
        page_subtitle = "Submitted to VA — we'll track your decision here"
    return templates.TemplateResponse(request, "claim_ready.html", {
        "claim": claim,
        "message": message,
        "readiness": readiness,
        "case_messages": case_messages,
        "vso_approved": collaboration.vso_approved(claim),
        "in_vso_queue": claim.status in (ClaimStatus.READY_FOR_VSO, ClaimStatus.IN_VSO_REVIEW),
        "vso_portal": "http://127.0.0.1:8001",
        "itf": itf,
        "itf_form_url": itf_form.landing if itf_form else "https://www.va.gov/find-forms/about-form-21-0966/",
        "itf_title": itf_helpers.TITLE,
        "itf_explainer": itf_helpers.EXPLAINER,
        "itf_explainer_short": itf_helpers.EXPLAINER_SHORT,
        "itf_form_label": itf_helpers.FORM_LABEL,
        "poa": poa,
        "poa_form_url": poa_form.landing if poa_form else "https://www.va.gov/find-forms/about-form-21-22/",
        "poa_title": poa_helpers.TITLE,
        "poa_explainer": poa_helpers.EXPLAINER,
        "poa_form_label": poa_helpers.FORM_LABEL,
        "latest_message_id": case_messages[-1].id if case_messages else "",
        "tracker": tracker,
        "tracker_title": decision_helpers.TITLE,
        "tracker_explainer": decision_helpers.EXPLAINER,
        "decision_title": decision_helpers.DECISION_TITLE,
        "appeal": appeal,
        "appeal_title": appeal_helpers.TITLE,
        "appeal_explainer": appeal_helpers.EXPLAINER,
        "page_subtitle": page_subtitle,
        "show_prep_sections": not tracker.submitted_on,
        "friendly": evidence_rules.friendly,
    })


def claim_view(
    request: Request,
    claim: Claim,
    message: str = "",
    checklist: Optional[object] = None,
    review: Optional[object] = None,
) -> HTMLResponse:
    """Claim dashboard — checklist and review come from the API service layer."""
    checklist = checklist or service.build_checklist(claim)
    review = review or ui_bridge.review_for_claim(claim)

    lane = lanes.determine_lane(claim.context)
    session = ClaimIntake(claim)
    missing = session.missing_items()

    return templates.TemplateResponse(request, "claim.html", {
        "claim": claim,
        "message": message,
        "checklist": checklist,
        "review": review,
        "lane": lane,
        "lane_title": lanes.LANE_TITLES[lane],
        "lane_blurb": lanes.LANE_BLURBS[lane],
        "steps": lanes.build_sequence(claim),
        "deadlines": lanes.deadlines(claim),
        "third_party": lanes.third_party_dependencies(claim),
        "missing": missing,
        "warnings": checklist.warnings,
        "blockers": checklist.blockers,
        "score": checklist.readiness_score,
        "evidence_types": [e for e in EvidenceType if e is not EvidenceType.OTHER],
        "friendly": evidence_rules.friendly,
        "held": {item.evidence_type for item in claim.evidence},
    })


@app.get("/api/gemini/status")
def gemini_key_status() -> JSONResponse:
    """Dev helper: one tiny API call to see if the key still has quota."""
    return JSONResponse(gemini.check_api_key())


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    claim_rows = []
    with store() as db:
        for claim_id, name, claim_type, status in db.list_claims():
            claim = db.load_claim(claim_id)
            badge = lifecycle_helpers.lifecycle_badge(claim) if claim else None
            claim_rows.append({
                "id": claim_id,
                "title": lifecycle_helpers.claim_title(claim) if claim else "New claim",
                "claim_type": claim_type,
                "status": status,
                "badge": badge,
            })
    return templates.TemplateResponse(request, "home.html", {"claims": claim_rows})


@app.get("/intake", response_class=HTMLResponse)
def intake_form(request: Request, error: str = "") -> HTMLResponse:
    itf_form = CATALOG.get("21-0966")
    poa_form = CATALOG.get("21-22")
    return templates.TemplateResponse(request, "intake.html", {
        "error": error,
        "branches": [b.value for b in Branch],
        "discharges": [d.value for d in DischargeType],
        "today": date.today().isoformat(),
        "itf_title": itf_helpers.TITLE,
        "itf_explainer": itf_helpers.EXPLAINER,
        "itf_form_label": itf_helpers.FORM_LABEL,
        "itf_form_url": itf_form.landing if itf_form else "https://www.va.gov/find-forms/about-form-21-0966/",
        "poa_title": poa_helpers.TITLE,
        "poa_explainer": poa_helpers.EXPLAINER,
        "poa_form_label": poa_helpers.FORM_LABEL,
        "poa_form_url": poa_form.landing if poa_form else "https://www.va.gov/find-forms/about-form-21-22/",
    })


@app.post("/intake")
async def submit_intake(request: Request) -> RedirectResponse:
    """Long form → create case + POST /payload equivalent via ui_bridge."""
    data = await request.form()

    try:
        with store() as db:
            claim = ui_bridge.submit_intake_form(
                db,
                data,
                parse_date=parse_date,
                parse_flag=lambda form, name: form.get(name) is not None,
                parse_text=lambda form, name: str(form.get(name, "")).strip(),
            )
    except (ValidationError, TypeError, ValueError) as error:
        return RedirectResponse(
            f"/intake?error={ui_bridge.first_validation_error(error)}",
            status_code=303,
        )

    return RedirectResponse(f"/claim/{claim.id}", status_code=303)


@app.get("/claim/{claim_id}", response_class=HTMLResponse)
def claim_page(request: Request, claim_id: str, message: str = "") -> HTMLResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
    if claim is None:
        return RedirectResponse("/", status_code=303)
    return claim_ready_view(request, claim, message)


@app.get("/claim/{claim_id}/details", response_class=HTMLResponse)
def claim_details_page(request: Request, claim_id: str, message: str = "") -> HTMLResponse:
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
            ClaimIntake(claim).add_evidence(
                evidence_type=EvidenceType(evidence_type),
                source="veteran",
            )
            ui_bridge.sync_case(db, claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Added+document", status_code=303)


@app.post("/claim/{claim_id}/documents")
async def upload_claim_document(claim_id: str, file: UploadFile = File(...)) -> RedirectResponse:
    """Upload a file — same path as POST /api/cases/{id}/documents."""
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)

        data = await file.read()
        if not data:
            return RedirectResponse(f"/claim/{claim_id}?message=Empty+file", status_code=303)

        filename = file.filename or "upload"
        try:
            result = ingest_document(claim, filename, data)
        except Exception as error:
            return RedirectResponse(
                f"/claim/{claim_id}?message=Upload+failed:+{error}",
                status_code=303,
            )

        collaboration.record_document_sent(db, claim, filename)
        db.save_claim(claim)
        try:
            ui_bridge.sync_case(db, claim)
        except Exception:
            db.save_claim(claim)

    message = "Document+sent"
    return RedirectResponse(f"/claim/{claim_id}?message={message}", status_code=303)


@app.post("/claim/{claim_id}/decision-date")
def record_decision_date_web(
    claim_id: str,
    decision_date: str = Form(...),
) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        when = parse_date(decision_date)
        if when is None:
            return RedirectResponse(
                f"/claim/{claim_id}?message=Invalid+decision+date",
                status_code=303,
            )
        decision_helpers.record_decision_date(claim, when)
        db.save_claim(claim)
    return RedirectResponse(
        f"/claim/{claim_id}?message=Decision+date+saved:+{when.isoformat()}",
        status_code=303,
    )


@app.post("/claim/{claim_id}/appeal/disagree")
def appeal_disagree(claim_id: str) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        appeal_helpers.mark_disagrees(claim)
        db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Pick+a+review+path+below", status_code=303)


@app.post("/claim/{claim_id}/appeal/accept")
def appeal_accept(claim_id: str) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        appeal_helpers.mark_accepts_decision(claim)
        db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Decision+accepted", status_code=303)


@app.post("/claim/{claim_id}/appeal/reset")
def appeal_reset(claim_id: str) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        claim.context.appeal_door_selected = None
        appeal_helpers.mark_disagrees(claim)
        db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message=Choose+a+new+path", status_code=303)


@app.post("/claim/{claim_id}/appeal")
def appeal_select(claim_id: str, door: str = Form(...)) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        try:
            appeal_helpers.select_door(claim, door)
        except ValueError as error:
            return RedirectResponse(
                f"/claim/{claim_id}?message={error}",
                status_code=303,
            )
        db.save_claim(claim)
    label = appeal_helpers.DOOR_COPY.get(door, {}).get("title", door)
    return RedirectResponse(
        f"/claim/{claim_id}?message=Saved:+{label.replace(' ', '+')}",
        status_code=303,
    )


@app.get("/claim/{claim_id}/appeal-chat")
def appeal_chat_start(claim_id: str) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        session_id = f"{APPEAL_PREFIX}{claim_id}"
        session = intake_chat.load_session_for_claim(claim, None, appeal_mode=True)
        session.transcript.clear()
        question = intake_chat.next_question(session)
        session.say("bot", question.text)
        db.save_chat_session(claim_id, intake_chat.session_to_dict(session))
        CHAT_SESSIONS[session_id] = session
    response = RedirectResponse("/chat", status_code=303)
    return _attach_chat_cookie(response, session_id)


@app.post("/claim/{claim_id}/vso-submit")
def submit_to_vso(claim_id: str) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        collaboration.submit_for_vso_review(db, claim)
    return RedirectResponse(
        f"/claim/{claim_id}?message=Sent+to+VSO+for+review",
        status_code=303,
    )


@app.post("/claim/{claim_id}/message")
def veteran_reply(
    claim_id: str,
    body: str = Form(""),
) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)

        text = body.strip()
        if not text:
            return RedirectResponse(
                f"/claim/{claim_id}?message=Add+a+reply+before+sending",
                status_code=303,
            )

        collaboration.post_message(
            db,
            claim,
            author=MessageAuthor.VETERAN,
            body=text,
        )

    return RedirectResponse(f"/claim/{claim_id}?message=Reply+sent", status_code=303)


@app.post("/claim/{claim_id}/itf")
def record_itf_date(
    claim_id: str,
    filed_on: str = Form(""),
) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        if not itf_helpers.itf_applies(claim):
            return RedirectResponse(
                f"/claim/{claim_id}?message=ITF+not+needed+on+your+claim+path",
                status_code=303,
            )
        when = parse_date(filed_on) or date.today()
        itf_helpers.record_itf(claim, when)
        db.save_claim(claim)
    return RedirectResponse(
        f"/claim/{claim_id}?message=Start+date+saved+with+VA:+{when.isoformat()}",
        status_code=303,
    )


@app.post("/claim/{claim_id}/poa")
def record_poa_date(
    claim_id: str,
    filed_on: str = Form(""),
    filing_on_own: str = Form(""),
) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        if filing_on_own:
            poa_helpers.mark_filing_on_own(claim)
            msg = "Marked+as+filing+on+your+own"
        else:
            when = parse_date(filed_on) or date.today()
            poa_helpers.record_poa(claim, when)
            msg = f"VSO+appointment+saved+for+{when.isoformat()}"
        db.save_claim(claim)
    return RedirectResponse(f"/claim/{claim_id}?message={msg}", status_code=303)


@app.post("/claim/{claim_id}/va-intake")
def va_intake_submit(claim_id: str) -> RedirectResponse:
    """Submit 526EZ to VA — same path as POST /api/cases/{id}/va/intake."""
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        try:
            submission_id, message = ui_bridge.submit_va_intake(db, claim)
        except VaClientError as error:
            return RedirectResponse(
                f"/claim/{claim_id}?message=VA+upload+failed:+{error}",
                status_code=303,
            )
        except Exception as error:
            return RedirectResponse(
                f"/claim/{claim_id}?message=Could+not+submit:+{error}",
                status_code=303,
            )

    short = message.replace(" ", "+")[:80]
    return RedirectResponse(
        f"/claim/{claim_id}?message=Submitted+{submission_id}.+{short}",
        status_code=303,
    )


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
# Conversational intake — synced to /api on every turn
# ---------------------------------------------------------------------------

CHAT_SESSIONS: dict = {}
SESSION_COOKIE = "vacare_chat"
APPEAL_PREFIX = "appeal-"


def _claim_id_from_session_key(session_id: str) -> tuple[str, bool]:
    if session_id.startswith(APPEAL_PREFIX):
        return session_id[len(APPEAL_PREFIX):], True
    return session_id, False


def _load_chat_session(db: ClaimStore, session_id: str):
    claim_id, appeal_mode = _claim_id_from_session_key(session_id)
    claim = db.load_claim(claim_id)
    if claim is None:
        return None
    saved = db.load_chat_session(claim_id)
    return intake_chat.load_session_for_claim(claim, saved, appeal_mode=appeal_mode)


def _session_for(request: Request) -> tuple:
    """Return (session_id, Session). Resumes saved chat for the cookie claim when possible."""
    session_id = request.cookies.get(SESSION_COOKIE)

    with store() as db:
        if session_id and session_id in CHAT_SESSIONS:
            return session_id, CHAT_SESSIONS[session_id]

        if session_id:
            session = _load_chat_session(db, session_id)
            if session is not None:
                CHAT_SESSIONS[session_id] = session
                return session_id, session

        claim = service.create_case()
        service.save_claim(db, claim)
        session_id = claim.id
        session = intake_chat.new_session(claim)
        CHAT_SESSIONS[session_id] = session

    return session_id, session


def _persist_chat(session) -> None:
    with store() as db:
        ui_bridge.sync_case(db, session.claim)
        db.save_chat_session(session.claim.id, intake_chat.session_to_dict(session))


def _attach_chat_cookie(response, session_id: str):
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax")
    return response


def _chat_page(request: Request, session_id: str, session, *, persist: bool = False) -> HTMLResponse:
    if persist:
        _persist_chat(session)
    claim = session.claim
    question = intake_chat.next_question(session)
    done = question.slot == intake_chat.Slot.DONE

    db_messages = []
    if done:
        with store() as db:
            db_messages = db.list_messages(claim.id)

    itf_form = CATALOG.get("21-0966")
    poa_form = CATALOG.get("21-22")
    show_itf_help = itf_helpers.itf_applies(claim)
    show_poa_help = True
    chat_ctx = {
        "session": session,
        "question": question,
        "done": done,
        "claim": claim,
        "have_key": gemini.available(),
        "progress": intake_chat.progress(session),
        "readiness": intake_chat.submit_readiness(claim),
        "case_messages": db_messages if done else [],
        "in_vso_queue": claim.status in (ClaimStatus.READY_FOR_VSO, ClaimStatus.IN_VSO_REVIEW),
        "vso_approved": collaboration.vso_approved(claim),
        "show_itf_help": show_itf_help,
        "show_poa_help": show_poa_help,
        "itf": itf_helpers.itf_status(claim) if done and show_itf_help else None,
        "poa": poa_helpers.poa_status(claim) if done else None,
        "itf_title": itf_helpers.TITLE,
        "itf_explainer": itf_helpers.EXPLAINER,
        "itf_form_label": itf_helpers.FORM_LABEL,
        "itf_form_url": itf_form.landing if itf_form else "https://www.va.gov/find-forms/about-form-21-0966/",
        "poa_title": poa_helpers.TITLE,
        "poa_explainer": poa_helpers.EXPLAINER,
        "poa_form_label": poa_helpers.FORM_LABEL,
        "poa_form_url": poa_form.landing if poa_form else "https://www.va.gov/find-forms/about-form-21-22/",
        "latest_message_id": db_messages[-1].id if db_messages else "",
    }
    response = templates.TemplateResponse(request, "chat.html", chat_ctx)
    return _attach_chat_cookie(response, session_id)


@app.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request) -> HTMLResponse:
    session_id, session = _session_for(request)
    if not session.transcript:
        question = intake_chat.next_question(session)
        if question.slot != intake_chat.Slot.DONE:
            session.say("bot", question.text)
            _persist_chat(session)
    return _chat_page(request, session_id, session)


@app.post("/chat", response_class=HTMLResponse)
async def chat_reply(request: Request) -> HTMLResponse:
    session_id, session = _session_for(request)
    form = await request.form()
    text = str(form.get("quick_pick") or form.get("message", "")).strip()
    slot = intake_chat.next_question(session).slot

    upload = form.get("document")
    upload_data = b""
    upload_name = ""
    if upload is not None and getattr(upload, "filename", ""):
        upload_data = await upload.read()
        upload_name = upload.filename or "upload"

    has_upload = bool(upload_data)
    combined = bool(text and has_upload and slot == intake_chat.Slot.STORY)

    try:
        if combined:
            session.say("veteran", text)
            session.say("veteran", f"[uploaded {upload_name}]")
            for message, detail in intake_chat.apply_story_with_document(
                session,
                text,
                intake_chat.Attachment(upload_name, upload_data),
            ):
                session.say("bot", message, detail=detail)
        else:
            if has_upload:
                result = intake_chat.apply_document(
                    session, intake_chat.Attachment(upload_name, upload_data)
                )
                session.say("bot", result.message, detail=result.detail)
            if text:
                receipt = intake_chat.apply_answer(session, text)
                session.say("bot", receipt)
    except gemini.GeminiError as error:
        session.say("bot", gemini.user_facing_error(error))

    _persist_chat(session)

    question = intake_chat.next_question(session)
    if question.slot != intake_chat.Slot.DONE:
        last = session.transcript[-1] if session.transcript else None
        if not last or last.role != "bot" or last.text != question.text:
            session.say("bot", question.text)

    return _chat_page(request, session_id, session, persist=False)


@app.post("/chat/finish")
def chat_finish(request: Request) -> RedirectResponse:
    _, session = _session_for(request)
    _persist_chat(session)
    return RedirectResponse(f"/claim/{session.claim.id}", status_code=303)


@app.get("/chat/new")
def chat_new(request: Request) -> RedirectResponse:
    """Fresh intake — new claim, without wiping saved chat on existing claims."""
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        CHAT_SESSIONS.pop(session_id, None)
    response = RedirectResponse("/chat", status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/chat/reset")
def chat_reset(request: Request) -> RedirectResponse:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        CHAT_SESSIONS.pop(session_id, None)
        claim_id, _ = _claim_id_from_session_key(session_id)
        with store() as db:
            db.delete_chat_session(claim_id)
    response = RedirectResponse("/chat", status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/claim/{claim_id}/chat")
def claim_chat_resume(claim_id: str) -> RedirectResponse:
    with store() as db:
        if db.load_claim(claim_id) is None:
            return RedirectResponse("/", status_code=303)
    CHAT_SESSIONS.pop(claim_id, None)
    response = RedirectResponse("/chat", status_code=303)
    return _attach_chat_cookie(response, claim_id)


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
