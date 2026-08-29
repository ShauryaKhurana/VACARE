-- VACARE local storage schema (SQLite)
-- Supports veteran intake, evidence tracking, follow-up tasks, and VSO review.
-- Dates are stored as ISO strings (YYYY-MM-DD) and booleans as 0/1.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS veterans (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    branch TEXT,
    service_start TEXT,
    service_end TEXT,
    discharge_type TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    veteran_id TEXT NOT NULL REFERENCES veterans(id) ON DELETE CASCADE,
    claim_type TEXT NOT NULL DEFAULT 'initial',
    status TEXT NOT NULL DEFAULT 'draft',
    summary TEXT,
    context_json TEXT,
    created_on TEXT NOT NULL
);

-- An in-service event a condition can point back to.
CREATE TABLE IF NOT EXISTS service_events (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date TEXT,
    location TEXT,
    witnesses TEXT,
    documented_in_service_records INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conditions (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    diagnosis TEXT,
    onset_date TEXT,
    started_in_service INTEGER NOT NULL DEFAULT 0,
    worsened_in_service INTEGER NOT NULL DEFAULT 0,
    currently_treated INTEGER NOT NULL DEFAULT 0,
    current_symptoms TEXT NOT NULL,
    service_event_id TEXT REFERENCES service_events(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS evidence_items (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL,
    title TEXT,
    source TEXT,
    file_uri TEXT,
    condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
    notes TEXT
);

-- Follow-up items generated from the missing-evidence checklist.
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    detail TEXT,
    required INTEGER NOT NULL DEFAULT 1,
    owner TEXT NOT NULL DEFAULT 'veteran',
    status TEXT NOT NULL DEFAULT 'open',
    condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS status_events (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    recorded_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vso_reviews (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL,
    verdict TEXT NOT NULL DEFAULT 'pending',
    review_notes TEXT,
    reviewed_on TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_veteran_id ON claims(veteran_id);
CREATE INDEX IF NOT EXISTS idx_conditions_claim_id ON conditions(claim_id);
CREATE INDEX IF NOT EXISTS idx_service_events_claim_id ON service_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON evidence_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_tasks_claim_id ON tasks(claim_id);
CREATE INDEX IF NOT EXISTS idx_status_events_claim_id ON status_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_vso_reviews_claim_id ON vso_reviews(claim_id);
