# Flight Events — Architecture

This document records the design decisions that follow from `SDK-FINDINGS.md`, and is expected
to evolve as we validate assumptions in-sim. Treat anything marked "ASSUMED" in the findings doc
as subject to change here too.

## System overview

```
┌─────────────────────────────┐        ┌──────────────────────────────┐        ┌────────────────────┐
│   MSFS 2024 (in-sim)        │        │  Flight Events Companion App  │        │  Flight Events      │
│   EFB App: "Flight Events"  │  HTTP/ │  (Node.js, runs on the same   │  HTTPS/│  Backend Server      │
│   html_ui JS/HTML/CSS       │◄──────►│  PC as the sim)                │◄──────►│  (REST + WebSocket) │
│                              │  WS,   │  - reads CUSTOMFLIGHT.PLN      │  WS    │  - Event registry    │
│   Renders event list,        │  localhost   - saves accepted .PLN to  │        │  - Auth tokens        │
│   Create/Join UI              │  only  │    Documents\Flight Events\   │        │  - Flight-plan relay  │
└─────────────────────────────┘        │  - talks to backend over the   │        └────────────────────┘
                                        │    open internet                │
                                        └──────────────────────────────┘
```

The pilot loads the saved `.PLN` into the EFB themselves (World Map / "Load Flight Plan") -
confirmed there's currently no programmatic way to do that step for them; see
`SDK-FINDINGS.md` #2. A future WASM module (Planned Route API) may be able to close that gap.

**Why a companion app instead of talking to the internet directly from the in-sim panel:**
in-sim HTML/JS panels run inside Coherent GT, which has at least one confirmed official bug
report around broken headers on outbound requests, and no documented networking contract at all.
Every comparable real-world add-on we found (Little Navmap/Navconnect; reportedly Volanta too)
uses a desktop companion process for exactly this reason, and SimConnect access is unavailable
to JS panels regardless — a companion app or WASM module is required for flight-plan injection
no matter what we decide about networking. Centralizing both jobs (SimConnect + internet) in one
companion process is the simplest design that actually works with what we've confirmed.

The in-sim panel therefore never talks to the internet. It only ever calls `localhost`.

## Components

### 1. `/addon` — the MSFS 2024 Community package

- A minimal EFB app ("Flight Events") providing the UI: event list, Create/Join buttons,
  flight-plan accept/decline prompts.
- Talks exclusively to the companion app's local HTTP/WebSocket server
  (`http://127.0.0.1:<port>`).
- Contains **no** SimConnect code and **no** direct internet calls. This keeps the in-sim
  surface area small and avoids relying on unverified in-sim networking behavior.
- Built as an EFB app page per the decision in `SDK-FINDINGS.md` §3, using TypeScript/JSX +
  esbuild against Asobo's `@microsoft/msfs-sdk` and `@efb/efb-api` frameworks, mirroring the
  real `EFB_Template_Sample` shipped with the SDK (`C:\MSFS 2024 SDK\Samples\DevmodeProjects\EFB`)
  — our first attempt (plain HTML/JS + `registerInstrument()`) followed the wrong pattern
  entirely and never appeared in the EFB; see `SDK-FINDINGS.md` §3 for what changed. If in-sim
  testing still shows problems, the fallback is an `InGamePanels` toolbar panel — we have
  concrete on-disk proof (PMS50 GTN750) that this works in MSFS 2024 today, at the cost of it
  being a compiled/less-documented pipeline to get right.

### 2. `/companion` — Node.js/TypeScript desktop process (Milestones 2–4 built)

- Plain Node.js + TypeScript, `http` built-in module (no Express — kept dependency-light),
  `fast-xml-parser` for `.PLN` XML, `node-simconnect` for SimConnect access (a from-scratch
  SimConnect protocol client, no native DLL dependency) so the whole stack — addon, companion,
  backend — stays one language.
