"""A claim should survive a save/load round trip unchanged."""

from src.claim_intake import ClaimIntake
from src.models import ClaimStatus, VSOVerdict
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


def test_round_trip_preserves_every_part_of_the_claim(tmp_path):
    claim = build_sample_claim()
    session = ClaimIntake(claim)
    session.record_vso_review("J. Okafor", VSOVerdict.APPROVED_TO_FILE, "Verified DD-214.")

    with ClaimStore(tmp_path / "claims.db") as store:
        store.save_claim(claim)
        loaded = store.load_claim(claim.id)

    assert loaded is not None
    assert loaded.veteran.full_name == claim.veteran.full_name
    assert loaded.veteran.dob == claim.veteran.dob
    assert [c.name for c in loaded.conditions] == [c.name for c in claim.conditions]
    assert [e.title for e in loaded.service_events] == [e.title for e in claim.service_events]
    assert {e.evidence_type for e in loaded.evidence} == {e.evidence_type for e in claim.evidence}
    assert len(loaded.tasks) == len(claim.tasks)
    assert len(loaded.status_history) == len(claim.status_history)
    assert loaded.reviews[0].reviewer_name == "J. Okafor"
    assert loaded.status == ClaimStatus.SUBMITTED


def test_conditions_keep_their_link_to_service_events(tmp_path):
    claim = build_sample_claim()
    with ClaimStore(tmp_path / "claims.db") as store:
        store.save_claim(claim)
        loaded = store.load_claim(claim.id)

    for condition in loaded.conditions:
        assert loaded.find_service_event(condition.service_event_id) is not None


def test_saving_twice_updates_instead_of_duplicating(tmp_path):
    claim = build_sample_claim()
    with ClaimStore(tmp_path / "claims.db") as store:
        store.save_claim(claim)
        claim.set_status(ClaimStatus.IN_VSO_REVIEW, "Picked up by VSO")
        store.save_claim(claim)

        assert len(store.list_claims()) == 1
        reloaded = store.load_claim(claim.id)
        assert reloaded.status == ClaimStatus.IN_VSO_REVIEW
        assert len(reloaded.conditions) == len(claim.conditions)


def test_latest_claim_and_missing_claim(tmp_path):
    with ClaimStore(tmp_path / "claims.db") as store:
        assert store.latest_claim() is None
        assert store.load_claim("does-not-exist") is None

        claim = build_sample_claim()
        store.save_claim(claim)
        assert store.latest_claim().id == claim.id
