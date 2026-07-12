# Flight Events — companion app

A small desktop process that runs alongside MSFS 2024 on the same PC. The in-sim EFB app can't
read files or open native dialogs, and can't reliably talk to the internet directly (see
`docs/SDK-FINDINGS.md` #4), so this fills both gaps: it reads/writes flight plan files on disk,
and holds the connection to the backend (`/server`) so the EFB app never has to. The EFB app only
ever talks to this process over `http://127.0.0.1:48219` — never anywhere else. Every pilot runs
their own copy of this app; there is exactly one `/server` instance, hosted centrally (see
`server/README.md`).

## Running it (for pilots — no Node.js needed)

Download/build the `release` folder (see "Building the standalone .exe" below) and double-click
**`Start Flight Events Companion.vbs`** inside it (not the `.exe` directly — see "Why a .vbs
launcher" below). A tray icon appears in the Windows notification area — that means it's running.
Right-click it for:

- **Show Log** — opens the log file (`~/.flight-events-companion/companion.log`) in Notepad. Useful
  for troubleshooting without needing a terminal.
- **Exit** — stops the companion app.

It also **shuts itself down automatically once MSFS 2024 closes** — MSFS doesn't manage the
lifetime of anything it launches (confirmed against how other community tools like FSUIPC have to
self-manage their own shutdown too), so the companion app watches for `FlightSimulator2024.exe`
and exits shortly after it's gone, rather than lingering as an orphaned background process. It only
starts watching once it's actually seen the sim running — starting the companion app before MSFS
(or during testing, with MSFS never running at all) won't cause it to exit early.

**Not auto-started with MSFS itself.** MSFS's `EXE.xml` auto-launch mechanism turned out to live
outside any Community package (`%AppData%\Microsoft Flight Simulator\exe.xml` for Steam, or a
LocalCache path for MS Store) and lists every auto-launched addon on the system, not just ours —
wiring into it safely means merging into a file we don't own, which needs a real installer, not
just a Community-folder drop. Deliberately not built yet; a manual double-click (with the tray
icon making "is it running" obvious, and log access built in) covers the non-technical-user case
well enough for now. See `docs/DEVELOPMENT-PLAN.md`.

### Why a `.vbs` launcher

`pkg` builds a console-subsystem `.exe`, so double-clicking `FlightEventsCompanion.exe` directly
opens a visible command window that most pilots have no reason to see. The straightforward fix —
have the exe silently re-launch itself hidden via Node's `windowsHide` spawn option — turned out to
reliably break: `pkg` specially patches `child_process.spawn` when the target is `process.execPath`
(itself), and that patched path fails with `Pkg: Error reading from file` regardless of how it's
invoked (confirmed by reproducing the failure outside our own code entirely, via plain PowerShell
`Start-Process`). A `.vbs` launcher sidesteps this completely — it's a trivial, separate OS-level
"run this hidden" call (`WScript.Shell.Run(path, 0, false)`) that never goes through `pkg`'s spawn
patching at all. `scripts/package-exe.js` generates it automatically. The raw `.exe` is still there
and still works if you want to see live console output for troubleshooting.

## Building the standalone .exe

```powershell
cd companion
npm install
npm run package
```

Produces `companion/release/` containing `FlightEventsCompanion.exe`, `Start Flight Events
Companion.vbs`, `traybin/`, and `assets/`. **Ship the whole folder together** — the exe alone can't
find its tray icon or the native tray helper process without the other two. `npm run package`
bundles the app with esbuild (single file, no `node_modules` needed at runtime), packages it with
`pkg` (target pinned to `node22-win-x64` specifically, since `@yao-pkg/pkg-fetch`'s prebuilt binary
cache only covers a handful of exact Node versions - checked directly against its releases: Node
22/24/26, not 18/20 - anything else falls back to compiling Node from source, which needs Visual
Studio build tools), sets the exe's icon, and writes the `.vbs` launcher.

### Custom icon

Drop a `.ico` file at `companion/assets/app-icon.ico` and re-run `npm run package` — it's used for
both the tray icon and the exe's own file icon (Explorer/taskbar). Without one, a generated
placeholder (a solid blue circle, hand-built in `scripts/make-icon.js` since no image tools were
available locally) is used for both.

**Icon-setting uses `resedit`, not `rcedit`.** `rcedit` is a generic PE resource editor that
doesn't know about the extra payload `pkg` appends to the exe (the bundled Node snapshot/
filesystem) — it silently corrupted that trailing data, so the packaged exe ran fine unmodified but
immediately failed with `Pkg: Error reading from file` the moment `rcedit` touched it (confirmed by
isolating the exact step that broke it, after initially misdiagnosing it as a `windowsHide`/spawn
problem). `resedit` (`resedit-cli` on npm) is the pkg maintainers' own documented working
alternative and handles pkg's binaries correctly.

