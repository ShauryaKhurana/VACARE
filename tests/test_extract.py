"""Extraction and the chat flow.

The API is mocked so the suite is fast, free, and works offline. The live
tests at the bottom only run when a real key is present.
"""

from datetime import date
from unittest.mock import patch

import pytest

from src import extract, gemini, intake_chat
from src.gemini import Attachment, GeminiError

STORY_PAYLOAD = {
    "conditions": [
        {"name": "Tinnitus", "current_symptoms": "Ears ring constantly",
         "onset_date": "2011-04-01", "started_in_service": True,
         "worsened_in_service": False, "currently_treated": True},
        {"name": "Lower back pain", "current_symptoms": "Hurts when standing",
         "onset_date": "", "started_in_service": True, "worsened_in_service": True},
    ],
    "event": {"title": "Convoy IED blast", "description": "Vehicle struck a device.",
              "event_date": "2011-04-09", "location": "Kandahar", "witnesses": "Alvarez",
              "documented_in_service_records": True},
    "private_treatment": True, "unemployable": False,
    "has_dependents": True, "has_witness": True,
}

DD214_PAYLOAD = {
    "document_type": "dd214", "confidence": "high", "summary": "DD-214 for DANA REYES",
    "first_name": "DANA", "last_name": "REYES", "date_of_birth": "1988-03-12",
    "branch": "army", "service_start": "2007-06-01", "service_end": "2013-08-30",
    "discharge_type": "honorable",
}


# --- parsing helpers -------------------------------------------------------


def test_parse_date_handles_partial_and_junk():
    assert extract.parse_date("2011-04-09") == date(2011, 4, 9)
    assert extract.parse_date("2011-04") == date(2011, 4, 1)
    assert extract.parse_date("2011") == date(2011, 1, 1)
    assert extract.parse_date("") is None
    assert extract.parse_date("sometime in the spring") is None
    assert extract.parse_date(None) is None


def test_parse_date_rejects_the_future():
    assert extract.parse_date("2099-01-01") is None


def test_names_from_documents_are_recased_but_typed_names_are_not():
    assert extract.normalize_name("REYES") == "Reyes"
    assert extract.normalize_name("de la Cruz") == "de la Cruz"


def test_conditions_are_normalized_into_model_kwargs():
    conditions = extract.conditions_from(STORY_PAYLOAD)
    assert [c["name"] for c in conditions] == ["Tinnitus", "Lower back pain"]
    assert conditions[0]["onset_date"] == date(2011, 4, 1)
    assert conditions[1]["onset_date"] is None
    assert conditions[0]["currently_treated"] is True


def test_conditions_without_a_name_are_dropped():
    assert extract.conditions_from({"conditions": [{"name": "", "current_symptoms": "x"}]}) == []


def test_event_needs_both_a_title_and_a_description():
    assert extract.event_from(STORY_PAYLOAD)["title"] == "Convoy IED blast"
    assert extract.event_from({"event": {"title": "Blast", "description": ""}}) is None
    assert extract.event_from({}) is None


def test_veteran_fields_are_recased_and_typed():
    fields = extract.veteran_fields_from(DD214_PAYLOAD)
    assert fields["first_name"] == "Dana" and fields["last_name"] == "Reyes"
    assert fields["dob"] == date(1988, 3, 12)
    assert fields["service_end"] == date(2013, 8, 30)


# --- the chat flow ---------------------------------------------------------


@pytest.fixture
def session():
    return intake_chat.new_session()


def test_first_question_is_the_open_story_question(session):
    question = intake_chat.next_question(session)
    assert question.slot == intake_chat.Slot.STORY
    assert question.accepts_upload


def test_story_populates_conditions_event_and_flags(session):
    with patch.object(extract, "extract_from_story", return_value=STORY_PAYLOAD), \
         patch.object(gemini, "available", return_value=True):
        receipt = intake_chat.apply_answer(session, "IED blast, ears ring, back hurts")

    claim = session.claim
    assert "Tinnitus" in receipt
    assert [c.name for c in claim.conditions] == ["Tinnitus", "Lower back pain"]
    assert claim.service_events[0].title == "Convoy IED blast"
    assert claim.conditions[0].service_event_id == claim.service_events[0].id
    assert claim.context.private_treatment and claim.context.has_dependents


def test_a_story_with_no_condition_re_asks_rather_than_advancing(session):
    with patch.object(extract, "extract_from_story", return_value={"conditions": []}), \
         patch.object(gemini, "available", return_value=True):
        receipt = intake_chat.apply_answer(session, "not sure really")
    assert "couldn't pick out" in receipt
    assert intake_chat.next_question(session).slot == intake_chat.Slot.STORY


def test_story_without_an_api_key_is_kept_not_lost(session):
    with patch.object(gemini, "available", return_value=False):
        receipt = intake_chat.apply_answer(session, "My knees are shot from jumping.")
    assert session.claim.summary == "My knees are shot from jumping."
    assert "VSO" in receipt


