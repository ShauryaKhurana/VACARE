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

cp .env.example .env         # then paste your GEMINI_API_KEY into it
python -m src.web            # web UI at http://127.0.0.1:8000
python -m src.cli demo        # or the CLI: a filled-in sample claim and packet
python -m src.cli intake      # guided terminal intake
```

## Web UI

`python -m src.web` then open <http://127.0.0.1:8000>.

| Page | What it does |
| --- | --- |
| `/chat` | **Conversational intake.** Four questions and two uploads; documents replace the rest |
| `/intake` | The long form, kept as a no-AI fallback |
| `/claim/{id}` | Lane, ordered form sequence with PDF links, deadline clocks, third-party chase list, evidence checklist, status history |
| `/claim/{id}/packet` | The VSO packet as plain text |
| `/forms` | All 42 forms, with who fills each one and its lock |
| `/claim/{id}/526ez` | The **filled 21-526EZ PDF**, generated from the claim |

## The chat intake

The design rule is that nothing gets asked twice and nothing gets asked that a
document can answer. A veteran with a DD-214 answers **four questions**:

1. "In your own words, what happened and what's bothering you now?" - Gemini
   extracts the conditions, the in-service event, onset dates, and the
   situation flags (civilian treatment, dependents, witnesses, employability)
2. Upload the DD-214 - name, date of birth, branch, service dates, and
   discharge are read off it
3. Current rating, or "none" - which alone implies whether they've filed before
4. What brings them here - only asked if they already have a rating

Everything else is derived. The separation date *is* the service end date, so
it is one field. Uploading a decision letter sets the decision date and starts
every clock that runs from it.

Extraction runs at `temperature: 0` so the same document yields the same
fields every time, and every extracted value is shown back for confirmation
rather than silently trusted.

## Gemini

Set `GEMINI_API_KEY` in `.env` (gitignored). The default model is
`gemini-3.7-flash`, overridable with `GEMINI_MODEL`. Gemini reads PDFs and
photos natively, so there is no separate OCR step.

Without a key the app still runs: lane routing, the checklist, the deadline
clocks, the long-form intake, and form filling are all deterministic Python.
Only the story parsing and document reading need the API.

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

- **`src/intake_chat.py`** - the conversation: which slots are still unknown,
  and what to ask next.
- **`src/extract.py`** - free text and documents to structured claim facts.
- **`src/gemini.py`** - a small REST client; structured output and native PDF
  reading, no SDK.
- **`src/formfill.py`** - fills the 21-526EZ AcroForm and reports what it could
  not fill.
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

The 526EZ is filled but neither signed nor submitted, and the SSN and mailing
address boxes are deliberately left blank rather than invented. Deadline maths is
plain calendar arithmetic - no tolling, no weekend or holiday rules - so a date
that matters legally still needs a human check. Most form PDF links are derived
from a URL pattern rather than individually verified. Still missing: POA
revocation checks, chase states for third-party forms, DBQ selection by
diagnostic code, form revision monitoring, and multi-user auth.

## Frontend

`frontend/veteran-app/` is a Next.js frontend for the veteran-facing conversational
intake flow. It runs against mock fixtures by default, and against this Python
backend when `NEXT_PUBLIC_API_BASE_URL` is set:

```bash
python -m src.web                                    # backend on :8000
cd frontend/veteran-app && cp .env.local.example .env.local && npm run dev
```

`src/api/app_routes.py` serves the frontend's own contract
(`frontend/veteran-app/lib/api/types.ts`), with `src/api/app_bridge.py` mapping
lanes, the evidence checklist, deadline clocks, and the decision summary onto
the shapes the UI already renders. See `frontend/veteran-app/README.md`.
