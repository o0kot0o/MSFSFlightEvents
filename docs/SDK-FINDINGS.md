# MSFS 2024 SDK Findings — Flight Events

Research conducted 2026-07-09. Sources: official Asobo SDK docs (docs.flightsimulator.com),
official MSFS 2024 SDK installed locally at `C:\MSFS 2024 SDK` (v1.6.9), the MSFS 2024 game
install (Steam), this machine's live MSFS 2024 user-data folder, an installed third-party
add-on (PMS50 GTN750) inspected for ground truth, plus community developer forums
(fsdeveloper.com, devsupport.flightsimulator.com, forums.flightsimulator.com).

Confidence is marked per finding:
- **CONFIRMED (docs)** — stated directly in official SDK documentation.
- **CONFIRMED (disk)** — verified by inspecting real files on this machine (SDK headers, game
  files, an installed add-on, or actual user flight-plan data).
- **COMMUNITY** — reported by developers on official/community forums, not independently
  reproduced by us.
- **ASSUMED / NEEDS IN-SIM TEST** — our best synthesis from documentation + training knowledge,
  not yet verified against a running sim. Must be validated during the POC milestone.

---

## 1. Reading the active flight plan

**CONFIRMED (disk).** MSFS 2024 automatically writes the currently active/custom flight plan
to disk as a standard `.PLN` XML file at:

```
%APPDATA%\Microsoft Flight Simulator 2024\MISSIONS\Custom\CustomFlight\CUSTOMFLIGHT.PLN
```

We verified this directly — the file exists on this machine and contains a real flight plan
(`DepartureID`, `DestinationID`, `Title`, `Descr`, `FPType`, `CruisingAlt`, departure/arrival
runway details). This is the classic FSX/P3D-lineage `SimBase.Document` / `FlightPlan.FlightPlan`
schema, which has been stable for ~20 years and is well documented publicly. En-route waypoints
appear as `<ATCWaypoint id="...">` elements (not present in the sample we captured, since it was
a local pattern flight with no en-route legs) — this is a documented part of the same schema, not
found on this machine's file, so we have not personally verified waypoint element formatting on this
machine, but it is extremely well established elsewhere.

**Implication:** the most reliable way to capture "what the pilot is currently flying" is to
**watch and parse this file**, not to reconstruct it from SimVars. This sidesteps the entire
"can a panel read the active flight plan" problem — a companion process just needs filesystem
access, not a live sim connection, for this part.

**Caveats (need in-sim testing):**
- This file is written by the sim's own "Custom Flight" quick-flight system. It is not yet
  confirmed whether it updates live as the pilot edits a route in the in-game World Map / EFB
  before starting the flight, or only once a flight is actually loaded/started.
- If the pilot loads a saved, named flight (`.FLT` from a career session or a saved flight)
  rather than a fresh custom flight, the same file may or may not be refreshed — needs testing.
- SimConnect exposes **no dedicated "read the current flight plan" call**. We confirmed this by
  grepping the actual `SimConnect.h` header shipped in the local SDK — the only flight-plan
  related functions are `SimConnect_FlightPlanLoad`, `SimConnect_AISetAircraftFlightPlan`, and
  `SimConnect_AICreateEnrouteATCAircraft(_EX1)` (AI traffic only). There is no
  `SimConnect_FlightPlanGet` or equivalent.
- Legacy `GPS *` SimVars (e.g. `GPS FLIGHT PLAN WP COUNT`, `GPS WP NEXT ID`,
  `FlightPlanWaypointICAO`, etc.) exist and are readable from a gauge/WASM module.
  **CONFIRMED (docs)**: MSFS 2024's own SDK docs
  (`6_Programming_APIs/GPSVars/GPS_Variables.htm`) state these are now deprecated —
  *"FS9GPS variables are deprecated in Microsoft Flight Simulator 2024. The variables will
  still work as they did in MSFS 2020 but all support is discontinued"* — and Microsoft
  explicitly recommends the **MSFS Avionics Framework, the SimConnect Planned Route API, or
  Coherent listeners** instead. We were not able to fully verify the Planned Route API's exact
  surface within our research budget; it's a real lead worth investigating for a future
  "live" read as a supplement to the file-based read.

