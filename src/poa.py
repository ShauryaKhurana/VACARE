"""Power of Attorney (Form 21-22) helpers.

A POA lets an accredited VSO file for the veteran and see their VA file.
VACARE assumes most veterans hand off to a VSO for review — this tracks whether
that permission is on record with the VA.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, TYPE_CHECKING

from src.models import Claim

if TYPE_CHECKING:
    from src.evidence_rules import ChecklistItem

TITLE = "Appoint your VSO"
FORM_LABEL = "VA Form 21-22"

EXPLAINER = (
    "This form gives a Veterans Service Organization (VSO) permission to talk to "
    "the VA for you, see your claim file, and file paperwork on your behalf. "
    "It is free. You sign it; your VSO countersigns. "
    "Without it, the VA will only speak to you directly — not your helper."
)

EXPLAINER_SHORT = (
    "Free form that lets your VSO file and communicate with the VA for you."
)


@dataclass
class PoaStatus:
    applies: bool
    filed_on: Optional[date]
    urgency: str  # none, missing, ok
    message: str
    filing_on_own: bool = False


@dataclass
class FilingCheckItem:
    label: str
    ok: bool
    detail: str
    optional: bool = False
    missing_items: List[str] = field(default_factory=list)


def poa_applies(claim: Claim) -> bool:
    return not claim.context.filing_on_own


def poa_status(claim: Claim) -> PoaStatus:
    if claim.context.filing_on_own:
        return PoaStatus(
            applies=False,
            filed_on=None,
            urgency="none",
            message="Veteran is filing on their own — no VSO appointment needed.",
            filing_on_own=True,
        )

    filed = claim.context.poa_filed_on
    if not filed:
        return PoaStatus(
            applies=True,
            filed_on=None,
            urgency="missing",
            message=(
                "No VSO appointment on record yet. "
                "Your representative needs Form 21-22 on file with the VA before they can file for you."
            ),
        )

    return PoaStatus(
        applies=True,
        filed_on=filed,
        urgency="ok",
        message=f"VSO appointment saved: {filed.isoformat()}. Your rep can act on your behalf with the VA.",
    )


def record_poa(claim: Claim, filed_on: date) -> PoaStatus:
    claim.context.poa_filed_on = filed_on
    claim.context.filing_on_own = False
    return poa_status(claim)


def mark_filing_on_own(claim: Claim) -> PoaStatus:
    claim.context.filing_on_own = True
    claim.context.poa_filed_on = None
    return poa_status(claim)


def _missing_evidence_labels(missing_required: List["ChecklistItem"]) -> List[str]:
    labels: List[str] = []
    for item in missing_required:
        scope = f" ({item.condition_name})" if item.condition_name else ""
        labels.append(f"{item.label}{scope}")
    return labels


def vso_filing_checklist(
    claim: Claim,
    *,
    missing_required: Optional[List["ChecklistItem"]] = None,
) -> List[FilingCheckItem]:
    """What the VSO should confirm before approving to file."""
    from src import itf as itf_helpers

    missing_required = missing_required or []
    missing_labels = _missing_evidence_labels(missing_required)

    itf = itf_helpers.itf_status(claim)
    poa = poa_status(claim)
    items: List[FilingCheckItem] = []

    if itf.applies:
        if itf.filed_on:
            itf_detail = f"21-0966 on file: {itf.filed_on.isoformat()}"
            if itf.expires_on:
                itf_detail += f" · valid through {itf.expires_on.isoformat()}"
        else:
            itf_detail = "Veteran has not recorded Form 21-0966 yet."
        items.append(FilingCheckItem(
            label="Back-pay start date (21-0966)",
            ok=itf.urgency not in {"missing", "expired"},
            detail=itf_detail,
            optional=itf.urgency == "expired",
        ))
    else:
        items.append(FilingCheckItem(
            label="Back-pay start date (21-0966)",
            ok=True,
            detail="Not applicable for this claim.",
            optional=True,
        ))

    if poa.applies:
        poa_detail = (
            f"21-22 on file: {poa.filed_on.isoformat()}"
            if poa.filed_on
            else "Veteran has not recorded Form 21-22 yet."
        )
        items.append(FilingCheckItem(
            label="VSO representation (21-22)",
            ok=poa.urgency == "ok",
            detail=poa_detail,
        ))
    else:
        items.append(FilingCheckItem(
            label="VSO representation (21-22)",
            ok=True,
            detail="Veteran is filing on their own.",
            optional=True,
        ))

    items.append(FilingCheckItem(
        label="Required evidence",
        ok=not missing_required,
        detail=(
            "All required documents on the checklist are present."
            if not missing_required
            else f"{len(missing_required)} required item(s) still missing:"
        ),
        missing_items=missing_labels,
    ))

    return items


def checklist_ready_to_approve(items: List[FilingCheckItem]) -> bool:
    return all(item.ok or item.optional for item in items)
