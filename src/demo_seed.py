"""Demo claims at each lifecycle stage for hackathon judging."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from src import appeal, collaboration, decision, itf, poa
from src.models import (
    Claim,
    ClaimStatus,
    MessageAuthor,
    VaSubmission,
    Veteran,
    VSOReview,
    VSOVerdict,
)
from src.sample_data import build_sample_claim
from src.storage import ClaimStore

PRIMARY_EMAIL = "primary@demo.vacare.local"


def clear_all_claims(db: ClaimStore) -> int:
    """Remove every claim (and orphan veterans) from the database."""
    row = db.connection.execute("SELECT COUNT(*) AS n FROM claims").fetchone()
    count = int(row["n"]) if row else 0
    db.connection.execute("DELETE FROM claims")
    db.connection.execute("DELETE FROM veterans")
    db.connection.commit()
    return count


def seed_primary_claim(db: ClaimStore) -> str:
    """One claim for the veteran home screen: Tinnitus & Lower back pain."""
    claim = build_sample_claim()
    claim.veteran.email = PRIMARY_EMAIL
    itf.record_itf(claim, date.today() - timedelta(days=14))
    poa.record_poa(claim, date.today() - timedelta(days=10))
    db.save_claim(claim)
    collaboration.submit_for_vso_review(db, claim)
    db.add_message(
        claim.id,
        MessageAuthor.VSO,
        "Hi — I'm reviewing your packet. Do you have any buddy statements for the back pain?",
    )
    return claim.id


def primary_claim_summary(claim_id: str) -> List[str]:
    return [
        "Primary demo claim seeded:",
        f"  • Tinnitus & Lower back pain: /claim/{claim_id}",
        "VSO inbox: http://127.0.0.1:8001",
    ]


DEMO_MARKER = "demo@vacare.local"

DEMO_STAGES: Tuple[str, ...] = (
    "vso_queue",
    "approved",
    "submitted",
    "appeal",
)


def _demo_email(stage: str) -> str:
    return f"{stage}.{DEMO_MARKER}"


def find_demo_claim_id(db: ClaimStore, stage: str) -> Optional[str]:
    row = db.connection.execute(
        """
        SELECT c.id FROM claims c
        JOIN veterans v ON v.id = c.veteran_id
        WHERE v.email = ?
        """,
        (_demo_email(stage),),
    ).fetchone()
    return row["id"] if row else None


def delete_claim(db: ClaimStore, claim_id: str) -> None:
    db.connection.execute("DELETE FROM claims WHERE id = ?", (claim_id,))
    db.connection.commit()


def _clone_demo_veteran(claim: Claim, *, first: str, last: str, email: str) -> None:
    claim.veteran = Veteran(
        first_name=first,
        last_name=last,
        dob=claim.veteran.dob,
        email=email,
        phone=claim.veteran.phone,
        branch=claim.veteran.branch,
        service_start=claim.veteran.service_start,
        service_end=claim.veteran.service_end,
        discharge_type=claim.veteran.discharge_type,
    )


def _ready_claim(first: str, last: str, email: str) -> Claim:
    claim = build_sample_claim()
    _clone_demo_veteran(claim, first=first, last=last, email=email)
    itf.record_itf(claim, date.today() - timedelta(days=14))
    poa.record_poa(claim, date.today() - timedelta(days=10))
    claim.set_status(ClaimStatus.READY_FOR_VSO, "Demo: ready for VSO")
    return claim


def build_vso_queue_claim() -> Claim:
    return _ready_claim("Morgan", "Voss", _demo_email("vso_queue"))


def build_approved_claim() -> Claim:
    claim = _ready_claim("Jordan", "Lee", _demo_email("approved"))
    claim.reviews.append(
        VSOReview(
            reviewer_name="Demo VSO",
            verdict=VSOVerdict.APPROVED_TO_FILE,
            review_notes="Demo packet approved — ready for VA sandbox.",
        )
    )
    claim.set_status(ClaimStatus.IN_VSO_REVIEW, "Demo: VSO approved")
    return claim


def build_submitted_claim() -> Claim:
    claim = build_approved_claim()
    _clone_demo_veteran(claim, first="Sam", last="Rivera", email=_demo_email("submitted"))
    decision.mark_submitted(claim, note="Demo: 526EZ submitted to VA sandbox.")
    claim.va_submissions.append(
        VaSubmission(
            submission_id="demo-submitted-001",
            status="received",
            message="Demo submission — waiting on VA decision.",
            submitted_on=date.today() - timedelta(days=45),
        )
    )
    return claim


def build_appeal_claim() -> Claim:
    claim = build_submitted_claim()
    _clone_demo_veteran(claim, first="Casey", last="Dunn", email=_demo_email("appeal"))
    claim.context.decision_date = date.today() - timedelta(days=20)
    claim.context.decision_outcome = "partial"
    claim.context.decision_summary = "Tinnitus granted at 10%; lower back pain denied."
    claim.context.decision_granted = ["Tinnitus"]
    claim.context.decision_denied = ["Lower back pain"]
    claim.context.combined_rating = 10
    claim.context.has_existing_rating = True
    claim.context.has_filed_before = True
    claim.set_status(ClaimStatus.DECIDED, "Demo: partial grant decision")
    appeal.select_door(claim, "20-0995")
    return claim


BUILDERS = {
    "vso_queue": build_vso_queue_claim,
    "approved": build_approved_claim,
    "submitted": build_submitted_claim,
    "appeal": build_appeal_claim,
}

STAGE_LABELS = {
    "vso_queue": "With VSO (inbox)",
    "approved": "Approved to file",
    "submitted": "Submitted — awaiting decision",
    "appeal": "Decision + appeal path",
}


def seed_demo_journey(
    db: ClaimStore,
    *,
    replace: bool = False,
) -> Dict[str, str]:
    """Create four demo claims. Returns stage → claim_id."""
    created: Dict[str, str] = {}

    for stage in DEMO_STAGES:
        existing = find_demo_claim_id(db, stage)
        if existing:
            if replace:
                delete_claim(db, existing)
            else:
                created[stage] = existing
                continue

        claim = BUILDERS[stage]()
        db.save_claim(claim)
        claim_id = claim.id

        if stage == "vso_queue":
            collaboration.submit_for_vso_review(db, claim)
            db.add_message(
                claim_id,
                MessageAuthor.VSO,
                "Hi Morgan — I'm reviewing your packet. Do you have any buddy statements for the back pain?",
            )
        elif stage == "approved":
            collaboration.submit_for_vso_review(db, claim)
            collaboration.vso_approve_to_file(
                db,
                claim,
                reviewer_name="Demo VSO",
                note="Demo approval — test-submit when ready.",
            )

        created[stage] = claim_id

    return created


def demo_summary(claim_ids: Dict[str, str]) -> List[str]:
    lines = ["Demo claims seeded:"]
    for stage, claim_id in claim_ids.items():
        lines.append(f"  • {STAGE_LABELS[stage]}: /claim/{claim_id}")
    lines.append("VSO inbox: http://127.0.0.1:8001")
    return lines
