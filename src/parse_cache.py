"""Persist successful document parses so repeat uploads can skip the AI API.

Off by default: every upload is read afresh, even a file seen before. Reusing
a stored parse saves an API call, but it also means a document is only ever
interpreted as well as it was the first time — by whatever prompt and schema
happened to be current then, on whatever claim uploaded it first. Re-reading
is slower and costs a call; it is also what people expect when they upload a
document.

Set VACARE_PARSE_CACHE=1 to turn reuse back on.

The in-memory map is fast; disk survives server restarts and "Start over".
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "parse_cache"

def document_field_keys() -> tuple:
    """Every field the document extractor can return.

    This used to be a hand-written list, and it drifted: seven fields the
    schema had grown - ssn, home_of_record, still_serving, and the four
    decision-letter fields - were silently dropped on the way into the cache.
    A cached document therefore lost them, which looks exactly like the
    extraction not working. Deriving it from the schema keeps them in step.
    """
    from src import extract

    return tuple(extract.DOCUMENT_SCHEMA["properties"].keys())

_MEMORY: Dict[str, Dict[str, Any]] = {}


def enabled() -> bool:
    """Whether a stored parse may be reused instead of re-reading the file."""
    return os.environ.get("VACARE_PARSE_CACHE", "").strip().lower() in {
        "1", "true", "yes", "on",
    }


def file_hash(data: bytes) -> str:
    # The extraction contract is part of the key. Keyed on bytes alone, a
    # cached result outlived every change to the schema or prompt: adding an
    # SSN field changed nothing for any document already seen, which looks
    # exactly like the new field not working.
    return hashlib.sha256(data + b"|" + extraction_version().encode()).hexdigest()


# Bump when a cached entry's *shape* changes for reasons the schema does not
# capture. Entries written before this are ignored rather than needing anyone
# to clear a directory by hand.
CACHE_FORMAT = "2"


def extraction_version() -> str:
    """A fingerprint of what the extractor currently asks for."""
    from src import extract

    return hashlib.sha256(
        (json.dumps(extract.DOCUMENT_SCHEMA, sort_keys=True)
         + extract.SYSTEM + CACHE_FORMAT).encode()
    ).hexdigest()[:16]


def document_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only document-parse keys from a full intake-turn payload."""
    return {key: payload[key] for key in document_field_keys() if key in payload}


def get(data: bytes) -> Optional[Dict[str, Any]]:
    if not enabled():
        return None
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
    if not enabled():
        return          # nothing reads it, so do not accumulate stale parses
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
