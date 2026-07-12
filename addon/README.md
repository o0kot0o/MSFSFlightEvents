# Flight Events — MSFS 2024 add-on

This is the in-sim package: an EFB (Electronic Flight Bag) app called "Flight Events". The UI
shell is built and confirmed working in a live MSFS 2024 session, and as of Milestone 3 it's
wired to real data end-to-end (companion app → backend), not just stubs. See
`docs/DEVELOPMENT-PLAN.md` for milestone-by-milestone status.

## UI shell

`FlightEventsPage` is the persistent layout: a header (back arrow, title, and a settings gear —
back arrow only visible outside Home), a content area that swaps between four sections, and a
bottom nav where **Create Flight Event** / **Join Flight Event** stay visible and highlight the
active section. This is plain internal state (`Subject<'home'|'create'|'join'|'settings'>`), not
`AppViewService` page navigation — that's what keeps the bottom nav from being replaced every
time the section changes.

- **Home** (`HomeSection.tsx`) — a short prompt; the bottom nav does the actual navigating.
- **Create Flight Event** (`CreateEventSection.tsx`) — Title (60-char counter), Description
  (250-char counter), optional Password (blank = open join), a "Flight Plan Source" section with
  rich "Load Current Plan" / "Load .PLN File" buttons (each with a subtitle, both call the
  companion app and work), a "Selected Flight Plan" box (summary + Clear button), and "Post Event"
  (posts to the companion app, which relays to `/server` using the configured settings). The
  flight-plan summary shows start/end/leg count and total great-circle distance in NM
  (`flightPlanFormat.ts`) rather than the full waypoint chain.
- **Join Flight Event** (`JoinEventSection.tsx`) — a search box (client-side filter over event
  name/host), a Sort by dropdown (Newest/Oldest/Name), a scrollable list of event cards (name,
  host, route as start/end/legs, player count, a lock icon if password-protected, Join button),
  and a footer showing the visible event count and last-refreshed time. The list loads from the
  companion app's `GET /events` whenever this section becomes active (via an `isActive` prop from
  `FlightEventsPage` — sections stay mounted the whole time, so this can't just be a mount hook)
  and via a Refresh button — **real data**, not mock. Password-protected events show an inline
  password field (Submit/Cancel) instead of joining immediately. On a successful join, a prompt
  shows the plan's title and a "Save File" button that calls `POST /flightplan/save` to write the
  plan to `Documents\Flight Events\<event name>.pln`, telling the pilot to load it via Import →
  Load PLN File → Load from PC (see `companion/README.md`'s "Why not SimConnect_FlightPlanLoad"
  for why this isn't fully automatic — no supported API lets us drive the EFB's own file dialog
  directly); "Close" just dismisses the prompt. An earlier "Enter Route String" auto-copy path was
  tried and removed — see `docs/SDK-FINDINGS.md` #2 for why. Events you posted yourself
  additionally show "(yours)" and a **Delete Event** button alongside Join (so you can still
  rejoin your own event after changing your flight plan) via `DELETE /events/:id`,
  companion-tracked. No live push yet (host notifications over WebSocket).
- **Settings** (`SettingsSection.tsx`, reached via the header gear icon) — Server Address and
  Your Name fields, backed entirely by the companion app's own config file
  (`~/.flight-events-companion/config.json`) via `GET`/`POST /settings`. This panel holds no
  state of its own; it just loads and saves through the companion app.

What's still stubbed: host notifications over WebSocket (pilots poll via Refresh instead).

## This structure is now verified against a real Asobo sample

The first version of this POC was built from documentation alone (plain HTML/JS + a made-up
`config.json` descriptor) and **did not show up in the EFB**. We then found the real
`EFB_Template_Sample` project shipped with the SDK
(`C:\MSFS 2024 SDK\Samples\DevmodeProjects\EFB`) and rebuilt this package to match it exactly.
The real mechanism is completely different from the first attempt:

- EFB apps are **TypeScript + JSX** (Asobo's own `FSComponent` JSX, not React, though it looks
  similar), compiled with **esbuild**, not static HTML pages.
