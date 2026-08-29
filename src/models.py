"""Structured claim models for VACARE.

These models are the single source of truth for what a claim record looks like.
Validation here is deliberately basic: it catches obviously incomplete or
malformed input at intake time so a VSO never has to chase a missing birth date.
It is NOT a legal review and does not decide whether a claim will be granted.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def new_id() -> str:
    """Short unique id used for rows in the local database."""
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Controlled vocabularies
# ---------------------------------------------------------------------------


class Branch(str, Enum):
    ARMY = "army"
    NAVY = "navy"
    AIR_FORCE = "air_force"
    MARINE_CORPS = "marine_corps"
    COAST_GUARD = "coast_guard"
    SPACE_FORCE = "space_force"
    NATIONAL_GUARD = "national_guard"
    RESERVES = "reserves"


class DischargeType(str, Enum):
    HONORABLE = "honorable"
    GENERAL = "general"
    OTHER_THAN_HONORABLE = "other_than_honorable"
    BAD_CONDUCT = "bad_conduct"
    DISHONORABLE = "dishonorable"
    UNCHARACTERIZED = "uncharacterized"
    UNKNOWN = "unknown"


class ClaimType(str, Enum):
    INITIAL = "initial"
    INCREASE = "increase"
    SECONDARY = "secondary"
    SUPPLEMENTAL = "supplemental"


class ClaimStatus(str, Enum):
    DRAFT = "draft"                    # veteran still filling things in
    READY_FOR_VSO = "ready_for_vso"    # required items collected
    IN_VSO_REVIEW = "in_vso_review"
    SUBMITTED = "submitted"
    DECIDED = "decided"


class EvidenceType(str, Enum):
    DD214 = "dd214"
    SERVICE_TREATMENT_RECORD = "service_treatment_record"
    SERVICE_PERSONNEL_RECORD = "service_personnel_record"
    CURRENT_MEDICAL_RECORD = "current_medical_record"
    PRIVATE_DOCTOR_NOTE = "private_doctor_note"
    NEXUS_LETTER = "nexus_letter"
    BUDDY_STATEMENT = "buddy_statement"
    PERSONAL_STATEMENT = "personal_statement"
    HEARING_TEST = "hearing_test"
    MENTAL_HEALTH_EVALUATION = "mental_health_evaluation"
    IMAGING = "imaging"
    OTHER = "other"


class TaskStatus(str, Enum):
    OPEN = "open"
    DONE = "done"
    WAIVED = "waived"


class VSOVerdict(str, Enum):
    PENDING = "pending"
    NEEDS_MORE_INFO = "needs_more_info"
    APPROVED_TO_FILE = "approved_to_file"


# ---------------------------------------------------------------------------
# Core records
# ---------------------------------------------------------------------------


class Veteran(BaseModel):
    """Basic identity and service history for the person filing."""

    id: str = Field(default_factory=new_id)
    first_name: str
    last_name: str
    # Optional so a conversational intake can build a veteran progressively;
    # the CLI and web form still require it up front.
    dob: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    branch: Optional[Branch] = None
    service_start: Optional[date] = None
    service_end: Optional[date] = None
    discharge_type: DischargeType = DischargeType.UNKNOWN

    @field_validator("first_name", "last_name")
    @classmethod
    def name_must_look_real(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("name must be at least 2 characters")
        return cleaned

    @field_validator("email")
    @classmethod
    def email_must_look_like_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        cleaned = value.strip()
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("email does not look like an email address")
        return cleaned

    @field_validator("phone")
    @classmethod
    def phone_must_have_enough_digits(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        digits = [c for c in value if c.isdigit()]
        if len(digits) < 10:
            raise ValueError("phone number needs at least 10 digits")
        return value.strip()

    @field_validator("dob")
    @classmethod
    def dob_must_be_plausible(cls, value: Optional[date]) -> Optional[date]:
        if value is None:
            return None
        today = date.today()
        if value >= today:
            raise ValueError("date of birth must be in the past")
        if (today.year - value.year) > 110:
            raise ValueError("date of birth is implausibly old")
        return value

    @model_validator(mode="after")
    def service_dates_must_make_sense(self) -> "Veteran":
        if self.dob and self.service_start and self.service_start <= self.dob:
            raise ValueError("service start date must be after date of birth")
        if self.service_start and self.service_end and self.service_end < self.service_start:
            raise ValueError("service end date cannot be before service start date")
        if self.service_end and self.service_end > date.today():
            raise ValueError("service end date cannot be in the future")
        return self

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class ServiceEvent(BaseModel):
    """An in-service event the veteran believes caused or worsened a condition.

    This is the 'what happened to you in service' half of service connection.
    """

    id: str = Field(default_factory=new_id)
    title: str
    description: str
    event_date: Optional[date] = None
    location: Optional[str] = None
    witnesses: Optional[str] = None
    documented_in_service_records: bool = False

    @field_validator("title", "description")
    @classmethod
    def must_not_be_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("this field needs at least a few words")
        return cleaned


class Condition(BaseModel):
    """One claimed condition, in the veteran's own words plus structured facts."""

    id: str = Field(default_factory=new_id)
    name: str
    diagnosis: Optional[str] = None
    onset_date: Optional[date] = None
    started_in_service: bool = False
    worsened_in_service: bool = False
    currently_treated: bool = False
    current_symptoms: str
    service_event_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("condition name is required")
        return cleaned

    @field_validator("current_symptoms")
    @classmethod
    def symptoms_must_be_described(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 5:
            raise ValueError("describe the current symptoms in at least a few words")
        return cleaned

    @field_validator("onset_date")
    @classmethod
    def onset_not_in_future(cls, value: Optional[date]) -> Optional[date]:
        if value and value > date.today():
            raise ValueError("onset date cannot be in the future")
        return value

    @property
    def has_service_connection_story(self) -> bool:
        """True when the veteran has told us *some* in-service link."""
        return bool(
            self.started_in_service
            or self.worsened_in_service
            or self.service_event_id
        )


class EvidenceItem(BaseModel):
    """A document the veteran has (or has been asked to obtain)."""

    id: str = Field(default_factory=new_id)
    evidence_type: EvidenceType
    title: Optional[str] = None
    source: Optional[str] = None
    file_uri: Optional[str] = None
    condition_id: Optional[str] = None
    notes: Optional[str] = None

    @property
    def label(self) -> str:
        return self.title or self.evidence_type.value.replace("_", " ")


class Task(BaseModel):
    """A follow-up item for the veteran or the VSO."""

    id: str = Field(default_factory=new_id)
    name: str
    detail: Optional[str] = None
    required: bool = True
    owner: str = "veteran"          # 'veteran' or 'vso'
    status: TaskStatus = TaskStatus.OPEN
    condition_id: Optional[str] = None


class StatusEvent(BaseModel):
    """One entry in the claim's status history."""

    id: str = Field(default_factory=new_id)
    status: ClaimStatus
    note: Optional[str] = None
    recorded_on: date = Field(default_factory=date.today)


class VSOReview(BaseModel):
    """Lightweight confirmation step performed by the VSO."""

    id: str = Field(default_factory=new_id)
    reviewer_name: str
    verdict: VSOVerdict = VSOVerdict.PENDING
    review_notes: Optional[str] = None
    reviewed_on: date = Field(default_factory=date.today)


class LaneContext(BaseModel):
    """The answers that decide which lane a veteran is in.

    Kept separate from Claim so the lane logic has one obvious input, and so it
    can be stored as a single JSON column instead of twenty nullable ones.
    """

    # Where they are relative to service
    still_serving: bool = False
    separation_date: Optional[date] = None
    meb_referral: bool = False
    guard_or_reserve: bool = False

    # Claim history
    has_filed_before: bool = False
    has_existing_rating: bool = False
    combined_rating: Optional[int] = None

    # What they want now
    claiming_worse: bool = False              # rated condition got worse
    claiming_new: bool = False                # condition not on the rating
    caused_by_rated_condition: bool = False   # secondary claim
    disagrees_with_decision: bool = False

    # Decision review inputs
    decision_date: Optional[date] = None
    has_new_evidence: bool = False
    wants_judge: bool = False

    # Add-ons and dependencies
    unemployable: bool = False
    private_treatment: bool = False
    has_dependents: bool = False
    has_witness: bool = False

    # Dates that start their own clocks
    itf_filed_on: Optional[date] = None
    poa_filed_on: Optional[date] = None
    records_auth_signed_on: Optional[date] = None

    @field_validator("combined_rating")
    @classmethod
    def rating_must_be_a_percentage(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and not 0 <= value <= 100:
            raise ValueError("combined rating must be between 0 and 100")
        return value


class Claim(BaseModel):
    """Everything gathered for one filing."""

    id: str = Field(default_factory=new_id)
    veteran: Veteran
    claim_type: ClaimType = ClaimType.INITIAL
    status: ClaimStatus = ClaimStatus.DRAFT
    summary: Optional[str] = None
    context: LaneContext = Field(default_factory=LaneContext)
    conditions: List[Condition] = Field(default_factory=list)
    service_events: List[ServiceEvent] = Field(default_factory=list)
    evidence: List[EvidenceItem] = Field(default_factory=list)
    tasks: List[Task] = Field(default_factory=list)
    status_history: List[StatusEvent] = Field(default_factory=list)
    reviews: List[VSOReview] = Field(default_factory=list)
    created_on: date = Field(default_factory=date.today)

    # -- small helpers used by the intake flow --------------------------------

    def add_condition(self, condition: Condition) -> Condition:
        self.conditions.append(condition)
        return condition

    def add_service_event(self, event: ServiceEvent) -> ServiceEvent:
        self.service_events.append(event)
        return event

    def add_evidence(self, item: EvidenceItem) -> EvidenceItem:
        self.evidence.append(item)
        return item

    def has_evidence(self, evidence_type: EvidenceType) -> bool:
        return any(item.evidence_type == evidence_type for item in self.evidence)

    def evidence_for_condition(self, condition_id: str) -> List[EvidenceItem]:
        return [item for item in self.evidence if item.condition_id == condition_id]

    def find_service_event(self, event_id: Optional[str]) -> Optional[ServiceEvent]:
        if event_id is None:
            return None
        for event in self.service_events:
            if event.id == event_id:
                return event
        return None

    def set_status(self, status: ClaimStatus, note: Optional[str] = None) -> None:
        self.status = status
        self.status_history.append(StatusEvent(status=status, note=note))

    @property
    def open_tasks(self) -> List[Task]:
        return [task for task in self.tasks if task.status == TaskStatus.OPEN]
