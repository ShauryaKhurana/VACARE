"""Shared test fixtures — isolate tests from developer .env secrets."""

import pytest
from fastapi.testclient import TestClient

from src import parse_cache, web
from src.api import deps


@pytest.fixture(autouse=True)
def clear_document_parse_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(parse_cache, "CACHE_DIR", tmp_path / "parse_cache")
    parse_cache.clear()
    yield
    parse_cache.clear()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", tmp_path / "web.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "web.db")
    monkeypatch.setattr(
        "src.va.client._env",
        lambda name, default="": "true" if name == "VA_USE_MOCK" else default,
    )
    monkeypatch.setattr("src.document_ingest.UPLOAD_ROOT", tmp_path / "uploads")
    return TestClient(web.app)