## Developing (requires Node.js)

```powershell
cd companion
npm install
npm run build
npm start
```

Or for active development (rebuilds on change, no separate build step):

```powershell
npm run dev
```

You should see `Flight Events companion app listening on http://127.0.0.1:48219`. It needs to be
running before you click "Get Current Flight Plan from EFB" or "Load .PLN File" in the add-on —
if it isn't, those buttons report "Could not reach the companion app" rather than failing
silently. The tray icon and sim-watcher run in dev mode too (`npm start`/`npm run dev`), not just
the packaged exe.

## What it does today

- `GET /health` — liveness check.
- `GET /flightplan/current` — reads and parses the active flight plan MSFS writes to
  `%APPDATA%\Microsoft Flight Simulator 2024\MISSIONS\Custom\CustomFlight\CUSTOMFLIGHT.PLN`
  (Steam/boxed install path, confirmed on this machine; also scans
  `%LOCALAPPDATA%\Packages\*FlightSimulator*` / `*Limitless*` for a Microsoft Store install, path
  unconfirmed since this dev machine doesn't have one). 404s with a clear message if no flight
  plan file exists yet (i.e. no flight has been started).
- `POST /flightplan/pick-file` — opens a native Windows "Open File" dialog (via a PowerShell
  `System.Windows.Forms.OpenFileDialog` script, since Node has no built-in dialog and this
  project deliberately avoids pulling in Electron for one dialog) filtered to `.pln`, parses the
  selection, and returns it. Returns `{ "cancelled": true }` if the user closes the dialog.

Both flight-plan endpoints return the same JSON shape (`FlightPlanSummary` in `src/types.ts`):
title, description, departure/destination IDs, flight plan type, cruising altitude, and the
ordered waypoint list (id + type only — lat/lon/altitude per waypoint aren't parsed yet since
nothing consumes them).

- `GET /settings` / `POST /settings` — reads/writes this pilot's local config
  (`~/.flight-events-companion/config.json`): `backendUrl` (where `/server` is) and `pilotName`
  (shown to others as host/joiner name). `POST` accepts `host`, `host:port`, or a full URL for
  `backendUrl` and normalizes it (defaults to `http://` and port `4000` if omitted). The add-on's
  Settings screen is a thin editor for this file — it always reads/writes through here rather
  than storing anything itself.
- `POST /events` / `GET /events` / `POST /events/:id/join` — thin proxies to the configured
  `/server` (`backendUrl` from settings). Fill in `hostName`/`playerName` from the stored
  `pilotName` automatically — the EFB app never has to know it. Returns a clear 400 if
  `pilotName` isn't set yet, or 502 with the underlying error if the backend can't be reached.
- `DELETE /events/:id` — deletes an event, but only if *this* companion app created it. The
  backend only hands out an event's `hostToken` once, at creation (see `server/README.md`), so
  `POST /events` stashes it locally (`~/.flight-events-companion/hosted-events.json`, keyed by
  event id) and this route looks it up rather than requiring the EFB app to carry it around.
  `GET /events` also stamps each event with `isMine: true/false` based on this same local store,
  so the EFB app knows which events to offer a Delete button for instead of Join.
- `POST /flightplan/save` — body: `{ flightPlan, eventName }` (a `FlightPlanPayload`, as received
  from joining an event). Writes it to `Documents\Flight Events\<eventName>.pln`
  (`writeSharedPlnFile` in `src/flightplan/writePln.ts`) and returns the path. The add-on tells
  the pilot to load that file themselves via the EFB's own Import → Load PLN File → Load from PC
  — **not** an automatic SimConnect injection. See "Why not SimConnect_FlightPlanLoad" below.

  An earlier "Enter Route String" auto-copy path (`POST /clipboard/copy`, `src/clipboard.ts`) was
  built and then removed (2026-07-10): it worked for plans built from real airports/navaids, but
  sent MSFS to the wrong place entirely for plans with `User`-type custom waypoints — exactly the
  scenic/bush-trip routes this project cares about most. See `docs/SDK-FINDINGS.md` #2 for the
  full writeup. `POST /flightplan/save` above is now the only flight-plan-transfer path.

  ### Why not `SimConnect_FlightPlanLoad`

  This was the original plan (`src/simconnect/loadFlightPlan.ts` still exists, unused, kept for
  reference). Built and live-tested first: the call completes with no exception (protocol-level
  success) but the EFB's Flight Plan / World Map page shows no change whatsoever. Confirmed via
  an official Asobo/Working Title dev-support response
  (`devsupport.flightsimulator.com/t/simconnect-api-flighplanload-doesnt-work/12670`):
  `SimConnect_FlightPlanLoad` only populates a legacy "ATC flight plan," not the EFB's own
  display, and **MSFS 2024 currently has no programmatic way to load a `.PLN` into the EFB at
  all** - only manual button interaction. Asobo's own recommended replacement, the **Planned
  Route API**, was investigated and ruled out too - it's WASM-only, has to be wired into a
  specific aircraft's `panel.cfg` (real conflict risk with other addons), and only lets the EFB
  *pull* a route on its own initiative, not something we can push on demand. See
  `docs/SDK-FINDINGS.md` #2 for the full writeup. Save-and-guide (`POST /flightplan/save`,
  Import → Load PLN File → Load from PC) is what we're using instead.

