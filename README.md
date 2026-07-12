# Flight Events

An MSFS 2024 add-on that lets a group of pilots share flight plans in-game: a **host** creates a
flight event from their current route, other pilots discover and join it, and the host's flight
plan is transferred to each joining pilot for their acceptance.

## Status

**Milestones 1 and 1.5 (proof of concept + full UI shell) complete and verified in-sim
(2026-07-09).** The "Flight Events" EFB app has a persistent header (back arrow + title) and
bottom nav (Create/Join always visible), and working Create Flight Event / Join Flight Event
screens — confirmed rendering in a live session, including a round of readability/layout fixes
based on in-sim screenshots. The first version of this POC was built from documentation alone and
didn't appear in the EFB; it was rebuilt against the real `EFB_Template_Sample` shipped with the
SDK, built and packaged with the SDK's own `fspackagetool.exe` (see `docs/SDK-FINDINGS.md` §3 and
`addon/README.md` for the full story).

**Milestone 2 (flight-plan capture) complete and confirmed in-sim (2026-07-09).** A `/companion`
desktop app runs a local HTTP server (`http://127.0.0.1:48219`) that reads/parses MSFS's active
`CUSTOMFLIGHT.PLN` and offers a native "Load .PLN File" picker. Both "Get Current Flight Plan
from EFB" and "Load .PLN File" were confirmed working from inside a running MSFS session — this
resolved the biggest open networking question of the whole project (can the EFB app's `fetch()`
reach `localhost` at all) in our favor.

**Milestone 3 (backend + discovery) complete and confirmed in-sim (2026-07-09).** `/server` is a
single, centrally-hosted backend (you host it; pilots don't run their own) for event
create/list/join. A new **Settings** screen (gear icon in the header) lets each pilot point their
companion app at that server and set their display name — the companion app owns this config, not
the EFB app. "Post Event" and "Join Flight Event" are wired to real data through the companion
app — the full create → discover → join loop works end to end in a live session. Follow-up
refinement based on that testing: the flight-plan summary and event cards now show start/end/leg
count (+ distance in NM when creating) instead of the full waypoint chain, and a real bug was
fixed where the Join list only ever refreshed once at page load instead of every time that screen
opens. A second round of in-sim screenshots surfaced layout issues (header spacing, cramped
buttons, overlapping event cards in landscape) and a missing feature (hosts couldn't delete their
own events) — all fixed. The delete feature still didn't show up in-sim even after those fixes,
which led to finding a real infrastructure bug: `fspackagetool.exe` was silently serving a stale
build (`-rebuild` reported success but the installed file was ~40 minutes old). Worked around
with `addon/scripts/deploy.sh`, which bypasses the packager's copy step and verifiably updates
the live install — see `addon/README.md`'s "Known issue" section before trusting any future
`fspackagetool`-only deploy.

**Milestone 4 (join flow + flight-plan transfer) complete, with a scope change.**
Password-protected events show an inline password field instead of joining immediately, and a
successful join shows an "Accept flight plan?" overlay before doing anything. Two real bugs
turned up along the way and got fixed: there was no way to actually create a password-protected
event (no password field existed on Create), and a real Little-Navmap-exported route loaded with
no effect because the companion's coordinate parser only handled MSFS's own format, not the
fuller degrees/minutes/seconds format other tools write. But the bigger finding: **automatic
flight-plan injection into the EFB isn't actually possible in MSFS 2024 today.**
`SimConnect_FlightPlanLoad` reported success with no error, yet the EFB's Flight Plan page never
changed — confirmed via an official Asobo/Working Title forum response that this call only
updates a legacy "ATC flight plan," never the EFB's own display, and that MSFS 2024 currently has
no programmatic way to load a `.PLN` into the EFB at all. We looked seriously at the WASM-based
Planned Route API as a real fix, but it turned out to require being wired into a *specific
aircraft's* `panel.cfg` (real conflict risk with other addons, no coverage for arbitrary
aircraft) and only supports the EFB *pulling* a route on its own initiative, not us pushing one —
not worth building. Instead, checking the EFB's own Import menu directly turned up a much
simpler option: "Enter Route String," a plain text field. Accepting a flight plan generates a
route string for that field, auto-copied straight to the Windows clipboard the moment you join
(`POST /clipboard/copy`, via PowerShell's `Set-Clipboard`, since the pilot pointed out there was
no way to actually copy the displayed text), with a "Copy Again" button as backup.

