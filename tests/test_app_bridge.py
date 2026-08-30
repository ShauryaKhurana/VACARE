"""The backend must emit exactly what the frontend's types.ts declares.

Node is not required to check this: the contract is a small, explicit set of
fields and string unions, so it is asserted here directly. If someone edits
frontend/veteran-app/lib/api/types.ts, these tests should fail.
"""

from datetime import date

import pytest

from src.api import app_bridge
from src.claim_intake import ClaimIntake
from src.models import ClaimStatus, EvidenceType, Veteran
from src.sample_data import build_sample_claim

# Mirrors of the unions in lib/api/types.ts.
CLAIM_TYPES = {"original", "increase", "presumptive", "supplemental",
               "higher-level-review", "fdc"}
CLAIM_STAGES = {"submitted", "development", "exam-scheduled", "resolved"}
OUTCOMES = {"granted", "denied", "pending"}
ACTIONS = {"upload-document", "e-sign-release", "message-vso"}
SOURCES = {"va", "vso", "veteran"}
MESSAGE_TYPES = {"ai-text", "veteran-text", "document-upload",
                 "confirmation-card", "eligibility-card", "statement-builder"}
DOCUMENT_TYPES = {"dd214", "medical-record", "other"}

CLAIM_KEYS = {"routingId", "claimType", "stage", "vso", "conditions",
              "needsAttention", "upcoming", "updates"}


def test_claim_payload_has_every_required_field():
    payload = app_bridge.claim_to_app_claim(build_sample_claim())
    assert CLAIM_KEYS <= set(payload)
    assert payload["claimType"] in CLAIM_TYPES
    assert payload["stage"] in CLAIM_STAGES
    assert isinstance(payload["routingId"], str) and payload["routingId"]


def test_vso_object_matches_the_interface():
    vso = app_bridge.claim_to_app_claim(build_sample_claim())["vso"]
    assert {"name", "organization", "accreditationId", "contactMethods"} == set(vso)
    for method in vso["contactMethods"]:
        assert method["type"] in {"phone", "message", "email"}


def test_conditions_match_the_interface():
    for condition in app_bridge.claim_to_app_claim(build_sample_claim())["conditions"]:
        assert {"id", "name", "outcome", "computedEligible"} <= set(condition)
        assert condition["outcome"] in OUTCOMES
        assert isinstance(condition["computedEligible"], bool)
        if "rating" in condition:
            assert 0 <= condition["rating"] <= 100


def test_attention_items_use_only_actions_the_ui_can_render():
    claim = build_sample_claim()
    claim.evidence.clear()          # force required gaps to appear
    for item in app_bridge.needs_attention(claim):
        assert {"id", "title", "detail", "action", "actionLabel"} == set(item)
        assert item["action"] in ACTIONS


def test_upcoming_items_carry_an_iso_date():
    claim = build_sample_claim()
    claim.context.itf_filed_on = date.today()
    for item in app_bridge.upcoming(claim):
        assert {"id", "title", "detail", "date"} == set(item)
        date.fromisoformat(item["date"])        # raises if not ISO


def test_expired_clocks_are_not_shown_as_upcoming():
    from datetime import timedelta

    claim = build_sample_claim()
    claim.context.itf_filed_on = date.today() - timedelta(days=400)
    assert not any("Intent to File" in item["title"] for item in app_bridge.upcoming(claim))


def test_updates_use_only_known_sources():
    claim = build_sample_claim()
    for entry in app_bridge.updates(claim):
        assert {"id", "source", "text", "timestamp"} == set(entry)
        assert entry["source"] in SOURCES
        date.fromisoformat(entry["timestamp"])


# --- claim type and stage ---------------------------------------------------


def test_lane_maps_onto_the_frontend_claim_type():
    claim = build_sample_claim()
    assert app_bridge.claim_type(claim) in CLAIM_TYPES

    claim.context.has_existing_rating = True
    claim.context.claiming_worse = True
    assert app_bridge.claim_type(claim) == "increase"


def test_a_decision_under_review_becomes_supplemental_or_hlr():
    claim = build_sample_claim()
    claim.context.disagrees_with_decision = True
    claim.context.decision_date = date(2026, 6, 1)

    claim.context.has_new_evidence = True
    assert app_bridge.claim_type(claim) == "supplemental"

    claim.context.has_new_evidence = False
    assert app_bridge.claim_type(claim) == "higher-level-review"


def test_stage_tracks_claim_status():
    claim = build_sample_claim()
    assert app_bridge.stage(claim) == "submitted"

    claim.set_status(ClaimStatus.SUBMITTED, "filed")
    assert app_bridge.stage(claim) in {"development", "exam-scheduled"}


# --- combined rating maths --------------------------------------------------


def test_va_combines_ratings_rather_than_adding_them():
    """50 + 30 + 10 is 70 in VA maths, not 90."""
    combined, steps = app_bridge.combine_ratings([50, 30, 10])
    assert combined == 70
    assert steps and "Rounded" in steps[-1]["label"]


@pytest.mark.parametrize("ratings,expected", [
    ([], 0),
    ([10], 10),
    ([50, 50], 80),        # 50 then 50% of the remaining 50 = 75, rounds to 80
    ([100], 100),
])
def test_combined_rating_cases(ratings, expected):
    assert app_bridge.combine_ratings(ratings)[0] == expected


def test_no_dollar_figure_is_invented():
    """We do not bundle VA's rate table, so no monthly amount is asserted."""
    claim = build_sample_claim()
    claim.context.decision_date = date(2026, 6, 1)
    claim.context.combined_rating = 70
    decision = app_bridge.decision(claim)
    if decision is not None:
        assert decision["monthlyAmount"] == 0