---

## 2. Injecting a flight plan into a joining pilot's sim

**CONFIRMED (disk).** `SimConnect_FlightPlanLoad(HANDLE hSimConnect, const char* szFileName)`
exists verbatim in the MSFS 2024 `SimConnect.h` header (`C:\MSFS 2024 SDK\SimConnect SDK\include\SimConnect.h`).
It loads a `.PLN` file (the extension need not be included in the path) into the sim as an
external SimConnect client call.

**RESOLVED 2026-07-10 — confirmed by Asobo/Working Title staff, and matches what we observed
in-sim.** `SimConnect_FlightPlanLoad` **does not update the EFB's own Flight Plan display.** Per
a developer response on the official MSFS dev support forum
(`devsupport.flightsimulator.com/t/simconnect-api-flighplanload-doesnt-work/12670`): *"the
FlightPlanLoad call ... still works to populate the sim's ATC flight plan"* but *"doesn't
automatically push plans to the avionics systems."* It also *"doesn't fire the complimentary
FlightPlanActivated simconnect event"* that some external tools expect. We built and tested the
full call (`companion/src/simconnect/loadFlightPlan.ts`, via `node-simconnect`) against a live
MSFS 2024 session: it completes with no exception (protocol-level success) but the EFB's Flight
Plan / World Map page shows no change whatsoever — exactly matching the forum report.

The same developer states Asobo's own recommended replacement, the **Planned Route API**
(introduced in 2024 specifically for this gap), is **WASM-only** — not reachable from an external
SimConnect client like our companion app at all — and is a request/response protocol designed for
avionics units (GPS/FMS) to sync routes with the EFB, not a generic "inject an arbitrary plan"
call. Critically, per the same source: *"Users still cannot programmatically load .PLN files into
the EFB itself — this requires manual button interaction."* That's stated as a current MSFS 2024
limitation regardless of which API is used.

**WASM/Planned Route API investigated 2026-07-10, decided against.** Found real ground truth
locally: the actual header (`C:\MSFS 2024 SDK\WASM\include\MSFS\MSFS_PlannedRoute.h`) and a
working sample (`Samples\DevmodeProjects\SimObjects\Aircraft\WasmAircraft\...\PlannedRouteModule.cpp`,
plus its `panel.cfg`). Two disqualifying findings:
1. **The module has to be wired into a specific aircraft's `panel.cfg`** as a cockpit gauge
   entry (`htmlgauge00=WasmInstrument/WasmInstrument.html?wasm_module=...` in `[VCockpit01]`), not
   registered globally. Supporting "whatever aircraft the pilot is flying" would mean shipping
   `panel.cfg` overrides per aircraft — direct conflict risk with any other addon that also
   overrides that aircraft's panel (a livery/avionics mod, etc.), and no way to support arbitrary
   third-party aircraft we don't control.
2. **It's a pull the EFB has to initiate, not a push we can trigger.**
   `fsPlannedRouteRespondToRequest` only fires in response to `fsPlannedRouteRegisterForRequest`'s
   callback, which only fires when the EFB itself requests a route from a registered avionics
   provider. There's no "inject this plan now" call — the pilot would separately need to use the
   EFB's own avionics-import feature and select our module from whatever list that shows
   (unconfirmed whether third-party WASM registrants even appear there the way a real GPS does).

Given aircraft-specific bundling, real interference risk, and a multi-step pull UX even in the
best case, this isn't worth it over the simpler alternative below.

**Decision: save-and-guide only.** The companion app saves the accepted flight plan to
`Documents\Flight Events\<event name>.pln` for manual loading via the EFB's Import → Load PLN
File → Load from PC. This is the only flight-plan-transfer path — see the route-string writeup
below for why the alternative we tried was abandoned.

