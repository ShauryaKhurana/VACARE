"""VA Lighthouse API clients — mock for local dev, sandbox when configured."""

from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from pathlib import Path
from typing import Optional

from src.va import intake as intake_api

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is not None and value.strip():
        return value.strip()
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, raw = line.split("=", 1)
            if key.strip() == name:
                return raw.strip().strip('"').strip("'")
    return default


class VaClientError(Exception):
    """VA client operation failed."""


@dataclass
class IntakeSubmission:
    submission_id: str
    status: str
    message: str


@dataclass
class IntakeStatus:
    submission_id: str
    status: str
    final_status: bool = False
    updated_at: Optional[str] = None
    detail: Optional[str] = None


class VaClient(ABC):
    @abstractmethod
    def submit_benefits_intake(
        self,
        *,
        case_id: str,
        veteran_first_name: str,
        veteran_last_name: str,
        pdf_path: Path,
    ) -> IntakeSubmission:
        ...

    @abstractmethod
    def get_intake_status(self, submission_id: str) -> IntakeStatus:
        ...


class MockVaClient(VaClient):
    """Returns realistic sandbox-shaped responses without network access."""

    def submit_benefits_intake(
        self,
        *,
        case_id: str,
        veteran_first_name: str,
        veteran_last_name: str,
        pdf_path: Path,
    ) -> IntakeSubmission:
        submission_id = f"mock-{uuid.uuid4().hex[:12]}"
        return IntakeSubmission(
            submission_id=submission_id,
            status="received",
            message=(
                f"Mock Benefits Intake accepted 526EZ for {veteran_first_name} {veteran_last_name} "
                f"(case {case_id}, {pdf_path.name}). Set VA_USE_MOCK=false and VA_API_KEY to hit sandbox."
            ),
        )

    def get_intake_status(self, submission_id: str) -> IntakeStatus:
        return IntakeStatus(
            submission_id=submission_id,
            status="received",
            final_status=True,
            updated_at=None,
            detail="Mock status — sandbox not called.",
        )


class SandboxVaClient(VaClient):
    """Real VA Benefits Intake sandbox client."""

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        *,
        file_number: Optional[str] = None,
        zip_code: Optional[str] = None,
        source: str = "VACARE",
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url or "https://sandbox-api.va.gov/services/vba_documents/v1"
        self.file_number = file_number or "000000000"
        self.zip_code = zip_code or "20500"
        self.source = source

    def submit_benefits_intake(
        self,
        *,
        case_id: str,
        veteran_first_name: str,
        veteran_last_name: str,
        pdf_path: Path,
    ) -> IntakeSubmission:
        if not pdf_path.exists():
            raise VaClientError(f"PDF not found: {pdf_path}")

        pdf_bytes = pdf_path.read_bytes()
        metadata = intake_api.build_metadata(
            veteran_first_name=veteran_first_name,
            veteran_last_name=veteran_last_name,
            file_number=self.file_number,
            zip_code=self.zip_code,
            source=self.source,
        )

        try:
            location = intake_api.request_upload_location(self.base_url, self.api_key)
            intake_api.upload_document(location.location, metadata, pdf_bytes)
            status = intake_api.get_upload_status(self.base_url, self.api_key, location.guid)
        except intake_api.VaIntakeError as error:
            raise VaClientError(str(error)) from error

        return IntakeSubmission(
            submission_id=location.guid,
            status=status.status,
            message=(
                f"526EZ uploaded to VA sandbox for case {case_id}. "
                f"Current status: {status.status}."
            ),
        )

    def get_intake_status(self, submission_id: str) -> IntakeStatus:
        try:
            status = intake_api.get_upload_status(self.base_url, self.api_key, submission_id)
        except intake_api.VaIntakeError as error:
            raise VaClientError(str(error)) from error

        return IntakeStatus(
            submission_id=status.guid,
            status=status.status,
            final_status=status.final_status,
            updated_at=status.updated_at,
            detail=status.detail,
        )


def get_va_client() -> VaClient:
    use_mock = _env("VA_USE_MOCK", "true").lower() in {"1", "true", "yes"}
    api_key = _env("VA_API_KEY")
    if use_mock or not api_key:
        return MockVaClient()
    return SandboxVaClient(
        api_key,
        base_url=_env("VA_API_BASE_URL") or None,
        file_number=_env("VA_SANDBOX_FILE_NUMBER") or None,
        zip_code=_env("VA_SANDBOX_ZIP") or None,
        source=_env("VA_INTAKE_SOURCE", "VACARE"),
    )
