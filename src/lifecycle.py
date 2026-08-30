"""Plain-language claim lifecycle labels for list views."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src import collaboration, decision
from src.models import Claim, ClaimStatus


@dataclass
class LifecycleBadge:
    key: str
    label: str
    css_class: str


def lifecycle_badge(claim: Claim) -> LifecycleBadge:
    """One veteran-friendly status for home / inbox lists."""
    ctx = claim.context

    if ctx.appeal_door_selected:
        return LifecycleBadge("appeal", "Appeal started", "lifecycle-appeal")

    if claim.status == ClaimStatus.DECIDED or decision.has_decision(claim):
        if ctx.disagrees_with_decision and not ctx.appeal_door_selected:
            return LifecycleBadge("decision_review", "Decision — review options", "lifecycle-decision")
        return LifecycleBadge("decided", "Decision received", "lifecycle-decided")

    if claim.status == ClaimStatus.SUBMITTED or decision.is_submitted(claim):
        return LifecycleBadge("submitted", "Submitted to VA", "lifecycle-submitted")

    if collaboration.vso_approved(claim):
        return LifecycleBadge("approved", "Approved to file", "lifecycle-approved")

    if claim.status in {ClaimStatus.READY_FOR_VSO, ClaimStatus.IN_VSO_REVIEW}:
        return LifecycleBadge("vso", "With VSO", "lifecycle-vso")

    return LifecycleBadge("draft", "In progress", "lifecycle-draft")


def claim_title(claim: Claim) -> str:
    """Short label for lists — primary condition(s), not veteran name."""
    if claim.conditions:
        names = [c.name.strip() for c in claim.conditions if c.name.strip()]
        if not names:
            pass
        elif len(names) == 1:
            return names[0]
        elif len(names) == 2:
            return f"{names[0]} & {names[1]}"
        else:
            return f"{names[0]} + {len(names) - 1} more"
    if claim.summary and claim.summary.strip():
        text = claim.summary.strip()
        return text if len(text) <= 48 else text[:45] + "..."
    return "New claim"
