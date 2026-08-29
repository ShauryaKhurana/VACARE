# VACARE

A veteran-focused intake and claim-prep tool for VA disability benefits.

VACARE turns a plain-language intake into structured claim facts, tells the
veteran exactly which documents are still missing, and hands a VSO a clean,
review-ready packet so filing is a short confirmation step.

**VACARE is not a legal or benefits-decision engine.** It does not give legal
advice and cannot predict or guarantee a VA outcome. A VSO or accredited
representative reviews and files every claim.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python -m src.web            # web UI at http://127.0.0.1:8000
python -m src.cli demo        # or the CLI: a filled-in sample claim and packet
python -m src.cli intake      # guided terminal intake
```

## Web UI

`python -m src.web` then open <http://127.0.0.1:8000>.

| Page | What it does |
| --- | --- |
| `/intake` | Plain-language intake. The answers route the veteran into a lane |
| `/claim/{id}` | Lane, ordered form sequence with PDF links, deadline clocks, third-party chase list, evidence checklist, status history |
| `/claim/{id}/packet` | The VSO packet as plain text |
| `/forms` | All 42 forms, with who fills each one and its lock |

## Commands

| Command | What it does |
| --- | --- |
| `intake` | Guided intake: veteran details, in-service events, conditions, documents on hand |
| `list` | List every claim in the local database |
| `show [CLAIM_ID]` | Claim summary for the veteran |
| `checklist [CLAIM_ID]` | What is still missing, plus the VSO review notes |
| `packet [CLAIM_ID] --out FILE` | The full VSO-ready packet |
| `add-evidence TYPE --file PATH` | Attach a document and re-check readiness |
| `status [CLAIM_ID]` | Claim status, history, and open tasks |
| `set-status STATUS --note ...` | Record a status change (post-submission tracker) |
| `review --reviewer NAME --verdict ...` | Record a VSO verdict |

Every command takes `--db PATH`; claims default to `vacare.db` in the working
directory, and commands that take an optional `CLAIM_ID` default to the most
recent claim.

## How it works

```
intake answers  ->  validated models  ->  evidence rules  ->  packet
   (src/cli)         (src/models)      (src/evidence_rules)  (src/packet)
                            |
                       SQLite storage
                       (src/storage)
```

- **`src/lanes.py`** - routes a veteran into one of the five lanes, builds the
  ordered form sequence for that lane, and computes every deadline clock.
- **`src/forms.py`** - the form catalog: number, title, who physically fills it,
  PDF link, and the lock that matters.
- **`src/web.py`** + `src/templates/` - the FastAPI frontend.
- **`src/models.py`** - Pydantic models for veteran, service event, condition,
  evidence, task, status, and VSO review. Validation rejects obviously
  incomplete or malformed records (short names, future birth dates, service end
  before service start, conditions with no described symptoms).
- **`src/evidence_rules.py`** - Categorizes each condition by keyword, derives
  the required and suggested evidence, flags weak service-connection stories,
  and produces follow-up tasks and a 0-100 checklist-completeness score.
- **`src/claim_intake.py`** - Builds a claim step by step and moves it between
  `draft` and `ready_for_vso` as items are collected.
- **`src/storage.py`** - Saves and loads a whole claim in local SQLite.
- **`src/packet.py`** - Plain-text claim summary and VSO-ready packet.

## Claim lifecycle

`draft` -> `ready_for_vso` -> `in_vso_review` -> `submitted` -> `decided`

A claim only reaches `ready_for_vso` when there are no blockers: at least one
condition, a DD-214, service treatment records, current medical records for each
condition, and a recorded service connection for every condition.

## Tests

```bash
python -m pytest tests -q
```

## Not built yet

Actual file uploads (evidence stores a path only), pre-filled form PDFs,
decision-letter parsing, DBQ selection by diagnostic code, multi-user accounts
and auth, and any LLM-backed free-text parsing.
