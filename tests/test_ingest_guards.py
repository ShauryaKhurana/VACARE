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


# --- the records step must be escapable -------------------------------------


def records_session():
    """A session parked on the 'upload your records' step."""
    from src import intake_chat

    session = intake_chat.new_session()
    session.story_done = True
    session.identity_done = True
    session.contact_done = True
    session.address_done = True
    session.ssn_done = True
    session.rating_done = True
    session.intent_done = True
    veteran = session.claim.veteran
    veteran.first_name, veteran.last_name = "Dana", "Reyes"
    veteran.dob = date(1988, 3, 12)
    veteran.service_start = date(2007, 6, 1)
    assert intake_chat.next_question(session).slot == intake_chat.Slot.RECORDS
    return session


@pytest.mark.parametrize("answer", [
    "done", "Done uploading", "skip", "Skip for now", "no", "nope", "none",
    "nothing else", "that's all", "that's everything", "no more", "all set",
    "finished", "next", "continue", "ready",
])
def test_ordinary_ways_of_saying_nothing_more_finish_the_step(answer):
    """A veteran should not have to guess a magic word to move on."""
    from src import intake_chat

    session = records_session()
    intake_chat.apply_answer(session, answer)
    assert session.records_done, f"{answer!r} left the veteran stuck"


def test_an_unrelated_answer_keeps_the_step_open_with_a_usable_hint():
    from src import intake_chat

    session = records_session()
    receipt = intake_chat.apply_answer(session, "what does a nexus letter cost")
    assert not session.records_done
    assert "done" in receipt.lower()          # tells them how to move on


def test_the_step_advertises_a_way_out():
    from src import intake_chat

    session = records_session()
    assert intake_chat.next_question(session).options, "no options means no buttons"


# --- address and SSN collection ---------------------------------------------


@pytest.mark.parametrize("text,street,city,state,zip_code", [
    ("3114 Elm Street, Tucson, AZ 85701", "3114 Elm Street", "Tucson", "AZ", "85701"),
    ("12 Oak Ave, Apt 3, Denver, CO 80202-1234", "12 Oak Ave, Apt 3", "Denver", "CO", "802021234"),
    ("PO Box 12, Reno, NV 89501", "PO Box 12", "Reno", "NV", "89501"),
])
def test_a_one_line_address_is_parsed(text, street, city, state, zip_code):
    from src.intake_chat import _parse_address

    parsed = _parse_address(text)
    assert parsed is not None
    assert (parsed.street, parsed.city, parsed.state, parsed.zip_code) == (
        street, city, state, zip_code)


@pytest.mark.parametrize("text", ["nope", "Tucson AZ 85701", "just a street name", ""])
def test_an_unusable_address_is_rejected_rather_than_half_saved(text):
    from src.intake_chat import _parse_address

    assert _parse_address(text) is None


def identity_session():
    from src import intake_chat

    session = intake_chat.new_session()
    session.story_done = True
    session.identity_done = True
    session.contact_done = True
    veteran = session.claim.veteran
    veteran.first_name, veteran.last_name = "Marcus", "Rivera"
    veteran.dob = date(1990, 7, 22)
    veteran.service_start = date(2009, 9, 14)
    veteran.service_end = date(2016, 11, 3)
    return session


def test_the_intake_asks_for_an_address_then_an_ssn():
    from src import intake_chat

    session = identity_session()
    assert intake_chat.next_question(session).slot == intake_chat.Slot.ADDRESS

    intake_chat.apply_answer(session, "3114 Elm Street, Tucson, AZ 85701")
    assert session.claim.veteran.address.is_complete
    assert intake_chat.next_question(session).slot == intake_chat.Slot.SSN

    intake_chat.apply_answer(session, "000-00-0000")
    assert session.claim.veteran.ssn == "000000000"


