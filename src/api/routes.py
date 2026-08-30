"""FastAPI routes for the JSON API."""

from __future__ import annotations

import tempfile
from pathlib import Path

from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import ValidationError

from src.api import deps, service
from src.api.schemas import (
    CaseMessageResponse,
    CaseSummaryResponse,
    CaseLiveResponse,
    ChecklistResponse,
    CreateCaseRequest,
    DocumentUploadResponse,
    IntakePayload,
    ItfRecordRequest,
    ItfStatusResponse,
    InboxLiveItemResponse,
    LiveMessageResponse,
    LiveEvidenceResponse,
    PathSchemaResponse,
    PoaRecordRequest,
    PoaStatusResponse,
    PostMessageRequest,
    ReviewDecisionRequest,
    ReviewPayloadResponse,
    TrackerResponse,
    TrackerStepResponse,
    TrackerDeadlineResponse,
    DecisionSummaryResponse,
    AppealDoorResponse,
    DecisionDateRequest,
    AppealStatusResponse,
    AppealSelectRequest,
    AppealPickerOptionResponse,
    AppealCheckItemResponse,
    VaIntakeStatusResponse,
    VaIntakeSubmitResponse,
    VaSubmissionResponse,
    VsoApproveBody,
    VsoQueueItemResponse,
    VsoRequestInfoBody,
)
from src import collaboration, itf as itf_helpers, poa as poa_helpers, packet as packet_view
from src import decision as decision_helpers
from src import appeal as appeal_helpers
from src.document_ingest import ingest_document
from src.models import ClaimStatus, MessageAuthor
from src.formfill import fill_526ez
from src.va import VaClientError, get_va_client

router = APIRouter(tags=["api"])


@router.get("/paths", response_model=List[PathSchemaResponse])
def list_paths() -> List[PathSchemaResponse]:
    """Tell the frontend what to collect for each user path."""
    return service.path_schemas()


@router.post("/cases", response_model=CaseSummaryResponse, status_code=201)
def create_case(body: Optional[CreateCaseRequest] = None) -> CaseSummaryResponse:
    claim = service.create_case(body)
    with deps.store() as db:
        service.save_claim(db, claim)
    return service.case_summary(claim)


@router.get("/cases/{case_id}", response_model=CaseSummaryResponse)
def get_case(case_id: str) -> CaseSummaryResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return service.case_summary(claim)


@router.post("/cases/{case_id}/payload", response_model=ChecklistResponse)
def submit_payload(case_id: str, body: IntakePayload) -> ChecklistResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        try:
            claim = service.apply_payload(claim, body)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=error.errors()) from error
        service.save_claim(db, claim)
        dd214 = body.dd214_facts.model_dump() if body.dd214_facts else None
        return service.build_checklist(claim, path_hint=body.path_hint, dd214_facts=dd214)


@router.get("/cases/{case_id}/checklist", response_model=ChecklistResponse)
def get_checklist(case_id: str) -> ChecklistResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return service.build_checklist(claim)


@router.get("/cases/{case_id}/review", response_model=ReviewPayloadResponse)
def get_review(case_id: str) -> ReviewPayloadResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return service.build_review_payload(claim)


@router.post("/cases/{case_id}/review/{item_id}", response_model=CaseSummaryResponse)
def post_review_decision(
    case_id: str,
    item_id: str,
    body: ReviewDecisionRequest,
) -> CaseSummaryResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        claim = service.record_review_decision(
            claim,
            item_id,
            body.reviewer_id,
            body.decision,
            body.note,
        )
        service.save_claim(db, claim)
    return service.case_summary(claim)


@router.get("/cases/{case_id}/packet")
def get_packet(case_id: str) -> dict:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"case_id": case_id, "packet": packet_view.vso_packet(claim)}


@router.post("/cases/{case_id}/documents", response_model=DocumentUploadResponse)
async def upload_document(case_id: str, file: UploadFile = File(...)) -> DocumentUploadResponse:
    """Upload a PDF/image; Gemini parses it and merges facts into the case."""
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")

        filename = file.filename or "upload"
        try:
            result = ingest_document(claim, filename, data)
        except Exception as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        collaboration.record_document_sent(db, claim, filename)
        service.save_claim(db, claim)
        checklist = service.build_checklist(claim)

    return DocumentUploadResponse(
        case_id=case_id,
        filename=result.filename,
        stored_path=result.stored_path,
        document_type=result.document_type,
        summary=result.summary,
        parsed_with_gemini=result.parsed_with_gemini,
        fields_applied=result.fields_applied,
        conditions_added=result.conditions_added,
        evidence_type=result.evidence_type,
        message=result.message,
        checklist=checklist,
    )


