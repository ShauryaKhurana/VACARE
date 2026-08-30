"""Veteran ↔ VSO collaboration — shared by both localhost apps."""

from __future__ import annotations

from typing import List

from src.claim_intake import ClaimIntake
from src import poa as poa_helpers
from src.models import (
    CaseMessage,
    Claim,
    ClaimStatus,
    MessageAuthor,
    Task,
    VSOReview,
    VSOVerdict,
)
from src.storage import ClaimStore


class ApprovalBlockedError(Exception):
    """VSO cannot approve until required filing checklist items pass."""

    def __init__(self, blockers: List[str]) -> None:
        self.blockers = blockers
        super().__init__("; ".join(blockers))


def approval_blockers(claim: Claim) -> List[str]:
    """Labels for checklist items that block VSO approval."""
    session = ClaimIntake(claim)
    missing_required = [m for m in session.missing_items() if m.required]
    items = poa_helpers.vso_filing_checklist(
        claim, missing_required=missing_required,
    )
    blockers: List[str] = []
    for item in items:
        if item.ok or item.optional:
            continue
        if item.label == "Required evidence" and missing_required:
            for missing in missing_required:
                scope = f" ({missing.condition_name})" if missing.condition_name else ""
                blockers.append(f"{missing.label}{scope}")
        else:
            blockers.append(item.label)
    return blockers


def list_messages(db: ClaimStore, claim_id: str) -> List[CaseMessage]:
    return db.list_messages(claim_id)


def post_message(
    db: ClaimStore,
    claim: Claim,
    *,
    author: MessageAuthor,
    body: str,
) -> CaseMessage:
    message = db.add_message(claim.id, author, body)
    if author == MessageAuthor.VSO and claim.status == ClaimStatus.READY_FOR_VSO:
        claim.set_status(ClaimStatus.IN_VSO_REVIEW, note="VSO opened the case")
        save_claim(db, claim)
    return message


def notify_veteran_uploaded_document(
    db: ClaimStore,
    claim: Claim,
    filename: str,
) -> CaseMessage:
    """System line in the veteran ↔ VSO thread when a document is added."""
    name = (filename or "document").strip()
    return db.add_message(
        claim.id,
        MessageAuthor.SYSTEM,
        f"{UPLOAD_MESSAGE_PREFIX}{name}",
    )


UPLOAD_MESSAGE_PREFIX = "upload:"


def is_upload_notice(message: CaseMessage) -> bool:
    if message.author != MessageAuthor.SYSTEM:
        return False
    if message.body.startswith(UPLOAD_MESSAGE_PREFIX):
        return True
    return message.body.strip().lower() in {
        "user uploaded a document.",
        "veteran uploaded a document.",
    }


def upload_filename(message: CaseMessage) -> str:
    return message.body[len(UPLOAD_MESSAGE_PREFIX):]


def message_text_for_veteran(message: CaseMessage) -> str:
    if is_upload_notice(message):
        name = upload_filename(message)
        if name and name != "document":
            return f"You sent a document: {name}"
        return "You sent a document."
    return message.body


def message_text_for_vso(message: CaseMessage) -> str:
    if is_upload_notice(message):
        return "Veteran uploaded a document."
    return message.body


def record_document_sent(
    db: ClaimStore,
    claim: Claim,
    filename: str,
) -> CaseMessage:
    """Always append a conversation line when the veteran sends a document."""
    return notify_veteran_uploaded_document(db, claim, filename)


def submit_for_vso_review(db: ClaimStore, claim: Claim) -> Claim:
    """Veteran finished intake — hand off to the VSO queue."""
    claim.set_status(ClaimStatus.READY_FOR_VSO, note="Veteran submitted for VSO review")
    save_claim(db, claim)
    db.add_message(
        claim.id,
        MessageAuthor.SYSTEM,
        "Claim submitted for VSO review. A representative will look at your packet soon.",
    )
    return claim


def vso_open_case(db: ClaimStore, claim: Claim, reviewer_name: str = "VSO") -> Claim:
    if claim.status == ClaimStatus.READY_FOR_VSO:
        claim.set_status(ClaimStatus.IN_VSO_REVIEW, note=f"Review started by {reviewer_name}")
        save_claim(db, claim)
    return claim


def vso_request_info(
    db: ClaimStore,
    claim: Claim,
    *,
    reviewer_name: str,
    request_text: str,
) -> CaseMessage:
    claim.reviews.append(
        VSOReview(
            reviewer_name=reviewer_name,
            verdict=VSOVerdict.NEEDS_MORE_INFO,
            review_notes=request_text,
        )
    )
    claim.tasks.append(
        Task(
            name="VSO requested information",
            detail=request_text,
            owner="veteran",
            required=True,
        )
    )
    claim.set_status(ClaimStatus.IN_VSO_REVIEW, note="VSO requested more information")
    save_claim(db, claim)
    return db.add_message(claim.id, MessageAuthor.VSO, request_text)


def vso_approve_to_file(
    db: ClaimStore,
    claim: Claim,
    *,
    reviewer_name: str,
    note: str = "Approved to file with VA.",
) -> Claim:
    blockers = approval_blockers(claim)
    if blockers:
        raise ApprovalBlockedError(blockers)

    claim.reviews.append(
        VSOReview(
            reviewer_name=reviewer_name,
            verdict=VSOVerdict.APPROVED_TO_FILE,
            review_notes=note,
        )
    )
    claim.set_status(ClaimStatus.IN_VSO_REVIEW, note="VSO approved — ready for VA submission")
    save_claim(db, claim)
    db.add_message(
        claim.id,
        MessageAuthor.VSO,
        f"Your packet looks good. {note} You can download the 526EZ and send it to the VA sandbox when ready.",
    )
    return claim


def vso_approved(claim: Claim) -> bool:
    return any(review.verdict == VSOVerdict.APPROVED_TO_FILE for review in claim.reviews)


def save_claim(db: ClaimStore, claim: Claim) -> None:
    db.save_claim(claim)
