"""End-to-end checks on the web frontend."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from src import web
from src.gemini import GeminiError
from src.sample_data import build_sample_claim
from src.storage import ClaimStore

BASE_INTAKE = {
    "first_name": "Dana", "last_name": "Reyes", "dob": "1988-03-12",
    "email": "dana@example.com", "phone": "555-014-2277", "branch": "army",
    "service_start": "2007-06-01", "service_end": "2013-08-30", "discharge_type": "honorable",
    "condition_1_name": "Tinnitus",
    "condition_1_symptoms": "Ringing in both ears all day.",
    "condition_1_started": "on",
    "have_dd214": "on",
}


@pytest.fixture(autouse=True)
def clear_chat_sessions():
    web.CHAT_SESSIONS.clear()
    yield
    web.CHAT_SESSIONS.clear()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", tmp_path / "web.db")
    monkeypatch.setattr(
        "src.va.client._env",
        lambda name, default="": "true" if name == "VA_USE_MOCK" else default,
    )
    monkeypatch.setattr("src.document_ingest.UPLOAD_ROOT", tmp_path / "uploads")
    return TestClient(web.app)


def submit(client, **overrides):
    payload = dict(BASE_INTAKE)
    payload.update(overrides)
    response = client.post("/intake", data=payload, follow_redirects=False)
    return response


def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_every_page_renders(client):
    assert client.get("/").status_code == 200
    assert client.get("/intake").status_code == 200
    assert client.get("/forms").status_code == 200


def claim_details(client, claim_path: str):
    return client.get(f"{claim_path}/details")


def test_intake_creates_a_claim_and_lands_on_its_dashboard(client):
    response = submit(client)
    assert response.status_code == 303
    location = response.headers["location"]

    page = client.get(location)
    assert page.status_code == 200
    assert "Dana Reyes" in page.text
    assert "21-526EZ" in page.text
    assert "21-0966" in claim_details(client, location).text


def test_intake_rejects_a_bad_date_of_birth_without_creating_a_claim(client):
    response = submit(client, dob="2030-01-01")
    assert response.status_code == 303
    assert "/intake?error=" in response.headers["location"]
    with ClaimStore(web.DB_PATH) as store:
        assert store.list_claims() == []


def test_intake_requires_at_least_one_condition(client):
    response = submit(client, condition_1_name="", condition_1_symptoms="")
    assert "/intake?error=" in response.headers["location"]


def test_mental_health_condition_changes_the_form_sequence(client):
    location = submit(
        client,
        condition_1_name="PTSD",
        condition_1_symptoms="Nightmares and hypervigilance most days.",
    ).headers["location"]
    assert "21-0781" in claim_details(client, location).text


def test_decision_review_answers_route_to_the_right_door(client):
    location = submit(
        client,
        has_filed_before="on", has_existing_rating="on",
        disagrees_with_decision="on", decision_date="2026-06-01",
        has_new_evidence="on",
    ).headers["location"]
    page = claim_details(client, location).text
    assert "20-0995" in page                     # supplemental, because new evidence exists
    assert "Higher-Level Review deadline" in page  # the clock is shown either way


def test_deadline_clock_appears_when_an_itf_date_is_given(client):
    location = submit(client, itf_filed_on="2026-06-01").headers["location"]
    assert "Intent to File expires" in claim_details(client, location).text


def test_adding_evidence_updates_the_checklist(client):
    location = submit(client).headers["location"]
    before = claim_details(client, location).text
    assert "Service treatment records" in before

    client.post(f"{location}/evidence", data={"evidence_type": "service_treatment_record"},
                follow_redirects=False)
    after = claim_details(client, location).text
    assert after.count("Service treatment records") < before.count("Service treatment records")


def test_status_can_be_recorded_from_the_dashboard(client):
    location = submit(client).headers["location"]
    client.post(f"{location}/status", data={"status": "in_vso_review", "note": "Picked up"},
                follow_redirects=False)
    page = claim_details(client, location).text
    assert "in vso review" in page and "Picked up" in page


def test_packet_route_returns_the_vso_packet(client):
    location = submit(client).headers["location"]
    packet = client.get(f"{location}/packet")
    assert packet.status_code == 200
    assert "VSO-READY CLAIM PACKET" in packet.text


def test_unknown_claim_redirects_home(client):
    response = client.get("/claim/nope", follow_redirects=False)
    assert response.status_code == 303


def test_home_lists_a_saved_claim(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)
    assert claim.id in client.get("/").text


def test_gemini_status_missing_key(client, monkeypatch):
    monkeypatch.setattr("src.gemini.api_key", lambda: None)
    response = client.get("/api/gemini/status")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["status"] == "missing"


def test_gemini_status_ok(client, monkeypatch):
    monkeypatch.setattr("src.gemini.api_key", lambda: "test-key")
    monkeypatch.setattr("src.gemini.generate_text", lambda *args, **kwargs: "OK")
    response = client.get("/api/gemini/status")
    body = response.json()
    assert body["ok"] is True
    assert body["status"] == "ok"


def test_gemini_status_daily_exhausted(client, monkeypatch):
    monkeypatch.setattr("src.gemini.api_key", lambda: "test-key")
    monkeypatch.setattr(
        "src.gemini.generate_text",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            GeminiError(
                'Gemini returned HTTP 429: {"error":{"message":"quota exceeded per day FreeTier limit: 20"}}'
            )
        ),
    )
    response = client.get("/api/gemini/status")
    body = response.json()
    assert body["ok"] is False
    assert body["status"] == "daily_exhausted"


def _chat_session(client):
    response = client.get("/chat")
    session_id = response.cookies.get("vacare_chat")
    return web.CHAT_SESSIONS[session_id]


def test_rating_quick_pick_none_advances_chat(client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: False)
    session = _chat_session(client)
    session.story_done = True
    session.identity_done = True
    session.claim.veteran.first_name = "Dana"
    session.claim.veteran.last_name = "Reyes"
    session.claim.veteran.dob = date(1988, 3, 12)
    session.claim.veteran.service_start = date(2007, 6, 1)
    session.claim.veteran.service_end = date(2013, 8, 30)
    session.contact_done = True
    # The dig also collects a mailing address and SSN before rating.
    session.address_done = True
    session.ssn_done = True
    session.claim.veteran.phone = "555-014-2277"
    session.transcript.clear()
    session.say("bot", "Does the VA pay you for any disability right now?")

    response = client.post(
        "/chat",
        data={"quick_pick": "No, this is my first claim", "message": ""},
        follow_redirects=False,
    )
    assert response.status_code == 200
    assert session.rating_done is True
    assert session.claim.context.has_existing_rating is False
    assert "first claim" in response.text


def test_rating_quick_pick_percent_multipart(client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: False)
    session = _chat_session(client)
    session.story_done = True
    session.identity_done = True
    session.claim.veteran.first_name = "Dana"
    session.claim.veteran.last_name = "Reyes"
    session.claim.veteran.dob = date(1988, 3, 12)
    session.claim.veteran.service_start = date(2007, 6, 1)
    session.claim.veteran.service_end = date(2013, 8, 30)
    session.contact_done = True
    # The dig also collects a mailing address and SSN before rating.
    session.address_done = True
    session.ssn_done = True
    session.claim.veteran.email = "dana@example.com"
    session.transcript.clear()
    session.say("bot", "Does the VA pay you for any disability right now?")

    response = client.post(
        "/chat",
        data={"quick_pick": "30%", "message": ""},
        follow_redirects=False,
    )
    assert response.status_code == 200
    assert session.rating_done is True
    assert session.claim.context.combined_rating == 30
    assert "30%" in response.text


def test_chat_quick_pick_buttons_are_not_submit(client):
    page = client.get("/chat").text
    assert "chat-quick-pick" in page
    assert "chat-suggestion" in page
    assert 'type="button"' in page


def test_pages_include_test_api_key_button(client):
    assert "vacare-test-key" in client.get("/chat").text


def test_chat_has_home_button(client):
    page = client.get("/chat").text
    assert 'class="chat-home-btn"' in page
    assert 'href="/"' in page
    assert "aria-label=\"Home\"" in page


def test_chat_persists_across_memory_clear(client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: False)
    first = client.get("/chat")
    claim_id = first.cookies.get("vacare_chat")
    client.post("/chat", data={"message": "My back hurts from service", "quick_pick": ""})

    web.CHAT_SESSIONS.clear()
    resumed = client.get("/chat")
    assert resumed.status_code == 200
    assert "My back hurts from service" in resumed.text
    assert resumed.cookies.get("vacare_chat") == claim_id


def test_claim_chat_resume_sets_cookie(client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: False)
    started = client.get("/chat")
    claim_id = started.cookies.get("vacare_chat")
    client.cookies.clear()
    response = client.get(f"/claim/{claim_id}/chat", follow_redirects=False)
    assert response.status_code == 303
    follow = client.get("/chat")
    assert follow.cookies.get("vacare_chat") == claim_id


def test_chat_new_starts_fresh_claim(client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: False)
    first = client.get("/chat")
    first_id = first.cookies.get("vacare_chat")
    response = client.get("/chat/new", follow_redirects=False)
    assert response.status_code == 303
    second = client.get("/chat")
    second_id = second.cookies.get("vacare_chat")
    assert second_id != first_id
