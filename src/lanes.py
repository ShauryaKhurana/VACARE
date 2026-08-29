"""Lane routing, form sequencing, and deadline clocks.

Encodes va-claim-forms-by-lane.md: which of the five lanes a veteran is in,
which forms that lane needs in what order, which steps are gates rather than
paperwork, and which clocks are already running.

Claim-prep logic, not legal advice. Deadlines are computed from the dates the
veteran gave us; a real filing decision still goes through a VSO.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from typing import List, Optional

from src import evidence_rules
from src.forms import CATALOG, FilledBy, Form
from src.models import Claim, LaneContext

# --- lanes -----------------------------------------------------------------


class Lane(str, Enum):
    BDD = "bdd"
    PRE_DISCHARGE = "pre_discharge"
    IDES = "ides"
    FIRST_CLAIM = "first_claim"
    INCREASE = "increase"
    NEW_CONDITION = "new_condition"
    DECISION_REVIEW = "decision_review"
    UNKNOWN = "unknown"


LANE_TITLES = {
    Lane.BDD: "I'm getting out - BDD",
    Lane.PRE_DISCHARGE: "I'm getting out - standard pre-discharge",
    Lane.IDES: "I'm getting out - medical board (IDES)",
    Lane.FIRST_CLAIM: "I've never filed",
    Lane.INCREASE: "I got worse",
    Lane.NEW_CONDITION: "Something new came up",
    Lane.DECISION_REVIEW: "They got it wrong",
    Lane.UNKNOWN: "Not enough information yet",
}

LANE_BLURBS = {
    Lane.BDD: (
        "Benefits Delivery at Discharge. Filed 180-90 days before separation so the "
        "rating lands around discharge day. Complete service treatment records must go in "
        "with the claim."
    ),
    Lane.PRE_DISCHARGE: (
        "Fewer than 90 days out. Same paperwork as BDD without the window and exam-availability "
        "locks; processed as a standard claim. The effective date is still the day after discharge."
    ),
    Lane.IDES: (
        "A medical board referral puts the claim on the joint DoD/VA track. It rides on the "
        "21-0819, and DoD runs the exams. Mutually exclusive with BDD."
    ),
    Lane.FIRST_CLAIM: (
        "The first claim after service. The work is proving three things: a current diagnosis, "
        "something that happened in service, and a link between them."
    ),
    Lane.INCREASE: (
        "Already rated; asking for a higher percentage. Shortest paperwork stack of all the lanes - "
        "the fight is entirely about evidence of severity."
    ),
    Lane.NEW_CONDITION: (
        "A condition not yet on the rating, either standalone or caused by one that is. For a "
        "secondary claim the nexus letter effectively is the claim."
    ),
    Lane.DECISION_REVIEW: (
        "Denied or rated too low. Three doors, and the right one depends on a single question: "
        "is there evidence VA has not seen? Every clock runs from the decision date."
    ),
}

BDD_WINDOW_OPENS = 180
BDD_WINDOW_CLOSES = 90
LEGACY_CUTOFF = date(2019, 2, 19)


def determine_lane(context: LaneContext, today: Optional[date] = None) -> Lane:
    """Route to a lane. Order matters: service status first, then decisions."""
    today = today or date.today()

    if context.still_serving:
        if context.meb_referral:
            return Lane.IDES
        if context.separation_date:
            days_out = (context.separation_date - today).days
            if BDD_WINDOW_CLOSES <= days_out <= BDD_WINDOW_OPENS:
                return Lane.BDD
            return Lane.PRE_DISCHARGE
        return Lane.PRE_DISCHARGE

    if context.disagrees_with_decision and context.decision_date:
        return Lane.DECISION_REVIEW

    if context.has_existing_rating:
        if context.claiming_worse:
            return Lane.INCREASE
        if context.claiming_new or context.caused_by_rated_condition:
            return Lane.NEW_CONDITION

    if context.has_filed_before and not context.has_existing_rating:
        # Filed before, nothing granted, no decision to review: treat as a fresh claim.
        return Lane.FIRST_CLAIM

    if not context.has_filed_before:
        return Lane.FIRST_CLAIM

    return Lane.UNKNOWN


def decision_review_door(context: LaneContext) -> Optional[str]:
    """Which of the three Lane 5 doors fits: 20-0995, 20-0996, or 10182."""
    if not context.disagrees_with_decision:
        return None
    if context.decision_date and context.decision_date < LEGACY_CUTOFF:
        return "21-0958"          # legacy system
    if context.wants_judge:
        return "10182"
    if context.has_new_evidence:
        return "20-0995"
    return "20-0996"


# --- steps -----------------------------------------------------------------


@dataclass
class Step:
    """One item in a lane's sequence: a form to file, or a gate to clear."""

    title: str
    detail: str = ""
    form_number: Optional[str] = None
    gate: bool = False
    lock: Optional[str] = None
    optional: bool = False

    @property
    def form(self) -> Optional[Form]:
        return CATALOG.get(self.form_number) if self.form_number else None

    @property
    def filled_by(self) -> Optional[FilledBy]:
        form = self.form
        return form.filled_by if form else None


