"""Post-submission tracker and decision-letter helpers (M9-lite).

Tracks claim progress after filing, reads decision letters, and surfaces
plain-language next steps when a veteran may want to appeal.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional

from src import extract, lanes
from src.models import Claim, ClaimStatus

TITLE = "Your claim status"
DECISION_TITLE = "What VA decided"

EXPLAINER = (
    "After you file, the VA reviews your packet and sends a decision letter. "
    "Upload that letter here and we'll read the date and outcome, then show "
    "any deadlines if you want to challenge the result."
)

OUTCOME_LABELS = {
    "granted": "Fully granted",
    "partial": "Partially granted",
    "denied": "Denied",
    "increased": "Rating increased",
    "decreased": "Rating decreased",
    "unchanged": "No change",
    "mixed": "Mixed results",
    "unknown": "Outcome unclear",
}

DISAGREE_OUTCOMES = {"partial", "denied", "decreased", "mixed", "unknown"}


@dataclass
class TimelineStep:
    key: str
    label: str
    detail: str
    state: str  # done, current, upcoming


@dataclass
class DecisionSummary:
    has_decision: bool
    decision_date: Optional[date]
    outcome: Optional[str]
    outcome_label: str
    summary: Optional[str]
    combined_rating: Optional[int]
    granted: List[str]
    denied: List[str]
    message: str


@dataclass
class AppealDoor:
    form_number: str
    title: str
    detail: str
    lock: Optional[str]
    recommended: bool
    selected: bool = False


@dataclass
class TrackerStatus:
    claim_status: str
    timeline: List[TimelineStep]
    submitted_on: Optional[date]
    submission_id: Optional[str]
    va_status: Optional[str]
    decision: DecisionSummary
    deadlines: List[lanes.Deadline]
    appeal_doors: List[AppealDoor]
    legacy_decision: bool


def _latest_submission(claim: Claim):
    if not claim.va_submissions:
        return None
    return claim.va_submissions[-1]


def _submitted_on(claim: Claim) -> Optional[date]:
    sub = _latest_submission(claim)
    if sub:
        return sub.submitted_on
    for event in reversed(claim.status_history):
        if event.status == ClaimStatus.SUBMITTED:
            return event.recorded_on
    if claim.status in {ClaimStatus.SUBMITTED, ClaimStatus.DECIDED}:
        return claim.created_on
    return None


def is_submitted(claim: Claim) -> bool:
    return bool(claim.va_submissions) or claim.status in {
        ClaimStatus.SUBMITTED,
        ClaimStatus.DECIDED,
    }


def has_decision(claim: Claim) -> bool:
    return claim.context.decision_date is not None or claim.status == ClaimStatus.DECIDED


def decision_summary(claim: Claim) -> DecisionSummary:
    ctx = claim.context
    outcome = ctx.decision_outcome
    label = OUTCOME_LABELS.get(outcome or "", "Decision recorded")

    if not has_decision(claim):
        return DecisionSummary(
            has_decision=False,
            decision_date=None,
            outcome=None,
            outcome_label="Waiting for decision",
            summary=None,
            combined_rating=ctx.combined_rating,
            granted=list(ctx.decision_granted),
            denied=list(ctx.decision_denied),
            message=(
                "No decision letter on file yet. Upload yours when it arrives "
                "and we'll read the date and outcome."
            ),
        )

    parts: List[str] = []
    if ctx.decision_date:
        parts.append(f"Decision dated {ctx.decision_date.isoformat()}.")
    if outcome and outcome != "unknown":
        parts.append(label + ".")
    if ctx.combined_rating is not None:
        parts.append(f"Combined rating: {ctx.combined_rating}%.")
    if ctx.decision_granted:
        parts.append("Granted: " + ", ".join(ctx.decision_granted) + ".")
    if ctx.decision_denied:
        parts.append("Denied or deferred: " + ", ".join(ctx.decision_denied) + ".")
    if ctx.decision_summary and ctx.decision_summary not in " ".join(parts):
        parts.append(ctx.decision_summary)

    message = " ".join(parts) if parts else "Decision letter recorded."

    if outcome in {"granted", "increased", "unchanged"} and not ctx.decision_denied:
        message += " If this matches what you expected, no further action is needed here."

    return DecisionSummary(
        has_decision=True,
        decision_date=ctx.decision_date,
        outcome=outcome,
        outcome_label=label,
        summary=ctx.decision_summary,
        combined_rating=ctx.combined_rating,
        granted=list(ctx.decision_granted),
        denied=list(ctx.decision_denied),
        message=message,
    )


def timeline(claim: Claim) -> List[TimelineStep]:
    from src import collaboration

    vso_done = collaboration.vso_approved(claim)
    in_vso = claim.status in {ClaimStatus.READY_FOR_VSO, ClaimStatus.IN_VSO_REVIEW}
    submitted = is_submitted(claim)
    decided = has_decision(claim)

    steps = [
        TimelineStep(
            key="prepare",
            label="Prepare your packet",
            detail="Intake, evidence, and forms gathered.",
            state="done",
        ),
        TimelineStep(
            key="vso",
            label="VSO review",
            detail=(
                "A VSO checked your packet before filing."
                if vso_done
                else "Waiting for VSO review."
                if in_vso
                else "Send to a VSO or file on your own when ready."
            ),
            state="done" if vso_done or submitted else "current" if in_vso else "upcoming",
        ),
        TimelineStep(
            key="submitted",
            label="Submitted to VA",
            detail=(
                f"526EZ sent {_latest_submission(claim).submitted_on.isoformat()}."
                if submitted and _latest_submission(claim)
                else "Not submitted yet."
            ),
            state="done" if submitted else "current" if vso_done and not submitted else "upcoming",
        ),
        TimelineStep(
            key="review",
            label="VA reviewing",
            detail="The VA is working through your claim.",
            state=(
                "done"
                if decided
                else "current"
                if submitted and not decided
                else "upcoming"
            ),
        ),
        TimelineStep(
            key="decision",
            label="Decision received",
            detail=(
                f"Letter dated {claim.context.decision_date.isoformat()}."
                if decided and claim.context.decision_date
                else "Upload your decision letter when it arrives."
            ),
            state="done" if decided else "upcoming",
        ),
    ]

    # One "current" step — prefer the first non-done that isn't upcoming-only
    current_set = False
    for step in steps:
        if step.state == "current":
            if current_set:
                step.state = "upcoming"
            else:
                current_set = True
    if not current_set:
        for step in reversed(steps):
            if step.state == "done":
                break
            if step.key == "decision" and not decided:
                step.state = "current"
                break

    return steps


def appeal_doors(claim: Claim) -> List[AppealDoor]:
    """Modern AMA review options — legacy NOD path omitted for hackathon scope."""
    ctx = claim.context
    if not ctx.decision_date:
        return []

    if ctx.decision_date < lanes.LEGACY_CUTOFF:
        return []

    if ctx.decision_outcome in {"granted", "increased", "unchanged"} and not ctx.decision_denied:
        if not ctx.disagrees_with_decision:
            return []

    recommended = lanes.decision_review_door(ctx)
    selected = ctx.appeal_door_selected
    highlight = selected or recommended
    doors = [
        AppealDoor(
            form_number="20-0996",
            title="Higher-Level Review",
            detail=(
                "A senior rater re-reads what's already in your file. "
                "You cannot add new evidence."
            ),
            lock="Hard 1-year deadline from the decision date.",
            recommended=highlight == "20-0996",
            selected=selected == "20-0996",
        ),
        AppealDoor(
            form_number="20-0995",
            title="Supplemental Claim",
            detail=(
                "Submit new evidence VA has not seen. "
                "The duty to assist kicks back in."
            ),
            lock="File within 1 year to keep the same effective date.",
            recommended=highlight == "20-0995",
            selected=selected == "20-0995",
        ),
        AppealDoor(
            form_number="10182",
            title="Board Appeal",
            detail=(
                "A Veterans Law Judge reviews your case. "
                "You choose direct review, evidence submission, or a hearing."
            ),
            lock="Hard 1-year deadline. Cannot file two Board appeals in a row.",
            recommended=highlight == "10182",
            selected=selected == "10182",
        ),
    ]
    return doors


def tracker_status(claim: Claim, today: Optional[date] = None) -> TrackerStatus:
    today = today or date.today()
    sub = _latest_submission(claim)
    ctx = claim.context
    return TrackerStatus(
        claim_status=claim.status.value,
        timeline=timeline(claim),
        submitted_on=_submitted_on(claim),
        submission_id=sub.submission_id if sub else None,
        va_status=sub.status if sub else None,
        decision=decision_summary(claim),
        deadlines=lanes.deadlines(claim, today),
        appeal_doors=appeal_doors(claim),
        legacy_decision=bool(ctx.decision_date and ctx.decision_date < lanes.LEGACY_CUTOFF),
    )


def _normalize_outcome(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    return text if text in OUTCOME_LABELS else "unknown"


def _string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def apply_decision_payload(claim: Claim, payload: Dict[str, Any]) -> DecisionSummary:
    """Merge extracted decision-letter fields and mark the claim decided."""
    ctx = claim.context

    decision = extract.parse_date(payload.get("decision_date"))
    if decision:
        ctx.decision_date = decision

    outcome = _normalize_outcome(payload.get("outcome"))
    if outcome:
        ctx.decision_outcome = outcome

    summary = payload.get("summary")
    if isinstance(summary, str) and summary.strip():
        ctx.decision_summary = summary.strip()

    granted = _string_list(payload.get("granted_conditions"))
    denied = _string_list(payload.get("denied_conditions"))
    if granted:
        ctx.decision_granted = granted
    if denied:
        ctx.decision_denied = denied

    rating = payload.get("combined_rating")
    if isinstance(rating, int) and 0 <= rating <= 100:
        ctx.combined_rating = rating
        ctx.has_existing_rating = True
        ctx.has_filed_before = True
    elif isinstance(rating, str) and rating.isdigit():
        parsed = int(rating)
        if 0 <= parsed <= 100:
            ctx.combined_rating = parsed
            ctx.has_existing_rating = True
            ctx.has_filed_before = True

    if outcome in DISAGREE_OUTCOMES or denied:
        ctx.disagrees_with_decision = True
    elif outcome in {"granted", "increased", "unchanged"} and not denied:
        if not ctx.disagrees_with_decision:
            ctx.disagrees_with_decision = False

    if ctx.decision_date:
        note = ctx.decision_summary or f"Decision letter recorded ({outcome or 'unknown'})."
        if claim.status != ClaimStatus.DECIDED:
            claim.set_status(ClaimStatus.DECIDED, note)

    return decision_summary(claim)


def record_decision_date(claim: Claim, decision_date: date) -> DecisionSummary:
    """Manual decision date when a letter is not uploaded."""
    claim.context.decision_date = decision_date
    if not claim.context.decision_outcome:
        claim.context.decision_outcome = "unknown"
    note = f"Decision date recorded: {decision_date.isoformat()}."
    if claim.status != ClaimStatus.DECIDED:
        claim.set_status(ClaimStatus.DECIDED, note)
    return decision_summary(claim)


def mark_submitted(claim: Claim, *, note: Optional[str] = None) -> None:
    """Move claim to submitted once a 526EZ package is sent."""
    if claim.status not in {ClaimStatus.SUBMITTED, ClaimStatus.DECIDED}:
        claim.set_status(
            ClaimStatus.SUBMITTED,
            note or "526EZ submitted to VA Benefits Intake.",
        )
