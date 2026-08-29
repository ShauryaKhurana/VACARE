"""Tests for VA Benefits Intake sandbox client."""

from pathlib import Path
from unittest.mock import patch

import pytest

from src.va.client import MockVaClient, SandboxVaClient, VaClientError
from src.va.intake import UploadLocation, UploadStatus, build_metadata, build_multipart_body


def test_build_metadata_and_multipart():
    metadata = build_metadata(
        veteran_first_name="Jane",
        veteran_last_name="Doe",
        file_number="012345678",
        zip_code="97202",
    )
    body, boundary = build_multipart_body(metadata, b"%PDF-1.4 test")
    assert boundary in body.decode("latin-1")
    assert b"veteranFirstName" in body
    assert b"%PDF-1.4 test" in body


def test_mock_client_submit_and_status(tmp_path):
    pdf = tmp_path / "526.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    client = MockVaClient()
    result = client.submit_benefits_intake(
        case_id="case1",
        veteran_first_name="Dana",
        veteran_last_name="Reyes",
        pdf_path=pdf,
    )
    assert result.submission_id.startswith("mock-")
    status = client.get_intake_status(result.submission_id)
    assert status.status == "received"
    assert status.final_status is True


@patch("src.va.client.intake_api.get_upload_status")
@patch("src.va.client.intake_api.upload_document")
@patch("src.va.client.intake_api.request_upload_location")
def test_sandbox_client_full_flow(mock_location, mock_upload, mock_status, tmp_path):
    pdf = tmp_path / "526.pdf"
    pdf.write_bytes(b"%PDF-1.4 filled")

    mock_location.return_value = UploadLocation(
        guid="abc-guid-123",
        location="https://sandbox-upload.example/put-here",
    )
    mock_status.return_value = UploadStatus(
        guid="abc-guid-123",
        status="received",
        final_status=True,
        updated_at="2026-08-29T12:00:00Z",
    )

    client = SandboxVaClient("test-api-key")
    result = client.submit_benefits_intake(
        case_id="case1",
        veteran_first_name="Dana",
        veteran_last_name="Reyes",
        pdf_path=pdf,
    )

    assert result.submission_id == "abc-guid-123"
    assert result.status == "received"
    mock_upload.assert_called_once()
    mock_location.assert_called_once()

    status = client.get_intake_status("abc-guid-123")
    assert status.final_status is True


def test_sandbox_client_missing_pdf():
    client = SandboxVaClient("test-api-key")
    with pytest.raises(VaClientError, match="PDF not found"):
        client.submit_benefits_intake(
            case_id="case1",
            veteran_first_name="Dana",
            veteran_last_name="Reyes",
            pdf_path=Path("/no/such/file.pdf"),
        )
