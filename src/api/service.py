"""Business logic for the JSON API — maps payloads to claims and builds responses."""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional, Tuple

from pydantic import ValidationError

from src import evidence_rules, lanes, packet as packet_view, presumptive
from src.api.schemas import (
    CaseSummaryResponse,
    ChecklistItemResponse,
    ChecklistResponse,
    ConditionPayload,
    CreateCaseRequest,
    DeadlineResponse,
    FormStepResponse,
    IntakePayload,
    PathHint,
    PathSchemaResponse,
    ReviewItemResponse,
    ReviewPayloadResponse,
    RuleResultResponse,
    ServiceEventPayload,
    SituationPayload,
    VeteranPayload,
)
from src.claim_intake import ClaimIntake
from src.lanes import Lane, LANE_BLURBS, LANE_TITLES, determine_lane
from src.models import (
    Branch,
    Claim,
    ClaimStatus,
    ClaimType,
    DischargeType,
    EvidenceType,
    LaneContext,
    VaSubmission,
    Veteran,
    VSOVerdict,
)
from src.storage import ClaimStore


# Fields the frontend should collect per path (documentation for FE team).
PATH_FIELD_SCHEMA: Dict[PathHint, Tuple[List[str], List[str]]] = {
    PathHint.FIRST_CLAIM: (
        [
            "veteran.first_name",
            "veteran.last_name",
            "veteran.service_start",
            "veteran.service_end",
            "conditions[].name",
            "conditions[].current_symptoms",
            "evidence_on_hand (dd214 minimum)",
        ],
        ["veteran.dob", "service_events[]", "conditions[].started_in_service"],
    ),
    PathHint.INCREASE: (
        [
            "situation.has_existing_rating",
            "situation.claiming_worse",
            "situation.combined_rating",
            "conditions[].name",
            "conditions[].current_symptoms",
            "evidence_on_hand (current medical records)",
        ],
        ["conditions[].diagnosis"],
    ),
    PathHint.NEW_CONDITION: (
        [
            "situation.claiming_new",
            "conditions[].name",
            "conditions[].current_symptoms",
            "evidence_on_hand",
        ],
        ["situation.caused_by_rated_condition", "service_events[]"],
    ),
    PathHint.DECISION_REVIEW: (
        [
            "situation.disagrees_with_decision",
            "situation.decision_date",
            "situation.has_new_evidence",
            "conditions[].name",
        ],
        ["situation.wants_judge"],
    ),
    PathHint.BDD: (
        [
            "situation.still_serving",
            "situation.separation_date",
            "conditions[].name",
            "evidence_on_hand (service treatment records)",
        ],
        ["dd214_facts"],
    ),
    PathHint.PRE_DISCHARGE: (
        [
            "situation.still_serving",
            "situation.separation_date",
            "conditions[].name",
        ],
        ["evidence_on_hand"],
    ),
    PathHint.IDES: (
        [
            "situation.still_serving",
            "situation.meb_referral",
            "conditions[].name",
        ],
        ["situation.separation_date"],
    ),
}


def path_schemas() -> List[PathSchemaResponse]:
    schemas: List[PathSchemaResponse] = []
    for hint in PathHint:
        required, optional = PATH_FIELD_SCHEMA.get(hint, ([], []))
        lane = _lane_for_hint(hint)
        schemas.append(PathSchemaResponse(
            path=hint.value,
            title=LANE_TITLES.get(lane, hint.value.replace("_", " ").title()),
            description=LANE_BLURBS.get(lane, ""),
            required_fields=required,
            optional_fields=optional,
        ))
    return schemas


def _lane_for_hint(hint: PathHint) -> Lane:
    mapping = {
        PathHint.BDD: Lane.BDD,
        PathHint.PRE_DISCHARGE: Lane.PRE_DISCHARGE,
        PathHint.IDES: Lane.IDES,
        PathHint.FIRST_CLAIM: Lane.FIRST_CLAIM,
        PathHint.INCREASE: Lane.INCREASE,
        PathHint.NEW_CONDITION: Lane.NEW_CONDITION,
        PathHint.DECISION_REVIEW: Lane.DECISION_REVIEW,
    }
    return mapping[hint]


