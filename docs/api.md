# VACARE JSON API (frontend contract)

Base URL when running locally: `http://127.0.0.1:8000/api`

All request/response bodies are JSON unless noted. Dates use ISO format (`YYYY-MM-DD`).

## How frontend and backend split work

| Frontend | Backend |
| --- | --- |
| Conversation / screens / path UX | Validate payload, confirm lane, run rules |
| Collect fields listed under `GET /paths` | Return checklist, `next_ask`, VSO review items |
| `path_hint` (optional) | **Recomputes lane** from `situation` facts |

Send partial payloads as the user progresses; backend merges into the case and returns what is still missing.

---

## Paths (claim lanes)

`GET /paths`

Returns one entry per user path with `required_fields` and `optional_fields`.

| `path` | When to use |
| --- | --- |
| `first_claim` | Never filed before |
| `increase` | Already rated, condition got worse |
| `new_condition` | New or secondary condition |
| `decision_review` | Disagrees with a VA decision |
| `bdd` | Still serving, 180–90 days from separation |
| `pre_discharge` | Still serving, fewer than 90 days out |
| `ides` | Medical evaluation board referral |

---

## Case lifecycle

### 1. Create case

`POST /cases`

Optional body:

```json
{
  "path_hint": "first_claim",
  "veteran": { "first_name": "Dana", "last_name": "Reyes" }
}
```

Response (`201`):

```json
{
  "case_id": "abc123",
  "status": "draft",
  "veteran_name": "Dana Reyes",
  "lane": "unknown",
  "condition_count": 0,
  "readiness_score": 0
}
```

### 2. Submit intake payload

`POST /cases/{case_id}/payload`

```json
{
  "path_hint": "first_claim",
  "situation": {
    "has_filed_before": false,
    "has_existing_rating": false
  },
  "veteran": {
    "first_name": "Dana",
    "last_name": "Reyes",
    "dob": "1988-03-12",
    "service_start": "2007-06-01",
    "service_end": "2013-08-30",
    "branch": "army"
  },
  "conditions": [
    {
      "name": "Tinnitus",
      "current_symptoms": "Ringing in both ears all day.",
      "started_in_service": true
    }
  ],
  "service_events": [],
  "evidence_on_hand": ["dd214", "service_treatment_record"],
  "dd214_facts": {
    "mos_code": "11B",
    "deployments": ["Afghanistan"],
    "campaign_medals": []
  }
}
```

Key response fields:

| Field | Use in UI |
| --- | --- |
| `lane` / `lane_title` | Show which claim path backend confirmed |
| `required_fields_still_missing` | Fields still needed |
| `evidence_checklist` | Document checklist |
| `presumptive_hits` | Deterministic rule results (`MATCH`, `NO_MATCH`, `NOT_ENOUGH_DATA`) |
| `next_ask` | Suggested next chat question |
| `form_sequence` | Ordered forms for this lane |
| `deadlines` | Running clocks (ITF, decision review, etc.) |
| `vso_packet_ready` | True when no blockers remain |
| `readiness_score` | 0–100 completeness |

### 3. Poll checklist (optional)

`GET /cases/{case_id}/checklist` — same shape as payload response.

### 4. VSO review

`GET /cases/{case_id}/review` — review cards with `suggested_state`: `CONFIRM`, `REJECT`, `NEEDS_REVIEW`.

`POST /cases/{case_id}/review/{item_id}`

```json
{
  "reviewer_id": "jane.vso@example.org",
  "decision": "approved_to_file",
  "note": "Looks complete."
}
```

`decision` values: `pending`, `needs_more_info`, `approved_to_file`.

### 5. VSO packet

`GET /cases/{case_id}/packet`

```json
{ "case_id": "abc123", "packet": "…plain text…" }
```

### 6. Upload evidence document

`POST /cases/{case_id}/documents`

Multipart form field: `file` (PDF or image).

When `GEMINI_API_KEY` is set, the backend sends the file to **Gemini** (see `src/extract.py`) to classify the document and pull veteran name, service dates, conditions, and decision-letter dates. Facts are merged into the case; the raw file is stored under `data/uploads/{case_id}/`.

Without a Gemini key, the file is saved and attached as evidence only — nothing is parsed or invented.

Response:

```json
{
  "case_id": "abc123",
  "filename": "dd214.pdf",
  "stored_path": "data/uploads/abc123/dd214.pdf",
  "document_type": "dd214",
  "summary": "DD-214 for Dana Reyes",
  "parsed_with_gemini": true,
  "fields_applied": ["name", "service dates", "branch"],
  "conditions_added": [],
  "evidence_type": "dd214",
  "message": "Read it as: DD-214 for Dana Reyes. Filled in name, service dates.",
  "checklist": { "…": "same shape as POST /payload response" }
}
```

---

## VA Benefits Intake (sandbox)

Requires `VA_API_KEY` in `.env` and `VA_USE_MOCK=false`.

### Submit filled 526EZ

`POST /cases/{case_id}/va/intake`

Backend generates a 21-526EZ PDF from the case and uploads via [VA Benefits Intake API](https://developer.va.gov/explore/api/benefits-intake/docs).

Response:

```json
{
  "submission_id": "guid-from-va",
  "status": "received",
  "message": "Upload accepted by VA sandbox."
}
```

With `VA_USE_MOCK=true` (default), `submission_id` starts with `mock-`.

### Check upload status

`GET /cases/{case_id}/va/intake/{submission_id}`

```json
{
  "submission_id": "…",
  "status": "received",
  "final_status": true,
  "updated_at": "2026-08-29T12:00:00Z",
  "detail": null
}
```

Sandbox final status is usually `received`.

### List submissions for a case

`GET /cases/{case_id}/va/submissions`

Returns every Benefits Intake upload recorded on the case (newest last). Status is updated when you poll `GET …/va/intake/{submission_id}`.

```json
[
  {
    "id": "sub-uuid",
    "submission_id": "guid-from-va",
    "doc_type": "21-526EZ",
    "status": "received",
    "message": "526EZ uploaded to VA sandbox…",
    "submitted_on": "2026-08-29",
    "updated_at": "2026-08-29T12:00:00Z"
  }
]
```

---

## Error codes

| HTTP | Meaning |
| --- | --- |
| `404` | Unknown `case_id` |
| `422` | Payload failed validation (Pydantic errors in body) |
| `502` | VA API call failed (check server logs / env vars) |

---

## Environment (backend)

Copy `.env.example` → `.env`:

```bash
VA_USE_MOCK=true          # set false when sandbox key is ready
VA_API_KEY=               # from developer.va.gov
VA_SANDBOX_FILE_NUMBER=000000000
VA_SANDBOX_ZIP=20500
GEMINI_API_KEY=           # optional — enables document parsing (DD-214, medical records, etc.)
```

Get a sandbox key: [developer.va.gov](https://developer.va.gov) → Benefits Intake API → Request access.

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-08-29 | Document upload (`POST …/documents`) with Gemini parsing; VA submissions list + persistence on case |
| 2026-08-29 | VA sandbox client: real multipart upload + `GET …/va/intake/{submission_id}` |

<!-- Append new rows here as endpoints evolve. -->
