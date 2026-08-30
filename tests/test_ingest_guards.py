"""Guards found by running a real conversation.

A DD-214 for one veteran followed by medical records for another was silently
merged into one claim, and the same condition arriving under three different
wordings produced three entries.
"""

from datetime import date

import pytest

from src import document_ingest
from src.claim_intake import ClaimIntake
from src.document_ingest import identity_conflict, same_condition
from src.models import Veteran

DANA = {"first_name": "Dana", "last_name": "Reyes"}
MARCUS = {"first_name": "Marcus", "last_name": "Rivera"}


def claim_for(first="Dana", last="Reyes"):
    return ClaimIntake().start_claim(
        Veteran(first_name=first, last_name=last, dob=date(1988, 3, 12))
    )


# --- identity ---------------------------------------------------------------


def test_a_document_for_another_veteran_is_flagged():
    conflict = identity_conflict(claim_for(), MARCUS)
    assert conflict == "Marcus Rivera"


def test_the_same_veteran_is_not_flagged():
    assert identity_conflict(claim_for(), DANA) is None


def test_a_middle_name_or_different_first_name_spelling_is_tolerated():
    """Surnames decide; 'Dan' vs 'Dana' must not block a legitimate upload."""
    assert identity_conflict(claim_for(), {"first_name": "Dan", "last_name": "Reyes"}) is None
    assert identity_conflict(claim_for(), {"first_name": "DANA MARIE", "last_name": "REYES"}) is None


def test_a_document_naming_nobody_is_not_flagged():
    assert identity_conflict(claim_for(), {}) is None
    assert identity_conflict(claim_for(), {"first_name": "", "last_name": ""}) is None


def test_a_claim_with_no_identity_yet_accepts_any_document():
    blank = ClaimIntake().start_claim(Veteran(first_name="Unknown", last_name="Veteran"))
    assert identity_conflict(blank, MARCUS) is None


def test_another_veterans_document_adds_nothing_to_the_claim(monkeypatch, tmp_path):
    """The whole point: no identity change, no conditions, but the file is kept."""
    monkeypatch.setattr(document_ingest, "UPLOAD_ROOT", tmp_path)
    payload = {
        "document_type": "medical_record", "confidence": "high",
        "summary": "Clinic note for Marcus Rivera",
        "first_name": "Marcus", "last_name": "Rivera",
        "date_of_birth": "1990-07-22", "service_start": "", "service_end": "",
        "conditions": [{"name": "Chronic lumbar strain",
                        "current_symptoms": "Back pain when standing",
                        "started_in_service": True, "worsened_in_service": False}],
    }
    claim = claim_for()
    result = document_ingest.ingest_document(
        claim, "record.pdf", b"%PDF-fake", preloaded_payload=payload
    )

    assert result.identity_conflict == "Marcus Rivera"
    assert claim.conditions == []
    assert claim.veteran.full_name == "Dana Reyes"
    assert claim.veteran.dob == date(1988, 3, 12)
    assert "Marcus Rivera" in result.message and "Dana Reyes" in result.message
    assert claim.evidence, "the file should still be kept as evidence"


# --- condition wording ------------------------------------------------------


@pytest.mark.parametrize("left,right", [
    ("Tinnitus", "Tinnitus, bilateral"),
    ("Bilateral tinnitus", "Tinnitus, bilateral"),
    ("Chronic lumbar strain", "Chronic lumbar strain with radiculopathy"),
    ("PTSD", "PTSD"),
])
def test_the_same_condition_worded_differently_is_one_condition(left, right):
    assert same_condition(left, right)


@pytest.mark.parametrize("left,right", [
    ("Left knee strain", "Right knee strain"),   # separately rated by VA
    ("Tinnitus", "PTSD"),
    ("Hearing loss", "Tinnitus"),
])
def test_genuinely_different_conditions_stay_separate(left, right):
    assert not same_condition(left, right)


def test_re_uploading_a_record_does_not_duplicate_conditions(monkeypatch, tmp_path):
    monkeypatch.setattr(document_ingest, "UPLOAD_ROOT", tmp_path)
    claim = claim_for()
    ClaimIntake(claim).add_condition(
        name="Tinnitus", current_symptoms="Ringing in both ears.", started_in_service=True
    )
    payload = {
        "document_type": "medical_record", "confidence": "high",
        "summary": "Clinic note", "first_name": "Dana", "last_name": "Reyes",
        "date_of_birth": "", "service_start": "", "service_end": "",
        "conditions": [{"name": "Tinnitus, bilateral",
                        "current_symptoms": "Constant ringing",
                        "onset_date": "2011-01-01",
                        "started_in_service": True, "worsened_in_service": False,
                        "currently_treated": True}],
    }
    document_ingest.ingest_document(claim, "note.pdf", b"x", preloaded_payload=payload)

    assert len(claim.conditions) == 1
    # The more specific wording wins, and detail the first mention lacked is kept.
    assert claim.conditions[0].name == "Tinnitus, bilateral"
    assert claim.conditions[0].onset_date == date(2011, 1, 1)
    assert claim.conditions[0].currently_treated


def test_a_first_upload_is_not_described_as_a_repeat(monkeypatch, tmp_path):
    """A parse-cache hit from another claim must not read as 'you already did this'."""
    monkeypatch.setattr(document_ingest, "UPLOAD_ROOT", tmp_path)
    payload = {
        "document_type": "dd214", "confidence": "high", "summary": "DD-214",
        "first_name": "Dana", "last_name": "Reyes", "date_of_birth": "1988-03-12",
        "service_start": "2007-06-01", "service_end": "2013-08-30",
    }
    claim = claim_for()
    result = document_ingest.ingest_document(
        claim, "dd214.pdf", b"bytes", preloaded_payload=payload
    )
    assert not result.seen_before
    assert "already uploaded" not in result.message


def test_the_same_file_renamed_is_recognized_as_a_repeat(monkeypatch, tmp_path):
    monkeypatch.setattr(document_ingest, "UPLOAD_ROOT", tmp_path)
    payload = {
        "document_type": "dd214", "confidence": "high", "summary": "DD-214",
        "first_name": "Dana", "last_name": "Reyes", "date_of_birth": "1988-03-12",
        "service_start": "2007-06-01", "service_end": "2013-08-30",
    }
    claim = claim_for()
    document_ingest.ingest_document(claim, "dd214.pdf", b"same-bytes",
                                    preloaded_payload=payload)
    again = document_ingest.ingest_document(claim, "dd214-copy.pdf", b"same-bytes",
                                            preloaded_payload=payload)
    assert again.seen_before
