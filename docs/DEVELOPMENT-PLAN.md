# Flight Events — Development Plan

## Milestone 1 — Proof of concept ✅ complete (2026-07-09)

**Goal:** confirm the in-sim UI shell actually works in MSFS 2024 on this machine.

- [x] Research SDK capabilities, document findings (`SDK-FINDINGS.md`)
- [x] Decide architecture (`ARCHITECTURE.md`)
- [x] Scaffold `/addon`, `/server`, `/docs`
- [x] Build EFB app package v1: manifest, layout, "Flight Events" page with title + Create/Join
      buttons — built from documentation alone (plain HTML/JS + `registerInstrument()`). **Did
      not appear in the EFB when tested.**
- [x] Located the real `EFB_Template_Sample` (`C:\MSFS 2024 SDK\Samples\DevmodeProjects\EFB`)
      and rebuilt the package to match its actual structure (TypeScript/JSX + esbuild,
      `@efb/efb-api`/`@microsoft/msfs-sdk`, `Efb.use(...)` registration,
      `html_ui/efb_ui/efb_apps/<Name>/` output path, Project-Editor-driven packaging). See
      `SDK-FINDINGS.md` §3 and `addon/README.md` for what changed and why.
- [x] `npm install` + `npm run build` in `addon/PackageSources/FlightEventsApp` — succeeded
      (after pinning `esbuild-sass-plugin` to `3.3.1` to resolve an `ERESOLVE` conflict), and
      TypeScript typechecked cleanly against the real Asobo type declarations.
- [x] Built the package via the SDK's command-line packager (`fspackagetool.exe`) against
      `addon/FlightEventsProject.xml` — produced a real `manifest.json`/`layout.json` and the
      expected `html_ui/efb_ui/efb_apps/FlightEventsApp/` layout. Copied into
      `%APPDATA%\Microsoft Flight Simulator 2024\Packages\Community\flight-events-efb-app`.
- [x] **User verification step, confirmed 2026-07-09:** launched MSFS 2024, opened the EFB —
      "Flight Events" appears in the app grid and opens a panel with the "Create Flight Event"
      and "Join Flight Event" buttons, as designed. **Milestone 1 is complete.** The EFB approach
      is confirmed working end to end; no fallback to InGamePanels/toolbar needed.

## Milestone 1.5 — Full UI shell ✅ complete (2026-07-09)

**Goal:** finish the in-sim UI end to end, ahead of the backend/companion app, so the remaining
milestones are about wiring real data into an already-built interface rather than building UI.

- [x] Persistent layout: header with a back arrow (visible on Create/Join, returns to Home) and
      a title that tracks the active section; a bottom nav with **Create Flight Event** /
      **Join Flight Event** always visible and highlighting the active section. Navigation is a
      plain internal `Subject<'home'|'create'|'join'>` on `FlightEventsPage`, not
      `AppViewService` pages — that's what makes the bottom nav persist across sections instead
      of being replaced by each page swap.
- [x] **Create Flight Event** screen: event name field, optional description, a flight-plan
      source area ("Get Current Flight Plan from EFB" / "Load .PLN File" buttons) with a summary
      display, and a "Post Event" button. All three actions currently just report *why* they're
      not live yet (needs companion app / backend) via a status line — see
      `CreateEventSection.tsx`.
- [x] **Join Flight Event** screen: a scrollable list of events (name, host, route, player count,
      password-lock indicator, Join button). Rendered from `MOCK_EVENTS` in
      `Components/types.ts` — fixed sample data, not live. `onJoin` reports the same "needs
      backend" status. Replacing this with real data is Milestone 3's job.
- [x] Verified via `npm run build` (esbuild + TypeScript typecheck against the real
      `@efb/efb-api`/`@microsoft/msfs-sdk` declarations) and repackaged/reinstalled with
      `fspackagetool.exe`.

What Milestone 2/3 inherit from this: `CreateEventSection`'s two flight-plan buttons and `Post
Event` button, and `JoinEventSection`'s `onJoin` and mock data, are the exact points to wire up —
no new UI should be needed, just replacing stub `statusMessage.set(...)` calls with real calls to
the companion app / backend.

## Milestone 2 — Flight plan capture (host side) ✅ complete (2026-07-09)

- [x] Built `/companion`: a Node.js + TypeScript HTTP server (`http://127.0.0.1:48219`, no
      Express - plain `http` + hand-rolled CORS headers, `fast-xml-parser` for `.PLN` XML).
      `GET /flightplan/current` reads/parses `CUSTOMFLIGHT.PLN`; `POST /flightplan/pick-file`
      opens a native Windows file dialog (via a PowerShell `OpenFileDialog` script - avoids an
      Electron dependency for one dialog) and parses the selection. Both tested directly against
      this machine's real flight plan file and confirmed correct.
