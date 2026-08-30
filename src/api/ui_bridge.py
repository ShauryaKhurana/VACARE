"""Connect the server-rendered UI to the same logic as /api routes."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Mapping, Optional

from pydantic import ValidationError

from src.api import service
from src.api.schemas import (
    ChecklistResponse,
    ConditionPayload,
    IntakePayload,
    PathHint,
    ReviewPayloadResponse,
    ServiceEventPayload,
    SituationPayload,
    VeteranPayload,
)
from src.formfill import fill_526ez
from src.lanes import Lane, determine_lane
from src.models import Claim, EvidenceType
from src.storage import ClaimStore
from src.va.client import VaClientError, get_va_client

_LANE_TO_HINT = {
    Lane.FIRST_CLAIM: PathHint.FIRST_CLAIM,
    Lane.INCREASE: PathHint.INCREASE,
    Lane.NEW_CONDITION: PathHint.NEW_CONDITION,
    Lane.DECISION_REVIEW: PathHint.DECISION_REVIEW,
    Lane.BDD: PathHint.BDD,
    Lane.PRE_DISCHARGE: PathHint.PRE_DISCHARGE,
    Lane.IDES: PathHint.IDES,
}


def claim_to_payload(claim: Claim) -> IntakePayload:
    """Serialize in-memory claim state into the JSON API intake contract."""
    lane = determine_lane(claim.context)
    path_hint = _LANE_TO_HINT.get(lane)

    evidence_on_hand: list[EvidenceType] = []
    seen: set[EvidenceType] = set()
    for item in claim.evidence:
        if item.evidence_type is EvidenceType.OTHER or item.evidence_type in seen:
            continue
        evidence_on_hand.append(item.evidence_type)
        seen.add(item.evidence_type)

    veteran = claim.veteran
    return IntakePayload(
        path_hint=path_hint,
        situation=SituationPayload.model_validate(claim.context.model_dump()),
        veteran=VeteranPayload(
            first_name=veteran.first_name,
            last_name=veteran.last_name,
            dob=veteran.dob,
            email=veteran.email,
            phone=veteran.phone,
            branch=veteran.branch.value if veteran.branch else None,
            service_start=veteran.service_start,
            service_end=veteran.service_end,
            discharge_type=veteran.discharge_type.value,
        ),
        conditions=[
            ConditionPayload(
                name=condition.name,
                current_symptoms=condition.current_symptoms,
                diagnosis=condition.diagnosis,
                onset_date=condition.onset_date,
                started_in_service=condition.started_in_service,
                worsened_in_service=condition.worsened_in_service,
                currently_treated=condition.currently_treated,
                notes=condition.notes,
            )
            for condition in claim.conditions
        ],
        service_events=[
            ServiceEventPayload(
                title=event.title,
                description=event.description,
                event_date=event.event_date,
                location=event.location,
                witnesses=event.witnesses,
                documented_in_service_records=event.documented_in_service_records,
            )
            for event in claim.service_events
        ],
        evidence_on_hand=evidence_on_hand,
    )


def sync_case(db: ClaimStore, claim: Claim) -> ChecklistResponse:
    """Push UI state through apply_payload and persist — same path as POST /payload."""
    payload = claim_to_payload(claim)
    service.apply_payload(claim, payload)
    service.save_claim(db, claim)
    return service.build_checklist(claim)


def review_for_claim(claim: Claim) -> ReviewPayloadResponse:
    return service.build_review_payload(claim)


def intake_form_to_payload(
    data: Mapping[str, Any],
    *,
    parse_date,
    parse_flag,
    parse_text,
) -> IntakePayload:
    """Build an IntakePayload from the long-form HTML POST body."""
    situation = SituationPayload(
        still_serving=parse_flag(data, "still_serving"),
        separation_date=parse_date(parse_text(data, "separation_date")),
        meb_referral=parse_flag(data, "meb_referral"),
        guard_or_reserve=parse_flag(data, "guard_or_reserve"),
        has_filed_before=parse_flag(data, "has_filed_before"),
        has_existing_rating=parse_flag(data, "has_existing_rating"),
        combined_rating=int(parse_text(data, "combined_rating"))
        if parse_text(data, "combined_rating").isdigit()
        else None,
        claiming_worse=parse_flag(data, "claiming_worse"),
        claiming_new=parse_flag(data, "claiming_new"),
        caused_by_rated_condition=parse_flag(data, "caused_by_rated_condition"),
        disagrees_with_decision=parse_flag(data, "disagrees_with_decision"),
        decision_date=parse_date(parse_text(data, "decision_date")),
        has_new_evidence=parse_flag(data, "has_new_evidence"),
        wants_judge=parse_flag(data, "wants_judge"),
        unemployable=parse_flag(data, "unemployable"),
        private_treatment=parse_flag(data, "private_treatment"),
        has_dependents=parse_flag(data, "has_dependents"),
        has_witness=parse_flag(data, "has_witness"),
        itf_filed_on=parse_date(parse_text(data, "itf_filed_on")),
        poa_filed_on=parse_date(parse_text(data, "poa_filed_on")),
        records_auth_signed_on=parse_date(parse_text(data, "records_auth_signed_on")),
    )

    veteran = VeteranPayload(
        first_name=parse_text(data, "first_name"),
        last_name=parse_text(data, "last_name"),
        dob=parse_date(parse_text(data, "dob")),
        email=parse_text(data, "email") or None,
        phone=parse_text(data, "phone") or None,
        branch=parse_text(data, "branch") or None,
        service_start=parse_date(parse_text(data, "service_start")),
        service_end=parse_date(parse_text(data, "service_end")),
        discharge_type=parse_text(data, "discharge_type") or "unknown",
    )

    conditions: list[ConditionPayload] = []
    for index in range(1, 4):
        name = parse_text(data, f"condition_{index}_name")
        if not name:
            continue
        conditions.append(
            ConditionPayload(
                name=name,
                current_symptoms=parse_text(data, f"condition_{index}_symptoms"),
                diagnosis=parse_text(data, f"condition_{index}_diagnosis") or None,
                onset_date=parse_date(parse_text(data, f"condition_{index}_onset")),
                started_in_service=parse_flag(data, f"condition_{index}_started"),
                worsened_in_service=parse_flag(data, f"condition_{index}_worsened"),
                currently_treated=parse_flag(data, f"condition_{index}_treated"),
            )
        )

    service_events: list[ServiceEventPayload] = []
    event_title = parse_text(data, "event_title")
    event_description = parse_text(data, "event_description")
    if event_title and event_description:
        service_events.append(
            ServiceEventPayload(
                title=event_title,
                description=event_description,
                event_date=parse_date(parse_text(data, "event_date")),
                location=parse_text(data, "event_location") or None,
                witnesses=parse_text(data, "event_witnesses") or None,
                documented_in_service_records=parse_flag(data, "event_documented"),
            )
        )

    evidence_on_hand = [
        evidence_type
        for evidence_type in EvidenceType
        if parse_flag(data, f"have_{evidence_type.value}")
    ]

    return IntakePayload(
        situation=situation,
        veteran=veteran,
        conditions=conditions,
        service_events=service_events,
        evidence_on_hand=evidence_on_hand,
    )


def submit_intake_form(
    db: ClaimStore,
    data: Mapping[str, Any],
    *,
    parse_date,
    parse_flag,
    parse_text,
) -> Claim:
    """Create a case and apply the long-form intake through the API service layer."""
    payload = intake_form_to_payload(
        data,
        parse_date=parse_date,
        parse_flag=parse_flag,
        parse_text=parse_text,
    )
    if not payload.conditions:
        raise ValueError("Add at least one condition.")

    claim = service.create_case()
    service.apply_payload(claim, payload)
    service.save_claim(db, claim)
    return claim


def submit_va_intake(db: ClaimStore, claim: Claim) -> tuple[str, str]:
    """Generate 526EZ and upload via VA client — same as POST /api/.../va/intake."""
    output = Path(tempfile.gettempdir()) / f"21-526EZ-{claim.id}.pdf"
    fill_526ez(claim, output)

    client = get_va_client()
    result = client.submit_benefits_intake(
        case_id=claim.id,
        veteran_first_name=claim.veteran.first_name,
        veteran_last_name=claim.veteran.last_name,
        pdf_path=output,
    )
    service.record_va_submission(
        claim,
        submission_id=result.submission_id,
        status=result.status,
        message=result.message,
    )
    from src import decision as decision_helpers

    decision_helpers.mark_submitted(claim, note=f"526EZ submitted ({result.submission_id}).")
    service.save_claim(db, claim)
    return result.submission_id, result.message


def first_validation_error(error: Exception) -> str:
    if isinstance(error, ValidationError):
        problem = error.errors()[0]
        field = str(problem["loc"][0]).replace("_", " ") if problem["loc"] else "input"
        return f"{field}: {problem['msg'].replace('Value error, ', '')}"
    if isinstance(error, ValueError):
        return str(error)
    return "Please check the dates - they must be YYYY-MM-DD."
