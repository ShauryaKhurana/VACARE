"""VACARE command line interface.

Run `python -m src.cli --help` to see everything. The main flow is:

    python -m src.cli intake      # guided veteran intake
    python -m src.cli checklist   # what is still missing
    python -m src.cli packet      # VSO-ready packet
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Callable, Optional

import typer
from pydantic import ValidationError

from src import packet as packet_view
from src.claim_intake import ClaimIntake
from src.models import (
    Branch,
    Claim,
    ClaimStatus,
    ClaimType,
    DischargeType,
    EvidenceType,
    VSOVerdict,
)
from src.storage import DEFAULT_DB_PATH, ClaimStore

app = typer.Typer(
    help="VACARE - VA disability claim intake and claim-prep helper.",
    no_args_is_help=True,
)

DB_OPTION = typer.Option(DEFAULT_DB_PATH, "--db", help="Path to the local claim database.")


# ---------------------------------------------------------------------------
# Small prompt helpers
# ---------------------------------------------------------------------------


def ask(question: str, default: str = "") -> str:
    return typer.prompt(question, default=default).strip()


def ask_optional(question: str) -> Optional[str]:
    answer = typer.prompt(f"{question} (optional)", default="").strip()
    return answer or None


def ask_yes_no(question: str, default: bool = False) -> bool:
    suffix = "Y/n" if default else "y/N"
    answer = typer.prompt(f"{question} ({suffix})", default="y" if default else "n").strip().lower()
    return answer.startswith("y")


def ask_date(question: str, required: bool = False) -> Optional[date]:
    """Keep asking until we get a real YYYY-MM-DD date (or a blank, if allowed)."""
    while True:
        label = question if required else f"{question} (optional)"
        answer = typer.prompt(f"{label} YYYY-MM-DD", default="").strip()
        if not answer:
            if required:
                typer.secho("This date is required.", fg=typer.colors.RED)
                continue
            return None
        try:
            return date.fromisoformat(answer)
        except ValueError:
            typer.secho("Please use the format YYYY-MM-DD, for example 1990-04-17.", fg=typer.colors.RED)


def ask_choice(question: str, options: list[str], default: str = "") -> Optional[str]:
    """Pick one value from a list, shown as a numbered menu."""
    typer.echo(f"\n{question}")
    for index, option in enumerate(options, start=1):
        typer.echo(f"  {index}. {option.replace('_', ' ')}")
    while True:
        answer = typer.prompt("Number (blank to skip)", default=default).strip()
        if not answer:
            return None
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return options[int(answer) - 1]
        typer.secho("Please enter one of the numbers listed.", fg=typer.colors.RED)


def build_with_retry(model_factory: Callable[[], object], repair: Callable[[str], None]) -> object:
    """Construct a model, and re-ask only the fields that failed validation."""
    while True:
        try:
            return model_factory()
        except ValidationError as error:
            typer.secho("\nSome answers need fixing:", fg=typer.colors.RED)
            for problem in error.errors():
                field = str(problem["loc"][0]) if problem["loc"] else "input"
                typer.secho(f"  - {field}: {problem['msg']}", fg=typer.colors.RED)
            for problem in error.errors():
                if problem["loc"]:
                    repair(str(problem["loc"][0]))


def load_claim_or_exit(store: ClaimStore, claim_id: Optional[str]) -> Claim:
    claim = store.load_claim(claim_id) if claim_id else store.latest_claim()
    if claim is None:
        typer.secho(
            "No claim found. Run `python -m src.cli intake` to start one.",
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1)
    return claim


# ---------------------------------------------------------------------------
# Intake
# ---------------------------------------------------------------------------


def _collect_veteran(answers: dict) -> object:
    from src.models import Veteran

    prompts = {
        "first_name": lambda: ask("First name"),
        "last_name": lambda: ask("Last name"),
        "dob": lambda: ask_date("Date of birth", required=True),
        "email": lambda: ask_optional("Email"),
        "phone": lambda: ask_optional("Phone"),
        "branch": lambda: ask_choice("Branch of service:", [b.value for b in Branch]),
        "service_start": lambda: ask_date("Service start date"),
        "service_end": lambda: ask_date("Service end date"),
        "discharge_type": lambda: ask_choice(
            "Discharge type:", [d.value for d in DischargeType], default=""
        ) or DischargeType.UNKNOWN.value,
    }

    for field, prompt in prompts.items():
        answers[field] = prompt()

    def repair(field: str) -> None:
        if field in prompts:
            typer.echo("")
            answers[field] = prompts[field]()

    return build_with_retry(lambda: Veteran(**answers), repair)


@app.command()
def intake(db: Path = DB_OPTION) -> None:
    """Guided intake: veteran details, in-service events, conditions, evidence."""
    typer.echo(packet_view.LINE)
    typer.echo("VACARE INTAKE")
    typer.echo(packet_view.LINE)
    typer.echo(packet_view.DISCLAIMER)
    typer.echo("")

    typer.secho("Step 1 of 4 - About you", bold=True)
    veteran = _collect_veteran({})

    intake_session = ClaimIntake()
    claim_type = ask_choice(
        "What kind of claim is this?", [c.value for c in ClaimType], default="1"
    ) or ClaimType.INITIAL.value
    intake_session.start_claim(veteran=veteran, claim_type=ClaimType(claim_type))

    # Step 2: in-service events, so conditions can point at them.
    typer.echo("")
    typer.secho("Step 2 of 4 - What happened during service", bold=True)
    typer.echo("Describe any injury, exposure, or event you believe caused your condition.")
    events: list[tuple[str, str]] = []
    while ask_yes_no("Add an in-service event?", default=not events):
        prompts = {
            "title": lambda: ask("Short title (for example: convoy IED blast)"),
            "description": lambda: ask("What happened, in your own words"),
            "event_date": lambda: ask_date("Roughly when"),
        }
        fields = {
            "title": prompts["title"](),
            "description": prompts["description"](),
            "event_date": prompts["event_date"](),
            "location": ask_optional("Where (base, country, ship)"),
            "witnesses": ask_optional("Anyone who saw it (name and contact)"),
            "documented_in_service_records": ask_yes_no("Is this in your service records?"),
        }

        def repair_event(field: str, _fields=fields, _prompts=prompts) -> None:
            if field in _prompts:
                _fields[field] = _prompts[field]()

        event = build_with_retry(
            lambda _fields=fields: intake_session.add_service_event(**_fields), repair_event
        )
        events.append((event.id, event.title))
        typer.secho(f"  Added event: {event.title}", fg=typer.colors.GREEN)

    # Step 3: conditions.
    typer.echo("")
    typer.secho("Step 3 of 4 - Conditions you are claiming", bold=True)
    while True:
        name = ask("Condition name (blank when finished)")
        if not name:
            if intake_session.claim.conditions:
                break
            typer.secho("Add at least one condition to continue.", fg=typer.colors.RED)
            continue

        fields = {
            "name": name,
            "current_symptoms": ask("How does it affect you today"),
            "diagnosis": ask_optional("Diagnosis, if a doctor gave you one"),
            "onset_date": ask_date("When did it start"),
            "started_in_service": ask_yes_no("Did it start during service?"),
            "worsened_in_service": ask_yes_no("Did service make it worse?"),
            "currently_treated": ask_yes_no("Are you being treated for it now?"),
            "notes": None,
            "service_event_id": None,
        }

        if events:
            titles = [title for _, title in events]
            chosen = ask_choice("Which in-service event is this related to?", titles)
            if chosen:
                fields["service_event_id"] = dict((t, i) for i, t in events)[chosen]

        prompts = {
            "name": lambda: ask("Condition name"),
            "current_symptoms": lambda: ask("How does it affect you today"),
            "onset_date": lambda: ask_date("When did it start"),
        }

        def repair(field: str) -> None:
            if field in prompts:
                fields[field] = prompts[field]()

        condition = build_with_retry(
            lambda: intake_session.add_condition(**fields), repair
        )
        typer.secho(f"  Added condition: {condition.name}", fg=typer.colors.GREEN)

    # Step 4: evidence on hand.
    typer.echo("")
    typer.secho("Step 4 of 4 - Documents you already have", bold=True)
    for evidence_type in EvidenceType:
        if evidence_type is EvidenceType.OTHER:
            continue
        from src.evidence_rules import friendly

        if ask_yes_no(f"Do you have {friendly(evidence_type)}?"):
            intake_session.add_evidence(
                evidence_type=evidence_type,
                source="veteran",
                file_uri=ask_optional("File path or where it is stored"),
            )

    intake_session.evaluate_readiness()

    with ClaimStore(db) as store:
        store.save_claim(intake_session.claim)

    typer.echo("\n" + packet_view.claim_summary(intake_session.claim))
    typer.echo("")
    typer.secho(f"Saved claim {intake_session.claim.id} to {db}", fg=typer.colors.GREEN)
    typer.echo("Next: python -m src.cli packet   (generates the VSO-ready packet)")


# ---------------------------------------------------------------------------
# Viewing and updating
# ---------------------------------------------------------------------------


@app.command("list")
def list_claims(db: Path = DB_OPTION) -> None:
    """List every claim in the local database."""
    with ClaimStore(db) as store:
        rows = store.list_claims()
    if not rows:
        typer.echo("No claims yet. Run `python -m src.cli intake`.")
        return
    typer.echo(f"{'CLAIM ID':<14}{'VETERAN':<26}{'TYPE':<14}STATUS")
    for claim_id, name, claim_type, status in rows:
        typer.echo(f"{claim_id:<14}{name:<26}{claim_type:<14}{status}")


@app.command()
def show(claim_id: Optional[str] = typer.Argument(None), db: Path = DB_OPTION) -> None:
    """Show the claim summary (defaults to the most recent claim)."""
    with ClaimStore(db) as store:
        typer.echo(packet_view.claim_summary(load_claim_or_exit(store, claim_id)))


@app.command()
def checklist(claim_id: Optional[str] = typer.Argument(None), db: Path = DB_OPTION) -> None:
    """Show what is still missing before the claim can be filed."""
    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
    typer.echo(packet_view.checklist_section(claim))
    typer.echo("")
    typer.echo(packet_view.vso_review_notes(claim))


@app.command()
def packet(
    claim_id: Optional[str] = typer.Argument(None),
    out: Optional[Path] = typer.Option(None, "--out", help="Also write the packet to this file."),
    db: Path = DB_OPTION,
) -> None:
    """Generate the VSO-ready claim packet."""
    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
        session = ClaimIntake(claim)
        session.evaluate_readiness()
        store.save_claim(claim)

    text = packet_view.vso_packet(claim)
    typer.echo(text)
    if out:
        out.write_text(text + "\n")
        typer.secho(f"\nWrote packet to {out}", fg=typer.colors.GREEN)


@app.command("add-evidence")
def add_evidence(
    evidence_type: str = typer.Argument(..., help="For example: dd214, nexus_letter"),
    claim_id: Optional[str] = typer.Option(None, "--claim-id"),
    file_uri: Optional[str] = typer.Option(None, "--file", help="Path or location of the document."),
    title: Optional[str] = typer.Option(None, "--title"),
    db: Path = DB_OPTION,
) -> None:
    """Attach a document to a claim, then re-check readiness."""
    try:
        parsed = EvidenceType(evidence_type)
    except ValueError:
        typer.secho(
            "Unknown evidence type. Options: " + ", ".join(e.value for e in EvidenceType),
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1)

    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
        session = ClaimIntake(claim)
        session.add_evidence(evidence_type=parsed, title=title, file_uri=file_uri, source="veteran")
        status = session.evaluate_readiness()
        store.save_claim(claim)

    typer.secho(f"Added {parsed.value}. Claim status is now {status.value}.", fg=typer.colors.GREEN)
    typer.echo("")
    typer.echo(packet_view.checklist_section(claim))


@app.command("set-status")
def set_status(
    status: str = typer.Argument(..., help="draft, ready_for_vso, in_vso_review, submitted, decided"),
    claim_id: Optional[str] = typer.Option(None, "--claim-id"),
    note: Optional[str] = typer.Option(None, "--note"),
    db: Path = DB_OPTION,
) -> None:
    """Record a status change, for the post-submission tracker."""
    try:
        parsed = ClaimStatus(status)
    except ValueError:
        typer.secho(
            "Unknown status. Options: " + ", ".join(s.value for s in ClaimStatus),
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1)

    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
        claim.set_status(parsed, note)
        store.save_claim(claim)

    typer.secho(f"Claim {claim.id} is now {parsed.value}.", fg=typer.colors.GREEN)


@app.command()
def review(
    reviewer: str = typer.Option(..., "--reviewer", help="VSO name."),
    verdict: str = typer.Option("pending", "--verdict", help="pending, needs_more_info, approved_to_file"),
    notes: Optional[str] = typer.Option(None, "--notes"),
    claim_id: Optional[str] = typer.Option(None, "--claim-id"),
    db: Path = DB_OPTION,
) -> None:
    """Record a VSO review verdict on a claim."""
    try:
        parsed = VSOVerdict(verdict)
    except ValueError:
        typer.secho(
            "Unknown verdict. Options: " + ", ".join(v.value for v in VSOVerdict),
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1)

    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
        session = ClaimIntake(claim)
        session.record_vso_review(reviewer_name=reviewer, verdict=parsed, review_notes=notes)
        store.save_claim(claim)

    typer.secho(f"Recorded {parsed.value} by {reviewer}.", fg=typer.colors.GREEN)
    typer.echo("")
    typer.echo(packet_view.status_section(claim))


@app.command()
def status(claim_id: Optional[str] = typer.Argument(None), db: Path = DB_OPTION) -> None:
    """Show the claim status, history, and open tasks."""
    with ClaimStore(db) as store:
        claim = load_claim_or_exit(store, claim_id)
    typer.echo(packet_view.status_section(claim))
    if claim.open_tasks:
        typer.echo("\nOPEN TASKS")
        typer.echo(packet_view.THIN)
        for task in claim.open_tasks:
            marker = "REQUIRED" if task.required else "suggested"
            typer.echo(f"  [{marker}] ({task.owner}) {task.name}")
            if task.detail:
                typer.echo(f"      {task.detail}")


@app.command()
def demo(db: Path = DB_OPTION) -> None:
    """Create a realistic sample claim, so you can see the output immediately."""
    from src.sample_data import build_sample_claim

    claim = build_sample_claim()
    with ClaimStore(db) as store:
        store.save_claim(claim)
    typer.echo(packet_view.vso_packet(claim))
    typer.secho(f"\nSaved sample claim {claim.id} to {db}", fg=typer.colors.GREEN)


if __name__ == "__main__":
    app()