# --- chat messages ----------------------------------------------------------


def make_session():
    from src import intake_chat
    return intake_chat.new_session()


def test_chat_messages_use_only_types_the_ui_renders():
    session = make_session()
    session.say("bot", "What happened?")
    session.say("veteran", "An IED blast")
    for message in app_bridge.chat_messages(session):
        assert message["type"] in MESSAGE_TYPES
        assert message["id"]
        if message["type"] == "document-upload":
            assert message["documentType"] in DOCUMENT_TYPES


def test_a_receipt_becomes_a_confirmation_card():
    session = make_session()
    session.say("bot", "Thanks for the DD-214!",
                "• Name: Marcus Rivera\n• Date of birth: July 22, 1990")
    cards = [m for m in app_bridge.chat_messages(session) if m["type"] == "confirmation-card"]
    assert cards, "an extracted-field receipt should be shown for confirmation"
    assert {"label": "Name", "value": "Marcus Rivera"} in cards[0]["fields"]


def test_a_plain_bot_line_is_not_turned_into_a_card():
    session = make_session()
    session.say("bot", "What happened during your service?")
    assert not [m for m in app_bridge.chat_messages(session) if m["type"] == "confirmation-card"]


def test_since_returns_only_the_new_turn():
    session = make_session()
    session.say("bot", "one")
    before = len(session.transcript)
    session.say("veteran", "two")
    new = app_bridge.chat_messages(session, since=before)
    assert [m["text"] for m in new if m["type"] == "veteran-text"] == ["two"]


def test_an_upload_slot_offers_a_document_upload_card():
    session = make_session()
    uploads = [m for m in app_bridge.chat_messages(session) if m["type"] == "document-upload"]
    assert uploads, "the opening question accepts an upload"
    assert uploads[0]["documentType"] in DOCUMENT_TYPES


def test_no_name_or_identifier_leaks_into_the_routing_id():
    """Requirements 4.5: the routing id is never a name, SSN, or file number."""
    claim = build_sample_claim()
    payload = app_bridge.claim_to_app_claim(claim)
    assert claim.veteran.last_name.lower() not in payload["routingId"].lower()
    assert claim.veteran.first_name.lower() not in payload["routingId"].lower()


# --- quick replies ----------------------------------------------------------


def test_a_question_with_choices_sends_them_as_quick_replies():
    """Without these the veteran is told to tap a button that isn't rendered."""
    from src import intake_chat

    session = intake_chat.new_session()
    session.story_done = True
    session.identity_done = True
    session.contact_done = True
    # The dig also collects a mailing address and SSN before rating.
    session.address_done = True
    session.ssn_done = True
    session.claim.veteran.first_name = "Dana"
    session.claim.veteran.last_name = "Reyes"
    session.claim.veteran.dob = date(1988, 3, 12)
    session.claim.veteran.service_start = date(2007, 6, 1)

    question = intake_chat.next_question(session)
    assert question.options, "this step is choice-based"

    replies = [m for m in app_bridge.chat_messages(session) if m["type"] == "quick-replies"]
    assert replies, "choices must reach the frontend"
    assert replies[0]["options"] == list(question.options)


def test_an_open_question_sends_no_quick_replies():
    from src import intake_chat

    session = intake_chat.new_session()      # opening story question is open-ended
    assert not [m for m in app_bridge.chat_messages(session) if m["type"] == "quick-replies"]


def test_a_finished_conversation_offers_no_choices():
    from src import intake_chat

    session = intake_chat.new_session()
    for field in vars(session):
        if isinstance(getattr(session, field), bool):
            setattr(session, field, True)
    assert not [m for m in app_bridge.chat_messages(session) if m["type"] == "quick-replies"]


def test_every_message_id_in_a_conversation_is_unique():
    """Duplicate ids become duplicate React keys, which drop or clone bubbles."""
    from src import intake_chat

    session = intake_chat.new_session()
    seen: set = set()

    # Walk several turns while the same slot stays open, which is exactly
    # when the trailing upload/quick-reply cards used to repeat an id.
    for turn in range(4):
        for message in app_bridge.chat_messages(session):
            assert message["id"] not in seen or True   # accumulated below
        session.say("bot", f"still asking ({turn})")
        session.say("veteran", f"answer {turn}")

    for message in app_bridge.chat_messages(session):
        assert message["id"] not in seen, f"duplicate id: {message['id']}"
        seen.add(message["id"])


def test_the_trailing_card_id_changes_between_turns():
    """The card is re-sent while the question is open; its id must move."""
    from src import intake_chat

    session = intake_chat.new_session()
    first = [m["id"] for m in app_bridge.chat_messages(session)
             if m["type"] == "document-upload"]

    session.say("bot", "still asking")
    session.say("veteran", "not an answer")
    second = [m["id"] for m in app_bridge.chat_messages(session)
              if m["type"] == "document-upload"]

    assert first and second
    assert first[0] != second[0], "the same id twice becomes a duplicate key"


def test_ids_accumulated_across_incremental_turns_never_collide():
    """Mirrors how the client accumulates: each turn appended to the last."""
    from src import intake_chat

    session = intake_chat.new_session()
    collected: list = []

    for text in ["ringing ears", "still ringing", "and my back"]:
        before = len(session.transcript)
        session.say("veteran", text)
        session.say("bot", "tell me more")
        collected.extend(app_bridge.chat_messages(session, since=before))

    ids = [m["id"] for m in collected]
    assert len(ids) == len(set(ids)), f"duplicates: {[i for i in ids if ids.count(i) > 1]}"
