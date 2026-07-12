import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FlightPlanPayload } from "../types";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Inverse of parseWorldPosition in pln.ts: decimal degrees -> the PLN
 * "N43° 30.71',W110° 44.05',+006451.00" format. Altitude is always written
 * as 0 - we don't carry per-waypoint altitude today (see FlightPlanWaypoint),
 * and SimConnect_FlightPlanLoad doesn't need it to be accurate to accept
 * the plan.
 */
function formatWorldPosition(lat: number, lon: number): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lonHem = lon >= 0 ? "E" : "W";
  const latAbs = Math.abs(lat);
  const lonAbs = Math.abs(lon);
  const latDeg = Math.floor(latAbs);
  const latMin = (latAbs - latDeg) * 60;
  const lonDeg = Math.floor(lonAbs);
  const lonMin = (lonAbs - lonDeg) * 60;
  return `${latHem}${latDeg}° ${latMin.toFixed(2)}',${lonHem}${lonDeg}° ${lonMin.toFixed(2)}',+000000.00`;
}

/**
 * Builds a .PLN matching the schema parsePlnXml reads (see
 * docs/SDK-FINDINGS.md #1). Waypoints without coordinates are written
 * without a <WorldPosition> - matches what real direct-to flights on this
 * machine look like (see docs/SDK-FINDINGS.md's PLN caveat), and is
 * presumed to be acceptable to SimConnect_FlightPlanLoad, though this
 * specific write path hasn't been confirmed in-sim yet.
 */
export function buildPlnXml(plan: FlightPlanPayload): string {
  const waypointsXml = plan.waypoints
    .map((wp) => {
      const positionXml =
        typeof wp.lat === "number" && typeof wp.lon === "number"
          ? `\n            <WorldPosition>${formatWorldPosition(wp.lat, wp.lon)}</WorldPosition>`
          : "";
      // A real Little Navmap export includes this for every waypoint
      // (confirmed against a real file with "User" type waypoints, which
      // otherwise have no nav-database entry to be looked up by id at all).
      // Mirroring it since it costs nothing and matches known-working output.
      const icaoXml = `\n            <ICAO>\n                <ICAOIdent>${escapeXml(wp.id)}</ICAOIdent>\n            </ICAO>`;
      return `        <ATCWaypoint id="${escapeXml(wp.id)}">
            <ATCWaypointType>${escapeXml(wp.type ?? "Airport")}</ATCWaypointType>${positionXml}${icaoXml}
        </ATCWaypoint>`;
    })
    .join("\n");

  const descriptionXml = plan.description ? `        <Descr>${escapeXml(plan.description)}</Descr>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<SimBase.Document>
    <FlightPlan.FlightPlan>
        <Title>${escapeXml(plan.title)}</Title>
${descriptionXml}        <FPType>${escapeXml(plan.flightPlanType ?? "VFR")}</FPType>
        <CruisingAlt>${plan.cruisingAltitude ?? 0}</CruisingAlt>
        <DepartureID>${escapeXml(plan.departureId)}</DepartureID>
        <DestinationID>${escapeXml(plan.destinationId)}</DestinationID>
${waypointsXml}
    </FlightPlan.FlightPlan>
</SimBase.Document>
`;
}

/**
 * Writes the plan to a fresh temp file each time (SimConnect_FlightPlanLoad
 * takes a path, not inline XML) and returns the path. Kept for the
 * WASM/Planned Route API work planned after the save-and-guide flow below
 * ships (see docs/DEVELOPMENT-PLAN.md Milestone 4) - SimConnect_FlightPlanLoad
 * itself is confirmed (per Asobo/Working Title staff) to only populate the
 * legacy ATC flight plan, not the EFB's own display, so it's not currently
 * called from anywhere in this app.
 */
export function writeTempPlnFile(plan: FlightPlanPayload): string {
  const filePath = path.join(os.tmpdir(), `flight-events-join-${Date.now()}.pln`);
  fs.writeFileSync(filePath, buildPlnXml(plan), "utf-8");
  return filePath;
}

const SHARED_PLN_DIR = path.join(os.homedir(), "Documents", "Flight Events");

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "flight-plan";
}

/**
 * Writes the plan to a persistent, discoverable location instead of a temp
 * file, since the pilot needs to find and load it manually via the World
 * Map / EFB's own "Load Flight Plan" button - MSFS 2024 has no
 * programmatic way to do that step for them (confirmed by Asobo/Working
 * Title staff, see docs/SDK-FINDINGS.md #2). Overwrites any existing file
 * for the same event name.
 */
export function writeSharedPlnFile(plan: FlightPlanPayload, eventName: string): string {
  fs.mkdirSync(SHARED_PLN_DIR, { recursive: true });
  const filePath = path.join(SHARED_PLN_DIR, `${sanitizeFileName(eventName)}.pln`);
  fs.writeFileSync(filePath, buildPlnXml(plan), "utf-8");
  return filePath;
}