@router.post("/cases/{case_id}/va/intake", response_model=VaIntakeSubmitResponse)
def submit_va_intake(case_id: str) -> VaIntakeSubmitResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")

        output = Path(tempfile.gettempdir()) / f"21-526EZ-{claim.id}.pdf"
        try:
            fill_526ez(claim, output)
        except Exception as error:
            raise HTTPException(status_code=500, detail=f"Could not generate 526EZ: {error}") from error

        client = get_va_client()
        try:
            result = client.submit_benefits_intake(
                case_id=case_id,
                veteran_first_name=claim.veteran.first_name,
                veteran_last_name=claim.veteran.last_name,
                pdf_path=output,
            )
        except VaClientError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

        service.record_va_submission(
            claim,
            submission_id=result.submission_id,
            status=result.status,
            message=result.message,
        )
        decision_helpers.mark_submitted(
            claim, note=f"526EZ submitted ({result.submission_id}).",
        )
        service.save_claim(db, claim)

    return VaIntakeSubmitResponse(
        submission_id=result.submission_id,
        status=result.status,
        message=result.message,
    )


@router.get("/cases/{case_id}/va/submissions", response_model=List[VaSubmissionResponse])
def list_va_submissions(case_id: str) -> List[VaSubmissionResponse]:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return [
        VaSubmissionResponse(
            id=s.id,
            submission_id=s.submission_id,
            doc_type=s.doc_type,
            status=s.status,
            message=s.message,
            submitted_on=s.submitted_on,
            updated_at=s.updated_at,
        )
        for s in claim.va_submissions
    ]


@router.get("/cases/{case_id}/va/intake/{submission_id}", response_model=VaIntakeStatusResponse)
def get_va_intake_status(case_id: str, submission_id: str) -> VaIntakeStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Case not found")

    client = get_va_client()
    try:
        status = client.get_intake_status(submission_id)
    except VaClientError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim:
            service.update_va_submission_status(
                claim,
                submission_id,
                status.status,
                updated_at=status.updated_at,
                detail=status.detail,
            )
            service.save_claim(db, claim)

    return VaIntakeStatusResponse(
        submission_id=status.submission_id,
        status=status.status,
        final_status=status.final_status,
        updated_at=status.updated_at,
        detail=status.detail,
    )


# ---------------------------------------------------------------------------
# Veteran ↔ VSO collaboration (shared by ports 8000 and 8001)
# ---------------------------------------------------------------------------


def _message_response(message) -> CaseMessageResponse:
    return CaseMessageResponse(
        id=message.id,
        claim_id=message.claim_id,
        author=message.author.value,
        body=message.body,
        created_at=message.created_at,
    )


@router.get("/vso/queue", response_model=List[VsoQueueItemResponse])
def vso_queue() -> List[VsoQueueItemResponse]:
    with deps.store() as db:
        rows = db.list_vso_queue()
    return [
        VsoQueueItemResponse(
            claim_id=row[0],
            veteran_name=row[1],
            status=row[2],
            created_on=row[3],
            conditions=row[4],
        )
        for row in rows
    ]


@router.get("/cases/{case_id}/messages", response_model=List[CaseMessageResponse])
def get_case_messages(case_id: str) -> List[CaseMessageResponse]:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        messages = collaboration.list_messages(db, case_id)
    return [_message_response(m) for m in messages]


@router.post("/cases/{case_id}/messages", response_model=CaseMessageResponse, status_code=201)
def post_case_message(case_id: str, body: PostMessageRequest) -> CaseMessageResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        try:
            author = MessageAuthor(body.author)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="Invalid author") from error
        if not body.body.strip():
            raise HTTPException(status_code=422, detail="Message cannot be empty")
        message = collaboration.post_message(db, claim, author=author, body=body.body)
    return _message_response(message)


@router.post("/cases/{case_id}/vso/submit", response_model=CaseSummaryResponse)
def submit_case_to_vso(case_id: str) -> CaseSummaryResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        claim = collaboration.submit_for_vso_review(db, claim)
    return service.case_summary(claim)


@router.post("/cases/{case_id}/vso/request-info", response_model=CaseMessageResponse)
def vso_request_info(case_id: str, body: VsoRequestInfoBody) -> CaseMessageResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        if not body.request_text.strip():
            raise HTTPException(status_code=422, detail="Request text required")
        collaboration.vso_open_case(db, claim, body.reviewer_name)
        message = collaboration.vso_request_info(
            db,
            claim,
            reviewer_name=body.reviewer_name,
            request_text=body.request_text,
        )
    return _message_response(message)