- Responsibilities:
  - **Read** (built): `GET /flightplan/current` reads
    `%APPDATA%\Microsoft Flight Simulator 2024\MISSIONS\Custom\CustomFlight\CUSTOMFLIGHT.PLN`
    (Steam/boxed path, confirmed; Store install path scanned for but unconfirmed — see
    `companion/README.md`) and parses the standard `SimBase.Document` XML schema.
    `POST /flightplan/pick-file` opens a native Windows file picker (via a PowerShell
    `OpenFileDialog` script, avoiding an Electron dependency) as the manual "Load .PLN file"
    fallback from the original spec. Both return the same `FlightPlanSummary` JSON shape.
  - **Save-and-guide** (built + confirmed in-sim, Milestone 4): on "Accept Flight Plan",
    `POST /flightplan/save` writes a `.PLN` file to `Documents\Flight Events\<event name>.pln`
    (`writePln.ts`, round-trip tested against the reader) and the add-on tells the pilot to load
    it via World Map / the EFB's own "Load Flight Plan" button. **Not** `SimConnect_FlightPlanLoad`
    — we built and live-tested that path first (`simconnect/loadFlightPlan.ts`, still in the repo
    but unused), and confirmed (Asobo/Working Title staff + our own test) that it only updates a
    legacy ATC flight plan concept, not the EFB's display, and that MSFS 2024 currently has no
    programmatic way to do that step at all — see `SDK-FINDINGS.md` #2. A WASM module using the
    (WASM-only) Planned Route API is the real fix, planned as later Milestone 4 follow-up work.
  - **Bridge**: hosts a local HTTP server (`http://127.0.0.1:48219`) for the in-sim EFB app —
    built and wired up for the read path.
  - **Bridge to `/server`** (built, Milestone 3): `GET`/`POST /settings` (server address + pilot
    name, persisted to `~/.flight-events-companion/config.json`) and `POST /events`,
    `GET /events`, `DELETE /events/:id`, `POST /events/:id/join` — thin proxies to the configured
    `/server`, filling in `hostName`/`playerName` from the stored pilot name. Host/join WebSocket
    push notifications are not built — pilots currently poll via Refresh.
- Runs alongside the sim; the user starts it manually (`npm start` in `/companion`). Auto-launch
  via an `EXE.xml` entry (which MSFS supports for launching external helper processes with the
  sim) is still deferred — not needed yet.
- **This was the first real test of whether the EFB app's `fetch()` can reach `localhost` from
  inside Coherent GT's sandbox at all** — the biggest open question from `SDK-FINDINGS.md` #4.
  **Confirmed working** in a live MSFS 2024 session (2026-07-09): both "Get Current Flight Plan
  from EFB" and "Load .PLN File" work in-sim.

### 3. `/server` — backend (built, Milestone 3)

- Plain `http` (no Express/framework — kept dependency-light, matching `/companion`'s style),
  in-memory `Map`-based store, no WebSocket yet (host/join push notifications are Milestone 4).
- **One shared instance**, hosted centrally by the operator (not run by each pilot — see
  `/companion` above, which is what each pilot actually runs). Binds to all interfaces (unlike
  the companion app's `localhost`-only binding) since other pilots' companion apps need to reach
  it over the network; the operator is responsible for making it reachable (port forwarding,
  hosting it on a reachable box, etc.) — nothing here does that automatically.
- Built: `POST /events` (create, returns a `hostToken` for later host-only actions),
  `GET /events` (list, public-safe `EventSummary` — no password/flight-plan), `POST /events/:id/join`
  (password/full-event checks, returns the flight plan on success), `DELETE /events/:id`
  (host-token gated). Simple token auth (`hostToken`) rather than full accounts, per the brief
  ("do not over-engineer the backend initially").
- Deliberately minimal: in-memory storage means events don't survive a restart. Fine for a
  self-hosted, small-group tool; revisit only if that becomes a real problem.
- Tested end-to-end via direct HTTP calls (create → list → join, and through the companion app's
  proxy routes) on 2026-07-09. Not yet exercised from inside a running EFB app.

## What Milestone 1 (this POC) actually includes

Per the brief, Milestone 1 is intentionally narrow:

- The `/addon` EFB app renders, showing "Flight Events" and two buttons: **Create Flight Event**
  and **Join Flight Event**. Buttons are wired up but have no backend yet — clicking them can
  show a placeholder state.
- No companion app, no backend server, no real networking yet.
- No flight-plan reading/injection yet — that starts once Milestone 1 confirms the EFB app
  actually renders in MSFS 2024 on this machine.

This deliberately front-loads the riskiest unknown (does our EFB registration work at all) before
investing in the companion app and backend.

## Known risks carried forward

1. EFB app registration format is unverified against a real sample (see `SDK-FINDINGS.md`).
2. Whether `SimConnect_FlightPlanLoad` silently overwrites an in-progress flight is unverified.
3. Whether `CUSTOMFLIGHT.PLN` reflects live World Map/EFB edits or only a loaded/started flight
   is unverified.
