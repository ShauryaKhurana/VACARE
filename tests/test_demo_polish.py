"""Lifecycle badges and demo seed."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from src import appeal, decision, demo_seed, itf, lifecycle, poa
from src.models import ClaimStatus
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


def test_lifecycle_submitted():
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    assert lifecycle.lifecycle_badge(claim).label == "Submitted to VA"


def test_lifecycle_appeal():
    claim = build_sample_claim()
    claim.context.decision_date = date.today() - timedelta(days=10)
    claim.set_status(ClaimStatus.DECIDED, "decided")
    appeal.select_door(claim, "20-0995")
    assert lifecycle.lifecycle_badge(claim).key == "appeal"


def test_lifecycle_vso_queue():
    claim = build_sample_claim()
    claim.set_status(ClaimStatus.READY_FOR_VSO, "submitted")
    assert lifecycle.lifecycle_badge(claim).label == "With VSO"


def test_claim_title_from_conditions():
    claim = build_sample_claim()
    assert lifecycle.claim_title(claim) == "Tinnitus & Lower back pain"


def test_claim_title_empty():
    claim = build_sample_claim()
    claim.conditions = []
    assert lifecycle.claim_title(claim) == "New claim"


def test_demo_seed_creates_four_stages(tmp_path):
    db_path = tmp_path / "demo.db"
    with ClaimStore(db_path) as db:
        ids = demo_seed.seed_demo_journey(db, replace=True)

    assert len(ids) == 4
    assert demo_seed.find_demo_claim_id(ClaimStore(db_path), "appeal") == ids["appeal"]

    with ClaimStore(db_path) as db:
        appeal_claim = db.load_claim(ids["appeal"])
        vso_claim = db.load_claim(ids["vso_queue"])

    assert appeal_claim.context.appeal_door_selected == "20-0995"
    assert vso_claim.status == ClaimStatus.READY_FOR_VSO


def test_demo_seed_is_idempotent(tmp_path):
    db_path = tmp_path / "demo2.db"
    with ClaimStore(db_path) as db:
        demo_seed.seed_demo_journey(db, replace=True)
        second = demo_seed.seed_demo_journey(db, replace=True)

    assert len(second) == 4
    with ClaimStore(db_path) as db:
        for stage in demo_seed.DEMO_STAGES:
            assert demo_seed.find_demo_claim_id(db, stage) == second[stage]
        count = db.connection.execute("SELECT COUNT(*) AS n FROM claims").fetchone()["n"]
    assert count == 4


def test_primary_seed_leaves_one_claim(tmp_path):
    db_path = tmp_path / "demo3.db"
    with ClaimStore(db_path) as db:
        demo_seed.clear_all_claims(db)
        demo_seed.seed_primary_claim(db)
        rows = db.connection.execute("SELECT id FROM claims").fetchall()
    assert len(rows) == 1
    with ClaimStore(db_path) as db:
        claim = db.load_claim(rows[0][0])
    assert lifecycle.claim_title(claim) == "Tinnitus & Lower back pain"


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src import web
    from src.api import deps

    monkeypatch.setattr(web, "DB_PATH", tmp_path / "home.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "home.db")
    return TestClient(web.app)


def test_home_shows_lifecycle_badge(client, tmp_path):
    from src import web
    from src import itf, poa

    claim = build_sample_claim()
    decision.mark_submitted(claim)
    itf.record_itf(claim, date.today())
    poa.record_poa(claim, date.today())
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get("/")
    assert page.status_code == 200
    assert "Submitted to VA" in page.text
    assert "Tinnitus" in page.text
    assert "claims-row" in page.text