def _mental_health_claimed(claim: Claim) -> bool:
    return any(
        evidence_rules.categorize(condition) == "mental_health"
        for condition in claim.conditions
    )


def _stage_zero(claim: Claim, include_itf: bool = True) -> List[Step]:
    """Representation and effective-date steps that precede every lane."""
    context = claim.context
    steps: List[Step] = []

    if include_itf:
        steps.append(Step(
            title="File the Intent to File",
            form_number="21-0966",
            detail=(
                "One page, no evidence, no conditions listed. It locks today's date so back pay "
                "runs from now when the claim is approved months later. Costs nothing; skipping "
                "it costs money."
            ),
            lock="Locks the effective date for 12 months" if not context.itf_filed_on else None,
        ))

    steps.append(Step(
        title="Appoint your representative",
        form_number="21-22",
        detail=(
            "Legal permission for a VSO to file for you and see your file. Free. Use 21-22a "
            "instead for a private attorney or claims agent."
        ),
        lock="Filing a new POA silently revokes the existing one",
        optional=True,
    ))
    return steps


def _records_steps(claim: Claim) -> List[Step]:
    if not claim.context.private_treatment:
        return []
    return [Step(
        title="Authorize release of private medical records",
        form_number="21-4142",
        detail=(
            "The permission slip that lets VA pull records straight from civilian doctors. "
            "File the 21-4142a alongside it with the list of providers."
        ),
        lock="The signature expires 12 months after it is signed",
    )]


def _conditional_attachments(claim: Claim) -> List[Step]:
    """Attachments that ride along with the 21-526EZ."""
    steps: List[Step] = []

    if _mental_health_claimed(claim):
        steps.append(Step(
            title="Add the mental health stressor statement",
            form_number="21-0781",
            detail="Required whenever a mental health condition is claimed. Describe the event(s) "
                   "behind it so VA can verify them in unit records.",
        ))

    if claim.context.has_witness:
        steps.append(Step(
            title="Collect a buddy statement",
            form_number="21-10210",
            detail="The witness fills this out and signs it themselves - firsthand observation only.",
            optional=True,
        ))

    if claim.context.unemployable:
        steps.extend([
            Step(
                title="Claim unemployability (TDIU)",
                form_number="21-8940",
                detail="Your work history and why work is impossible.",
                lock="VA will not grant TDIU without this, even when the file screams it",
            ),
            Step(
                title="Send the employer questionnaire to each recent employer",
                form_number="21-4192",
                detail="Each employer from the last year of employment confirms dates, duties, and "
                       "why the job ended.",
            ),
        ])

    if claim.context.has_dependents:
        steps.append(Step(
            title="Add dependents",
            form_number="21-686c",
            detail="Extra monthly pay once the combined rating hits 30%.",
            lock="Filed within 1 year of the rating that crossed 30%, retro runs to the rating date",
            optional=True,
        ))

    if claim.context.guard_or_reserve:
        steps.append(Step(
            title="Waive drill pay for drilling days",
            form_number="21-8951-2",
            detail="You cannot collect drill pay and disability pay for the same days. Annual.",
            optional=True,
        ))

    return steps


def _exam_gate(harsh: bool = False) -> Step:
    return Step(
        title="Attend the C&P exam",
        gate=True,
        detail="VA's examiner, VA's schedule. This is a state to track, not a form to file.",
        lock=(
            "No-show on an increase claim can mean outright denial"
            if harsh else
            "No-show without good cause means VA decides on the record as it stands"
        ),
    )