def create_case(body: Optional[CreateCaseRequest] = None) -> Claim:
    body = body or CreateCaseRequest()
    veteran = _build_veteran(body.veteran) if body.veteran else Veteran(
        first_name="New",
        last_name="Case",
    )
    session = ClaimIntake()
    claim = session.start_claim(veteran)
    if body.path_hint:
        claim.context = _context_from_hint(body.path_hint)
    return claim


def apply_payload(claim: Claim, payload: IntakePayload) -> Claim:
    """Merge frontend payload into an existing claim and re-evaluate readiness."""
    claim.context = _build_context(payload.situation)
    if payload.veteran:
        claim.veteran = _build_veteran(payload.veteran, existing=claim.veteran)

    if payload.dd214_facts:
        facts = payload.dd214_facts
        if facts.service_start and not claim.veteran.service_start:
            claim.veteran.service_start = facts.service_start
        if facts.service_end and not claim.veteran.service_end:
            claim.veteran.service_end = facts.service_end

    claim.conditions.clear()
    claim.service_events.clear()
    session = ClaimIntake(claim)
    event_ids: List[str] = []

    for event_data in payload.service_events:
        event = session.add_service_event(**event_data.model_dump())
        event_ids.append(event.id)

    for index, condition_data in enumerate(payload.conditions):
        data = condition_data.model_dump()
        if not claim.service_events and event_ids:
            data["service_event_id"] = event_ids[0]
        session.add_condition(**data)

    claim.evidence = [
        item for item in claim.evidence
        if item.source not in {"veteran", "payload"}
    ]
    for evidence_type in payload.evidence_on_hand:
        session.add_evidence(evidence_type=evidence_type, source="payload")

    claim.claim_type = _claim_type_for_lane(determine_lane(claim.context))
    session.evaluate_readiness()
    return claim


def build_checklist(
    claim: Claim,
    *,
    path_hint: Optional[PathHint] = None,
    dd214_facts: Optional[dict] = None,
) -> ChecklistResponse:
    session = ClaimIntake(claim)
    lane = determine_lane(claim.context)
    missing = session.missing_items()
    blockers = session.blockers()
    warnings = session.linkage_warnings()
    score = session.readiness_score()
    ready = claim.status == ClaimStatus.READY_FOR_VSO and not blockers

    facts = dd214_facts or {}
    presumptive_hits = presumptive.evaluate_presumptive(
        claim,
        campaign_medals=facts.get("campaign_medals"),
        deployments=facts.get("deployments"),
        mos_code=facts.get("mos_code"),
    )

    evidence_checklist = [
        ChecklistItemResponse(
            evidence_type=_evidence_type_for_label(item.label),
            label=item.label,
            required=item.required,
            satisfied=False,
            condition_name=item.condition_name,
        )
        for item in missing
    ]

    deadlines = [
        DeadlineResponse(
            label=clock.label,
            due_on=clock.due,
            days_remaining=clock.days_left,
            urgency=clock.urgency,
        )
        for clock in lanes.deadlines(claim)
    ]

    form_sequence = [
        FormStepResponse(
            form_number=step.form_number,
            title=step.title,
            filled_by=step.filled_by.value if step.filled_by else "veteran",
            is_gate=step.gate,
        )
        for step in lanes.build_sequence(claim)
        if step.form_number
    ]

    required_missing = _required_fields_still_missing(claim, lane, path_hint)

    return ChecklistResponse(
        case_id=claim.id,
        lane=lane.value,
        lane_title=LANE_TITLES[lane],
        path_hint=path_hint.value if path_hint else None,
        status=claim.status,
        required_fields_still_missing=required_missing,
        evidence_checklist=evidence_checklist,
        presumptive_hits=[
            RuleResultResponse(
                rule_id=hit.rule_id,
                result=hit.result.value,
                explanation=hit.explanation,
                condition_name=hit.condition_name,
            )
            for hit in presumptive_hits
        ],
        blockers=blockers,
        warnings=warnings,
        readiness_score=score,
        vso_packet_ready=ready,
        next_ask=_next_ask(required_missing, missing, blockers),
        deadlines=deadlines,
        form_sequence=form_sequence,
    )


