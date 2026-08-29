"""Local SQLite storage for claims.

One small module that saves a whole Claim and loads it back. It rewrites the
child rows for a claim on every save, which keeps the code simple and is fine
at MVP scale (one veteran working on one claim at a time).
"""

from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path
from typing import List, Optional, Tuple

from src.models import (
    Claim,
    LaneContext,
    Condition,
    EvidenceItem,
    ServiceEvent,
    StatusEvent,
    Task,
    Veteran,
    VSOReview,
)

DEFAULT_DB_PATH = Path("vacare.db")
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "va_claim_schema.sql"


def _iso(value: Optional[date]) -> Optional[str]:
    return value.isoformat() if value else None


class ClaimStore:
    """Save and load claims in a local SQLite file."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self._create_schema()

    def _create_schema(self) -> None:
        self.connection.executescript(SCHEMA_PATH.read_text())
        self._add_missing_columns()
        self.connection.commit()

    def _add_missing_columns(self) -> None:
        """Tiny forward migration so databases created by an older build still open."""
        existing = {row["name"] for row in self.connection.execute("PRAGMA table_info(claims)")}
        if "context_json" not in existing:
            self.connection.execute("ALTER TABLE claims ADD COLUMN context_json TEXT")

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "ClaimStore":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # -- saving ------------------------------------------------------------

    def save_claim(self, claim: Claim) -> str:
        """Insert or update a claim and all of its child records."""
        cur = self.connection.cursor()
        veteran = claim.veteran

        cur.execute(
            """
            INSERT INTO veterans (id, first_name, last_name, dob, email, phone,
                                  branch, service_start, service_end, discharge_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                first_name=excluded.first_name, last_name=excluded.last_name,
                dob=excluded.dob, email=excluded.email, phone=excluded.phone,
                branch=excluded.branch, service_start=excluded.service_start,
                service_end=excluded.service_end, discharge_type=excluded.discharge_type
            """,
            (
                veteran.id, veteran.first_name, veteran.last_name, _iso(veteran.dob),
                veteran.email, veteran.phone,
                veteran.branch.value if veteran.branch else None,
                _iso(veteran.service_start), _iso(veteran.service_end),
                veteran.discharge_type.value,
            ),
        )

        cur.execute(
            """
            INSERT INTO claims (id, veteran_id, claim_type, status, summary, context_json, created_on)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                claim_type=excluded.claim_type, status=excluded.status,
                summary=excluded.summary, context_json=excluded.context_json
            """,
            (
                claim.id, veteran.id, claim.claim_type.value, claim.status.value,
                claim.summary, claim.context.model_dump_json(), _iso(claim.created_on),
            ),
        )

        # Child rows are replaced wholesale so the database always mirrors the
        # in-memory claim. Order matters because of the foreign keys.
        for table in ("vso_reviews", "status_events", "tasks", "evidence_items",
                      "conditions", "service_events"):
            cur.execute(f"DELETE FROM {table} WHERE claim_id = ?", (claim.id,))

        cur.executemany(
            """
            INSERT INTO service_events (id, claim_id, title, description, event_date,
                                        location, witnesses, documented_in_service_records)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (event.id, claim.id, event.title, event.description, _iso(event.event_date),
                 event.location, event.witnesses, int(event.documented_in_service_records))
                for event in claim.service_events
            ],
        )

        cur.executemany(
            """
            INSERT INTO conditions (id, claim_id, name, diagnosis, onset_date,
                                    started_in_service, worsened_in_service, currently_treated,
                                    current_symptoms, service_event_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (c.id, claim.id, c.name, c.diagnosis, _iso(c.onset_date),
                 int(c.started_in_service), int(c.worsened_in_service), int(c.currently_treated),
                 c.current_symptoms, c.service_event_id, c.notes)
                for c in claim.conditions
            ],
        )

        cur.executemany(
            """
            INSERT INTO evidence_items (id, claim_id, evidence_type, title, source,
                                        file_uri, condition_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (e.id, claim.id, e.evidence_type.value, e.title, e.source,
                 e.file_uri, e.condition_id, e.notes)
                for e in claim.evidence
            ],
        )

        cur.executemany(
            """
            INSERT INTO tasks (id, claim_id, name, detail, required, owner, status, condition_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (t.id, claim.id, t.name, t.detail, int(t.required), t.owner,
                 t.status.value, t.condition_id)
                for t in claim.tasks
            ],
        )

        cur.executemany(
            "INSERT INTO status_events (id, claim_id, status, note, recorded_on) VALUES (?, ?, ?, ?, ?)",
            [
                (s.id, claim.id, s.status.value, s.note, _iso(s.recorded_on))
                for s in claim.status_history
            ],
        )

        cur.executemany(
            """
            INSERT INTO vso_reviews (id, claim_id, reviewer_name, verdict, review_notes, reviewed_on)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (r.id, claim.id, r.reviewer_name, r.verdict.value, r.review_notes, _iso(r.reviewed_on))
                for r in claim.reviews
            ],
        )

        self.connection.commit()
        return claim.id

    # -- loading -----------------------------------------------------------

    def list_claims(self) -> List[Tuple[str, str, str, str]]:
        """(claim_id, veteran name, claim type, status) for every stored claim."""
        rows = self.connection.execute(
            """
            SELECT c.id, v.first_name, v.last_name, c.claim_type, c.status
            FROM claims c JOIN veterans v ON v.id = c.veteran_id
            ORDER BY c.created_on DESC, c.id
            """
        ).fetchall()
        return [
            (row["id"], f"{row['first_name']} {row['last_name']}", row["claim_type"], row["status"])
            for row in rows
        ]

    def load_claim(self, claim_id: str) -> Optional[Claim]:
        claim_row = self.connection.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if claim_row is None:
            return None

        veteran_row = self.connection.execute(
            "SELECT * FROM veterans WHERE id = ?", (claim_row["veteran_id"],)
        ).fetchone()

        def child(table: str) -> List[sqlite3.Row]:
            return self.connection.execute(
                f"SELECT * FROM {table} WHERE claim_id = ?", (claim_id,)
            ).fetchall()

        return Claim(
            id=claim_row["id"],
            veteran=Veteran(**{k: veteran_row[k] for k in veteran_row.keys()}),
            claim_type=claim_row["claim_type"],
            status=claim_row["status"],
            summary=claim_row["summary"],
            context=(
                LaneContext.model_validate_json(claim_row["context_json"])
                if claim_row["context_json"] else LaneContext()
            ),
            created_on=claim_row["created_on"],
            service_events=[ServiceEvent(**dict(r)) for r in _drop_claim_id(child("service_events"))],
            conditions=[Condition(**dict(r)) for r in _drop_claim_id(child("conditions"))],
            evidence=[EvidenceItem(**dict(r)) for r in _drop_claim_id(child("evidence_items"))],
            tasks=[Task(**dict(r)) for r in _drop_claim_id(child("tasks"))],
            status_history=[StatusEvent(**dict(r)) for r in _drop_claim_id(child("status_events"))],
            reviews=[VSOReview(**dict(r)) for r in _drop_claim_id(child("vso_reviews"))],
        )

    def latest_claim(self) -> Optional[Claim]:
        """Convenience for the CLI: the most recently created claim."""
        claims = self.list_claims()
        return self.load_claim(claims[0][0]) if claims else None


def _drop_claim_id(rows: List[sqlite3.Row]) -> List[dict]:
    """Rows carry a claim_id column that the models do not have."""
    return [{k: row[k] for k in row.keys() if k != "claim_id"} for row in rows]
