"""Low-level HTTP helpers for the VA Benefits Intake API.

Flow (see https://developer.va.gov/explore/api/benefits-intake/docs):
  1. POST /uploads           → guid + signed upload URL
  2. PUT  {location}         → multipart PDF + metadata (no apikey on PUT)
  3. GET  /uploads/{guid}    → submission status
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class VaIntakeError(Exception):
    """VA Benefits Intake request failed."""


@dataclass
class UploadLocation:
    guid: str
    location: str


@dataclass
class UploadStatus:
    guid: str
    status: str
    final_status: bool = False
    updated_at: Optional[str] = None
    detail: Optional[str] = None
    code: Optional[str] = None


def _read_json(response) -> Dict[str, Any]:
    raw = response.read().decode("utf-8")
    if not raw.strip():
        return {}
    return json.loads(raw)


def _request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    data: Optional[bytes] = None,
    timeout: int = 120,
) -> Tuple[int, Dict[str, str], bytes]:
    request = Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urlopen(request, timeout=timeout) as response:
            response_headers = {k.lower(): v for k, v in response.headers.items()}
            body = response.read()
            return response.status, response_headers, body
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise VaIntakeError(f"VA HTTP {error.code} for {method} {url}: {detail}") from error
    except URLError as error:
        raise VaIntakeError(f"VA network error for {method} {url}: {error}") from error


def request_upload_location(base_url: str, api_key: str) -> UploadLocation:
    url = f"{base_url.rstrip('/')}/uploads"
    status, _, body = _request(
        "POST",
        url,
        headers={"apikey": api_key, "Accept": "application/json"},
    )
    if status not in (200, 201, 202):
        raise VaIntakeError(f"Unexpected status {status} from POST /uploads")

    payload = json.loads(body.decode("utf-8"))
    guid, location = _parse_upload_location(payload)
    if not guid or not location:
        raise VaIntakeError(f"Missing guid/location in upload response: {payload}")
    return UploadLocation(guid=guid, location=location)


def _parse_upload_location(payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    data = payload.get("data", payload)
    if isinstance(data, list):
        data = data[0] if data else {}
    attrs = data.get("attributes", data) if isinstance(data, dict) else {}
    guid = (
        attrs.get("guid")
        or data.get("guid")
        or data.get("id")
        or payload.get("guid")
    )
    location = attrs.get("location") or data.get("location") or payload.get("location")
    return guid, location


def build_metadata(
    *,
    veteran_first_name: str,
    veteran_last_name: str,
    file_number: str,
    zip_code: str,
    doc_type: str = "21-526EZ",
    source: str = "VACARE",
    business_line: str = "CMP",
) -> Dict[str, str]:
    return {
        "veteranFirstName": veteran_first_name,
        "veteranLastName": veteran_last_name,
        "fileNumber": file_number,
        "zipCode": zip_code,
        "docType": doc_type,
        "source": source,
        "businessLine": business_line,
    }


def build_multipart_body(metadata: Dict[str, Any], pdf_bytes: bytes) -> Tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    metadata_json = json.dumps(metadata, separators=(",", ":"))
    prefix = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="metadata"\r\n'
        f"Content-Type: application/json\r\n\r\n"
        f"{metadata_json}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="content"; filename="526ez.pdf"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8")
    suffix = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return prefix + pdf_bytes + suffix, boundary


def upload_document(location_url: str, metadata: Dict[str, Any], pdf_bytes: bytes) -> None:
    body, boundary = build_multipart_body(metadata, pdf_bytes)
    status, _, _ = _request(
        "PUT",
        location_url,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=body,
        timeout=300,
    )
    if status not in (200, 201, 204):
        raise VaIntakeError(f"Unexpected status {status} from document PUT")


def get_upload_status(base_url: str, api_key: str, guid: str) -> UploadStatus:
    # v2 endpoint is current; fall back to v1 path shape if needed.
    url = f"{base_url.rstrip('/')}/uploads/{guid}"
    status, _, body = _request(
        "GET",
        url,
        headers={"apikey": api_key, "Accept": "application/json"},
    )
    if status != 200:
        raise VaIntakeError(f"Unexpected status {status} from GET /uploads/{guid}")

    payload = json.loads(body.decode("utf-8"))
    return _parse_upload_status(payload, guid)


def _parse_upload_status(payload: Dict[str, Any], guid: str) -> UploadStatus:
    data = payload.get("data", payload)
    if isinstance(data, list):
        data = data[0] if data else {}
    attrs = data.get("attributes", data) if isinstance(data, dict) else {}
    return UploadStatus(
        guid=attrs.get("guid") or guid,
        status=(attrs.get("status") or "unknown").lower(),
        final_status=bool(attrs.get("final_status", False)),
        updated_at=attrs.get("updated_at"),
        detail=attrs.get("detail"),
        code=attrs.get("code"),
    )
