"""Tests for UI ↔ API bridge."""

from src.api import service, ui_bridge
from src.models import Claim, EvidenceType, Veteran
from src.storage import ClaimStore


def test_sync_case_persists_claim(tmp_path):
    db = ClaimStore(tmp_path / "bridge.db")
    claim = service.create_case()
    claim.veteran.first_name = "Dana"
    claim.veteran.last_name = "Reyes"
    checklist = ui_bridge.sync_case(db, claim)
    assert checklist.case_id == claim.id
    loaded = db.load_claim(claim.id)
    assert loaded is not None
    assert loaded.veteran.first_name == "Dana"
    db.close()


def test_claim_to_payload_includes_evidence():
    claim = Claim(veteran=Veteran(first_name="Ann", last_name="Bee"))
    from src.claim_intake import ClaimIntake
    ClaimIntake(claim).add_evidence(evidence_type=EvidenceType.DD214, source="upload")
    payload = ui_bridge.claim_to_payload(claim)
    assert EvidenceType.DD214 in payload.evidence_on_hand
