"""Tests for document upload and ingestion."""

from unittest.mock import patch

from src.document_ingest import ingest_document
from src.models import Claim, Veteran
from tests.test_extract import DD214_PAYLOAD


def test_ingest_without_gemini_stores_file_only(tmp_path, monkeypatch):
    monkeypatch.setattr("src.document_ingest.UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr("src.gemini.available", lambda: False)
    claim = Claim(veteran=Veteran(first_name="New", last_name="Case"))
    result = ingest_document(claim, "dd214.pdf", b"%PDF-1.4")
    assert result.parsed_with_gemini is False
    assert "GEMINI_API_KEY" in result.message
    assert len(claim.evidence) == 1


@patch("src.document_ingest.extract.extract_from_document", return_value=DD214_PAYLOAD)
def test_ingest_dd214_merges_veteran_fields(mock_extract, tmp_path, monkeypatch):
    monkeypatch.setattr("src.document_ingest.UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr("src.gemini.available", lambda: True)
    claim = Claim(veteran=Veteran(first_name="New", last_name="Case"))
    result = ingest_document(claim, "dd214.pdf", b"%PDF-1.4")
    assert result.parsed_with_gemini is True
    assert result.document_type == "dd214"
    assert "name" in result.fields_applied
    assert claim.veteran.first_name == "Dana"
    assert claim.veteran.service_end is not None
    mock_extract.assert_called_once()


@patch("src.document_ingest.extract.extract_from_document", return_value=DD214_PAYLOAD)
def test_api_document_upload_endpoint(mock_extract, client, monkeypatch):
    monkeypatch.setattr("src.gemini.available", lambda: True)
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    response = client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": ("dd214.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["document_type"] == "dd214"
    assert body["parsed_with_gemini"] is True
    assert body["checklist"]["case_id"] == case_id
    assert body["fields_applied"]


def test_va_submission_persisted(client):
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    client.post(
        f"/api/cases/{case_id}/payload",
        json={
            "veteran": {
                "first_name": "Dana",
                "last_name": "Reyes",
                "dob": "1988-03-12",
                "service_start": "2007-06-01",
                "service_end": "2013-08-30",
            },
            "conditions": [
                {
                    "name": "Tinnitus",
                    "current_symptoms": "Ringing all day",
                    "started_in_service": True,
                }
            ],
            "evidence_on_hand": [
                "dd214",
                "service_treatment_record",
                "current_medical_record",
            ],
        },
    )

    with patch("src.formfill.fill_526ez"):
        intake = client.post(f"/api/cases/{case_id}/va/intake")
    assert intake.status_code == 200
    assert intake.json()["submission_id"].startswith("mock-")

    subs = client.get(f"/api/cases/{case_id}/va/submissions")
    assert subs.status_code == 200
    assert len(subs.json()) == 1
    assert subs.json()[0]["submission_id"].startswith("mock-")