- [x] Wired `CreateEventSection`'s "Get Current Flight Plan from EFB" and "Load .PLN File"
      buttons to call the companion app over `fetch()` and populate the existing flight-plan
      summary line (and pre-fill the event name if empty) for the host to review before posting.
- [x] **User verification step, confirmed 2026-07-09**: both buttons work in-sim. "Load .PLN
      File" worked immediately. "Get Current Flight Plan from EFB" only succeeds once the pilot
      has spawned into a flight — this resolved `SDK-FINDINGS.md` #1 (`CUSTOMFLIGHT.PLN` doesn't
      exist before spawn-in) and #4 (the EFB app's `fetch()` reliably reaches `localhost` from
      inside Coherent GT's sandbox) at the same time. The companion app's 404 response now says
      this explicitly instead of failing silently.

## Milestone 3 — Backend + discovery ✅ complete (2026-07-09)

Decided along the way: the operator (you, for now) hosts one shared `/server` instance; every
pilot runs their own `/companion` app, pointed at that server's address via a new **Settings**
screen in the EFB app (server address + a "Your Name" field, since events need a host/joiner name
from somewhere). Settings live in the companion app's own config file, not in the EFB app.

- [x] Stood up `/server`: plain `http` + in-memory store (no framework, no DB - deliberately
      minimal). `POST /events`, `GET /events`, `POST /events/:id/join`, `DELETE /events/:id`
      (host-token gated). Tested end-to-end via direct HTTP calls: create → list → join.
- [x] Companion app: added `/settings` (persisted to `~/.flight-events-companion/config.json`)
      and `/events*` proxy routes that forward to the configured backend, filling in
      `hostName`/`playerName` from the stored pilot name automatically.
- [x] EFB app: new Settings section (gear icon in the header) for server address + pilot name.
      "Post Event" now actually posts (via the companion app) instead of stubbing. "Join Flight
      Event" now loads the real event list (with a Refresh button; no live push yet) and Join
      actually joins.
- [x] Verified via curl: companion `/settings`, `/events` (create/list), and the full
      companion → backend proxy chain all work correctly.
- [x] **User verification step, confirmed 2026-07-09**: Settings, Post Event, and Join Flight
      Event all work from inside the running EFB app - the full create → discover → join loop
      works end to end.
- [x] **Follow-up UX refinement, based on that feedback**: the flight-plan summary and event
      cards showed the full waypoint chain, which was hard to read - changed to start/end/leg
      count (`flightPlanFormat.ts`), plus total great-circle distance in NM on the Create screen
      (needed parsing waypoint lat/lon from `<WorldPosition>` in the companion app's PLN parser,
      previously skipped as unneeded - see `companion/README.md`'s parsing notes for a caveat:
      this hasn't been checked against a real filed multi-waypoint route yet, only a simple
      direct-to and a synthetic unit test). Also fixed a real bug: the Join list only ever
      refreshed once at page load (all sections mount up front and stay mounted for the
      persistent bottom nav - see `ARCHITECTURE.md` - so a mount-only refresh never re-fired on
      reopening Join). Now refreshes whenever the Join section becomes active, via an `isActive`
      prop threaded from `FlightEventsPage`.
- [x] **Second round of in-sim feedback (2026-07-09)**: header spacing (back arrow/title too
      close), the two flight-plan-source buttons cramped together (now stacked instead of
      side-by-side), and the Join list's event cards overlapping in landscape/wide EFB layout -
      traced to the `@efb/efb-api` `List` component's own `list`/`scroll-container` classes
      picking up fixed-row/grid styling from the EFB shell's stylesheet (invisible to us) that
      doesn't expect multi-line cards; fixed by overriding those shell classes at matching
      specificity in `JoinEventSection.scss`. Also added: hosts can delete their own posted
      events (companion app stores each event's `hostToken` locally since the backend only hands
      it out once, at creation - see `companion/README.md`).
