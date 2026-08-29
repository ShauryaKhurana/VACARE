"""Intake orchestration: build a claim step by step and check if it is ready.

The CLI (or a future web API) only needs this class. It wraps the models,
runs the evidence rules, and keeps the claim's status honest.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from src import evidence_rules
from src.evidence_rules import ChecklistItem
from src.models import (
    Claim,
    ClaimStatus,
    ClaimType,
    Condition,
    EvidenceItem,
    EvidenceType,
    ServiceEvent,
    Task,
    Veteran,
    VSOReview,
    VSOVerdict,
)


class ClaimIntake:
    """Wraps a single claim while the veteran fills it in."""

    def __init__(self, claim: Optional[Claim] = None) -> None:
        self._claim = claim

    # -- lifecycle ---------------------------------------------------------

    @property
    def claim(self) -> Claim:
        if self._claim is None:
            raise ValueError("No claim has been started yet. Call start_claim() first.")
        return self._claim

    def start_claim(self, veteran: Veteran, claim_type: ClaimType = ClaimType.INITIAL) -> Claim:
        self._claim = Claim(veteran=veteran, claim_type=claim_type)
        self._claim.set_status(ClaimStatus.DRAFT, "Intake started")
        return self._claim

    # -- adding facts ------------------------------------------------------

    def add_service_event(
        self,
        title: str,
        description: str,
        event_date: Optional[date] = None,
        location: Optional[str] = None,
        witnesses: Optional[str] = None,
        documented_in_service_records: bool = False,
    ) -> ServiceEvent:
        return self.claim.add_service_event(
            ServiceEvent(
                title=title,
                description=description,
                event_date=event_date,
                location=location,
                witnesses=witnesses,
                documented_in_service_records=documented_in_service_records,
            )
        )

    def add_condition(
        self,
        name: str,
        current_symptoms: str,
        diagnosis: Optional[str] = None,
        onset_date: Optional[date] = None,
        started_in_service: bool = False,
        worsened_in_service: bool = False,
        currently_treated: bool = False,
        service_event_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Condition:
        return self.claim.add_condition(
            Condition(
                name=name,
                current_symptoms=current_symptoms,
                diagnosis=diagnosis,
                onset_date=onset_date,
                started_in_service=started_in_service,
                worsened_in_service=worsened_in_service,
                currently_treated=currently_treated,
                service_event_id=service_event_id,
                notes=notes,
            )
        )

    def add_evidence(
        self,
        evidence_type: EvidenceType,
        title: Optional[str] = None,
        source: Optional[str] = None,
        file_uri: Optional[str] = None,
        condition_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> EvidenceItem:
        return self.claim.add_evidence(
            EvidenceItem(
                evidence_type=evidence_type,
                title=title,
                source=source,
                file_uri=file_uri,
                condition_id=condition_id,
                notes=notes,
            )
        )

    def record_vso_review(
        self,
        reviewer_name: str,
        verdict: VSOVerdict = VSOVerdict.PENDING,
        review_notes: Optional[str] = None,
    ) -> VSOReview:
        review = VSOReview(reviewer_name=reviewer_name, verdict=verdict, review_notes=review_notes)
        self.claim.reviews.append(review)
        if verdict == VSOVerdict.APPROVED_TO_FILE:
            self.claim.set_status(ClaimStatus.SUBMITTED, f"Approved to file by {reviewer_name}")
        elif verdict == VSOVerdict.NEEDS_MORE_INFO:
            self.claim.set_status(ClaimStatus.DRAFT, f"More information requested by {reviewer_name}")
        return review

    # -- checks ------------------------------------------------------------

    def missing_items(self) -> List[ChecklistItem]:
        return evidence_rules.missing_evidence(self.claim)

    def linkage_warnings(self) -> List[str]:
        return evidence_rules.linkage_warnings(self.claim)

    def blockers(self) -> List[str]:
        return evidence_rules.blockers(self.claim)

    def readiness_score(self) -> int:
        return evidence_rules.readiness_score(self.claim)

    def refresh_tasks(self) -> List[Task]:
        """Regenerate the follow-up task list from the current claim state."""
        self.claim.tasks = evidence_rules.build_tasks(self.claim)
        return self.claim.tasks

    def evaluate_readiness(self) -> ClaimStatus:
        """Recompute tasks and move the claim between draft and VSO-ready."""
        self.refresh_tasks()
        ready = evidence_rules.is_ready_for_vso(self.claim)

        if ready and self.claim.status == ClaimStatus.DRAFT:
            self.claim.set_status(ClaimStatus.READY_FOR_VSO, "All required items collected")
        elif not ready and self.claim.status == ClaimStatus.READY_FOR_VSO:
            self.claim.set_status(ClaimStatus.DRAFT, "Required items are missing again")

        return self.claim.status