def build_sequence(claim: Claim, today: Optional[date] = None) -> List[Step]:
    """The ordered list of what this specific veteran needs to do."""
    today = today or date.today()
    lane = determine_lane(claim.context, today)
    steps: List[Step] = []

    if lane in (Lane.BDD, Lane.PRE_DISCHARGE):
        if lane == Lane.BDD:
            steps.append(Step(
                title="Confirm the BDD window",
                gate=True,
                detail="BDD exists only between 180 and 90 days before separation. Day 89 is the "
                       "same paperwork on a slower track.",
                lock="180 to 90 days before separation",
            ))
        steps += _stage_zero(claim, include_itf=False)
        steps.append(Step(
            title="Gather complete service treatment records",
            detail="Including anything a Guard or Reserve unit is holding.",
            lock="Incomplete records eject the claim from BDD" if lane == Lane.BDD else None,
        ))
        steps += _records_steps(claim)
        steps.append(Step(
            title="File the claim",
            form_number="21-526EZ",
            detail="The master application, with BDD indicated.",
        ))
        steps += _conditional_attachments(claim)
        if lane == Lane.BDD:
            steps.append(Step(
                title="Stay available for exams",
                gate=True,
                detail="VA schedules C&P exams before separation. Being unreachable ejects the "
                       "claim from BDD.",
                lock="45 days of availability after submission",
            ))
        else:
            steps.append(_exam_gate())
        steps.append(Step(
            title="Separate; the DD-214 closes the loop",
            form_number="DD-214",
            detail="The effective date is the day after discharge either way.",
        ))

    elif lane == Lane.IDES:
        steps += _stage_zero(claim, include_itf=False)
        steps.append(Step(
            title="File the joint DoD/VA claim",
            form_number="21-0819",
            detail="Triggered by the MEB referral. DoD runs the exams (DD 2807-1 and DD 2808).",
        ))
        steps += _conditional_attachments(claim)

    elif lane == Lane.FIRST_CLAIM:
        steps += _stage_zero(claim)
        steps.append(Step(
            title="Gather your evidence",
            form_number="DD-214",
            detail="DD-214 via milConnect or SF-180, service treatment records, and current "
                   "private records.",
        ))
        steps += _records_steps(claim)
        steps.append(Step(
            title="File the claim",
            form_number="21-526EZ",
            detail="List every condition. The Fully Developed Claim election means 'I have "
                   "attached everything' - faster if true, quietly downgraded if VA has to fetch "
                   "anything.",
        ))
        steps += _conditional_attachments(claim)
        steps.append(_exam_gate())

    elif lane == Lane.INCREASE:
        steps += _stage_zero(claim, include_itf=False)
        steps.append(Step(
            title="Gather proof it got worse",
            form_number="DBQ",
            detail="Recent treatment records, ideally a DBQ where a doctor scores the condition "
                   "against VA's own criteria. Measurements win; 'trust me' loses.",
        ))
        steps += _records_steps(claim)
        steps.append(Step(
            title="File the claim for increase",
            form_number="21-526EZ",
            detail="Same master form, marked as an increase on the listed condition.",
        ))
        steps += _conditional_attachments(claim)
        steps.append(_exam_gate(harsh=True))

    elif lane == Lane.NEW_CONDITION:
        steps += _stage_zero(claim)
        if claim.context.caused_by_rated_condition:
            steps.append(Step(
                title="Get the nexus letter",
                form_number="Nexus letter",
                detail="A doctor writes, on letterhead, that the new condition is 'at least as "
                       "likely as not' caused or aggravated by the already-rated condition. For a "
                       "secondary claim this letter basically is the claim.",
            ))
        steps += _records_steps(claim)
        steps.append(Step(
            title="File the claim",
            form_number="21-526EZ",
            detail="New condition listed; for a secondary, named alongside the service-connected "
                   "condition causing it.",
        ))
        steps += _conditional_attachments(claim)
        steps.append(_exam_gate())

    elif lane == Lane.DECISION_REVIEW:
        door = decision_review_door(claim.context)
        steps += _stage_zero(claim, include_itf=False)
        if door == "20-0995":
            steps.append(Step(
                title="File a Supplemental Claim",
                form_number="20-0995",
                detail="'Here's something you haven't seen.' New evidence goes in and a rater "
                       "decides again. The duty to assist reattaches - the only lane where it does.",
                lock="File within 1 year of the decision to keep the original pay date",
            ))
            steps += _records_steps(claim)
        elif door == "20-0996":
            steps.append(Step(
                title="File a Higher-Level Review",
                form_number="20-0996",
                detail="'Same file, look again - you made a mistake.' A senior rater rereads what "
                       "is already there.",
                lock="Hard 1-year deadline. No new evidence accepted.",
            ))
        elif door == "10182":
            steps.append(Step(
                title="File a Board Appeal",
                form_number="10182",
                detail="A Veterans Law Judge decides. Pick a docket on the form: direct review, "
                       "evidence submission, or a hearing.",
                lock="Hard 1-year deadline. Cannot file two Board appeals in a row on one issue.",
            ))
        elif door == "21-0958":
            steps.append(Step(
                title="File a legacy Notice of Disagreement",
                form_number="21-0958",
                detail="This decision predates Feb 19, 2019 and is still in the legacy system. "
                       "The SOC arrives next, then VA Form 9.",
                lock="Within 1 year of the decision",
            ))

    return steps