**Route string, tried and removed.** Checking the EFB's own Import menu (user-reported, not
documentation) revealed a third option beyond "Load from Web" (looked non-functional) and "Load
PLN File": **"Enter Route String"**, a plain text field taking a standard ICAO/ATC route string
(e.g. `KJFK DCT MERIT J121 CAM DCT KBOS`). We built a generator (`formatAtcRouteString`) and an
auto-copy-to-clipboard flow (`POST /clipboard/copy`, via PowerShell's `Set-Clipboard` — not
something the in-sim panel itself can do, see §4 above, but the companion app is a normal desktop
process with full OS access).

**CONFIRMED BROKEN 2026-07-10 for routes with custom waypoints — this is a real limitation, not
a bug to patch.** A route string carries bare identifiers, not coordinates — MSFS has to resolve
each one against its own navigation database. Real airports/navaids resolve correctly, but
arbitrary `User`-type waypoints (the norm for scenic/bush-trip routes — e.g. Little Navmap's
"WP1".."WP33" for a custom loop, each only meaningful because the source `.PLN` recorded exact
lat/lon) have no stable global identity. Live-tested: a 33-`User`-waypoint route came out
scattered across the entire globe instead of the local loop the source `.PLN` actually described
— not a minor inaccuracy, a route a pilot could fly without noticing it was wrong. The `.PLN`
file (Save File / Load from PC) is unaffected since it carries real coordinates directly, and
remains correct.

**Response: removed entirely, not just detected-and-hidden.** An initial fix
(`hasUnresolvableWaypoints`) detected `User`-type waypoints and hid the route string only for
those plans, keeping it for plans using real database fixes. Since scenic/bush-trip routes with
custom waypoints are exactly the case this project cares about most, the whole feature (generator,
display, clipboard auto-copy, "Copy Again" button, and the `POST /clipboard/copy` companion route)
was removed instead of kept as a sometimes-works option. `companion/src/clipboard.ts` is deleted;
`formatAtcRouteString` and `hasUnresolvableWaypoints` are gone from `flightPlanFormat.ts`.