- They're built on two Asobo frameworks: `@microsoft/msfs-sdk` (the general avionics/UI
  framework) and `@efb/efb-api` (EFB-specific: `App`, `AppView`, `AppViewService`, `Efb.use(...)`,
  UI components like `TTButton`). Both are vendored into this repo under `PackageSources/`
  (copied from the SDK sample — they're not on the public npm registry).
- Registration is **code-driven**, not a JSON manifest: the compiled JS bundle calls
  `Efb.use(FlightEventsApp)` when it loads. There is no descriptor file the EFB reads to discover
  an app's name/icon — those come from getters (`get name()`, `get icon()`) on the `App` subclass.
- The final in-package path is `html_ui/efb_ui/efb_apps/<AppName>/` (confirmed from the sample's
  `PackageDefinitions` XML) — not `html_ui/EFBApps/<AppName>/` as originally guessed.
- Packaging goes through the MSFS **Project Editor** (part of the SDK), which reads a
  `*Project.xml` → `PackageDefinitions/*.xml` chain and assembles the final Community package
  from `PackageSources/`. It is not something we hand-roll a `layout.json` for anymore.

## Structure

```
FlightEventsProject.xml                    Project Editor project file - open this in the SDK's Project Editor
PackageDefinitions/
  flight-events-efb-app.xml                 declares the package (content type, output layout)
  flight-events-efb-app/ContentInfo/         store thumbnail (placeholder, copied from the sample)
PackageSources/
  efb_api/                                  vendored Asobo EFB framework (from the SDK sample)
  vendor/microsoft-msfs-sdk-2.1.1.tgz       vendored Asobo avionics/UI framework (from the SDK sample)
  FlightEventsApp/
    package.json, build.js, tsconfig.json, .env    esbuild + TypeScript build, mirrors the sample
    src/
      FlightEventsApp.tsx                    App + AppView registration (Efb.use(...))
      FlightEventsApp.scss
      Assets/
        app-icon.svg                          placeholder icon, replace with real branding later
        back-arrow.svg
        gear.svg                              settings icon
      Components/
        FlightEventsPage.tsx                  persistent layout: header/back arrow/gear + bottom nav
        FlightEventsPage.scss
        HomeSection.tsx / .scss
        CreateEventSection.tsx / .scss         event name/description, flight-plan capture, Post Event - all wired to the companion app
        JoinEventSection.tsx / .scss           real event list + Join, via the companion app
        SettingsSection.tsx / .scss            server address + pilot name, via the companion app
        flightPlanFormat.ts                    start/end/legs/distance formatting (haversine NM calc)
        types.ts                               FlightPlanSummary / FlightEventSummary types (mirror companion+server types.ts)
```

## Building

You need Node.js (>v18) and npm. **This has been run successfully on this machine** —
`npm install` initially failed with an `ERESOLVE` conflict because `esbuild-sass-plugin@^3.3.0`
resolved to a newer release requiring `esbuild>=0.27`, incompatible with this project's pinned
`esbuild@^0.21.3`. Fixed by pinning `esbuild-sass-plugin` to the exact version `3.3.1` in
`PackageSources/FlightEventsApp/package.json` (the sample project has the same latent issue —
it just never surfaces without a lockfile pinning an older resolution).

```powershell
cd addon\PackageSources\efb_api
npm install

cd ..\FlightEventsApp
npm install
npm run build      # one-off build -> outputs to PackageSources\FlightEventsApp\dist\
# or:
npm run watch       # rebuilds on every change
```

This produced `PackageSources\FlightEventsApp\dist\FlightEventsApp.{js,css}` plus `Assets/` —
confirmed on this machine, and the TypeScript typecheck passed cleanly against the real
`@efb/efb-api`/`@microsoft/msfs-sdk` type declarations.

That `dist/` output isn't itself a loadable Community package — it needs a `manifest.json`/
`layout.json` and the right folder structure around it. The SDK's packager can build that, either
via the GUI **Project Editor** or the command-line `fspackagetool.exe`
(`C:\MSFS 2024 SDK\Tools\bin\fspackagetool.exe`):

```powershell
& "C:\MSFS 2024 SDK\Tools\bin\fspackagetool.exe" "C:\Projects\MSFSGroupFlight\addon\FlightEventsProject.xml" -nopause -forcesteam
```

This is what set up the package the first time — real `manifest.json`/`layout.json`, correct
`html_ui\efb_ui\efb_apps\FlightEventsApp\` layout — and is still the right tool for structural
changes (new files, manifest fields, etc.).

### ⚠️ Known issue: `fspackagetool.exe` does not reliably re-copy changed files

During iterative development, `fspackagetool.exe -rebuild` **silently kept serving a stale
`FlightEventsApp.js`** — confirmed by comparing file timestamps and grepping for a string known
to exist only in the newer source (a whole feature was missing in-sim despite several
build/repackage/reinstall cycles that all reported success, and even a full MSFS restart didn't
help, which is what proved it wasn't a Coherent GT caching issue). Root cause unconfirmed — the
tool "attaches to" the running `FlightSimulator2024.exe`, so a file lock from a live game session
is the leading theory, but MSFS wasn't running at the moment this was caught, so treat that as
unproven. Either way: **don't trust that a `-rebuild` actually updated the JS/CSS** — verify.

**Workaround (what this repo now uses for iteration):** `addon/scripts/deploy.sh` builds
`FlightEventsApp` and copies `dist/` directly into both `addon/Packages/.../FlightEventsApp/` and
the live Community install, bypassing `fspackagetool`'s copy step entirely, then regenerates
`layout.json`'s file sizes/dates from what's actually on disk (`addon/scripts/sync-layout.js`) so
they don't drift from reality:

```bash
addon/scripts/deploy.sh
```

Re-run `fspackagetool.exe` only when the package *structure* changes (new files, manifest
changes) — `deploy.sh` only updates the app's own JS/CSS/Assets, not `manifest.json`. After
running either, verify the live file actually changed before assuming it worked:

```bash
grep -c "<some string unique to your latest change>" \
  "$APPDATA/Microsoft Flight Simulator 2024/Packages/Community/flight-events-efb-app/html_ui/efb_ui/efb_apps/FlightEventsApp/FlightEventsApp.js"
```

The live install is a **copy**, not a symlink (`New-Item -ItemType SymbolicLink` needs admin
rights or Windows Developer Mode, which wasn't available in this session) — every deploy fully
overwrites it.

## Status

Build/typecheck/package/install confirmed working end to end as of 2026-07-09. The UI shell,
flight-plan capture, Settings, Post Event, and Join have all been confirmed working from inside a
live MSFS 2024 EFB session — the full create → discover → join loop works. Route display was
then refined based on that feedback: the flight-plan summary and event cards show start/end/leg
count (+ distance in NM on the Create screen) instead of the full waypoint chain, and the Join
list now correctly refreshes every time that section is opened (previously it only refreshed once
at page load — a real bug from mounting all sections up front and only wiring `onAfterRender`).
The distance/leg math for a *filed multi-waypoint route* specifically hasn't been checked in-sim
yet — every flight tested here so far has been a simple direct-to with no en-route waypoints; see
`companion/README.md`'s parsing notes.

**Layout fixes from in-sim screenshots (2026-07-09):** more spacing between the back arrow and
header title; the two flight-plan-source buttons were cramped side-by-side (long labels wrapping
awkwardly) and are now stacked; and the Join list's event cards overlapped in landscape/wide EFB
layout. That last one traced back to the `List` component (`@efb/efb-api`) rendering its own
`list`/`scroll-container` classes with no CSS of its own — all list styling comes from the EFB
shell's stylesheet, which we can't see, and it appears to impose some fixed-row/grid assumption
that doesn't expect our multi-line cards. Fixed by overriding those shell classes directly in
`JoinEventSection.scss` (matching/exceeding their specificity, since a two-class shell selector
otherwise beats a one-class override regardless of source order) — later confirmed fixed in-sim.

**Deploy pipeline bug found and fixed (2026-07-09):** `fspackagetool.exe -rebuild` was silently
serving a stale build — a new feature (event delete) simply wasn't present in-sim even after a
full MSFS restart, and grepping the installed JS for a string unique to the newer source proved
the file itself hadn't actually changed. Root cause unconfirmed (the tool "attaches to" the
running game, so a file lock is the leading theory, but MSFS wasn't running when this was caught).
Worked around with `addon/scripts/deploy.sh` — see the "Known issue" section above. All fixes
from that point forward were verified with this script and confirmed by grepping the live file.

**Milestone 4 (complete, 2026-07-10):** password entry for protected events (inline field on the
event card) and an Accept/Decline overlay after joining. Also added: hosts can delete their own
posted events (Delete Event button alongside Join on cards you posted, via the companion app's
`DELETE /events/:id`).

**First real in-sim test (2026-07-09) surfaced two real gaps, both fixed:**
1. There was no way to actually create a password-protected event — `CreateEventSection` never
   had a password field or sent one. Added.
2. A real Little Navmap-exported 33-waypoint route loaded with no visible effect — the temp
   `.PLN` had **zero coordinates for every waypoint**. Root cause: the companion app's
   `WorldPosition` parser only handled MSFS's own degrees+decimal-minutes format, not the full
   degrees/minutes/seconds format Little Navmap (and likely other tools) write. Fixed and
   verified against the actual file that failed — see `companion/README.md`'s parsing notes,
   including that events posted *before* this fix still carry broken data and need to be
   re-posted.

**Second live test (2026-07-10): `SimConnect_FlightPlanLoad` doesn't do what we needed.** After
the coordinate fix, the flight plan still didn't appear in the EFB — the companion's own log
showed SimConnect accepted the call with no error, so this was a real dead end, not another
data bug. Confirmed via an official Asobo/Working Title forum response:
`SimConnect_FlightPlanLoad` only updates a legacy "ATC flight plan," never the EFB's own display,
and **MSFS 2024 currently has no programmatic way to load a `.PLN` into the EFB at all.** Pivoted
(explicit decision) to a save-and-guide flow: Accept now writes the plan to
`Documents\Flight Events\<event name>.pln` via the companion's new `POST /flightplan/save` and
tells the pilot exactly where to find it and how to load it manually. The `SimConnect_FlightPlanLoad`
code is kept (unused) for reference.

**WASM module investigated, decided against (2026-07-10).** Read the real Planned Route API
header and sample locally (`C:\MSFS 2024 SDK\WASM`, `Samples\DevmodeProjects\SimObjects\Aircraft\
WasmAircraft`). It has to be wired into a *specific aircraft's* `panel.cfg` as a cockpit gauge
(real conflict risk with any other addon overriding the same aircraft, and no way to cover
arbitrary third-party aircraft), and it's a pull the EFB has to initiate, not something we can
push on demand. Not worth it over a simpler alternative — see `docs/SDK-FINDINGS.md` #2.

**Route string added instead**, found by directly checking the EFB's own Import menu in-sim: it
has a third option beyond "Load from Web" (looked non-functional) and "Load PLN File" — "Enter
Route String," a plain text field. The Accept overlay now generates and displays one
(`formatAtcRouteString`) for the pilot to paste there — no file dialog at all.

**Follow-up (2026-07-10): the pilot reported no way to actually copy the displayed string.**
Fixed by having the companion app (a normal desktop process, not sandboxed like our in-sim panel)
write it straight to the Windows clipboard via PowerShell's `Set-Clipboard`
(`POST /clipboard/copy`), automatically the moment a join succeeds, plus a "Copy Again" button
for re-copying. Verified end-to-end via curl + `Get-Clipboard`. Explored and ruled out two other
automation options first: getting our EFB app to reach into the built-in Flight Planner app's own
fields directly (no supported cross-app API - each EFB app is its own isolated context), and
simulating keystrokes into whatever window has focus (fragile, unsupported, could misfire into
the wrong field - not worth the risk).

**Third follow-up (2026-07-10): the route string was confirmed to send MSFS to the wrong place
entirely** for the pilot's actual test route (Little Navmap, 33 `User`-type custom waypoints for
a scenic loop) — loading the real `.PLN` worked correctly, but the generated route string routed
across the whole globe instead of the local loop. Root cause: route strings carry bare names, not
coordinates, and arbitrary `User` waypoints have no stable global identity for MSFS's nav
database to resolve — not a bug, an inherent limitation for exactly the custom scenic/bush-trip
routes this project targets most. Fixed by detecting `User`-type waypoints
(`hasUnresolvableWaypoints` in `flightPlanFormat.ts`) and hiding the route string + skipping the
auto-copy entirely for those plans, with an explanation and a push toward Save File instead.
Route strings remain offered for plans using only real database fixes. See
`docs/SDK-FINDINGS.md` #2 for the full writeup. Not yet confirmed: whether the EFB accepts our
route-string format for a *simple* plan, or that the saved-file path loads cleanly — both next to
verify in-sim.

**Route string removed entirely (2026-07-10).** Since scenic/bush-trip routes with custom
waypoints are exactly what this project targets, and those are exactly what the route string got
wrong, the whole feature (generation, display, clipboard auto-copy, "Copy Again", and the
companion's `POST /clipboard/copy` route) was deleted rather than kept for the subset of plans it
worked for. Save File (Import → Load PLN File → Load from PC) is now the only flight-plan-transfer
path. In the same pass, `CreateEventSection` and `JoinEventSection` were rebuilt to match a UI
mockup the pilot supplied (title/description char counters, rich source buttons with subtitles, a
Selected Flight Plan box, a search box + Sort by dropdown + footer stats on Join) while keeping our
existing single-panel-at-a-time navigation instead of the mockup's side-by-side Create/Join
layout. Deployed and verified against the live installed file with `addon/scripts/deploy.sh`.

After any change under `PackageSources/FlightEventsApp/src`, re-run `npm run build` then the
`fspackagetool.exe` command above and re-copy (or symlink) the output into the Community
folder to see it in-sim.
