"""Minimal Gemini client for VACARE.

Talks to the REST API with the standard library so there is no SDK surface to
keep in sync. Two things are needed from the model and both are verified in
tests/test_gemini.py:

1. structured output - a JSON object matching a schema we supply
2. document reading - PDFs and photos, natively, with no separate OCR step

The API key is read from .env (gitignored). Everything here degrades politely:
if there is no key, `available()` is False and callers fall back to asking the
veteran directly rather than crashing.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# Verified working on 2026-08-29. The 2.5 family now 404s for new keys, so do
# not "helpfully" downgrade this default.
DEFAULT_MODEL = "gemini-3.7-flash"

# Documents a veteran might upload. PDFs and photos of paperwork both work.
SUPPORTED_UPLOADS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".txt"}
MAX_INLINE_BYTES = 18 * 1024 * 1024   # inline_data ceiling, with headroom


class GeminiError(RuntimeError):
    """The API refused or the response could not be parsed."""


def load_env(path: Path = ENV_PATH) -> Dict[str, str]:
    """Read KEY=value lines from .env. Not a full dotenv parser; we control the file."""
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def api_key() -> Optional[str]:
    """Environment first, then .env, so a shell export can override the file."""
    return os.environ.get("GEMINI_API_KEY") or load_env().get("GEMINI_API_KEY") or None


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL") or load_env().get("GEMINI_MODEL") or DEFAULT_MODEL


def available() -> bool:
    """True when a key is present. Callers use this to pick a graceful fallback."""
    return bool(api_key())


@dataclass
class Attachment:
    """One uploaded document, held in memory as bytes."""

    filename: str
    data: bytes

    @property
    def mime_type(self) -> str:
        guessed, _ = mimetypes.guess_type(self.filename)
        if guessed:
            return guessed
        return "application/pdf" if self.filename.lower().endswith(".pdf") else "image/jpeg"

    @property
    def too_big(self) -> bool:
        return len(self.data) > MAX_INLINE_BYTES

    def as_part(self) -> Dict[str, Any]:
        return {"inline_data": {
            "mime_type": self.mime_type,
            "data": base64.b64encode(self.data).decode(),
        }}


def _post(model: str, body: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    key = api_key()
    if not key:
        raise GeminiError("No GEMINI_API_KEY found in the environment or .env")

    request = urllib.request.Request(
        f"{API_ROOT}/{model}:generateContent",
        data=json.dumps(body).encode(),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode()[:500]
        raise GeminiError(f"Gemini returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise GeminiError(f"Could not reach Gemini: {error.reason}") from error


def _first_text(payload: Dict[str, Any]) -> str:
    """Pull the text out of a response, with a clear error when it is absent.

    A blocked or truncated response has candidates but no parts, which would
    otherwise surface as a confusing KeyError deep in a caller.
    """
    candidates = payload.get("candidates") or []
    if not candidates:
        feedback = payload.get("promptFeedback", {})
        raise GeminiError(f"Gemini returned no candidates (feedback: {feedback})")

    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    for part in parts:
        if "text" in part:
            return part["text"]

    raise GeminiError(f"Gemini returned no text (finishReason: {candidate.get('finishReason')})")


def generate_text(
    prompt: str,
    system: Optional[str] = None,
    attachments: Optional[List[Attachment]] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    model: Optional[str] = None,
    timeout: int = 120,
) -> str:
    """Plain conversational turn. `history` is a list of {role, parts} dicts."""
    parts: List[Dict[str, Any]] = []
    for attachment in attachments or []:
        parts.append(attachment.as_part())
    parts.append({"text": prompt})

    contents = list(history or [])
    contents.append({"role": "user", "parts": parts})

    body: Dict[str, Any] = {"contents": contents}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    return _first_text(_post(model or model_name(), body, timeout))


def generate_json(
    prompt: str,
    schema: Dict[str, Any],
    system: Optional[str] = None,
    attachments: Optional[List[Attachment]] = None,
    model: Optional[str] = None,
    timeout: int = 180,
) -> Any:
    """Structured extraction. Returns parsed JSON matching `schema`."""
    parts: List[Dict[str, Any]] = []
    for attachment in attachments or []:
        if attachment.too_big:
            raise GeminiError(
                f"{attachment.filename} is {len(attachment.data) // 1024 // 1024}MB; "
                "the inline limit is 18MB."
            )
        parts.append(attachment.as_part())
    parts.append({"text": prompt})

    body: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            # Extraction should be repeatable: the same document must not yield
            # different fields on two runs.
            "temperature": 0,
        },
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    text = _first_text(_post(model or model_name(), body, timeout))
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        # Schema mode makes this rare, but a truncated response can still land here.
        raise GeminiError(f"Gemini did not return valid JSON: {text[:200]}") from error


def list_models() -> List[str]:
    """Model ids this key can actually use. Handy when the default stops working."""
    key = api_key()
    if not key:
        return []
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
        headers={"x-goog-api-key": key},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    return [
        entry["name"].replace("models/", "")
        for entry in payload.get("models", [])
        if "generateContent" in entry.get("supportedGenerationMethods", [])
    ]
