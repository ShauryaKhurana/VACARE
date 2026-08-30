"""Decision review / appeals lane entry (M10-lite).

Helps a veteran pick the right AMA door after a rating decision:
Higher-Level Review, Supplemental Claim, or Board Appeal.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import List, Optional

from src import decision, lanes
from src.forms import CATALOG
from src.models import Claim

TITLE = "Challenge the decision"
EXPLAINER = (
    "If the VA got it wrong, you have three modern paths — each with a hard "
    "one-year clock from the date on your decision letter. Pick the one that "
    "matches your situation; a VSO should confirm before you file."
)

DOOR_COPY = {
    "20-0996": {
        "title": "Higher-Level Review",
        "picker": "Same file — ask a senior rater to look again",
        "detail": (
            "Use this when you think the VA made a mistake reading what's already "
            "in your claim file. You cannot add new evidence on this path."
        ),
        "lock": "Hard 1-year deadline. No new evidence accepted.",
    },
    "20-0995": {
        "title": "Supplemental Claim",
        "picker": "I have new evidence VA has not seen",
        "detail": (
            "Use this when you have doctor records, buddy statements, or other proof "
            "the VA did not have before. The duty to assist kicks back in."
        ),
        "lock": "File within 1 year to keep the same effective date.",
    },
    "10182": {
        "title": "Board Appeal",
        "picker": "I want a judge to decide",
        "detail": (
            "A Veterans Law Judge reviews your case. On the form you pick a docket: "
            "direct review, submit more evidence, or request a hearing."
        ),
        "lock": "Hard 1-year deadline. Cannot file two Board appeals in a row.",
    },
}

VALID_DOORS = frozenset(DOOR_COPY)


@dataclass
class AppealPickerOption:
    form_number: str
    title: str
    picker_label: str
    detail: str
    lock: str


@dataclass
class AppealCheckItem:
    label: str
    detail: str


@dataclass
class AppealStatus:
    applies: bool
    disagrees: bool
    selected_door: Optional[str]
    recommended_door: Optional[str]
    message: str
    picker_options: List[AppealPickerOption]
    selected: Optional[decision.AppealDoor]
    checklist: List[AppealCheckItem]
    form_url: Optional[str]
    legacy_decision: bool


def appeal_applies(claim: Claim) -> bool:
    ctx = claim.context
    if not ctx.decision_date:
        return False
    if ctx.decision_date < lanes.LEGACY_CUTOFF:
        return False
    return True


def recommended_door(claim: Claim) -> Optional[str]:
    ctx = claim.context
    if not ctx.disagrees_with_decision and not ctx.appeal_door_selected:
        if ctx.decision_outcome in {"granted", "increased", "unchanged"} and not ctx.decision_denied:
            return None
    if ctx.appeal_door_selected:
        return ctx.appeal_door_selected
    return lanes.decision_review_door(ctx)


def picker_options() -> List[AppealPickerOption]:
    return [
        AppealPickerOption(
            form_number=num,
            title=copy["title"],
            picker_label=copy["picker"],
            detail=copy["detail"],
            lock=copy["lock"],
        )
        for num, copy in DOOR_COPY.items()
    ]


def _apply_door_flags(claim: Claim, form_number: str) -> None:
    ctx = claim.context
    ctx.disagrees_with_decision = True
    ctx.appeal_door_selected = form_number
    if form_number == "20-0995":
        ctx.has_new_evidence = True
        ctx.wants_judge = False
    elif form_number == "10182":
        ctx.wants_judge = True
        ctx.has_new_evidence = False
    else:
        ctx.has_new_evidence = False
        ctx.wants_judge = False


def select_door(claim: Claim, form_number: str) -> AppealStatus:
    if form_number not in VALID_DOORS:
        raise ValueError(f"Unknown appeal form: {form_number}")
    _apply_door_flags(claim, form_number)
    note = f"Veteran selected appeal path: VA Form {form_number}."
    claim.set_status(claim.status, note)
    return appeal_status(claim)


def mark_disagrees(claim: Claim) -> AppealStatus:
    claim.context.disagrees_with_decision = True
    return appeal_status(claim)


def mark_accepts_decision(claim: Claim) -> AppealStatus:
    claim.context.disagrees_with_decision = False
    claim.context.appeal_door_selected = None
    return appeal_status(claim)


def appeal_checklist(claim: Claim) -> List[AppealCheckItem]:
    door = claim.context.appeal_door_selected or recommended_door(claim)
    if not door:
        return []

    items: List[AppealCheckItem] = [
        AppealCheckItem(
            label="Decision letter on hand",
            detail="You'll need the date and issues from the letter.",
        ),
    ]

    if door == "20-0995":
        items.append(AppealCheckItem(
            label="New evidence ready",
            detail="Doctor notes, test results, buddy statements — anything VA has not seen.",
        ))
        items.append(AppealCheckItem(
            label="21-4142 signed if using private records",
            detail="Authorizes VA to request records from private doctors.",
        ))
    elif door == "20-0996":
        items.append(AppealCheckItem(
            label="Point to the mistake",
            detail="Write a short note on what the rater missed in the existing file.",
        ))
        items.append(AppealCheckItem(
            label="No new evidence",
            detail="Do not attach new medical records on an HLR — they will not be considered.",
        ))
    else:
        items.append(AppealCheckItem(
            label="Pick a Board docket",
            detail="Direct review (fastest), evidence submission, or hearing — on Form 10182.",
        ))
        items.append(AppealCheckItem(
            label="Optional hearing prep",
            detail="If you choose a hearing docket, plan what you want the judge to hear.",
        ))

    items.append(AppealCheckItem(
        label="VSO review before filing",
        detail="Have your representative confirm the door and deadline.",
    ))
    return items


def appeal_status(claim: Claim) -> AppealStatus:
    ctx = claim.context
    legacy = bool(ctx.decision_date and ctx.decision_date < lanes.LEGACY_CUTOFF)
    applies = appeal_applies(claim)

    if not applies:
        msg = (
            "Record a decision date first, then we can walk through appeal options."
            if not ctx.decision_date
            else "This decision may use legacy rules — confirm next steps with your VSO."
            if legacy
            else "Appeal guidance is not available for this claim yet."
        )
        return AppealStatus(
            applies=False,
            disagrees=ctx.disagrees_with_decision,
            selected_door=ctx.appeal_door_selected,
            recommended_door=None,
            message=msg,
            picker_options=[],
            selected=None,
            checklist=[],
            form_url=None,
            legacy_decision=legacy,
        )

    rec = recommended_door(claim)
    selected_door = ctx.appeal_door_selected
    doors = decision.appeal_doors(claim)
    selected_card = None
    for door in doors:
        if door.form_number == selected_door:
            selected_card = door
            break

    form = CATALOG.get(selected_door) if selected_door else None
    form_url = form.landing if form else None

    if selected_door:
        copy = DOOR_COPY[selected_door]
        message = (
            f"You chose {copy['title']} (Form {selected_door}). "
            f"{copy['detail']} Confirm with your VSO before filing."
        )
    elif ctx.disagrees_with_decision:
        message = (
            "You indicated you disagree. Pick the path below that best matches "
            "your situation — we'll highlight deadlines and what to gather."
        )
    else:
        message = (
            "If the decision is not what you expected, say so and we'll help you "
            "pick the right review path."
        )

    return AppealStatus(
        applies=True,
        disagrees=ctx.disagrees_with_decision,
        selected_door=selected_door,
        recommended_door=rec,
        message=message,
        picker_options=picker_options(),
        selected=selected_card,
        checklist=appeal_checklist(claim),
        form_url=form_url,
        legacy_decision=legacy,
    )