**Requires a native/managed SimConnect client.** A pure in-sim HTML/JS panel *cannot* call
`SimConnect_FlightPlanLoad` directly — SimConnect is a native API (C/C++, or the officially
shipped **managed .NET wrapper** `Microsoft.FlightSimulator.SimConnect.dll`, confirmed present
in the local SDK at `SimConnect SDK\lib\managed\`). This means flight-plan injection must happen
either through a **WASM gauge module** (native code running inside the sim process, can link
the SimConnect API) or through an **external companion application** connected over SimConnect.
See Architecture doc for the decision.

---

## 3. Toolbar / in-sim panel integration

This was the least certain area, and we deliberately re-checked assumptions against real files
on this machine partway through.

- **COMMUNITY**: There is no first-party, fully-documented "register a toolbar button" API akin
  to a simple manifest flag. The traditional pre-2022 method was community add-ons literally
  overriding the toolbar's own HTML/JS files (destructive — only the last-loaded mod's toolbar
  customization would work). A shim library, `msfs-toolbar-interop` (github.com/parallel42),
  exists specifically to let multiple add-ons cooperate instead of clobbering each other.
- **CONFIRMED (disk), and this update matters:** `InGamePanels` is a real, currently-used,
  packager-recognized content category in MSFS 2024 — not just a hack. We inspected a real,
  actively maintained third-party add-on installed on this machine, **PMS50's GTN750** (a
  popular payware GPS unit), and found:
  - `InGamePanels/pms50-gtn750-panel.spb` — a compiled in-game panel binary
  - `html_ui/icons/toolbar/ICON_TOOLBAR_INGAMEPANEL_GTN750.svg` — a toolbar icon following an
    `ICON_TOOLBAR_INGAMEPANEL_<NAME>.svg` naming convention
  - `Config/pms50-gtn750/toolbar_panel_events.txt` — toolbar/panel event wiring
  - `manifest.json` with `"content_type": "INSTRUMENTS"`

  This is strong, real evidence that a dedicated toolbar icon + panel is achievable in MSFS 2024
  today. However, the panel content is **compiled** (`.spb`), so we could not inspect its raw
  HTML/JS/XML source or the exact pre-compilation folder layout the SDK's packager expects.
- **CONFIRMED (docs)**: The **Electronic Flight Bag (EFB) API** is officially documented for
  MSFS 2024 specifically (`6_Programming_APIs/EFB/Electronic_Flight_Bag_API.htm`), with a
  shipped `EFB_Template_Sample` referenced in the SDK's tutorials
  (`7_Samples_Tutorials/Samples/EFB/EFB_Template_Sample.htm`). A November 2025 official
  Asobo dev-support thread shows a developer failing to get a standalone in-game toolbar panel
  to render correctly in MSFS 2024 (only a debugger-set background color showed, always
  full-screen), but succeeding once they rebuilt the same functionality as a page inside the
  EFB using Asobo's own template.
- **UPDATE — CONFIRMED (disk, real sample found):** the real `EFB_Template_Sample` project was
  located at `C:\MSFS 2024 SDK\Samples\DevmodeProjects\EFB` and inspected in full. Our first POC
  (plain HTML + `registerInstrument()` + a hand-invented `config.json` descriptor) was **wrong**
  — that's the `InGamePanels`/VCockpit instrument pattern, not the EFB app pattern, and it's why
  the app never appeared in the EFB. The real mechanism, confirmed from the sample's actual
  source:
  - EFB apps are **TypeScript + JSX** (Asobo's `FSComponent` JSX via `@microsoft/msfs-sdk`, not
    React, despite looking similar), compiled with **esbuild**. There is no loadable `.html` entry
    page at all.
  - Built on two Asobo frameworks: `@microsoft/msfs-sdk` and an EFB-specific package
    `@efb/efb-api` (`App`, `AppView`, `AppViewService`, UI components like `TTButton`,
    `GamepadUiView`). Neither is on the public npm registry — both are vendored as local files in
    the SDK sample (`efb_api/dist` + a vendored `microsoft-msfs-sdk-2.1.1.tgz`).
  - Registration is **code-driven**, not manifest-driven: the compiled bundle calls
    `Efb.use(YourAppClass)` on load. The app's name/icon come from `get name()` / `get icon()`
    getters on the `App` subclass, not from a JSON descriptor.
  - Final in-package path (confirmed from the sample's `PackageDefinitions` XML):
    `html_ui/efb_ui/efb_apps/<AppName>/` — not `html_ui/EFBApps/<AppName>/` as we'd guessed.
  - `content_type` for an EFB-app-only package is `"MISC"`, not `"INSTRUMENTS"` (which is what
    GTN750's InGamePanel package used).
  - Packaging goes through the MSFS SDK's **Project Editor** tool, driven by a
    `*Project.xml` → `PackageDefinitions/*.xml` chain, which assembles the final Community
    package (including a real `manifest.json`/`layout.json`) from `PackageSources/`. This
    replaces our earlier hand-rolled `layout.json` generator approach.

  The add-on in `/addon` has been rebuilt to mirror this sample's structure exactly (with the
  vendored frameworks copied in so the project is self-contained). It has **not yet** been run
  through an actual Project Editor build + in-sim load — that's the next verification step.

**Decision:** given the tradeoffs above, we're building the POC as an **EFB app page**
(officially documented for MSFS 2024), and it's now built against the real `EFB_Template_Sample`
rather than guesswork. The remaining risk is an actual in-sim load, not the registration
mechanism itself. See `ARCHITECTURE.md` for the full reasoning and the fallback plan.

---

## 4. Network access from in-sim panels

- **CONFIRMED (docs, indirectly)**: an official Asobo dev-support thread exists titled
  *"Referer header / CORS on outgoing HTTP requests is missing"*, reporting that in-game panels
  running under Coherent GT can make outbound HTTP requests but with broken/missing
  `Referer`/`User-Agent` headers on some requests. The existence of this bug report is itself
  evidence that **outbound `fetch`/XHR from in-sim JS panels does work**, at least in some
  contexts, but is not fully documented or guaranteed to behave like a normal browser.
- No official CSP/manifest declaration for outbound networking was found in the docs we
  retrieved. This doesn't mean one doesn't exist — our research budget ran out before we could
  fully confirm it either way.
- **UPDATE — CONFIRMED (live test) 2026-07-09**: outbound `fetch()` from the EFB app to
  `http://127.0.0.1:48219` (our companion app) works reliably — confirmed via both
  `GET /flightplan/current` and `POST /flightplan/pick-file` succeeding from inside a running
  MSFS 2024 session. This only tests `localhost`, not arbitrary internet hosts (we still route
  all internet traffic through the companion app per the architecture decision below), but it
  resolves the one networking question that mattered for this project's design: the panel can
  reliably talk to a local companion process.
- **Practical conclusion:** direct in-sim networking to our own backend over the open internet
  remains untested and still carries the header-bug/no-documented-contract risk described above,
  so the architecture still routes all internet traffic through the companion app rather than
  the panel. This lines up with real-world precedent (#5 below).

---

## 5. Architecture patterns used by comparable real add-ons

**CONFIRMED (docs).** We inspected Little Navmap/Little Navconnect's own documentation:
- Little Navmap's web server is a feature of its **desktop companion application** (not an
  in-sim panel) — it serves HTTP/REST endpoints outward to browsers/clients.
- **Little Navconnect** is described by its own author as *"a free open source application that
  acts as an agent connecting Little Navmap with a flight simulator"* — explicitly built so
  Little Navmap can run on a different machine (including Linux/macOS, which can't host
  SimConnect) without the user hand-configuring SimConnect network links.

This is the same pattern reported (community-sourced, not independently verified by us) for
Volanta: a desktop companion app that holds the SimConnect connection and talks to Volanta's
cloud service, rather than any in-sim panel doing networking directly.

**Conclusion:** the dominant, proven pattern for "MSFS + external server" add-ons is a
**companion desktop application** that:
1. Holds the SimConnect connection (for flight-plan injection, and optionally richer live reads).
2. Talks to our backend over normal internet networking (no MSFS sandboxing concerns).
3. Exposes a local HTTP/WebSocket server on `localhost` that the in-sim panel/EFB app talks to
   via ordinary `fetch`/`WebSocket` calls — the same trick Little Navmap uses, and one that
   avoids depending on the flaky/undocumented direct-internet-from-Coherent-GT path entirely.

See `ARCHITECTURE.md` for how this shapes the "Flight Events" design.

---

## Open questions to resolve during hands-on testing (cannot be answered from outside the sim)

1. ~~Does `CUSTOMFLIGHT.PLN` update live as a route is edited in the World Map/EFB before flight
   start, or only once the flight is loaded?~~ **RESOLVED 2026-07-09**: the file only exists once
   the pilot has actually spawned into a flight. Loading the World Map/EFB and setting up a route
   beforehand isn't enough on its own — confirmed via the companion app's
   `GET /flightplan/current` returning 404 pre-spawn and correct data post-spawn, in a live
   session. `companion/src/server.ts` reports this explicitly to the user rather than failing
   silently.
2. ~~Does `SimConnect_FlightPlanLoad` interrupt an in-progress flight silently, or prompt the
   pilot?~~ **SUPERSEDED 2026-07-10**: moot question — confirmed (Asobo/Working Title staff +
   our own live test) that the call doesn't update the EFB's Flight Plan display at all, only a
   legacy ATC flight plan concept, so it was never going to interrupt anything the pilot could
   see. See §2 above for the full finding and the resulting save-and-guide-manually design.
3. ~~Does our EFB app, now built against the real `EFB_Template_Sample` structure, actually build
   cleanly via the Project Editor and render correctly once loaded in MSFS 2024?~~ **RESOLVED
   2026-07-09**: yes. Built via `fspackagetool.exe`, installed to the Community folder, and
   confirmed in a live MSFS 2024 session — "Flight Events" appears in the EFB app grid and opens
   a panel with the title and both buttons, exactly as designed.
4. ~~Can the EFB app's JS make outbound `fetch()` calls to `localhost` (our companion app)
   reliably?~~ **RESOLVED 2026-07-09**: yes. Both `GET /flightplan/current` and
   `POST /flightplan/pick-file` were confirmed working end-to-end from inside the running EFB app
   in a live session — this was the single biggest open risk in the whole project (§4 above,
   "practical conclusion"), and it's now settled in our favor. The in-sim panel can reach a local
   companion server without issue.