@router.post("/cases/{case_id}/vso/approve", response_model=CaseSummaryResponse)
def vso_approve_case(case_id: str, body: VsoApproveBody) -> CaseSummaryResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        collaboration.vso_open_case(db, claim, body.reviewer_name)
        try:
            claim = collaboration.vso_approve_to_file(
                db,
                claim,
                reviewer_name=body.reviewer_name,
                note=body.note,
            )
        except collaboration.ApprovalBlockedError as error:
            raise HTTPException(
                status_code=400,
                detail="Cannot approve yet: " + "; ".join(error.blockers),
            ) from error
    return service.case_summary(claim)


@router.get("/cases/{case_id}/itf", response_model=ItfStatusResponse)
def get_itf_status(case_id: str) -> ItfStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        status = itf_helpers.itf_status(claim)
    return ItfStatusResponse(
        applies=status.applies,
        filed_on=status.filed_on,
        expires_on=status.expires_on,
        days_left=status.days_left,
        urgency=status.urgency,
        message=status.message,
    )


@router.post("/cases/{case_id}/itf", response_model=ItfStatusResponse)
def record_itf(case_id: str, body: Optional[ItfRecordRequest] = None) -> ItfStatusResponse:
    from datetime import date as date_cls

    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        if not itf_helpers.itf_applies(claim):
            raise HTTPException(status_code=422, detail="Intent to File is not used on this claim path")
        filed_on = body.filed_on if body and body.filed_on else date_cls.today()
        status = itf_helpers.record_itf(claim, filed_on)
        service.save_claim(db, claim)
    return ItfStatusResponse(
        applies=status.applies,
        filed_on=status.filed_on,
        expires_on=status.expires_on,
        days_left=status.days_left,
        urgency=status.urgency,
        message=status.message,
    )


@router.get("/cases/{case_id}/poa", response_model=PoaStatusResponse)
def get_poa_status(case_id: str) -> PoaStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        status = poa_helpers.poa_status(claim)
    return PoaStatusResponse(
        applies=status.applies,
        filed_on=status.filed_on,
        urgency=status.urgency,
        message=status.message,
        filing_on_own=status.filing_on_own,
    )


@router.post("/cases/{case_id}/poa", response_model=PoaStatusResponse)
def record_poa(case_id: str, body: Optional[PoaRecordRequest] = None) -> PoaStatusResponse:
    from datetime import date as date_cls

    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        if body and body.filing_on_own:
            status = poa_helpers.mark_filing_on_own(claim)
        else:
            filed_on = body.filed_on if body and body.filed_on else date_cls.today()
            status = poa_helpers.record_poa(claim, filed_on)
        service.save_claim(db, claim)
    return PoaStatusResponse(
        applies=status.applies,
        filed_on=status.filed_on,
        urgency=status.urgency,
        message=status.message,
        filing_on_own=status.filing_on_own,
    )


def _tracker_response(claim) -> TrackerResponse:
    status = decision_helpers.tracker_status(claim)
    return TrackerResponse(
        claim_status=status.claim_status,
        timeline=[
            TrackerStepResponse(
                key=s.key, label=s.label, detail=s.detail, state=s.state,
            )
            for s in status.timeline
        ],
        submitted_on=status.submitted_on,
        submission_id=status.submission_id,
        va_status=status.va_status,
        decision=DecisionSummaryResponse(
            has_decision=status.decision.has_decision,
            decision_date=status.decision.decision_date,
            outcome=status.decision.outcome,
            outcome_label=status.decision.outcome_label,
            summary=status.decision.summary,
            combined_rating=status.decision.combined_rating,
            granted=status.decision.granted,
            denied=status.decision.denied,
            message=status.decision.message,
        ),
        deadlines=[
            TrackerDeadlineResponse(
                label=d.label,
                due=d.due,
                days_left=d.days_left,
                urgency=d.urgency,
                detail=d.detail,
                hard=d.hard,
            )
            for d in status.deadlines
        ],
        appeal_doors=[
            AppealDoorResponse(
                form_number=d.form_number,
                title=d.title,
                detail=d.detail,
                lock=d.lock,
                recommended=d.recommended,
                selected=d.selected,
            )
            for d in status.appeal_doors
        ],
        legacy_decision=status.legacy_decision,
    )


@router.get("/cases/{case_id}/tracker", response_model=TrackerResponse)
def get_tracker(case_id: str) -> TrackerResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
    return _tracker_response(claim)


