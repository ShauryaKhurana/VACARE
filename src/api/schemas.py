"""Request and response models for the frontend JSON API."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

from src.models import ClaimStatus, EvidenceType, VSOVerdict


class PathHint(str, Enum):
    """Frontend path identifiers — backend still recomputes lane from facts."""

    BDD = "bdd"
    PRE_DISCHARGE = "pre_discharge"
    IDES = "ides"
    FIRST_CLAIM = "first_claim"
    INCREASE = "increase"
    NEW_CONDITION = "new_condition"
    DECISION_REVIEW = "decision_review"


class SituationPayload(BaseModel):
    """Answers that decide lane routing — mirrors LaneContext."""

    still_serving: bool = False
    separation_date: Optional[date] = None
    meb_referral: bool = False
    guard_or_reserve: bool = False
    has_filed_before: bool = False
    has_existing_rating: bool = False
    combined_rating: Optional[int] = None
    claiming_worse: bool = False
    claiming_new: bool = False
    caused_by_rated_condition: bool = False
    disagrees_with_decision: bool = False
    decision_date: Optional[date] = None
    has_new_evidence: bool = False
    wants_judge: bool = False
    unemployable: bool = False
    private_treatment: bool = False
    has_dependents: bool = False
    has_witness: bool = False
    itf_filed_on: Optional[date] = None
    poa_filed_on: Optional[date] = None
    records_auth_signed_on: Optional[date] = None


class VeteranPayload(BaseModel):
    first_name: str = "Unknown"
    last_name: str = "Veteran"
    dob: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    branch: Optional[str] = None
    service_start: Optional[date] = None
    service_end: Optional[date] = None
    discharge_type: str = "unknown"


class ConditionPayload(BaseModel):
    name: str
    current_symptoms: str
    diagnosis: Optional[str] = None
    onset_date: Optional[date] = None
    started_in_service: bool = False
    worsened_in_service: bool = False
    currently_treated: bool = False
    notes: Optional[str] = None


class ServiceEventPayload(BaseModel):
    title: str
    description: str
    event_date: Optional[date] = None
    location: Optional[str] = None
    witnesses: Optional[str] = None
    documented_in_service_records: bool = False


class DD214FactsPayload(BaseModel):
    """Structured DD-214 fields used for deterministic presumptive checks."""

    service_start: Optional[date] = None
    service_end: Optional[date] = None
    campaign_medals: List[str] = Field(default_factory=list)
    deployments: List[str] = Field(default_factory=list)
    mos_code: Optional[str] = None


class IntakePayload(BaseModel):
    """What the frontend sends after collecting answers for a path."""

    path_hint: Optional[PathHint] = None
    situation: SituationPayload = Field(default_factory=SituationPayload)
    veteran: Optional[VeteranPayload] = None
    conditions: List[ConditionPayload] = Field(default_factory=list)
    service_events: List[ServiceEventPayload] = Field(default_factory=list)
    evidence_on_hand: List[EvidenceType] = Field(default_factory=list)
    dd214_facts: Optional[DD214FactsPayload] = None


class CreateCaseRequest(BaseModel):
    """Optional seed data when opening a new case."""

    veteran: Optional[VeteranPayload] = None
    path_hint: Optional[PathHint] = None


class RuleResultResponse(BaseModel):
    rule_id: str
    result: str  # MATCH | NO_MATCH | NOT_ENOUGH_DATA
    explanation: str
    condition_name: Optional[str] = None


class ChecklistItemResponse(BaseModel):
    evidence_type: str
    label: str
    required: bool
    satisfied: bool
    condition_name: Optional[str] = None


class DeadlineResponse(BaseModel):
    label: str
    due_on: Optional[date] = None
    days_remaining: Optional[int] = None
    urgency: str = "info"


class FormStepResponse(BaseModel):
    form_number: str
    title: str
    filled_by: str
    is_gate: bool = False


class ChecklistResponse(BaseModel):
    case_id: str
    lane: str
    lane_title: str
    path_hint: Optional[str] = None
    status: ClaimStatus
    required_fields_still_missing: List[str]
    evidence_checklist: List[ChecklistItemResponse]
    presumptive_hits: List[RuleResultResponse]
    blockers: List[str]
    warnings: List[str]
    readiness_score: int
    vso_packet_ready: bool
    next_ask: Optional[str] = None
    deadlines: List[DeadlineResponse] = Field(default_factory=list)
    form_sequence: List[FormStepResponse] = Field(default_factory=list)


class ReviewItemResponse(BaseModel):
    id: str
    category: str
    finding: str
    suggested_state: str  # CONFIRM | REJECT | NEEDS_REVIEW
    evidence_refs: List[str] = Field(default_factory=list)
    rule_result_ids: List[str] = Field(default_factory=list)


class ReviewPayloadResponse(BaseModel):
    case_id: str
    lane: str
    summary: str
    items: List[ReviewItemResponse]


class ReviewDecisionRequest(BaseModel):
    reviewer_id: str = "vso"
    decision: VSOVerdict
    note: Optional[str] = None


class PathSchemaResponse(BaseModel):
    path: str
    title: str
    description: str
    required_fields: List[str]
    optional_fields: List[str] = Field(default_factory=list)


class CaseSummaryResponse(BaseModel):
    case_id: str
    status: ClaimStatus
    veteran_name: str
    lane: str
    condition_count: int
    readiness_score: int


class VaIntakeSubmitResponse(BaseModel):
    submission_id: str
    status: str
    message: str


class VaIntakeStatusResponse(BaseModel):
    submission_id: str
    status: str
    final_status: bool = False
    updated_at: Optional[str] = None
    detail: Optional[str] = None


class VaSubmissionResponse(BaseModel):
    id: str
    submission_id: str
    doc_type: str
    status: str
    message: Optional[str] = None
    submitted_on: date
    updated_at: Optional[str] = None


class DocumentUploadResponse(BaseModel):
    case_id: str
    filename: str
    stored_path: str
    document_type: str
    summary: str
    parsed_with_gemini: bool
    fields_applied: List[str]
    conditions_added: List[str]
    evidence_type: str
    message: str
    checklist: ChecklistResponse


class CaseMessageResponse(BaseModel):
    id: str
    claim_id: str
    author: str
    body: str
    created_at: datetime


class PostMessageRequest(BaseModel):
    author: str = "veteran"
    body: str


class VsoQueueItemResponse(BaseModel):
    claim_id: str
    veteran_name: str
    status: str
    created_on: str
    conditions: str


class VsoRequestInfoBody(BaseModel):
    reviewer_name: str = "VSO"
    request_text: str


class VsoApproveBody(BaseModel):
    reviewer_name: str = "VSO"
    note: str = "Approved to file with VA."


class ItfRecordRequest(BaseModel):
    filed_on: Optional[date] = None  # defaults to today when omitted


class ItfStatusResponse(BaseModel):
    applies: bool
    filed_on: Optional[date] = None
    expires_on: Optional[date] = None
    days_left: Optional[int] = None
    urgency: str
    message: str


class PoaRecordRequest(BaseModel):
    filed_on: Optional[date] = None
    filing_on_own: bool = False


class PoaStatusResponse(BaseModel):
    applies: bool
    filed_on: Optional[date] = None
    urgency: str
    message: str
    filing_on_own: bool = False


class LiveMessageResponse(BaseModel):
    id: str
    author: str
    body: str
    created_at: str


class LiveEvidenceResponse(BaseModel):
    evidence_type: str
    label: str


class CaseLiveResponse(BaseModel):
    case_id: str
    status: str
    vso_approved: bool
    in_vso_queue: bool
    messages: List[LiveMessageResponse]
    latest_message_id: Optional[str] = None
    message_count: int = 0
    evidence: List[LiveEvidenceResponse] = Field(default_factory=list)
    evidence_count: int = 0


class InboxLiveItemResponse(BaseModel):
    claim_id: str
    veteran_name: str
    status: str
    vso_approved: bool
    latest_message_id: Optional[str] = None
    latest_author: Optional[str] = None
    latest_preview: Optional[str] = None


class TrackerStepResponse(BaseModel):
    key: str
    label: str
    detail: str
    state: str


class TrackerDeadlineResponse(BaseModel):
    label: str
    due: date
    days_left: int
    urgency: str
    detail: str
    hard: bool


class DecisionSummaryResponse(BaseModel):
    has_decision: bool
    decision_date: Optional[date] = None
    outcome: Optional[str] = None
    outcome_label: str
    summary: Optional[str] = None
    combined_rating: Optional[int] = None
    granted: List[str] = Field(default_factory=list)
    denied: List[str] = Field(default_factory=list)
    message: str


class AppealDoorResponse(BaseModel):
    form_number: str
    title: str
    detail: str
    lock: Optional[str] = None
    recommended: bool = False
    selected: bool = False


class TrackerResponse(BaseModel):
    claim_status: str
    timeline: List[TrackerStepResponse]
    submitted_on: Optional[date] = None
    submission_id: Optional[str] = None
    va_status: Optional[str] = None
    decision: DecisionSummaryResponse
    deadlines: List[TrackerDeadlineResponse]
    appeal_doors: List[AppealDoorResponse]
    legacy_decision: bool = False


class DecisionDateRequest(BaseModel):
    decision_date: date


class AppealSelectRequest(BaseModel):
    door: str  # 20-0996, 20-0995, 10182


class AppealPickerOptionResponse(BaseModel):
    form_number: str
    title: str
    picker_label: str
    detail: str
    lock: str


class AppealCheckItemResponse(BaseModel):
    label: str
    detail: str


class AppealStatusResponse(BaseModel):
    applies: bool
    disagrees: bool
    selected_door: Optional[str] = None
    recommended_door: Optional[str] = None
    message: str
    picker_options: List[AppealPickerOptionResponse] = Field(default_factory=list)
    checklist: List[AppealCheckItemResponse] = Field(default_factory=list)
    form_url: Optional[str] = None
    legacy_decision: bool = False
