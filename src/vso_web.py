"""VSO review portal — second localhost app sharing the same SQLite database.

Run alongside the veteran app:

    uvicorn src.vso_web:app --port 8001

Or use scripts/run_dev.sh to start both ports.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from src import collaboration, decision as decision_helpers, evidence_rules, itf as itf_helpers, poa as poa_helpers, packet as packet_view
from src import appeal as appeal_helpers
from src.forms import CATALOG
from src.api import service
from src.api.routes import router as api_router
from src.claim_intake import ClaimIntake
from src.models import Claim, ClaimStatus
from src.storage import DEFAULT_DB_PATH, ClaimStore

VETERAN_APP_URL = "http://127.0.0.1:8000"

app = FastAPI(title="VACARE VSO Portal")
app.include_router(api_router, prefix="/api")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
templates.env.filters["msg_veteran"] = collaboration.message_text_for_veteran
templates.env.filters["msg_vso"] = collaboration.message_text_for_vso
templates.env.filters["upload_notice"] = collaboration.is_upload_notice

DB_PATH = Path(DEFAULT_DB_PATH)


def store() -> ClaimStore:
    return ClaimStore(DB_PATH)


def _load_claim(claim_id: str) -> Optional[Claim]:
    with store() as db:
        return db.load_claim(claim_id)


def _status_label(status: ClaimStatus) -> str:
    return {
        ClaimStatus.READY_FOR_VSO: "Waiting for review",
        ClaimStatus.IN_VSO_REVIEW: "In review",
        ClaimStatus.SUBMITTED: "Submitted to VA",
        ClaimStatus.DECIDED: "Decided",
        ClaimStatus.DRAFT: "Draft",
    }.get(status, status.value.replace("_", " "))


@app.get("/", response_class=HTMLResponse)
def queue_page(request: Request, message: str = "") -> HTMLResponse:
    with store() as db:
        queue = db.list_vso_queue()
    return templates.TemplateResponse(request, "vso/queue.html", {
        "queue": queue,
        "message": message,
        "veteran_app": VETERAN_APP_URL,
    })


@app.get("/cases/{claim_id}", response_class=HTMLResponse)
def case_page(request: Request, claim_id: str, message: str = "") -> HTMLResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        messages = db.list_messages(claim_id)
        collaboration.vso_open_case(db, claim)
        claim = db.load_claim(claim_id)
        checklist = service.build_checklist(claim)

    session = ClaimIntake(claim)
    itf = itf_helpers.itf_status(claim)
    poa = poa_helpers.poa_status(claim)
    missing_required = [m for m in session.missing_items() if m.required]
    filing_checklist = poa_helpers.vso_filing_checklist(
        claim, missing_required=missing_required,
    )
    checklist_ready = poa_helpers.checklist_ready_to_approve(filing_checklist)
    approval_blockers = collaboration.approval_blockers(claim)
    tracker = decision_helpers.tracker_status(claim)
    appeal = appeal_helpers.appeal_status(claim)
    itf_form = CATALOG.get("21-0966")
    poa_form = CATALOG.get("21-22")
    return templates.TemplateResponse(request, "vso/case.html", {
        "claim": claim,
        "messages": messages,
        "checklist": checklist,
        "missing": session.missing_items(),
        "warnings": checklist.warnings,
        "blockers": checklist.blockers,
        "score": checklist.readiness_score,
        "packet_preview": packet_view.vso_packet(claim)[:4000],
        "approved": collaboration.vso_approved(claim),
        "status_label": _status_label(claim.status),
        "message": message,
        "veteran_app": VETERAN_APP_URL,
        "friendly": evidence_rules.friendly,
        "itf": itf,
        "poa": poa,
        "filing_checklist": filing_checklist,
        "checklist_ready": checklist_ready,
        "approval_blockers": approval_blockers,
        "itf_form_url": itf_form.landing if itf_form else "https://www.va.gov/find-forms/about-form-21-0966/",
        "itf_title": itf_helpers.TITLE,
        "itf_explainer": itf_helpers.EXPLAINER,
        "itf_form_label": itf_helpers.FORM_LABEL,
        "poa_form_url": poa_form.landing if poa_form else "https://www.va.gov/find-forms/about-form-21-22/",
        "poa_title": poa_helpers.TITLE,
        "poa_explainer": poa_helpers.EXPLAINER,
        "poa_form_label": poa_helpers.FORM_LABEL,
        "latest_message_id": messages[-1].id if messages else "",
        "tracker": tracker,
        "appeal": appeal,
    })


@app.post("/cases/{claim_id}/approve")
def approve_case(
    claim_id: str,
    reviewer_name: str = Form("VSO"),
    note: str = Form("Approved to file with VA."),
) -> RedirectResponse:
    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        try:
            collaboration.vso_approve_to_file(
                db,
                claim,
                reviewer_name=reviewer_name.strip() or "VSO",
                note=note.strip() or "Approved to file with VA.",
            )
        except collaboration.ApprovalBlockedError as error:
            blockers = "+".join(error.blockers[:2]).replace(" ", "+")
            return RedirectResponse(
                f"/cases/{claim_id}?message=Cannot+approve+yet:+{blockers}",
                status_code=303,
            )
    return RedirectResponse(f"/cases/{claim_id}?message=Approved+to+file", status_code=303)


@app.post("/cases/{claim_id}/message")
def vso_message(
    claim_id: str,
    body: str = Form(...),
    reviewer_name: str = Form("VSO"),
) -> RedirectResponse:
    from src.models import MessageAuthor

    with store() as db:
        claim = db.load_claim(claim_id)
        if claim is None:
            return RedirectResponse("/", status_code=303)
        collaboration.post_message(
            db,
            claim,
            author=MessageAuthor.VSO,
            body=f"[{reviewer_name.strip() or 'VSO'}] {body.strip()}",
        )
    return RedirectResponse(f"/cases/{claim_id}?message=Message+sent", status_code=303)


def main() -> None:
    import uvicorn

    uvicorn.run("src.vso_web:app", host="127.0.0.1", port=8001, reload=False)


if __name__ == "__main__":
    main()
