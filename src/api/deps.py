"""Shared dependencies for the JSON API."""

from __future__ import annotations

from pathlib import Path

from src.storage import DEFAULT_DB_PATH, ClaimStore

DB_PATH = Path(DEFAULT_DB_PATH)


def store() -> ClaimStore:
    return ClaimStore(DB_PATH)