**But the route string turned out to be actively wrong for the kind of route this project cares
about most.** Testing with a real 33-waypoint scenic loop (Little Navmap export) showed the
`.PLN` file loads correctly, but the generated route string sent MSFS scattered across the entire
globe — route strings only carry bare names, and MSFS has to resolve each one against its own nav
database, which has no idea what an arbitrary custom waypoint like "WP1" is supposed to mean. Real
scenic/bush-trip routes are exactly the case that broke, so **the route-string feature (and its
clipboard auto-copy) has been removed entirely** — Save File (writing the accepted plan to
`Documents\Flight Events\<event name>.pln` and pointing the pilot at Import → Load PLN File →
Load from PC) is now the only flight-plan-transfer path, since it carries real coordinates and
works for every waypoint type.

**Milestone 5 (UI redesign) complete.** The Create/Join screens were rebuilt to match a UI mockup
while keeping our existing single-panel-at-a-time navigation (the mockup showed Create and Join
side by side; ours still shows only the active tab's content, with the bottom Create/Join tabbar
unchanged). Create now has a title field with a 60-character counter, a description field with a
250-character counter, rich "Load Current Plan" / "Load .PLN File" buttons with subtitles, and a
"Selected Flight Plan" box with a Clear button. Join now has a search box (client-side filter over
name/host), a Sort by dropdown (Newest/Oldest/Name), and a footer showing the visible event count
and last-refreshed time. Skipped for now, flagged as future work: airport-name lookups (no local
navdata source), and scheduled date/time for events (would need a new backend field). Host
notifications over WebSocket are still not built; pilots poll via Refresh for now.

**Milestone 6 (event details) complete.** A blank Date on Create now defaults to today (stored,
not left blank), and Join cards show it as "Today"/"Tomorrow"/"Yesterday" relative to the viewer's
own clock. Descriptions now show on Join cards (they existed in the data model since Milestone 3
but were never actually exposed). The server operator now has cleanup tools: events auto-prune
after `MAX_EVENT_AGE_HOURS` (default 24h), and an `ADMIN_TOKEN` env var lets the operator delete
any event, not just ones their own companion app created — see `server/README.md`. Max-players
enforcement was explicitly descoped (small trusted groups; not needed yet).

**Milestone 7 (standalone companion app) complete.** Running the companion app used to require
Node.js, npm, and a terminal — a real barrier for a non-technical pilot. `npm run package` in
`/companion` now bundles it (esbuild) and packages it (`pkg`) into a standalone
`FlightEventsCompanion.exe` with no Node.js install needed. It runs as a system tray icon (Show
Log / Exit) and shuts itself down automatically once MSFS 2024 closes, since MSFS doesn't manage
the lifetime of anything it launches. Auto-starting it alongside MSFS itself via `EXE.xml` was
investigated and deliberately not pursued — that file lives outside any Community package and is
shared across every auto-launched addon on the system, so wiring into it safely needs a real
installer, not a Community-folder drop. See `companion/README.md`.

**Distribution folder added.** `/distribution` is a ready-to-hand-out build: the packaged addon
Community folder, the standalone companion `.exe` + its `Start Flight Events Companion.vbs`
launcher, and the server's compiled JS (zero runtime dependencies - just needs Node.js), plus two
plain-text setup guides — one for pilots, one for whoever hosts `/server`. It's a build output, not
source; regenerate it after any change (see `docs/DEVELOPMENT-PLAN.md`'s Milestone 8 for the exact
steps used to assemble it).

## Layout

```
/addon         MSFS 2024 Community package - the EFB app, HTML/JS/CSS via TypeScript+esbuild
/companion     Desktop companion app - reads flight plan files, holds settings, bridges to /server
/server        Backend API - one shared instance, hosted by the operator - event discovery + relay
/distribution  Ready-to-hand-out build: packaged addon + companion exe + server + how-to guides
/docs          Technical findings, architecture decisions, development plan
```

## Start here

- `docs/SDK-FINDINGS.md` — what we verified about MSFS 2024's SDK (reading/injecting flight
  plans, toolbar vs. EFB integration, in-sim networking) and what's still unconfirmed.
- `docs/ARCHITECTURE.md` — the resulting system design: in-sim EFB app ↔ localhost ↔ a desktop
  companion app (holds the SimConnect connection) ↔ backend server.
- `docs/DEVELOPMENT-PLAN.md` — milestones, in order, with what's done and what's next.
- `addon/README.md` — how to install the current POC into your Community folder and what to
  check once it's running.
- `companion/README.md` — how to run the companion app and what it does today.
- `server/README.md` — how to run the backend and its API.

## Why a companion desktop app

In-sim HTML/JS panels can't call SimConnect directly, and MSFS's in-sim networking has at least
one confirmed official bug report around broken request headers with no documented contract
otherwise. Every comparable real-world MSFS add-on we found (e.g. Little Navmap/Navconnect) uses
a desktop companion process that holds the SimConnect connection and talks to the outside world,
with the in-sim panel only ever talking to `localhost`. Full reasoning in
`docs/ARCHITECTURE.md`.
