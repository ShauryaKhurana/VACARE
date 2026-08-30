"""Local SQLite storage for claims.

One small module that saves a whole Claim and loads it back. It rewrites the
child rows for a claim on every save, which keeps the code simple and is fine
at MVP scale (one veteran working on one claim at a time).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional, Tuple, Union

from src.models import (
    CaseMessage,
    Claim,
    LaneContext,
    Condition,
    EvidenceItem,
    MessageAuthor,
    ServiceEvent,
    StatusEvent,
    Task,
    VaSubmission,
    Veteran,
    VSOReview,
)

DEFAULT_DB_PATH = Path("vacare.db")
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "va_claim_schema.sql"


def _iso(value: Optional[Union[date, datetime]]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    return value.isoformat()


def _parse_message_timestamp(raw: str) -> datetime:
    if "T" in raw:
        return datetime.fromisoformat(raw)
    return datetime.fromisoformat(f"{raw}T00:00:00")


def _store_dob(value: Optional[date]) -> str:
    """SQLite requires a value; use a sentinel when intake has not collected DOB yet."""
    return value.isoformat() if value else "0000-01-01"


def _load_dob(value: Optional[str]) -> Optional[date]:
    if not value or value == "0000-01-01":
        return None
    return date.fromisoformat(value)


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
        tables = {
            row["name"]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        if "va_submissions" not in tables:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS va_submissions (
                    id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
                    submission_id TEXT NOT NULL,
                    doc_type TEXT NOT NULL DEFAULT '21-526EZ',
                    status TEXT NOT NULL,
                    message TEXT,
                    submitted_on TEXT NOT NULL,
                    updated_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_va_submissions_claim_id
                    ON va_submissions(claim_id);
                """
            )
        if "case_messages" not in tables:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS case_messages (
                    id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
                    author TEXT NOT NULL,
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_case_messages_claim_id
                    ON case_messages(claim_id);
                """
            )
        if "chat_sessions" not in tables:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    claim_id TEXT PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
                    session_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

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
                veteran.id, veteran.first_name, veteran.last_name, _store_dob(veteran.dob),
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
        for table in ("va_submissions", "vso_reviews", "status_events", "tasks", "evidence_items",
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

        cur.executemany(
            """
            INSERT INTO va_submissions (id, claim_id, submission_id, doc_type, status,
                                        message, submitted_on, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    submission.id, claim.id, submission.submission_id, submission.doc_type,
                    submission.status, submission.message, _iso(submission.submitted_on),
                    submission.updated_at,
                )
                for submission in claim.va_submissions
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

        veteran_data = {k: veteran_row[k] for k in veteran_row.keys()}
        veteran_data["dob"] = _load_dob(veteran_data.get("dob"))
        for date_field in ("service_start", "service_end"):
            if veteran_data.get(date_field):
                veteran_data[date_field] = date.fromisoformat(veteran_data[date_field])

        return Claim(
            id=claim_row["id"],
            veteran=Veteran(**veteran_data),
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
            va_submissions=_load_va_submissions(child("va_submissions")),
        )

    def latest_claim(self) -> Optional[Claim]:
        """Convenience for the CLI: the most recently created claim."""
        claims = self.list_claims()
        return self.load_claim(claims[0][0]) if claims else None

    # -- veteran ↔ VSO messages -----------------------------------------------

    def add_message(self, claim_id: str, author: MessageAuthor, body: str) -> CaseMessage:
        message = CaseMessage(
            claim_id=claim_id,
            author=author,
            body=body.strip(),
            created_at=datetime.utcnow(),
        )
        if not message.body:
            raise ValueError("Message cannot be empty")
        self.connection.execute(
            """
            INSERT INTO case_messages (id, claim_id, author, body, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message.id, claim_id, author.value, message.body, _iso(message.created_at)),
        )
        self.connection.commit()
        return message

    def list_messages(self, claim_id: str) -> List[CaseMessage]:
        rows = self.connection.execute(
            """
            SELECT id, claim_id, author, body, created_at
            FROM case_messages WHERE claim_id = ?
            ORDER BY created_at ASC, rowid ASC
            """,
            (claim_id,),
        ).fetchall()
        return [
            CaseMessage(
                id=row["id"],
                claim_id=row["claim_id"],
                author=MessageAuthor(row["author"]),
                body=row["body"],
                created_at=_parse_message_timestamp(row["created_at"]),
            )
            for row in rows
        ]

    def save_chat_session(self, claim_id: str, session_data: dict) -> None:
        payload = json.dumps(session_data)
        now = datetime.utcnow().isoformat(timespec="seconds")
        self.connection.execute(
            """
            INSERT INTO chat_sessions (claim_id, session_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(claim_id) DO UPDATE SET
                session_json=excluded.session_json,
                updated_at=excluded.updated_at
            """,
            (claim_id, payload, now),
        )
        self.connection.commit()

    def load_chat_session(self, claim_id: str) -> Optional[dict]:
        row = self.connection.execute(
            "SELECT session_json FROM chat_sessions WHERE claim_id = ?",
            (claim_id,),
        ).fetchone()
        if row is None:
            return None
        return json.loads(row["session_json"])

    def delete_chat_session(self, claim_id: str) -> None:
        self.connection.execute("DELETE FROM chat_sessions WHERE claim_id = ?", (claim_id,))
        self.connection.commit()

    def list_vso_queue(self) -> List[Tuple[str, str, str, str, str]]:
        """(claim_id, veteran name, status, updated, condition summary) for VSO inbox."""
        rows = self.connection.execute(
            """
            SELECT c.id, v.first_name, v.last_name, c.status, c.created_on,
                   (SELECT GROUP_CONCAT(name, ', ') FROM conditions WHERE claim_id = c.id) AS conds
            FROM claims c
            JOIN veterans v ON v.id = c.veteran_id
            WHERE c.status IN ('ready_for_vso', 'in_vso_review')
            ORDER BY c.created_on DESC, c.id DESC
            """
        ).fetchall()
        return [
            (
                row["id"],
                f"{row['first_name']} {row['last_name']}",
                row["status"],
                row["created_on"],
                row["conds"] or "No conditions yet",
            )
            for row in rows
        ]


def _drop_claim_id(rows: List[sqlite3.Row]) -> List[dict]:
    """Rows carry a claim_id column that the models do not have."""
    return [{k: row[k] for k in row.keys() if k != "claim_id"} for row in rows]


def _load_va_submissions(rows: List[sqlite3.Row]) -> List[VaSubmission]:
    submissions: List[VaSubmission] = []
    for row in rows:
        data = {k: row[k] for k in row.keys() if k != "claim_id"}
        if data.get("submitted_on"):
            data["submitted_on"] = date.fromisoformat(data["submitted_on"])
        submissions.append(VaSubmission(**data))
    return submissions
