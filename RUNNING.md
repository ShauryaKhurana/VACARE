# Running VACARE — hackathon demo guide

Written to be followed by someone who has never opened this repo. Every command
is copy-pasteable and runs **from the repo root** unless it says otherwise.

There are **three** things that run, on three ports:

| Port | What | Who it's for |
|------|------|--------------|
| `3000` | Next.js chat app | The **veteran**. This is the demo. |
| `8000` | Python API + old server-rendered UI | The brain. The Next app talks to it. |
| `8001` | VSO review portal | The **VSO** who receives the claim. |

Port `3000` is the star. Port `8000` mostly runs in the background. Port `8001`
is the payoff shot at the end.

---

## Part 1 — One-time setup

Do this once, well before you present.

### 1. Python environment

```bash
cd /Users/sk/Desktop/HackerDojo/VACARE/VACARE
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install fpdf2          # only needed to regenerate sample PDFs
```

You never need to `activate` the venv. Every command below calls
`.venv/bin/python` directly, which avoids the classic "wrong directory, wrong
Python" failure.

### 2. Gemini API key

The app reads uploaded documents with Gemini. Put the key in `.env` at the repo
root:

```bash
cp .env.example .env      # skip if .env already exists
```

Then open `.env` and set:

```
GEMINI_API_KEY=your-key-here
```

Get a key at https://aistudio.google.com/apikey.

`.env` is gitignored. **Never commit it.**

Check it worked:

```bash
.venv/bin/python -c "from src.gemini import available; print('key OK' if available() else 'NO KEY')"
```

Without a key everything still runs — the app just can't read uploads, and says
so honestly instead of pretending.

### 3. Frontend dependencies

```bash
cd frontend/veteran-app
npm install
cd ../..
```

### 4. Point the frontend at the real backend

This is the single most common demo failure: the Next app silently runs on
**mock fixtures** when this file is missing, so nothing you type reaches Python.

```bash
cp frontend/veteran-app/.env.local.example frontend/veteran-app/.env.local
```

Confirm it contains:

```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

> Next.js only reads `.env.local` **at startup**. If you create or edit it while
> `npm run dev` is running, you must restart the dev server.

### 5. Generate the sample documents

These are the fake papers you'll upload on stage.

```bash
PYTHONPATH=. .venv/bin/python scripts/generate_sample_dd214.py
PYTHONPATH=. .venv/bin/python scripts/generate_sample_medical_record.py
PYTHONPATH=. .venv/bin/python scripts/generate_sample_service_treatment_record.py
```

They land in `tests/fixtures/`. All of them are marked SPECIMEN and carry SSN
`000-00-0000`, a number the SSA has never issued — **no real person's data is in
this repo.**

---

## Part 2 — Starting everything

Two terminal tabs. Leave both running.

### Tab 1 — both Python servers

```bash
cd /Users/sk/Desktop/HackerDojo/VACARE/VACARE
./scripts/start_demo.sh
```

That one script checks your environment, generates any missing sample PDFs,
seeds a demo claim, and starts port `8000` **and** port `8001`. It prints a
checklist as it goes — read it, it tells you if the key is missing.

<details>
<summary>Prefer to start them by hand?</summary>

```bash
.venv/bin/python -m uvicorn src.web:app     --host 127.0.0.1 --port 8000 --reload
.venv/bin/python -m uvicorn src.vso_web:app --host 127.0.0.1 --port 8001 --reload
```

Each needs its own tab.
</details>

### Tab 2 — the veteran app

```bash
cd /Users/sk/Desktop/HackerDojo/VACARE/VACARE/frontend/veteran-app
npm run dev
```

Wait for `Ready in …`, then open **http://localhost:3000**.

### Check all three are alive

```bash
curl -s -o /dev/null -w "veteran API %{http_code}\n" http://127.0.0.1:8000/docs
curl -s -o /dev/null -w "VSO portal %{http_code}\n" http://127.0.0.1:8001/
curl -s -o /dev/null -w "chat app   %{http_code}\n" http://localhost:3000/talk
```

Three `200`s means you're ready.

---

## Part 3 — The demo script

Open **http://localhost:3000** in an **incognito window**. Incognito matters:
the app remembers your session in `localStorage`, and a fresh window guarantees
you start at question one.

### Beat 1 — the veteran talks like a person

The chat greets you immediately with the first question. Type a plain-language
story, not form-speak:

> `Ringing in my ears since a convoy blast in 2012, and my right knee gives out on stairs.`

**Point out:** it pulled out *two separate conditions*, named the in-service
event, and linked them — from one sentence. No form. No checkboxes.

### Beat 2 — the document does the typing

When it asks for your DD-214, click the **paperclip** and upload:

```
tests/fixtures/sample_dd214.pdf
```

A "What we found" card appears with name, date of birth, branch, service dates,
and discharge — read straight off the PDF.

**Point out:** it also silently captured the **SSN** and **home of record**, so
it never asks for either. Those blocks are on every DD-214; asking the veteran
to retype them is the exact busywork this replaces.

### Beat 3 — the few questions that are actually necessary

It asks for phone and email, then the mailing address — offering the DD-214's
home of record as a **one-tap answer**.

**Point out:** it *offers* rather than assumes. Block 7b is where you lived when
you enlisted, which for most veterans is years stale. One tap if it's right,
type over it if not.

Answer the rating question ("No, this is my first claim" is the cleanest demo),
then upload the medical record when asked:

```
tests/fixtures/sample_medical_record.pdf
```

### Beat 4 — the filled form

When the dig is done you get **Continue to Review & confirm**, and from there a
**download of the filled 21-526EZ**. Open it.

**Point out:** ~52 boxes filled from a conversation and two PDFs. The only thing
left blank is the signature.

### Beat 5 — the VSO side (the payoff)

Click through the handoff. Now switch to **http://127.0.0.1:8001**.

The claim is sitting in the review queue. Click it: evidence checklist, the
forms this lane needs, the filled 526EZ, and a message thread back to the
veteran.

**The closing line:** the VSO's job just became *confirm and file*, instead of
an hour-long interview.

---

## Part 4 — Resetting between runs

You will demo more than once. Reset properly or your second run starts
mid-conversation.

**Fastest (in the browser):** click **Start over** at the top of the chat, or
just open a new incognito window.

**Full reset (wipes every claim):**

```bash
rm -f vacare.db
```

Then restart the Python servers. Re-seed a demo claim if you want the VSO queue
pre-populated:

```bash
PYTHONPATH=. .venv/bin/python scripts/seed_demo_journey.py --full --replace
```

`--full` seeds four claims at different lifecycle stages, so the VSO queue has
something in it. Plain `seed_demo_journey.py` seeds one draft claim.

---

## Part 5 — When something breaks on stage

### "Address already in use"

A server from an earlier run is still holding the port.

```bash
lsof -ti tcp:8000 | xargs kill -9
lsof -ti tcp:8001 | xargs kill -9
lsof -ti tcp:3000 | xargs kill -9
```

Then start them again.

### The chat answers instantly and ignores what you type

You're on the mock. `.env.local` is missing, or you created it after starting
`npm run dev`. Fix the file (Part 1, step 4) and **restart the dev server**.

### Uploads come back empty, or it asks for things the DD-214 shows

Check the key:

```bash
.venv/bin/python -c "from src.gemini import available; print(available())"
```

`False` means no key — parsing is off.

Also make sure you're uploading the **regenerated** PDF from `tests/fixtures/`,
not an old copy sitting in `data/uploads/`.

### Gemini is rate-limited or the venue wifi is bad

Turn on the parse cache so previously-read documents don't need a network call:

```bash
VACARE_PARSE_CACHE=1 .venv/bin/python -m uvicorn src.web:app --host 127.0.0.1 --port 8000
```

Seed it first, while you still have internet:

```bash
PYTHONPATH=. .venv/bin/python scripts/seed_sample_caches.py
```

The cache is **off by default on purpose** — re-reading every upload is what
people expect, and stale cached parses hid real bugs during development. Turn it
on only as a wifi insurance policy.

### The VSO queue says "No claims waiting"

That's correct, not broken. The queue only lists claims a veteran has actually
handed off. Finish a conversation on `:3000` and click **Continue to Review &
confirm** — then refresh `:8001`.

Want one there immediately without walking the chat?

```bash
PYTHONPATH=. .venv/bin/python scripts/seed_demo_journey.py --full --replace
```

---

## Part 6 — Running the tests (if a judge asks)

```bash
.venv/bin/python -m pytest tests -q                  # backend
cd frontend/veteran-app && npm test                  # frontend units
```

The backend suite makes **real Gemini calls** and takes several minutes. For a
quick check, run the fast subset:

```bash
.venv/bin/python -m pytest tests/test_app_routes.py tests/test_formfill.py -q
```

---

## Cheat sheet

```bash
# start everything (two tabs)
./scripts/start_demo.sh
cd frontend/veteran-app && npm run dev

# the three URLs
open http://localhost:3000      # veteran  (demo this)
open http://127.0.0.1:8001      # VSO portal
open http://127.0.0.1:8000/docs # API docs

# files to upload
tests/fixtures/sample_dd214.pdf
tests/fixtures/sample_medical_record.pdf

# panic button
lsof -ti tcp:3000 -ti tcp:8000 -ti tcp:8001 | xargs kill -9
```

---

**Say this, not that.** VACARE prepares a claim and gets it VSO-ready. It does
not give legal advice, and it does not promise benefits. Keep that framing in
the pitch — it's also what makes the VSO handoff the right ending.
