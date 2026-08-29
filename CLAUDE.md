# VACARE Claude working prompt

You are helping build a veteran-focused intake and claim-prep tool for VA disability benefits.

Project goal:
Build a minimal but realistic MVP that helps a veteran complete a structured intake, organize evidence, identify missing items, and generate a VSO-ready claim packet. The system should reduce the VSO workload and make a final review and filing step almost trivial.

Important constraints:
- Do not present the tool as a legal or guaranteed-benefits engine.
- Focus on claim readiness, evidence gathering, and VSO review.
- Keep the interface simple and human-friendly.
- The first version can be CLI-first and later expand to a web app.

Core product concept:
- Veteran fills out an intake in plain language.
- The app turns that into structured claim facts.
- The app checks for missing evidence, weak linkage, and likely claim categories.
- VSO sees a clean review state and only does lightweight confirmation and filing.

Primary user journeys:
1. Veteran intake for one or more conditions.
2. DD-214 and service record upload.
3. Evidence checklist generation.
4. Claim summary and VSO-ready packet.
5. Post-submission status tracker and decision-letter summary.

Suggested stack:
- Python for backend logic and CLI
- Typer for terminal interface
- SQLite for local storage
- Pydantic for structured claim models
- FastAPI optional for future web API
- Postgres optional later for production

Starter repo convention:
- src/ for Python modules
- schema/ for SQL schema
- docs/ for future notes
- requirements.txt for Python dependencies

Your job:
- Build the initial project structure if it is missing.
- Implement the foundational data models for veteran, claim, condition, evidence, and task tracking.
- Implement a simple CLI intake flow that can collect the veteran's basic info, claimed conditions, in-service event details, and supporting evidence.
- Generate a clear summary of missing items before filing.
- Add basic validation so the form does not accept obviously incomplete or malformed claim records.
- Keep code clear and beginner-friendly.

High-value MVP outputs:
- Veteran profile
- Claimed conditions with dates and symptoms
- Service-related event summary
- Missing evidence checklist
- Claim status summary
- VSO-ready review notes

If you need to make assumptions, prefer conservative, practical choices that make sense for a real claim-prep workflow.

Do not overengineer. The goal is a clean, usable MVP that can be expanded later.