def build_review_payload(claim: Claim) -> ReviewPayloadResponse:
    """Structured VSO review cards derived from checklist + presumptive rules."""
    checklist = build_checklist(claim)
    items: List[ReviewItemResponse] = []

    for index, hit in enumerate(checklist.presumptive_hits):
        if hit.result == "NOT_ENOUGH_DATA":
            suggested = "NEEDS_REVIEW"
        elif hit.result == "MATCH":
            suggested = "CONFIRM"
        else:
            suggested = "NEEDS_REVIEW"
        items.append(ReviewItemResponse(
            id=f"rule_{index + 1}",
            category="PRESUMPTIVE_ELIGIBILITY",
            finding=hit.explanation,
            suggested_state=suggested,
            rule_result_ids=[hit.rule_id],
        ))

    for index, condition in enumerate(claim.conditions):
        if not condition.has_service_connection_story:
            items.append(ReviewItemResponse(
                id=f"condition_{index + 1}",
                category="SERVICE_CONNECTION",
                finding=f"{condition.name}: no in-service link recorded yet.",
                suggested_state="NEEDS_REVIEW",
            ))
        else:
            items.append(ReviewItemResponse(
                id=f"condition_{index + 1}",
                category="CURRENT_CONDITION",
                finding=f"{condition.name} is documented with symptoms: {condition.current_symptoms[:120]}",
                suggested_state="CONFIRM",
            ))

    for index, item in enumerate(checklist.evidence_checklist):
        if item.satisfied:
            continue
        items.append(ReviewItemResponse(
            id=f"evidence_{index + 1}",
            category="MISSING_EVIDENCE",
            finding=f"Still need: {item.label}",
            suggested_state="NEEDS_REVIEW",
            evidence_refs=[item.evidence_type],
        ))

    summary = packet_view.claim_summary(claim)
    return ReviewPayloadResponse(
        case_id=claim.id,
        lane=checklist.lane,
        summary=summary,
        items=items,
    )


def record_review_decision(
    claim: Claim,
    item_id: str,
    reviewer_id: str,
    decision: VSOVerdict,
    note: Optional[str] = None,
) -> Claim:
    session = ClaimIntake(claim)
    session.record_vso_review(
        reviewer_name=reviewer_id,
        verdict=decision,
        review_notes=f"[{item_id}] {note}" if note else f"Review item {item_id}",
    )
    session.evaluate_readiness()
    return claim


def case_summary(claim: Claim) -> CaseSummaryResponse:
    session = ClaimIntake(claim)
    lane = determine_lane(claim.context)
    return CaseSummaryResponse(
        case_id=claim.id,
        status=claim.status,
        veteran_name=claim.veteran.full_name,
        lane=lane.value,
        condition_count=len(claim.conditions),
        readiness_score=session.readiness_score(),
    )


def record_va_submission(
    claim: Claim,
    *,
    submission_id: str,
    status: str,
    message: Optional[str] = None,
    doc_type: str = "21-526EZ",
    updated_at: Optional[str] = None,
) -> VaSubmission:
    submission = VaSubmission(
        submission_id=submission_id,
        doc_type=doc_type,
        status=status,
        message=message,
        updated_at=updated_at,
    )
    claim.va_submissions.append(submission)
    return submission


