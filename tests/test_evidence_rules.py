"""The checklist, linkage warnings, and readiness rules."""

from datetime import date

from src import evidence_rules
from src.claim_intake import ClaimIntake
from src.models import ClaimStatus, Condition, EvidenceType, Veteran
from src.sample_data import build_sample_claim


def bare_session() -> ClaimIntake:
    session = ClaimIntake()
    session.start_claim(Veteran(first_name="Dana", last_name="Reyes", dob=date(1988, 3, 12)))
    return session


def test_categorizes_conditions_by_keyword():
    assert evidence_rules.categorize(Condition(name="Tinnitus", current_symptoms="ringing ears")) == "hearing"
    assert evidence_rules.categorize(Condition(name="PTSD", current_symptoms="nightmares nightly")) == "mental_health"
    assert evidence_rules.categorize(Condition(name="Lower back pain", current_symptoms="stiff back")) == "musculoskeletal"
    assert evidence_rules.categorize(Condition(name="Vertigo", current_symptoms="dizzy spells")) == "general"


def test_empty_claim_is_blocked_and_scores_zero():
    session = bare_session()
    assert not evidence_rules.is_ready_for_vso(session.claim)
    assert session.readiness_score() == 0
    assert "No conditions have been claimed yet." in session.blockers()


def test_missing_baseline_documents_are_required_items():
    session = bare_session()
    session.add_condition(
        name="Tinnitus", current_symptoms="Ringing in both ears.", started_in_service=True
    )
    labels = [item.label for item in session.missing_items() if item.required]
    assert "DD-214 (discharge document)" in labels
    assert "Service treatment records" in labels


def test_condition_without_service_link_is_a_blocker():
    session = bare_session()
    session.add_condition(name="Tinnitus", current_symptoms="Ringing in both ears.")
    assert any("No service connection recorded" in problem for problem in session.blockers())
    assert any("no in-service event" in warning for warning in session.linkage_warnings())


def test_hearing_claim_suggests_a_hearing_test():
    session = bare_session()
    session.add_condition(
        name="Tinnitus", current_symptoms="Ringing in both ears.", started_in_service=True
    )
    suggested = [item.label for item in session.missing_items() if not item.required]
    assert "Audiology / hearing test results" in suggested


def test_nexus_letter_suggested_only_when_onset_was_after_service():
    session = bare_session()
    session.add_condition(
        name="Lower back pain", current_symptoms="Sharp pain when standing.", worsened_in_service=True
    )
    assert any("Nexus letter" in item.label for item in session.missing_items())

    started_in_service = bare_session()
    started_in_service.add_condition(
        name="Lower back pain", current_symptoms="Sharp pain when standing.", started_in_service=True
    )
    assert not any("Nexus letter" in item.label for item in started_in_service.missing_items())


def test_claim_becomes_ready_once_required_documents_arrive():
    session = bare_session()
    session.add_condition(
        name="Tinnitus",
        current_symptoms="Ringing in both ears.",
        started_in_service=True,
        currently_treated=True,
    )
    assert session.evaluate_readiness() == ClaimStatus.DRAFT

    for evidence_type in (
        EvidenceType.DD214,
        EvidenceType.SERVICE_TREATMENT_RECORD,
        EvidenceType.CURRENT_MEDICAL_RECORD,
    ):
        session.add_evidence(evidence_type)

    assert session.evaluate_readiness() == ClaimStatus.READY_FOR_VSO
    assert session.blockers() == []


def test_tasks_are_generated_from_the_checklist():
    session = bare_session()
    session.add_condition(
        name="Tinnitus", current_symptoms="Ringing in both ears.", started_in_service=True
    )
    tasks = session.refresh_tasks()
    assert tasks and all(task.owner == "veteran" for task in tasks)
    assert any(task.required for task in tasks)


def test_sample_claim_is_ready_with_only_soft_suggestions_left():
    claim = build_sample_claim()
    assert evidence_rules.is_ready_for_vso(claim)
    assert all(not item.required for item in evidence_rules.missing_evidence(claim))
    assert 0 < evidence_rules.readiness_score(claim) <= 100
