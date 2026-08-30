"""Persist successful document parses so repeat uploads skip the AI API.

The in-memory map is fast; disk survives server restarts and "Start over" in chat.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "parse_cache"

DOCUMENT_FIELD_KEYS = (
    "document_type",
    "confidence",
    "summary",
    "first_name",
    "last_name",
    "date_of_birth",
    "branch",
    "service_start",
    "service_end",
    "discharge_type",
    "decision_date",
    "conditions",
    "providers",
)

_MEMORY: Dict[str, Dict[str, Any]] = {}


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only document-parse keys from a full intake-turn payload."""
    return {key: payload[key] for key in DOCUMENT_FIELD_KEYS if key in payload}


def get(data: bytes) -> Optional[Dict[str, Any]]:
    key = file_hash(data)
    cached = _MEMORY.get(key)
    if cached is not None:
        return cached

    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if isinstance(payload, dict):
        _MEMORY[key] = payload
        return payload
    return None


def store(data: bytes, payload: Dict[str, Any]) -> None:
    doc_payload = document_fields(payload)
    if not doc_payload.get("document_type"):
        return
    key = file_hash(data)
    _MEMORY[key] = doc_payload
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(doc_payload, indent=2), encoding="utf-8")


def clear() -> None:
    _MEMORY.clear()
