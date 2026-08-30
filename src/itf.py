"""Intent to File (Form 21-0966) helpers.

An ITF locks the effective date for back pay for 12 months. BDD and pre-discharge
paths skip it because the effective date is fixed at separation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from src import lanes
from src.models import Claim

ITF_WINDOW_DAYS = 365

# Plain-language copy for veterans (and anyone helping them).
TITLE = "Save your back-pay start date"
FORM_LABEL = "VA Form 21-0966"

EXPLAINER = (
    "This is a one-page note to the VA that says: “I plan to file a disability claim.” "
    "It is not the full claim — you do not need doctor records or a list of conditions yet. "
    "If the VA approves you later, they can pay you back to the date on this form. "
    "Filing it early protects money you might lose while gathering paperwork. It is free."
)

EXPLAINER_SHORT = (
    "A free one-page form that tells the VA you're planning to claim — "
    "so if you're approved later, back pay can start from that date."
)


@dataclass
class ItfStatus:
    applies: bool
    filed_on: Optional[date]
    expires_on: Optional[date]
    days_left: Optional[int]
    urgency: str  # none, missing, ok, soon, urgent, expired
    message: str


def itf_applies(claim: Claim, today: Optional[date] = None) -> bool:
    lane = lanes.determine_lane(claim.context, today)
    return lane not in (lanes.Lane.BDD, lanes.Lane.PRE_DISCHARGE, lanes.Lane.IDES)


def itf_status(claim: Claim, today: Optional[date] = None) -> ItfStatus:
    today = today or date.today()
    if not itf_applies(claim, today):
        return ItfStatus(
            applies=False,
            filed_on=None,
            expires_on=None,
            days_left=None,
            urgency="none",
            message=(
                "Not needed on your path — your back-pay start date is tied to your separation date."
            ),
        )

    filed = claim.context.itf_filed_on
    if not filed:
        return ItfStatus(
            applies=True,
            filed_on=None,
            expires_on=None,
            days_left=None,
            urgency="missing",
            message=(
                "You haven't saved a start date with the VA yet. "
                "The one-page form is free and takes about a minute."
            ),
        )

    expires = filed + timedelta(days=ITF_WINDOW_DAYS)
    days_left = (expires - today).days
    if days_left < 0:
        urgency = "expired"
        message = (
            f"Your saved start date expired on {expires.isoformat()}. "
            f"File a new {FORM_LABEL} to begin a fresh 12-month window."
        )
    elif days_left <= 30:
        urgency = "urgent"
        message = (
            f"Your saved start date runs out in {days_left} days ({expires.isoformat()}). "
            "Finish and submit your full claim before then to keep that back-pay date."
        )
    elif days_left <= 90:
        urgency = "soon"
        message = (
            f"Your saved start date is good until {expires.isoformat()} "
            f"({days_left} days left)."
        )
    else:
        urgency = "ok"
        message = (
            f"Start date saved with the VA: {filed.isoformat()}. "
            f"If approved, back pay could begin from that day. Good through {expires.isoformat()}."
        )

    return ItfStatus(
        applies=True,
        filed_on=filed,
        expires_on=expires,
        days_left=days_left,
        urgency=urgency,
        message=message,
    )


def record_itf(claim: Claim, filed_on: date) -> ItfStatus:
    claim.context.itf_filed_on = filed_on
    return itf_status(claim)
