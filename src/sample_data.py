"""A realistic sample claim, used by `cli demo` and by the tests."""

from __future__ import annotations

from datetime import date

from src.claim_intake import ClaimIntake
from src.models import Branch, DischargeType, EvidenceType, Veteran


def build_sample_claim():
    veteran = Veteran(
        first_name="Dana",
        last_name="Reyes",
        dob=date(1988, 3, 12),
        email="dana.reyes@example.com",
        phone="555-014-2277",
        branch=Branch.ARMY,
        service_start=date(2007, 6, 1),
        service_end=date(2013, 8, 30),
        discharge_type=DischargeType.HONORABLE,
    )

    session = ClaimIntake()
    session.start_claim(veteran)

    blast = session.add_service_event(
        title="Convoy IED blast",
        description=(
            "Vehicle struck a roadside device outside Kandahar. Ears rang for days "
            "and my lower back has hurt since."
        ),
        event_date=date(2011, 4, 9),
        location="Kandahar, Afghanistan",
        witnesses="SGT M. Alvarez, same vehicle",
        documented_in_service_records=True,
    )

    session.add_condition(
        name="Tinnitus",
        current_symptoms="Constant ringing in both ears, worse at night, makes sleep difficult.",
        diagnosis="Bilateral tinnitus",
        onset_date=date(2011, 4, 1),
        started_in_service=True,
        currently_treated=True,
        service_event_id=blast.id,
    )
    session.add_condition(
        name="Lower back pain",
        current_symptoms="Stiffness and sharp pain when standing more than 20 minutes.",
        onset_date=date(2011, 5, 1),
        started_in_service=True,
        worsened_in_service=True,
        currently_treated=False,
        service_event_id=blast.id,
    )

    session.add_evidence(EvidenceType.DD214, source="veteran", file_uri="~/documents/dd214.pdf")
    session.add_evidence(EvidenceType.SERVICE_TREATMENT_RECORD, source="veteran")
    session.add_evidence(EvidenceType.CURRENT_MEDICAL_RECORD, source="VA clinic")

    session.evaluate_readiness()
    return session.claim