def update_va_submission_status(
    claim: Claim,
    submission_id: str,
    status: str,
    *,
    updated_at: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    for submission in claim.va_submissions:
        if submission.submission_id == submission_id:
            submission.status = status
            submission.updated_at = updated_at
            if detail:
                submission.message = detail
            return


def load_claim(store: ClaimStore, case_id: str) -> Optional[Claim]:
    return store.load_claim(case_id)


def save_claim(store: ClaimStore, claim: Claim) -> None:
    store.save_claim(claim)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_veteran(data: VeteranPayload, existing: Optional[Veteran] = None) -> Veteran:
    branch = None
    if data.branch:
        try:
            branch = Branch(data.branch.lower())
        except ValueError:
            branch = existing.branch if existing else None

    discharge = DischargeType.UNKNOWN
    try:
        discharge = DischargeType(data.discharge_type.lower())
    except ValueError:
        pass

    fields = dict(
        first_name=data.first_name,
        last_name=data.last_name,
        dob=data.dob,
        email=data.email,
        phone=data.phone,
        branch=branch,
        service_start=data.service_start,
        service_end=data.service_end,
        discharge_type=discharge,
    )
    if existing:
        fields["id"] = existing.id
    return Veteran(**fields)


def _build_context(data: SituationPayload) -> LaneContext:
    return LaneContext.model_validate(data.model_dump())


def _context_from_hint(hint: PathHint) -> LaneContext:
    presets: Dict[PathHint, dict] = {
        PathHint.FIRST_CLAIM: {"has_filed_before": False},
        PathHint.INCREASE: {
            "has_existing_rating": True,
            "has_filed_before": True,
            "claiming_worse": True,
        },
        PathHint.NEW_CONDITION: {
            "has_existing_rating": True,
            "has_filed_before": True,
            "claiming_new": True,
        },
        PathHint.DECISION_REVIEW: {
            "has_filed_before": True,
            "disagrees_with_decision": True,
        },
        PathHint.BDD: {"still_serving": True},
        PathHint.PRE_DISCHARGE: {"still_serving": True},
        PathHint.IDES: {"still_serving": True, "meb_referral": True},
    }
    return LaneContext(**presets.get(hint, {}))


def _claim_type_for_lane(lane: Lane) -> ClaimType:
    if lane == Lane.INCREASE:
        return ClaimType.INCREASE
    if lane == Lane.NEW_CONDITION:
        return ClaimType.SECONDARY
    if lane == Lane.DECISION_REVIEW:
        return ClaimType.SUPPLEMENTAL
    return ClaimType.INITIAL


def _required_fields_still_missing(
    claim: Claim,
    lane: Lane,
    path_hint: Optional[PathHint],
) -> List[str]:
    missing: List[str] = []
    veteran = claim.veteran

    if len(veteran.first_name) < 2 or veteran.first_name == "New":
        missing.append("veteran.first_name")
    if len(veteran.last_name) < 2 or veteran.last_name in {"Case", "Veteran"}:
        missing.append("veteran.last_name")

    if veteran.dob is None:
        missing.append("veteran.dob")

    if lane in {Lane.FIRST_CLAIM, Lane.BDD, Lane.PRE_DISCHARGE}:
        if not veteran.service_start:
            missing.append("veteran.service_start")
        if not veteran.service_end and not claim.context.still_serving:
            missing.append("veteran.service_end")

    if lane == Lane.INCREASE and claim.context.combined_rating is None:
        missing.append("situation.combined_rating")

    if lane == Lane.DECISION_REVIEW:
        if not claim.context.decision_date:
            missing.append("situation.decision_date")

    if lane in {Lane.BDD, Lane.PRE_DISCHARGE, Lane.IDES}:
        if claim.context.still_serving and not claim.context.separation_date:
            missing.append("situation.separation_date")

    if not claim.conditions:
        missing.append("conditions[] (at least one)")

    for index, condition in enumerate(claim.conditions, start=1):
        if len(condition.current_symptoms.strip()) < 5:
            missing.append(f"conditions[{index}].current_symptoms")

    if path_hint and path_hint in PATH_FIELD_SCHEMA:
        for field in PATH_FIELD_SCHEMA[path_hint][0]:
            if field.startswith("evidence_on_hand") and not claim.evidence:
                if "evidence_on_hand" not in " ".join(missing):
                    missing.append("evidence_on_hand")

    return missing


def _next_ask(
    required_missing: List[str],
    evidence_missing: list,
    blockers: List[str],
) -> Optional[str]:
    if required_missing:
        field = required_missing[0]
        prompts = {
            "veteran.first_name": "What is your first name?",
            "veteran.last_name": "What is your last name?",
            "veteran.dob": "What is your date of birth?",
            "veteran.service_start": "When did your service start?",
            "veteran.service_end": "When did your service end?",
            "situation.separation_date": "What is your separation date?",
            "situation.decision_date": "When did you receive the decision letter?",
            "situation.combined_rating": "What is your current combined disability rating?",
            "conditions[] (at least one)": "What condition are you claiming?",
            "evidence_on_hand": "Which documents do you already have (DD-214, medical records, etc.)?",
        }
        return prompts.get(field, f"Please provide: {field}")

    required_missing_evidence = [item for item in evidence_missing if item.required]
    if required_missing_evidence:
        return f"Do you have your {required_missing_evidence[0].label}?"

    if blockers:
        return blockers[0]

    return None


def _evidence_type_for_label(label: str) -> str:
    for evidence_type, friendly_label in evidence_rules.FRIENDLY_NAMES.items():
        if friendly_label == label:
            return evidence_type.value
    return "other"