def test_dd214_upload_fills_identity_so_it_is_never_asked(session):
    session.story_done = True
    with patch.object(extract, "extract_from_document", return_value=DD214_PAYLOAD), \
         patch.object(gemini, "available", return_value=True):
        receipt = intake_chat.apply_document(session, Attachment("dd214.pdf", b"%PDF-"))

    veteran = session.claim.veteran
    assert veteran.full_name == "Dana Reyes"
    assert veteran.dob == date(1988, 3, 12)
    assert veteran.service_end == date(2013, 8, 30)
    assert veteran.discharge_type.value == "honorable"
    assert "Filled in" in receipt
    # And the identity questions are now skipped entirely.
    assert intake_chat.next_question(session).slot == intake_chat.Slot.RATING


def test_uploaded_document_is_recorded_as_evidence(session):
    session.story_done = True
    with patch.object(extract, "extract_from_document", return_value=DD214_PAYLOAD), \
         patch.object(gemini, "available", return_value=True):
        intake_chat.apply_document(session, Attachment("dd214.pdf", b"%PDF-"))
    assert session.claim.has_evidence("dd214")


def test_decision_letter_sets_the_date_and_the_lane(session):
    session.story_done = True
    payload = {"document_type": "decision_letter", "confidence": "high",
               "summary": "Rating decision", "decision_date": "2026-06-01"}
    with patch.object(extract, "extract_from_document", return_value=payload), \
         patch.object(gemini, "available", return_value=True):
        intake_chat.apply_document(session, Attachment("decision.pdf", b"%PDF-"))
    assert session.claim.context.decision_date == date(2026, 6, 1)
    assert session.claim.context.disagrees_with_decision


def established_identity(session):
    """Fast-forward past the story and identity slots."""
    session.story_done = True
    session.identity_done = True
    veteran = session.claim.veteran
    veteran.first_name, veteran.last_name = "Dana", "Reyes"
    veteran.dob = date(1988, 3, 12)
    veteran.service_start = date(2007, 6, 1)
    veteran.service_end = date(2013, 8, 30)
    return session


def test_rating_answer_implies_having_filed_before(session):
    established_identity(session)
    assert intake_chat.next_question(session).slot == intake_chat.Slot.RATING

    intake_chat.apply_answer(session, "30%")
    context = session.claim.context
    assert context.combined_rating == 30
    assert context.has_existing_rating and context.has_filed_before


def test_no_rating_means_no_intent_question(session):
    established_identity(session)
    intake_chat.apply_answer(session, "none")
    assert intake_chat.next_question(session).slot == intake_chat.Slot.RECORDS


def test_a_sentence_is_rejected_in_the_name_slot(session):
    session.story_done = True
    session.identity_done = True
    receipt = intake_chat.apply_answer(session, "A new condition caused by one I am rated for")
    assert "doesn't look like a name" in receipt
    assert session.claim.veteran.first_name == "Unknown"


def test_intent_answer_routes_to_a_secondary_claim(session):
    established_identity(session)
    session.rating_done = True
    session.claim.context.has_existing_rating = True
    assert intake_chat.next_question(session).slot == intake_chat.Slot.INTENT

    intake_chat.apply_answer(session, "A new condition caused by one I'm rated for")
    assert session.claim.context.caused_by_rated_condition


# --- live tests ------------------------------------------------------------

live = pytest.mark.skipif(not gemini.available(), reason="no GEMINI_API_KEY configured")


@live
def test_live_story_extraction_finds_two_conditions():
    try:
        payload = extract.extract_from_story(
            "IED blast in Kandahar 2011. Ears ring constantly and my lower back hurts when I stand."
        )
    except GeminiError as error:
        if "HTTP 503" in str(error) or "HTTP 429" in str(error):
            pytest.skip(f"Gemini temporarily unavailable: {error}")
        raise
    names = " ".join(c["name"].lower() for c in extract.conditions_from(payload))
    assert "tinnitus" in names or "ring" in names
    assert "back" in names


@live
def test_live_document_extraction_identifies_a_dd214():
    text = (b"CERTIFICATE OF RELEASE OR DISCHARGE FROM ACTIVE DUTY\n"
            b"1. NAME: REYES, DANA\n2. BRANCH: ARMY\n5. DATE OF BIRTH: 1988 03 12\n"
            b"12a. DATE ENTERED AD: 2007 06 01\n12b. SEPARATION DATE: 2013 08 30\n"
            b"24. CHARACTER OF SERVICE: HONORABLE\n")
    try:
        payload = extract.extract_from_document(Attachment("dd214.txt", text))
    except GeminiError as error:
        if "HTTP 503" in str(error) or "HTTP 429" in str(error):
            pytest.skip(f"Gemini temporarily unavailable: {error}")
        raise
    assert payload["document_type"] == "dd214"
    fields = extract.veteran_fields_from(payload)
    assert fields["dob"] == date(1988, 3, 12)
    assert fields["service_end"] == date(2013, 8, 30)