def test_the_ssn_can_be_skipped_without_blocking_the_intake():
    from src import intake_chat

    session = identity_session()
    intake_chat.apply_answer(session, "3114 Elm Street, Tucson, AZ 85701")
    receipt = intake_chat.apply_answer(session, "Skip — I'll write it in myself")

    assert session.ssn_done and session.claim.veteran.ssn is None
    assert "write in" in receipt
    assert intake_chat.next_question(session).slot != intake_chat.Slot.SSN


def test_a_receipt_never_echoes_the_whole_ssn_back():
    from src import intake_chat

    session = identity_session()
    intake_chat.apply_answer(session, "3114 Elm Street, Tucson, AZ 85701")
    receipt = intake_chat.apply_answer(session, "123-45-6789")

    assert "123456789" not in receipt and "123-45-6789" not in receipt
    assert "6789" in receipt        # last four only, so they can check it


def test_a_malformed_ssn_is_refused():
    from src import intake_chat

    session = identity_session()
    intake_chat.apply_answer(session, "3114 Elm Street, Tucson, AZ 85701")
    receipt = intake_chat.apply_answer(session, "12345")

    assert not session.ssn_done
    assert "9 digits" in receipt


# --- the cache must not silently drop schema fields -------------------------


def test_the_parse_cache_keeps_every_field_the_schema_defines():
    """A hand-written allow-list drifted and dropped seven fields."""
    from src import extract, parse_cache

    assert set(parse_cache.document_field_keys()) == set(
        extract.DOCUMENT_SCHEMA["properties"]
    )


def test_a_cached_parse_round_trips_the_newer_fields():
    from src import parse_cache

    payload = {
        "document_type": "dd214", "confidence": "high", "summary": "DD-214",
        "first_name": "Marcus", "last_name": "Rivera", "ssn": "000000000",
        "home_of_record": "3114 ELM STREET, TUCSON, AZ 85701",
        "still_serving": False, "outcome": "granted", "combined_rating": 30,
    }
    kept = parse_cache.document_fields(payload)
    for key in ("ssn", "home_of_record", "still_serving", "outcome", "combined_rating"):
        assert key in kept, f"{key} was dropped on the way into the cache"


def test_the_cache_key_changes_when_the_extraction_contract_changes(monkeypatch):
    """Otherwise a schema change is invisible for any document already seen."""
    from src import extract, parse_cache

    before = parse_cache.file_hash(b"same bytes")
    schema = {**extract.DOCUMENT_SCHEMA,
              "properties": {**extract.DOCUMENT_SCHEMA["properties"],
                             "new_field": {"type": "string"}}}
    monkeypatch.setattr(extract, "DOCUMENT_SCHEMA", schema)
    assert parse_cache.file_hash(b"same bytes") != before


# --- what the DD-214 already answers is not asked again ---------------------


def test_an_ssn_read_off_the_dd214_is_not_asked_for():
    from src import intake_chat

    session = identity_session()
    session.claim.veteran.ssn = "000000000"
    intake_chat.apply_answer(session, "3114 Elm Street, Tucson, AZ 85701")

    assert intake_chat.next_question(session).slot != intake_chat.Slot.SSN


def test_the_home_of_record_is_offered_as_an_address_but_never_assumed():
    """Block 7b is where they lived when they enlisted - often long stale."""
    from src import intake_chat

    session = identity_session()
    session.claim.veteran.home_of_record = "3114 ELM STREET, TUCSON, AZ 85701"

    question = intake_chat.next_question(session)
    assert question.slot == intake_chat.Slot.ADDRESS
    assert question.options == ["3114 ELM STREET, TUCSON, AZ 85701"]
    # Offered only: nothing is on the claim until the veteran picks it.
    assert not session.claim.veteran.address.is_complete


def test_the_records_step_always_names_medical_records():
    """It briefly said only 'anything else to add?', which tells nobody what
    is wanted -- and the DD-214 already counts as a document."""
    from src import intake_chat
    from src.models import EvidenceType

    session = records_session()
    assert "medical records" in intake_chat.next_question(session).text.lower()

    ClaimIntake(session.claim).add_evidence(EvidenceType.DD214)
    assert "medical records" in intake_chat.next_question(session).text.lower()
