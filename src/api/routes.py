"""FastAPI routes for the JSON API."""

from __future__ import annotations

import tempfile
from pathlib import Path

from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import ValidationError

from src.api import deps, service
from src.api.schemas import (
    CaseSummaryResponse,
    ChecklistResponse,
    CreateCaseRequest,
    DocumentUploadResponse,
    IntakePayload,
    PathSchemaResponse,
    ReviewDecisionRequest,
    ReviewPayloadResponse,
    VaIntakeStatusResponse,
    VaIntakeSubmitResponse,
    VaSubmissionResponse,
)
from src import packet as packet_view
from src.document_ingest import ingest_document
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
