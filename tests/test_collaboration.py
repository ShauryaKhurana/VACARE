"""Veteran ↔ VSO collaboration flow."""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src import collaboration, vso_web, web
from src.api import deps
from src.models import ClaimStatus, EvidenceType, MessageAuthor
from src.sample_data import build_sample_claim
from src.storage import ClaimStore
from tests.test_extract import SERVICE_TREATMENT_RECORD_PAYLOAD

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "collab.db"


@pytest.fixture
def veteran_client(db_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", db_path)
    monkeypatch.setattr(vso_web, "DB_PATH", db_path)
    monkeypatch.setattr(deps, "DB_PATH", db_path)
    monkeypatch.setattr("src.document_ingest.UPLOAD_ROOT", db_path.parent / "uploads")
    return TestClient(web.app)


@pytest.fixture
def vso_client(db_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", db_path)
    monkeypatch.setattr(vso_web, "DB_PATH", db_path)
    monkeypatch.setattr(deps, "DB_PATH", db_path)
    return TestClient(vso_web.app)


def seed_claim(db_path) -> str:
    from datetime import date

    from src import itf, poa

    claim = build_sample_claim()
    claim.veteran.first_name = "Alex"
    claim.veteran.last_name = "Kim"
    itf.record_itf(claim, date.today())
    poa.record_poa(claim, date.today())
    with ClaimStore(db_path) as db:
        db.save_claim(claim)
    return claim.id


def test_submit_appears_in_vso_queue(veteran_client, vso_client, db_path):
    claim_id = seed_claim(db_path)

    response = veteran_client.post(f"/api/cases/{claim_id}/vso/submit")
    assert response.status_code == 200
    assert response.json()["status"] == ClaimStatus.READY_FOR_VSO.value

    queue = vso_client.get("/api/vso/queue").json()
    assert len(queue) == 1
    assert queue[0]["claim_id"] == claim_id
    assert "Alex Kim" in queue[0]["veteran_name"]

    page = vso_client.get("/")
    assert page.status_code == 200
    assert "Alex Kim" in page.text


def test_vso_request_shows_on_veteran_claim(veteran_client, vso_client, db_path):
    claim_id = seed_claim(db_path)
    veteran_client.post(f"/api/cases/{claim_id}/vso/submit")

    vso_client.post(
        f"/api/cases/{claim_id}/vso/request-info",
        json={"request_text": "Please upload your DD-214."},
    )

    messages = veteran_client.get(f"/api/cases/{claim_id}/messages").json()
    assert len(messages) >= 2
    assert any("DD-214" in m["body"] for m in messages)

    page = veteran_client.get(f"/claim/{claim_id}")
    assert "DD-214" in page.text
    assert "claim-attachment-preview" in page.text
    assert "Ready to send" in page.text
    assert "claim-attachment-send" in page.text


@patch("src.document_ingest.extract.extract_from_document", return_value=SERVICE_TREATMENT_RECORD_PAYLOAD)
def test_veteran_reply_with_staged_document(mock_extract, veteran_client, vso_client, db_path, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: True)
    claim_id = seed_claim(db_path)
    veteran_client.post(f"/api/cases/{claim_id}/vso/submit")

    vso_client.post(
        f"/api/cases/{claim_id}/vso/request-info",
        json={"request_text": "Please upload service treatment records."},
    )

    pdf = (FIXTURES / "sample_service_treatment_record.pdf").read_bytes()
    reply = veteran_client.post(
        f"/claim/{claim_id}/message",
        data={"body": "Attached my in-theater treatment record."},
        follow_redirects=False,
    )
    assert reply.status_code == 303
    assert "Reply+sent" in reply.headers["location"]

    upload = veteran_client.post(
        f"/claim/{claim_id}/documents",
        files={"file": ("sample_service_treatment_record.pdf", pdf, "application/pdf")},
        follow_redirects=False,
    )
    assert upload.status_code == 303
    assert "Document+sent" in upload.headers["location"]

    with ClaimStore(db_path) as db:
        claim = db.load_claim(claim_id)
        msgs = db.list_messages(claim_id)
    assert any(m.author == MessageAuthor.VETERAN for m in msgs)
    assert any(m.author == MessageAuthor.SYSTEM and m.body.startswith("upload:") for m in msgs)
    assert any(
        e.evidence_type == EvidenceType.SERVICE_TREATMENT_RECORD for e in claim.evidence
    )
    mock_extract.assert_called_once()

    vso_page = vso_client.get(f"/cases/{claim_id}")
    assert "Veteran uploaded a document" in vso_page.text
    vet_page = veteran_client.get(f"/claim/{claim_id}")
    assert "You sent a document" in vet_page.text
    assert "sample_service_treatment_record.pdf" in vet_page.text
    assert "Attached my in-theater treatment record" in vso_page.text


def test_upload_notice_after_vso_message(veteran_client, vso_client, db_path):
    claim_id = seed_claim(db_path)
    veteran_client.post(f"/api/cases/{claim_id}/vso/submit")
    vso_client.post(
        f"/api/cases/{claim_id}/vso/request-info",
        json={"request_text": "[VSO] Please upload your service treatment records."},
    )

    pdf = (FIXTURES / "sample_service_treatment_record.pdf").read_bytes()
    with patch("src.document_ingest.extract.extract_from_document", return_value=SERVICE_TREATMENT_RECORD_PAYLOAD):
        veteran_client.post(
            f"/claim/{claim_id}/documents",
            files={"file": ("sample_service_treatment_record.pdf", pdf, "application/pdf")},
        )

    with ClaimStore(db_path) as db:
        msgs = db.list_messages(claim_id)
    vso_idx = next(i for i, m in enumerate(msgs) if m.author == MessageAuthor.VSO)
    upload_idx = next(i for i, m in enumerate(msgs) if collaboration.is_upload_notice(m))
    assert upload_idx > vso_idx

    vso_page = vso_client.get(f"/cases/{claim_id}")
    assert vso_page.text.index("Please upload your service treatment records") < vso_page.text.index(
        "Veteran uploaded a document"
    )


    claim_id = seed_claim(db_path)
    veteran_client.post(f"/api/cases/{claim_id}/vso/submit")

    vso_client.post(
        f"/api/cases/{claim_id}/vso/request-info",
        json={"request_text": "Need buddy statement."},
    )

    veteran_client.post(
        f"/claim/{claim_id}/message",
        data={"body": "I can get one from my squad leader."},
        follow_redirects=False,
    )

    with ClaimStore(db_path) as db:
        msgs = db.list_messages(claim_id)
    assert any(m.author == MessageAuthor.VETERAN for m in msgs)

    approve = vso_client.post(
        f"/api/cases/{claim_id}/vso/approve",
        json={"note": "Looks good."},
    )
    assert approve.status_code == 200

    summary = veteran_client.get(f"/api/cases/{claim_id}").json()
    assert summary["status"] == ClaimStatus.IN_VSO_REVIEW.value

    page = veteran_client.get(f"/claim/{claim_id}")
    assert "approved" in page.text.lower() or "Approved" in page.text


def test_vso_approve_blocked_without_poa(veteran_client, vso_client, db_path):
    claim = build_sample_claim()
    claim.veteran.first_name = "Pat"
    claim.veteran.last_name = "NoPoa"
    from datetime import date
    from src import itf
    itf.record_itf(claim, date.today())
    with ClaimStore(db_path) as db:
        db.save_claim(claim)
    claim_id = claim.id

    veteran_client.post(f"/api/cases/{claim_id}/vso/submit")
    approve = vso_client.post(
        f"/api/cases/{claim_id}/vso/approve",
        json={"note": "Should fail."},
    )
    assert approve.status_code == 400
    assert "Cannot approve" in approve.json()["detail"]


def test_vso_case_page_renders(vso_client, db_path):
    claim_id = seed_claim(db_path)
    with ClaimStore(db_path) as db:
        claim = db.load_claim(claim_id)
        collaboration.submit_for_vso_review(db, claim)

    response = vso_client.get(f"/cases/{claim_id}")
    assert response.status_code == 200
    assert "Alex Kim" in response.text
    assert "Approve to file" in response.text
