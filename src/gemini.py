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
import re
import time
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


def user_facing_error(error: Exception) -> str:
    """Plain-language message for veterans — never expose raw API JSON."""
    text = str(error)
    lowered = text.lower()
    retry_match = re.search(r"retry in (\d+(?:\.\d+)?)\s*s", text, re.I)
    retry_hint = ""
    if retry_match:
        seconds = min(int(float(retry_match.group(1))) + 1, 120)
        retry_hint = f" Wait about {seconds} seconds, then try again."

    if "429" in text or "quota" in lowered or "resource_exhausted" in lowered:
        if "per day" in lowered or "freetier" in lowered or "limit: 20" in lowered:
            return (
                "The daily AI request limit on this API key is used up for now."
                " Try again tomorrow, or use a fresh key in .env."
                " Your file is saved — you don't need to re-upload it."
            )
        return (
            "Too many requests in a row."
            + (retry_hint or " Wait about a minute and try again.")
            + " Your file is saved."
        )
    if "503" in text or "unavailable" in lowered:
        return "The AI service is busy right now. Please wait a moment and try again."
    if "401" in text or "403" in text or "api key" in lowered:
        return (
            "The document reader isn't configured correctly. "
            "Check GEMINI_API_KEY in .env and restart the server."
        )
    if "no gemini_api_key" in lowered:
        return "No API key configured — I saved your upload but can't read documents yet."
    return "I couldn't read that just now. Please try again in a moment."


def classify_api_error(error_text: str) -> tuple[str, str]:
    """Map a Gemini HTTP error to (status_code, short_message) for dev checks."""
    lowered = error_text.lower()
    if "no gemini_api_key" in lowered:
        return "missing", "No GEMINI_API_KEY in .env — document reading is off."
    if "per day" in lowered or "freetier" in lowered or "free_tier" in lowered or "limit: 20" in lowered:
        model_match = re.search(r"model: ([^\n\\]+)", error_text)
        model_hint = f" ({model_match.group(1).strip()})" if model_match else ""
        return (
            "daily_exhausted",
            "Daily free-tier quota used up"
            + model_hint
            + ". Try GEMINI_MODEL=gemini-2.5-flash in .env, wait until tomorrow, "
            "or enable billing in Google AI Studio (Projects → your project → tier).",
        )
    if "429" in error_text or "quota" in lowered or "resource_exhausted" in lowered:
        retry_match = re.search(r"retry in (\d+(?:\.\d+)?)\s*s", error_text, re.I)
        if retry_match:
            seconds = min(int(float(retry_match.group(1))) + 1, 120)
            return "rate_limited", f"Rate limited — wait ~{seconds}s, then try again."
        return "rate_limited", "Rate limited — wait about a minute, then try again."
    if "503" in error_text or "unavailable" in lowered:
        return "busy", "AI service is busy right now. Try again in a moment."
    if "401" in error_text or "403" in error_text or "api key not valid" in lowered:
        return "invalid", "Key rejected — check GEMINI_API_KEY in .env and restart the server."
    return "error", user_facing_error(GeminiError(error_text))


def check_api_key(timeout: int = 20) -> Dict[str, Any]:
    """Probe the configured key with one tiny request (uses ~1 daily quota slot)."""
    model = model_name()
    if not api_key():
        status, message = classify_api_error("No GEMINI_API_KEY found")
        return {"configured": False, "ok": False, "status": status, "model": model, "message": message}

    try:
        generate_text("Reply with exactly the word OK.", timeout=timeout)
        return {
            "configured": True,
            "ok": True,
            "status": "ok",
            "model": model,
            "message": f"API key works ({model}). Document reading is available.",
        }
    except GeminiError as error:
        status, message = classify_api_error(str(error))
        return {
            "configured": True,
            "ok": False,
            "status": status,
            "model": model,
            "message": message,
        }


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
    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode()[:500]
            last_error = GeminiError(f"Gemini returned HTTP {error.code}: {detail}")
            quota_hit = error.code == 429 and (
                "quota" in detail.lower() or "RESOURCE_EXHAUSTED" in detail
            )
            if quota_hit:
                raise last_error from error
            if error.code in {429, 503} and attempt == 0:
                time.sleep(2)
                continue
            raise last_error from error
        except urllib.error.URLError as error:
            raise GeminiError(f"Could not reach Gemini: {error.reason}") from error
    assert last_error is not None
    raise last_error


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
