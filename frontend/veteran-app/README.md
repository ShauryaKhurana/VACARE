# VA CARE — Veteran App

A Next.js frontend for VACARE: a conversational, mobile-first intake experience that walks a
veteran through preparing a VA disability claim, then hands a review-ready packet to their VSO.
This app is the veteran-facing surface described in the hackathon HLD/LLD; the Python/FastAPI
project at the repo root (`/`) is the claim-prep backend and is not yet wired to this frontend —
see [Mock API layer](#mock-api-layer-no-backend-yet) below.

## Connecting to the Python backend

By default the app runs on mock fixtures, so `npm run dev` works with nothing
else running. To use the real backend instead:

```bash
cp .env.local.example .env.local        # sets NEXT_PUBLIC_API_BASE_URL
cd ../.. && python -m src.web           # the Python service on :8000
cd frontend/veteran-app && npm run dev  # the app on :3000
```

`lib/api/client.ts` picks the implementation from `NEXT_PUBLIC_API_BASE_URL`:
set, it uses `HttpApiClient` (`lib/api/http.ts`); unset, `MockApiClient`. No
component knows the difference - that was the point of the interface.

The backend serves the contract in `lib/api/types.ts` from
`src/api/app_routes.py`, mapped by `src/api/app_bridge.py`:

| ApiClient method | Endpoint |
| --- | --- |
| `getClaim` | `GET /api/app/claims/{routingId}` |
| `sendChatMessage` | `POST /api/app/claims/{routingId}/chat` |
| `confirmClaimDraft` | `POST /api/app/claims/{routingId}/confirm` |
| `deleteMyData` | `DELETE /api/app/claims/{routingId}` |
| *(extra)* `uploadDocument` | `POST /api/app/claims/{routingId}/documents` |
| *(extra)* `getMessages` | `GET /api/app/claims/{routingId}/messages` |

The routing id is minted here, client-side, and the backend creates a claim the
first time it sees one - there is no registration step. CORS allows
`localhost:3000` by default; override with `VACARE_CORS_ORIGINS` on the server.

Two fields are deliberately empty until real data exists: `vso` is blank until
an accredited representative is actually on the case, and `decision.monthlyAmount`
is `0` because VA's compensation rate table is not bundled - the UI already
hides the dollar line when it is zero.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app is a PWA-shaped single-page flow — there's no separate
marketing site or login; `/` redirects into the onboarding flow on a fresh session.

Other commands:

```bash
npm run build      # production build (Turbopack)
npm run start       # serve the production build
npm run lint        # ESLint, zero warnings required
npm run test        # Vitest unit tests
npm run test:e2e     # Playwright smoke suite
```

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 (CSS-first `@theme`/`:root` tokens, no `tailwind.config.ts`) |
| Components | shadcn/ui on Base UI primitives (not Radix — an upstream default change) |
| Icons | Tabler Icons |
| State | Zustand, with `persist` (localStorage) for session/accessibility state |
| Data fetching | TanStack Query |
| Forms | React Hook Form + Zod |
| Testing | Vitest + Testing Library (unit), Playwright (e2e smoke + accessibility scan) |

## Project structure

```
app/
  (onboarding)/     welcome -> connect -> review — first-run flow, no nav chrome
  (main)/            talk, claim, you — the three persistent surfaces post-onboarding
  layout.tsx          root shell: fixed-height body, providers, skip link
components/
  chat/               Talk page: ChatThread, message cards, input bar, restart dialog
  claim/              My claim page: stage timeline, needs-attention/upcoming/updates
  decision/           decision-letter breakdown (rating math, options, unlocks)
  you/                You page: data-storage breakdown, settings rows, delete flow
  nav/                SideNav (desktop) / BottomNav (mobile)
  shared/             cross-page primitives — the only places allowed to touch semantic
                      color tokens directly (AccentButton, ComputedTag, StatusTag) plus
                      StepTracker, PageContainer
  ui/                 shadcn primitives (button, dialog, card, ...)
  dev/                FixtureSwitcher — dev-only claim-state preview switcher
lib/
  api/                ApiClient interface + MockApiClient implementation, mock script/fixtures
  store/               Zustand stores (session, accessibility)
  tokens.ts, utils.ts, documentCapture.ts
e2e/                  Playwright smoke spec
test/                 Vitest unit tests
```

## Architecture & product decisions

### Entry flow and nav gating

`SideNav`/`BottomNav` only render once `onboardingComplete || conversationStarted` is true
(`app/(main)/layout.tsx`), matching the HLD's "three persistent surfaces after first run": a
first-time veteran sees an uncluttered onboarding flow with no navigation to get lost in; nav
chrome appears the moment there's something to navigate *to*. This is gated behind a
client-side `mounted` check to avoid hydration mismatches against the persisted Zustand store.

### Mock API layer (no backend yet)

`lib/api/client.ts` exports a `MockApiClient` that implements the full `ApiClient` interface
with no network calls. `lib/api/mock/chatScript.ts` drives Talk's conversation as a fixed,
linear script — one scripted turn of AI messages/cards per veteran message sent — and the
message shapes (`ConfirmationCard` fields, `EligibilityCard` conditions, etc.) match the real
tool-result contracts the HLD describes, so swapping this file for a real streaming client later
shouldn't require touching any card component.

The script's turn index is persisted to `localStorage` (`veteran-app-chat-turn-{routingId}`),
not held in memory — an in-memory counter resets on every Fast Refresh and, more importantly,
every real page reload, which looked identical to the AI forgetting the conversation.

### Submission is a one-way door

Once a claim is confirmed and sent to a VSO (`submitClaim()` in `sessionStore`), Talk stops
advancing the scripted dig. Further messages are treated as flagged relay requests to the VSO
(`sendRelayMessage`) rather than new dig turns. The only way back into editing is an explicit,
confirmable restart — either a full restart (clears all chat state) or a restart from one
specific step, which truncates the conversation back to that step's marker message and redoes
the rest, rather than wiping everything. Restart lives behind `RestartClaimDialog` and is always
a deliberate, confirmed action, never an implicit side effect of navigation.

### Accessibility

- A working global text-scale control: `--va-text-scale` is set on `documentElement` and drives
  `html`'s `font-size` (`calc(17px * var(--va-text-scale))`) — not `body`'s, since Tailwind's
  `text-*` utilities are `rem`-based off the root element, so scaling `body` alone had no
  visible effect on any Tailwind text size.
- High-contrast mode overrides the full token set, including computed/accent-tint tokens that
  were initially missed.
- Skip-to-content link, `focus-visible` rings on all custom interactive controls (nav rows,
  StepTracker's step buttons), and a Playwright + axe-core scan in the e2e suite.

### Scroll containment

The chat/claim surfaces need an internal scroll region with a pinned header and input bar,
never a document-level scrollbar. Nested flex children default to `min-height: auto`, which
lets tall content grow the whole page instead of scrolling inside its container. The fix is
`flex-1 min-h-0` at every level of the containing chain (not `h-full`, not `min-h-dvh` alone),
down from `app/layout.tsx`'s `body` (`h-full overflow-hidden`) through both route group layouts
to `ChatThread`'s own scroll area.

### Design tokens

Only `AccentButton`, `ComputedTag`, and `StatusTag` (`components/shared/`) reference semantic
color tokens (`accent`/`computed`/`success`/`warning`/`danger`) directly. Every other component
goes through those three, so a token/theme change never requires hunting through unrelated
components for a stray color class.

## Testing

- **Unit** (`npm run test`): Vitest + Testing Library, jsdom environment. Run with
  `NODE_OPTIONS=--no-experimental-webstorage` (baked into the script) — Node 22's experimental
  native `globalThis.localStorage` shadows jsdom's Storage implementation otherwise, breaking
  any store test that touches `persist`.
- **E2E** (`npm run test:e2e`): Playwright smoke suite covering the onboarding → Talk entry
  flow and an axe-core accessibility scan.

## Known limitations

- **Mock-only.** There is no live backend integration; every API call resolves against the
  in-repo mock fixtures/script. The Python backend at the repo root implements much of the
  same domain logic (lanes, evidence rules, packet generation) but isn't yet exposed as an API
  this frontend calls.
- **The Talk script is linear and fixed** — it does not branch on veteran input content, only
  on turn count. Real eligibility computation, document parsing, and statement generation are
  simulated with canned responses.
- **Auth is simulated.** The `/connect` sign-in step mimics a Login.gov/ID.me handoff for
  demo purposes; no credentials are validated or stored anywhere.
