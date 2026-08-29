"""End-to-end checks on the CLI, including the guided intake flow."""

from typer.testing import CliRunner

from src.cli import app
from src.sample_data import build_sample_claim
from src.storage import ClaimStore

runner = CliRunner()

# Answers for the guided intake, in the order the prompts appear.
INTAKE_ANSWERS = [
    # Step 1 - about you
    "Dana", "Reyes", "1988-03-12", "dana@example.com", "555-014-2277",
    "1",                      # branch: army
    "2007-06-01", "2013-08-30",
    "1",                      # discharge: honorable
    "1",                      # claim type: initial
    # Step 2 - one in-service event, then stop
    "y", "Convoy IED blast", "Vehicle struck a roadside device.", "2011-04-09",
    "Kandahar", "SGT M. Alvarez", "y",
    "n",
    # Step 3 - one condition, then a blank name to finish
    "Tinnitus", "Ringing in both ears all day.", "Bilateral tinnitus", "2011-04-01",
    "y", "n", "y",            # started / worsened / currently treated
    "1",                      # linked to the blast event
    "",
    # Step 4 - documents on hand (one answer per evidence type)
    "y", "",                  # DD-214 + file location
    "y", "",                  # service treatment records
    "n",                      # service personnel records
    "y", "",                  # current medical records
    "n", "n", "n", "n", "n", "n", "n",
]


def run(args, db, input_text=None):
    return runner.invoke(app, args + ["--db", str(db)], input=input_text)


def test_guided_intake_creates_a_vso_ready_claim(tmp_path):
    db = tmp_path / "claims.db"
    result = run(["intake"], db, input_text="\n".join(INTAKE_ANSWERS) + "\n")

    assert result.exit_code == 0, result.output
    assert "VACARE CLAIM SUMMARY" in result.output

    with ClaimStore(db) as store:
        claim = store.latest_claim()

    assert claim.veteran.full_name == "Dana Reyes"
    assert [c.name for c in claim.conditions] == ["Tinnitus"]
    assert claim.conditions[0].service_event_id == claim.service_events[0].id
    assert claim.status.value == "ready_for_vso"


def test_intake_reprompts_after_a_bad_answer(tmp_path):
    db = tmp_path / "claims.db"
    answers = INTAKE_ANSWERS.copy()
    answers[0] = "D"              # too short: rejected, then re-asked after step 1
    answers.insert(9, "Dana")     # the corrected first name
    result = run(["intake"], db, input_text="\n".join(answers) + "\n")

    assert result.exit_code == 0, result.output
    assert "Some answers need fixing" in result.output
    with ClaimStore(db) as store:
        assert store.latest_claim().veteran.first_name == "Dana"


def test_intake_reprompts_after_an_empty_event_description(tmp_path):
    db = tmp_path / "claims.db"
    answers = INTAKE_ANSWERS.copy()
    answers[11] = ""              # blank event title, which validation rejects
    answers.insert(17, "Convoy IED blast")   # the corrected title
    result = run(["intake"], db, input_text="\n".join(answers) + "\n")

    assert result.exit_code == 0, result.output
    assert "Some answers need fixing" in result.output
    with ClaimStore(db) as store:
        assert store.latest_claim().service_events[0].title == "Convoy IED blast"

def test_commands_report_a_missing_claim_instead_of_crashing(tmp_path):
    for command in (["show"], ["checklist"], ["packet"], ["status"]):
        result = run(command, tmp_path / "empty.db")
        assert result.exit_code == 1
        assert "No claim found" in result.output


def test_list_show_and_packet_on_a_saved_claim(tmp_path):
    db = tmp_path / "claims.db"
    claim = build_sample_claim()
    with ClaimStore(db) as store:
        store.save_claim(claim)

    listed = run(["list"], db)
    assert claim.id in listed.output and "Dana Reyes" in listed.output

    shown = run(["show", claim.id], db)
    assert "VACARE CLAIM SUMMARY" in shown.output
    assert "does not provide legal advice" in shown.output

    out_file = tmp_path / "packet.txt"
    generated = run(["packet", claim.id, "--out", str(out_file)], db)
    assert generated.exit_code == 0
    assert "VSO-READY CLAIM PACKET" in out_file.read_text()


def test_add_evidence_updates_the_checklist(tmp_path):
    db = tmp_path / "claims.db"
    claim = build_sample_claim()
    with ClaimStore(db) as store:
        store.save_claim(claim)

    result = run(["add-evidence", "hearing_test", "--claim-id", claim.id], db)
    assert result.exit_code == 0
    assert "Audiology" not in result.output      # no longer missing

    with ClaimStore(db) as store:
        assert store.load_claim(claim.id).has_evidence("hearing_test")


def test_add_evidence_rejects_an_unknown_type(tmp_path):
    db = tmp_path / "claims.db"
    with ClaimStore(db) as store:
        store.save_claim(build_sample_claim())

    result = run(["add-evidence", "banana"], db)
    assert result.exit_code == 1
    assert "Unknown evidence type" in result.output


def test_status_tracking_and_vso_review(tmp_path):
    db = tmp_path / "claims.db"
    claim = build_sample_claim()
    with ClaimStore(db) as store:
        store.save_claim(claim)

    assert run(["set-status", "in_vso_review", "--note", "Picked up"], db).exit_code == 0
    review = run(["review", "--reviewer", "J. Okafor", "--verdict", "approved_to_file"], db)
    assert review.exit_code == 0

    with ClaimStore(db) as store:
        updated = store.load_claim(claim.id)
    assert updated.status.value == "submitted"
    assert [event.note for event in updated.status_history if event.note == "Picked up"]

    assert run(["set-status", "not_a_status"], db).exit_code == 1