- [x] **Third round (2026-07-09): `fspackagetool.exe` was silently serving a stale build.**
      The delete feature didn't appear in-sim even after a full MSFS restart, which ruled out
      Coherent GT caching. Grepping the shipped `FlightEventsApp.js` for a string known only in
      the newer source proved it: `-rebuild` reported success but the installed file's timestamp
      was ~40 minutes stale. Root cause unconfirmed - the tool "attaches to" the running
      `FlightSimulator2024.exe`, so a file lock during a live session is the leading theory, but
      MSFS wasn't running at the moment this was caught, so treat that as unproven. Worked around
      with `addon/scripts/deploy.sh`, which builds and copies `dist/` directly into the package
      and live install (bypassing `fspackagetool`'s copy step) and regenerates `layout.json`'s
      sizes/dates from what's actually on disk. Verified this fix actually works by re-grepping
      the live file post-deploy. See `addon/README.md`'s "Known issue" section. This means some
      earlier "confirmed in-sim" milestones may have been tested against a slightly stale build -
      the features themselves aren't in doubt (their logic was unit/curl-verified independently),
      but treat visual/UX specifics from before this fix with a little extra skepticism.

## Milestone 4 — Join flow + flight-plan transfer ✅ complete, with a scope change (2026-07-10)

- [x] Password entry UI: password-protected events show an inline field (Submit/Cancel) on the
      event card instead of joining immediately. Required adding a password field to
      `CreateEventSection` too (there was no way to actually create a protected event to test
      against) and fixing the companion proxy, which was silently dropping the field.
- [x] "Accept flight plan?" overlay after a successful join, showing the plan's title and
      start/end/legs (`flightPlanFormat.ts`, reused from the Create screen), with Accept/Decline.
- [x] **Tried `SimConnect_FlightPlanLoad` first, confirmed it doesn't work for this purpose.**
      Built it fully (`companion/src/simconnect/loadFlightPlan.ts`, via `node-simconnect`'s
      `Protocol.SunRise`), including a round-trip-tested PLN writer and clean error handling when
      MSFS isn't running. Live-tested against a real MSFS 2024 session: the call succeeds with no
      exception, but the EFB's Flight Plan / World Map page shows no change at all. Confirmed via
      an official Asobo/Working Title forum response that this is expected -
      `SimConnect_FlightPlanLoad` only populates a legacy "ATC flight plan," not the EFB's
      display, and MSFS 2024 currently has **no programmatic way to load a `.PLN` into the EFB at
      all** - only manual button interaction. See `docs/SDK-FINDINGS.md` #2 for the full
      citation. The code is kept in the repo (unused) as groundwork for the WASM approach below.
- [x] **Along the way, found and fixed a real, unrelated bug**: a genuine Little Navmap-exported
      33-waypoint route loaded with no effect even before the SimConnect finding came in, because
      the companion's `WorldPosition` parser only handled MSFS's own degrees+decimal-minutes
      format, not the full degrees/minutes/seconds format Little Navmap (and presumably other
      tools) write - every waypoint was silently getting zero coordinates. Fixed and verified
      against the actual file that failed. This fix is real and needed regardless of the
      SimConnect finding, since it also affects the flight-plan *capture* side. Events created
      before this fix still carry broken data - delete and re-post to pick up the fix.
- [x] **Pivoted to save-and-guide, per explicit decision**: `POST /flightplan/save` now writes
      the accepted plan to `Documents\Flight Events\<event name>.pln` and the add-on tells the
      pilot to load it themselves via World Map / "Load Flight Plan," instead of falsely claiming
      an automatic load. Verified end-to-end (file written, correct content, addon shows the
      path) - not yet confirmed that the file loads cleanly via the EFB's own Load flow, though
      there's no reason to expect it wouldn't (it's a normal, valid `.PLN`).
- Host notification ("X joined your flight event") via WebSocket push - not started; currently
  pilots have to hit Refresh to see updated player counts.

### WASM module for real EFB injection — investigated 2026-07-10, decided against

Found and read the real header (`C:\MSFS 2024 SDK\WASM\include\MSFS\MSFS_PlannedRoute.h`) and a
working sample (`Samples\DevmodeProjects\SimObjects\Aircraft\WasmAircraft\...\PlannedRouteModule.cpp`
+ its `panel.cfg`). Two disqualifying findings, in the user's own words after seeing them: "No I
don't like the WASM style from your research."
- **Aircraft-specific bundling required.** The sample wires the module into a specific aircraft's
  `panel.cfg` as a cockpit gauge (`[VCockpit01] htmlgauge00=WasmInstrument/WasmInstrument.html?
  wasm_module=...`). Supporting arbitrary aircraft would mean shipping `panel.cfg` overrides per
  aircraft - real conflict risk with any other addon overriding the same file, and no way to
  cover third-party aircraft we don't control at all.
- **Pull, not push.** `fsPlannedRouteRespondToRequest` only fires in response to the EFB itself
  requesting a route from a registered provider (`fsPlannedRouteRegisterForRequest`'s callback) -
  there's no "inject this plan now" call. The pilot would need to separately use the EFB's own
  avionics-import feature and pick our module from whatever list that shows, which isn't even
  confirmed to include third-party WASM registrants.

Not pursuing this. See `docs/SDK-FINDINGS.md` #2 for the full writeup.

### Route string — found via direct in-sim inspection, built same day

Asked the user to check the EFB's own Import menu directly (something not documented anywhere we
could find). Beyond "Load from Web" (looked non-functional) and "Load PLN File," there's a third
option: **"Enter Route String"** - a plain text field taking a standard ICAO/ATC route string
(e.g. `KJFK DCT MERIT J121 CAM DCT KBOS`). Pure text, no file dialog, no WASM, no aircraft
binding - and something we can generate and display for copy/paste right now.

- [x] Built `formatAtcRouteString` (`addon/.../flightPlanFormat.ts`): departure ICAO,
      `DCT`-separated waypoints, destination ICAO. Deliberately conservative (no SID/STAR/airway/
      runway, since we don't carry that data) - should still be valid, just not fully procedural.
- [x] Accept overlay now shows this string alongside the file-save option, and the buttons were
      relabeled ("Save File" / "Close" instead of "Accept" / "Decline") since the route string
      doesn't require clicking either button to be usable - it's just displayed for copying.
- [x] **Follow-up same day: the pilot reported no way to actually copy the string.** Considered
      and ruled out two automation options: our EFB app reaching into the built-in Flight
      Planner's own fields directly (no supported cross-app API - each EFB app is an isolated
      context, confirmed by how the sample project structures separate `AppContainer` instances)
      and simulating keystrokes into whatever window has focus (fragile, unsupported, real risk
      of typing into the wrong field). Landed on: the companion app is a normal desktop process,
      not sandboxed like the in-sim panel, so it can write directly to the Windows clipboard.
      Added `POST /clipboard/copy` (`companion/src/clipboard.ts`, shells out to PowerShell's
      `Set-Clipboard` via stdin) and wired it to auto-copy the route string the instant a join
      succeeds, plus a "Copy Again" button for re-copying. Verified end-to-end (HTTP → clipboard
      contents checked via `Get-Clipboard`).
- [x] **Second follow-up: the route string itself was confirmed dangerously wrong for the
      pilot's actual test route.** Loading the real `.PLN` (Little Navmap, 33 `User`-type
      waypoints for a scenic loop) worked correctly; pasting our generated route string sent the
      route scattered across the entire globe instead. Root cause: a route string carries bare
      identifiers, not coordinates - MSFS resolves each one against its own nav database, and
      arbitrary `User` waypoints like "WP1".."WP33" have no stable global identity, so they match
      unrelated same-named fixes elsewhere in the world. This isn't a bug to patch - it's an
      inherent limitation of route strings for exactly the kind of custom scenic/bush-trip routes
      this project cares about most. **Fix**: `hasUnresolvableWaypoints` (`flightPlanFormat.ts`)
      detects any `User`-type waypoint and hides the route string + skips the auto-copy entirely
      for that plan, showing an explanation and pointing to Save File instead. Route strings
      remain offered for plans using only real database fixes (most simple airport-to-airport
      routes). See `docs/SDK-FINDINGS.md` #2.
- [ ] **Not yet confirmed**: whether the EFB accepts a route string for a *simple* (no
      `User`-waypoint) plan, or that the saved-file path loads cleanly. Both are next to verify
      in-sim.
- Also unresolved, not pursued: whether there's any way to make MSFS's native "Load from PC" file
  dialog default to `Documents\Flight Events\` or pre-select the saved file. No supported API for
  this exists (would require UI automation against a dialog we don't own) - not attempted.
- [x] **Superseded: route string removed entirely.** Given the pilot cares most about custom
      scenic/bush-trip routes - exactly the case that broke - the whole feature (generation,
      display, clipboard auto-copy, "Copy Again") was removed rather than kept as a
      sometimes-works option. Deleted `companion/src/clipboard.ts` and the `POST /clipboard/copy`
      route, and `formatAtcRouteString`/`hasUnresolvableWaypoints` from `flightPlanFormat.ts`.
      Save File (Import → Load PLN File → Load from PC) is now the only flight-plan-transfer path.

## Milestone 5 — UI redesign to match mockup

The pilot supplied a UI mockup and asked to get close to it while keeping our existing
single-panel-at-a-time navigation (the mockup showed Create and Join side by side; we deliberately
kept only the active tab's content visible, per prior explicit preference).

- [x] `CreateEventSection` rebuilt: Title field with a 60-char counter, Description with a
      250-char counter, Password field, a "Flight Plan Source" section with rich
      `Button`-based "Load Current Plan" / "Load .PLN File" buttons (title + subtitle each,
      confirmed via reading `efb_api`'s compiled `Button` source that it supports arbitrary JSX
      children), and a "Selected Flight Plan" box with a Clear button.
- [x] `JoinEventSection` rebuilt: a search `TextBox` filtering the already-loaded event list
      client-side (name/host match) rather than the `SearchBar` component, which turned out to be
      an async-typeahead-with-its-own-result-list pattern unsuited to filtering local data; a
      `DropdownButton`-based Sort by control (Newest/Oldest/Name - "Newest" is just the
      backend's existing order); a footer showing the visible event count and last-refreshed
      clock time.
- Deliberately skipped, flagged as future work: airport-name lookups (no local navdata source, so
  event cards still show ICAO idents only), and scheduled date/time as an event field (would need
  a new `EventRecord.scheduledAt` field plus date/time pickers - out of scope for this pass),
  new icon assets for the source/sort buttons (reused existing gear/back-arrow SVGs only, used
  text labels elsewhere), and password masking (the `TextBox`/`Input` component's `type` prop
  only supports `'text' | 'number'` - no native masking, building fake masking on a two-way-bound
  component was judged too risky for this pass).
- [x] Header top-clearance fix (`.fe-header { padding: 52px 16px 12px 16px; }` in
      `FlightEventsPage.scss`) reverified intact - not touched by this redesign.
- [x] Deployed via `addon/scripts/deploy.sh` and verified against the live installed
      `FlightEventsApp.js` (grep for new markers present, old route-string markers absent).

## Milestone 6 — Event details

- [x] **Relative date display (2026-07-10).** A blank Date field on Create now defaults to
      today's actual date (`todayIsoDate()`, stored - not left blank) rather than showing nothing.
      Join cards format `scheduledDate` via `scheduleFormat.ts`'s `formatScheduledDate` into
      "Today"/"Tomorrow"/"Yesterday" relative to the viewer's own clock, falling back to a
      readable date otherwise. Parses bare `YYYY-MM-DD` as local time deliberately (not the
      native `Date` UTC-midnight interpretation), since that would show the wrong relative day
      for anyone west of UTC.
- [x] **Description shown on the Join browser (2026-07-10).** `description` existed on
      `EventRecord` since Milestone 3 but was never included in the public `EventSummary` the
      backend returns from `GET /events` - added it there, to the addon's mirrored
      `FlightEventSummary` type, and to the Join card's render (clamped to 3 lines via
      `-webkit-line-clamp` so a long description doesn't blow out card height).
- [x] **Operator cleanup tools (2026-07-10).** `/server` now auto-prunes events older than
      `MAX_EVENT_AGE_HOURS` (default 24h, checked at startup and every 15 minutes) and supports an
      operator-only `ADMIN_TOKEN` env var for deleting any event via `X-Admin-Token`, regardless
      of who created it - see `server/README.md`.
- Max pilots protection - **explicitly descoped, not needed right now** (small trusted groups;
  revisit only if it becomes an actual problem).
- Basic reconnect/error handling for dropped companion↔backend connections - still open.

## Milestone 7 — Standalone companion app for non-technical pilots

**Goal:** so far, running the companion app has required Node.js, npm, and a terminal - fine for
development, a real barrier for a non-technical pilot who only knows how to install a Community
package. This milestone closes that gap without requiring a traditional installer.

- [x] **Investigated `EXE.xml` auto-launch, deliberately not pursued (2026-07-10).** Verified via
      web research (see `companion/README.md`) that `EXE.xml` lives outside any Community
      package - at a per-install, per-user path - and lists every auto-launched addon on the
      system. Registering into it safely means merging into a file we don't own (risk of breaking
      another addon's entry if done carelessly), which needs a real installer, not a Community-
      folder drop. Decided against building that installer for now; a tray icon + manual
      double-click covers "is it running / how do I stop it" well enough without that risk.
- [x] **Standalone `.exe` packaging.** `companion/build.js` bundles the app to a single file with
      esbuild (tree-shaking naturally drops the unused `node-simconnect` native import in
      `simconnect/loadFlightPlan.ts`, so it never has to be dealt with), then
      `scripts/package-exe.js` packages it with `@yao-pkg/pkg` (the maintained fork - the
      original `vercel/pkg` is archived) into `companion/release/` - no Node.js install needed on
      the pilot's machine. Target pinned to `node22-win-x64` specifically: `pkg-fetch`'s prebuilt
      binary cache (checked directly against its GitHub releases) only covers a handful of exact
      Node versions - Node 22/24/26, not 18/20 - anything else falls back to compiling Node from
      source, which needs Visual Studio build tools this dev environment doesn't have. Verified by
      actually running the packaged exe standalone: served `/health` correctly, wrote to its log
      file, and spawned its tray helper process successfully.
- [x] **System tray icon** (`src/tray.ts`, via `systray2` - `node-systray`'s more actively
      maintained fork) with **Show Log** (opens the log file in Notepad) and **Exit**. The tray
      helper is a real spawned subprocess, not a `require()`'d native addon, so it bundles cleanly
      with esbuild; its binary and the tray `.ico` (hand-built in `scripts/make-icon.js` - no
      image tooling like ImageMagick was available locally) both need to sit as real files next to
      the packaged exe, resolved via `process.execPath`'s directory rather than `__dirname` (which
      `pkg` redirects into its virtual snapshot) once running as the packaged build.
- [x] **File logging** (`src/logger.ts`) - wraps `console.log`/`console.error` to also append to
      `~/.flight-events-companion/companion.log` (capped at 1MB, trimmed from the start rather than
      deleted), since a tray-icon app run via double-click has no visible console to read output
      from otherwise.
- [x] **Self-termination on sim close** (`src/simWatcher.ts`) - confirmed (community-tool
      convention, e.g. FSUIPC) that MSFS does not close applications it launches when it exits
      itself, so the companion app polls for `FlightSimulator2024.exe` via `tasklist` and exits
      shortly after it disappears - but only once it's actually seen the sim running at least
      once, so starting the companion app for testing without MSFS open doesn't cause it to exit
      immediately.
- [x] **Hidden console window + custom icon (2026-07-11).** Pilot feedback after testing the first
      packaged exe: a console window opens on double-click, and they have their own icon to use.
      - Tried the obvious fix first - the exe re-spawning itself hidden via Node's `windowsHide`
        spawn option (`src/hideConsole.ts`, since removed) - and it reliably broke with
        `Pkg: Error reading from file`, reproducible even outside our own code (plain PowerShell
        `Start-Process` on the same exe failed identically). Root cause: `pkg` specially patches
        `child_process.spawn` when the target is `process.execPath` (itself), and that patched
        path doesn't work reliably regardless of spawn options. Replaced with a generated
        `Start Flight Events Companion.vbs` launcher (`scripts/package-exe.js`) - a trivial,
        separate OS-level `WScript.Shell.Run(path, 0, false)` call that never touches `pkg`'s spawn
        patching at all. Confirmed working end-to-end (launched via `wscript.exe`, matching a real
        double-click: no console window, `/health` responded, tray helper process spawned).
      - Custom icon support: `companion/assets/app-icon.ico` (if present) is used for both the tray
        icon and the exe's own file icon, falling back to the generated placeholder otherwise.
        First attempt used `rcedit` to set the exe's icon post-build - it's a generic PE resource
        editor that doesn't know about the extra payload `pkg` appends to the exe (the bundled Node
        snapshot/filesystem), and silently corrupted that trailing data: the exe ran fine
        unmodified but immediately failed with the same `Pkg: Error reading from file` the moment
        `rcedit` touched it (this was actually the same failure being misdiagnosed as the
        `windowsHide` spawn problem above, until isolated by testing each change independently).
        Switched to `resedit` (`resedit-cli` on npm) - the pkg maintainers' own documented working
        alternative, confirmed via web research and then by testing - which handles pkg's binaries
        correctly.
- [x] **Stale "Load Current Plan" investigated and mitigated (2026-07-11).** A pilot reported
      that editing the route in the EFB's Flight Planner mid-session, without restarting the
      flight, still loaded the *previous* route via "Load Current Plan". Confirmed this isn't a
      caching bug in our own code (the companion app re-reads the file fresh on every request,
      no caching anywhere) - it's that MSFS itself only rewrites `CUSTOMFLIGHT.PLN` when a flight
      spawns in, not on every route edit afterward, so the file genuinely doesn't reflect
      mid-session changes yet. Since this is an MSFS engine limitation we can't fix, added
      `lastModified` (the source file's mtime) to `FlightPlanSummary` end-to-end, and "Load
      Current Plan" now warns explicitly when the file is more than 2 minutes old, explaining why
      and suggesting a fix (restart the flight after editing, or use Load .PLN File instead). The
      Selected Flight Plan summary also always shows "(saved X ago)" so staleness stays visible.

## Milestone 8 — Distribution package for non-technical rollout

**Goal:** package everything built so far into something that can actually be handed to a group -
a pilot needs the addon + companion set up with clear instructions and no assumption of technical
skill; a server host needs the backend running with slightly more technical (but still guided)
instructions.

- [x] **Two plain-text how-to guides** (`distribution/HOW-TO - Pilot Setup.txt` and
      `distribution/HOW-TO - Server Host Setup.txt`) - plain `.txt`, not markdown, deliberately:
      the target readers will most likely just double-click and read them in Notepad, where raw
      `#`/`**`/etc. markdown syntax would look like clutter rather than formatting. Cover, for
      pilots: installing the addon, running the companion app via its `.vbs` launcher, EFB
      Settings, and the create/join flow, plus a troubleshooting section pulling from real error
      messages the app actually produces. Cover, for the server host: installing Node.js, running
      the server, port forwarding (with a note about CGNAT being a hard blocker to watch for),
      the `ADMIN_TOKEN`/auto-prune cleanup tools, and the `https://` vs `http://` mistake a pilot
      already hit in practice.
- [x] **`/distribution` folder** assembled from fresh builds of all three projects: the packaged
      addon Community folder (`addon/Packages/flight-events-efb-app/`), the companion `.exe`
      release (`companion/release/` - repackaged first, since its source had changed since the
      last package build and would otherwise have shipped stale), and the server's compiled JS
      (`server/dist/`, plus a minimal `package.json` added for `npm start` - it has zero runtime
      dependencies, so this isn't strictly required, just convenient). The pilot how-to guide is
      also copied into `distribution/addon/` directly, since it should travel with the addon
      package specifically if that folder ever gets shared on its own.
- [x] **How-to guides also built as `.md`, `.html`, and `.pdf` (2026-07-11/12)**, in addition to
      the original `.txt` - the pilot wanted to compare formats before picking one. HTML/PDF got a
      real design pass (not a generic template): a "flight-strip/briefing document" aesthetic
      (numbered procedure steps with a connecting rail - legitimate here since these are real
      sequential instructions, not decorative numbering; `Bahnschrift`/`Cascadia Code` system
      fonts, both genuinely Windows-native given this all runs on Windows; NOTAM-style amber
      callout boxes), a supplied banner image as a hero with a color-matched fade into a bordered
      content card below, and a top nav between the two docs. Iterated through several rounds of
      pilot feedback (banner width/fade sizing, a real bug where the Server Host doc's dark-mode
      accent had been accidentally copy-pasted as blue instead of its own bronze tone, borders
      missing from the hero/banner sections). Landed on: keep all four formats for now
      (`.txt`/`.md`/`.html`/`.pdf`) - confirmed keeping `.md` specifically for GitHub's renderer
      once satisfied with the HTML/PDF design; the others haven't been explicitly pruned. PDFs are
      generated from the HTML via headless Edge (`--headless --print-to-pdf`) - already installed
      on Windows, avoiding a Puppeteer/Chromium download.
- [x] **Pushed to GitHub (2026-07-11/12)**, `github.com/o0kot0o/MSFSFlightEvents`. Caught a real
      licensing issue before the first push: `addon/PackageSources/vendor/microsoft-msfs-sdk-2.1.1.tgz`
      is Microsoft's own SDK package, vendored locally because it isn't on the public npm
      registry - redistributing it on GitHub risks violating Microsoft's SDK terms, which weren't
      available to check. Excluded via `.gitignore` instead, with a `vendor/README.md` explaining
      where to source it locally when building.
- [x] **Stopped committing pre-built distribution artifacts (2026-07-12).** The packaged addon,
      companion `.exe`, and server dist under `distribution/` are pure build output already
      mirrored from `addon/`, `companion/`, `server/` - keeping them in git just duplicated
      artifacts excluded elsewhere and bloated history every rebuild (the companion `.exe` alone
      is 55MB, and git can't diff binaries). Since the repo was still brand new (pushed once,
      nobody else had cloned it), rewrote history via an orphan branch + force-push to actually
      remove the binary from history rather than just stopping future growth - safe to do at this
      stage, would not be once others depend on the history. Installed GitHub CLI (`winget install
      GitHub.cli`) and authenticated via the device-code flow to publish a
      [GitHub Release](https://github.com/o0kot0o/MSFSFlightEvents/releases) instead:
      `FlightEvents-Pilot-Package.zip` (addon + companion + pilot guide) and
      `FlightEvents-Server-Package.zip` (server + server-host guide). To publish a new release
      after changes: rebuild all three projects fresh, re-copy into `distribution/`'s (gitignored)
      build-mirror folders, zip each audience's package, then
      `gh release create v0.x.x <zips> --title "..." --notes "..."`.

## Milestone 9 — Join list polish: expand/collapse, route preview, real timezones

- [x] **Expand/collapse event cards (2026-07-12).** Join/Delete were always visible on every card,
      cluttering the list. Added an `expandedEventId` Subject (only one card open at a time, same
      pattern as the existing inline-password-field state) - collapsed cards show just name/badges/
      host/route; expanding reveals description, player count, and the action buttons. Iterated
      per pilot feedback: first the whole header row was clickable, then the whole card (excluding
      the actions/password row specifically, via `event.target.closest(...)`, so clicking Join
      doesn't also immediately re-toggle the card), plus a highlight border on the expanded card.
      Found along the way: this framework (FSComponent) does *not* support `onclick` as a JSX prop
      on plain elements the way React does - confirmed by reading `buildComponent`'s actual source,
      which routes unrecognized props through `element.setAttribute`, not `addEventListener`. Click
      handlers on plain elements need a `ref` + manual `addEventListener` instead.
- [x] **Route preview on the post-join screen, not the list (2026-07-12).** Originally planned for
      inside the expanded card, but building it surfaced a real design constraint: the public
      Join list (`GET /events`) only ever sends bare waypoint id strings, deliberately no
      coordinates, so a password-protected event's route can't be inferred by anyone browsing the
      list without the password. Full waypoint data only exists after a successful join. Moved the
      preview to the "Flight plan received" screen instead - doesn't leak anything, and is arguably
      the more useful moment anyway. Draws with the SDK's real `MapProjection`/`GeoPoint` classes
      (the same Mercator projection math backing G3000/G1000 moving maps) rather than naive lat/lon
      normalization - geometry only, no basemap imagery (see the `MapBingLayer` research below).
      Falls back to a plain message for plans with no coordinates at all (SimBrief-style airway
      routes). Couldn't unit-test this one the way `pln.ts`'s fixes were tested - the real SDK
      module has runtime dependencies on sim-provided globals (`SimVar`, `RunwayDesignator`, etc.)
      that don't exist outside MSFS, so it won't load standalone in Node. Needs an in-sim check.
- [x] **Investigated real in-game map imagery, decided against for now.** The SDK does expose a
      `MapBingLayer` class ("displays the MSFS Bing Map, weather radar, and 3D terrain") - the
      actual imagery technology, not a mockup. But it's documented and built around cockpit
      panel/gauge contexts (registered in an aircraft's `panel.cfg`), the same category of
      constraint that ruled out the Planned Route API earlier. The real EFB sample template in the
      SDK doesn't demonstrate any map usage, and the base game's own built-in EFB apps aren't
      accessible to inspect for precedent (packed, not plain files). Whether it works inside an EFB
      webview at all is a genuine unknown - not chased further; the vector-only preview above was
      built as the safe, guaranteed-to-work alternative instead.
- [x] **Timezone-aware scheduled time (2026-07-12).** The Time field was pure freeform text shown
      identically to every viewer regardless of their own timezone - "8:00 PM" typed by a host in
      one timezone read as ambiguous to a pilot in another. Added `parseHostTime` (accepts
      "8:00 AM", "8:00 PM", explicit "12:00 AM"/"12:00 PM" for midnight/noon, and any bare
      hour:minute with no suffix - including "12:00" - read as literal 24-hour time, e.g. "8:00" is
      8am and "12:00" is noon; "24:00" is additionally accepted as the end-of-day equivalent of
      midnight. First pass had bare "12:00" defaulting to midnight instead of noon - pilot feedback
      corrected it to this, which matches normal 24-hour-clock reading more closely) and
      `computeScheduledAtUtc`, which combines the Date+Time fields using `new Date(y,m,d,h,mi)` -
      interpreted in whatever timezone the host's own PC is set to - then serializes to an ISO UTC
      instant. Every viewer's own app converts that same instant back to *their* local time via
      `formatScheduledInstant` (using their own machine's `Date`/`toLocaleTimeString`) - no
      timezone picker needed on either end, no manual UTC/Zulu convention required from the host.
      Verified with a real unit-test round trip (`computeScheduledAtUtc("2026-07-15", "8:00 PM")`
      on this machine, US Central/UTC-5 in July, correctly produced `2026-07-16T01:00:00.000Z`,
      and reformatting it reproduced "July 15, 2026 · 8:00 PM"), plus an end-to-end HTTP test
      directly against the local server confirming `scheduledAtUtc` round-trips through both
      `POST /events` and `GET /events`. Kept the old raw-text fields as a fallback for events
      created before this existed or where the Time text couldn't be parsed.

## Not yet verified end-to-end

- A full join flow with a second real pilot: joining an event, saving the flight plan, and
  actually loading + flying it via Import → Load PLN File → Load from PC. Everything up to "saved
  to disk" is confirmed; loading it back into the EFB by a *different* pilot on a *different*
  machine has not been.
- Two pilots joining the same event concurrently from separate companion app instances pointed at
  the same server.
- No second tester has been available so far - this needs a real second person/machine to
  actually confirm.

## Explicitly out of scope for now

- Voice, in-flight position sharing, or any real-time multiplayer telemetry — this is
  flight-plan sharing only, per the brief.
- Auto-launching the companion app via `EXE.xml` — investigated in Milestone 7; requires a real
  installer since `EXE.xml` lives outside any Community package and is shared across every
  auto-launched addon on the system. Worth revisiting if the tray-icon/manual-launch approach
  proves insufficient in practice.
- Any persistence beyond what's needed to keep events alive for the session (no accounts,
  history, etc.) — "do not over-engineer the backend initially."
- Max pilots enforcement (see Milestone 6 above).