@router.post("/cases/{case_id}/decision-date", response_model=DecisionSummaryResponse)
def record_decision_date(case_id: str, body: DecisionDateRequest) -> DecisionSummaryResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        summary = decision_helpers.record_decision_date(claim, body.decision_date)
        service.save_claim(db, claim)
    return DecisionSummaryResponse(
        has_decision=summary.has_decision,
        decision_date=summary.decision_date,
        outcome=summary.outcome,
        outcome_label=summary.outcome_label,
        summary=summary.summary,
        combined_rating=summary.combined_rating,
        granted=summary.granted,
        denied=summary.denied,
        message=summary.message,
    )


def _appeal_response(status: appeal_helpers.AppealStatus) -> AppealStatusResponse:
    return AppealStatusResponse(
        applies=status.applies,
        disagrees=status.disagrees,
        selected_door=status.selected_door,
        recommended_door=status.recommended_door,
        message=status.message,
        picker_options=[
            AppealPickerOptionResponse(
                form_number=o.form_number,
                title=o.title,
                picker_label=o.picker_label,
                detail=o.detail,
                lock=o.lock,
            )
            for o in status.picker_options
        ],
        checklist=[
            AppealCheckItemResponse(label=i.label, detail=i.detail)
            for i in status.checklist
        ],
        form_url=status.form_url,
        legacy_decision=status.legacy_decision,
    )


@router.get("/cases/{case_id}/appeal", response_model=AppealStatusResponse)
def get_appeal_status(case_id: str) -> AppealStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        status = appeal_helpers.appeal_status(claim)
    return _appeal_response(status)


@router.post("/cases/{case_id}/appeal/disagree", response_model=AppealStatusResponse)
def mark_appeal_disagree(case_id: str) -> AppealStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        status = appeal_helpers.mark_disagrees(claim)
        service.save_claim(db, claim)
    return _appeal_response(status)


@router.post("/cases/{case_id}/appeal/accept", response_model=AppealStatusResponse)
def mark_appeal_accept(case_id: str) -> AppealStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        status = appeal_helpers.mark_accepts_decision(claim)
        service.save_claim(db, claim)
    return _appeal_response(status)


@router.post("/cases/{case_id}/appeal", response_model=AppealStatusResponse)
def select_appeal_door(case_id: str, body: AppealSelectRequest) -> AppealStatusResponse:
    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        try:
            status = appeal_helpers.select_door(claim, body.door)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        service.save_claim(db, claim)
    return _appeal_response(status)


@router.get("/cases/{case_id}/live", response_model=CaseLiveResponse)
def case_live_state(case_id: str) -> CaseLiveResponse:
    from src import evidence_rules

    with deps.store() as db:
        claim = service.load_claim(db, case_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Case not found")
        messages = collaboration.list_messages(db, case_id)
    seen = set()
    evidence_items: list = []
    for item in claim.evidence:
        key = item.evidence_type.value
        if key in seen:
            continue
        seen.add(key)
        evidence_items.append(
            LiveEvidenceResponse(
                evidence_type=key,
                label=evidence_rules.friendly(item.evidence_type),
            )
        )
    return CaseLiveResponse(
        case_id=case_id,
        status=claim.status.value,
        vso_approved=collaboration.vso_approved(claim),
        in_vso_queue=claim.status in (ClaimStatus.READY_FOR_VSO, ClaimStatus.IN_VSO_REVIEW),
        messages=[
            LiveMessageResponse(
                id=m.id,
                author=m.author.value,
                body=m.body,
                created_at=m.created_at.isoformat(),
            )
            for m in messages
        ],
        latest_message_id=messages[-1].id if messages else None,
        message_count=len(messages),
        evidence=evidence_items,
        evidence_count=len(evidence_items),
    )


@router.get("/live/inbox", response_model=List[InboxLiveItemResponse])
def live_inbox() -> List[InboxLiveItemResponse]:
    with deps.store() as db:
        rows = db.list_claims()
        items: List[InboxLiveItemResponse] = []
        for claim_id, name, _claim_type, status in rows:
            claim = service.load_claim(db, claim_id)
            if claim is None:
                continue
            messages = db.list_messages(claim_id)
            last = messages[-1] if messages else None
            items.append(
                InboxLiveItemResponse(
                    claim_id=claim_id,
                    veteran_name=name,
                    status=status,
                    vso_approved=collaboration.vso_approved(claim),
                    latest_message_id=last.id if last else None,
                    latest_author=last.author.value if last else None,
                    latest_preview=(last.body[:100] if last else None),
                )
            )
    return items