# --- deadlines -------------------------------------------------------------


@dataclass
class Deadline:
    label: str
    due: date
    detail: str = ""
    hard: bool = True

    @property
    def days_left(self) -> int:
        return (self.due - date.today()).days

    @property
    def expired(self) -> bool:
        return self.days_left < 0

    @property
    def urgency(self) -> str:
        if self.expired:
            return "expired"
        if self.days_left <= 30:
            return "urgent"
        if self.days_left <= 90:
            return "soon"
        return "ok"


def deadlines(claim: Claim, today: Optional[date] = None) -> List[Deadline]:
    """Every clock currently running on this claim, soonest first.

    One decision date feeds six of these, which is exactly why they are computed
    in one place rather than scattered through the UI.
    """
    today = today or date.today()
    context = claim.context
    found: List[Deadline] = []

    if context.itf_filed_on:
        found.append(Deadline(
            label="Intent to File expires",
            due=context.itf_filed_on + timedelta(days=365),
            detail="File the 21-526EZ before this date to inherit the ITF effective date.",
        ))

    if context.records_auth_signed_on:
        found.append(Deadline(
            label="21-4142 authorization expires",
            due=context.records_auth_signed_on + timedelta(days=365),
            detail="A new signature is needed after this date; long claims routinely outlive it.",
        ))

    if context.still_serving and context.separation_date:
        found.append(Deadline(
            label="BDD window closes",
            due=context.separation_date - timedelta(days=BDD_WINDOW_CLOSES),
            detail="After this, the claim is processed as a standard pre-discharge claim.",
        ))

    if context.decision_date:
        one_year = context.decision_date + timedelta(days=365)
        found.append(Deadline(
            label="Higher-Level Review deadline",
            due=one_year,
            detail="Hard deadline. No new evidence accepted on this door.",
        ))
        found.append(Deadline(
            label="Board Appeal deadline",
            due=one_year,
            detail="Hard deadline, and you cannot file two Board appeals in a row on one issue.",
        ))
        found.append(Deadline(
            label="Supplemental Claim - effective date preserved until",
            due=one_year,
            detail="Filing later is allowed, but the effective date resets to the filing date.",
            hard=False,
        ))
        if context.has_dependents:
            found.append(Deadline(
                label="Dependents retro window (21-686c)",
                due=one_year,
                detail="Filed within 1 year of the rating that crossed 30%, back pay runs to the "
                       "rating date. Later, only from the filing date.",
                hard=False,
            ))

    return sorted(found, key=lambda deadline: deadline.due)


def third_party_dependencies(claim: Claim) -> List[Step]:
    """Steps the veteran cannot complete themselves - the chase list."""
    return [
        step for step in build_sequence(claim)
        if step.filled_by in {FilledBy.DOCTOR, FilledBy.EMPLOYER, FilledBy.WITNESS, FilledBy.FACILITY}
    ]