## Verified so far

- `GET /flightplan/current`, `POST /flightplan/pick-file`, `GET/POST /settings`, `/events*`, and
  `POST /flightplan/save` have all been tested directly (curl / against this machine's real
  `CUSTOMFLIGHT.PLN` and a real Little Navmap export) and work correctly end-to-end down to a
  locally running `/server`.
- **Confirmed 2026-07-09**: the in-sim EFB app's `fetch()` reaches this server successfully — the
  "Get Current Flight Plan from EFB" and "Load .PLN File" buttons both work in a live session.
  This was the biggest open question from `docs/SDK-FINDINGS.md` #4 and it's resolved.
- **Confirmed 2026-07-09**: Settings, Post Event, and Join all work from inside the running EFB
  app, not just via curl.
- **Confirmed 2026-07-10**: `SimConnect_FlightPlanLoad` reports success but doesn't update the
  EFB (see above) - this is why `/flightplan/save` exists instead. The save-and-guide flow itself
  is verified via curl (file written with correct content) but not yet confirmed that the saved
  file loads cleanly through the EFB's own "Load Flight Plan" — there's no specific reason to
  expect it wouldn't (it's a normal, valid `.PLN`), but it hasn't been watched happen.

## Parsing notes

The `.PLN` format is the FSX/P3D-lineage `SimBase.Document` → `FlightPlan.FlightPlan` XML schema
(confirmed against a real file on this machine, see `docs/SDK-FINDINGS.md` #1). Parsed with
`fast-xml-parser`. Waypoints come from `<ATCWaypoint id="...">` elements: `id`, `ATCWaypointType`,
and now lat/lon parsed from `<WorldPosition>` (format `N43° 30.71',W110° 44.05',+006451.00` —
degrees + decimal minutes). Used by the EFB app to show total great-circle distance in NM.

**Caveat**: every flight plan captured on this dev machine so far has been a simple direct-to
quick flight with **no `<ATCWaypoint>` elements at all** — MSFS's "Custom Flight" system only
seems to populate them for an actually-filed multi-waypoint route (via World Map/EFB flight
planning), not a plain direct flight.

**RESOLVED 2026-07-09 — real bug found via a real Little Navmap export.** A user loaded a
33-waypoint route exported by Little Navmap (`.PLN` "Load .PLN File") and accepting/joining it
had no effect in-sim. The temp `.PLN` the companion app generated to send to
`SimConnect_FlightPlanLoad` had 33 `User`-type waypoints with **zero coordinates** — `parseWorldPosition`
had silently failed to match every single one. Root cause: it only handled the MSFS-native
degrees+decimal-minutes format (`N43° 30.71',W110° 44.05',+006451.00`), but Little Navmap (and
likely other tools) write full degrees/minutes/seconds instead
(`N52° 42' 40.82",W4° 4' 14.05",+002210.38`). Fixed by making the regex handle both forms,
verified against the actual file that failed (all 33 waypoints now parse with correct
coordinates — cross-checked against known real-world coordinates for the route). Also added the
`<ICAO><ICAOIdent>` block to `writePln.ts`'s output for every waypoint, matching what Little
Navmap itself writes (harmless for waypoint types with a real ICAO id, and likely necessary for
`User`-type waypoints, which have no other way to be identified).

**Important**: events created *before* this fix still have the broken (coordinate-less) flight
plan stored in the backend, since an event's flight plan is captured at posting time, not
re-read live. Delete and re-post any event that was created before this fix to pick up corrected
data.

Also added basic logging (`console.log`) to the companion app - per-request in `server.ts`, and
SimConnect-specific detail (`sendId`, exception/timeout outcome) in `loadFlightPlan.ts` - so
future issues like this are diagnosable from the running process instead of needing to dig
through temp files.
