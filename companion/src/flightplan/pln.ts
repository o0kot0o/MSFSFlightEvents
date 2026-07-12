import * as fs from "fs";
import { XMLParser } from "fast-xml-parser";
import { FlightPlanSummary, FlightPlanWaypoint } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlnNode = any;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function parsePlnFile(filePath: string): FlightPlanSummary {
  const xml = fs.readFileSync(filePath, "utf-8");
  const summary = parsePlnXml(xml, filePath);
  summary.lastModified = fs.statSync(filePath).mtime.toISOString();
  return summary;
}

/**
 * Parses a PLN <WorldPosition> string. Two formats seen in the wild for the
 * same schema:
 *   - MSFS-native, degrees + decimal minutes: "N47° 26.06',W122° 18.24',+000429.00"
 *   - Little Navmap (and presumably others), degrees/minutes/seconds:
 *     "N52° 42' 40.82",W4° 4' 14.05",+002210.38"
 * The first version of this parser only handled the first format - it
 * silently failed to match the second, which meant every waypoint loaded
 * from a real Little Navmap export had no coordinates at all, and the
 * resulting flight plan had nothing for MSFS to place its "User" waypoints
 * at. Returns null if neither format matches - callers should treat missing
 * coordinates as "unknown", not fail the whole parse over it.
 */
function parseWorldPosition(raw: unknown): { lat: number; lon: number } | null {
  if (typeof raw !== "string") {
    return null;
  }
  const match =
    /^([NS])(\d+)°?\s*(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)")?\s*,\s*([EW])(\d+)°?\s*(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)")?\s*,/.exec(
      raw.trim()
    );
  if (!match) {
    return null;
  }
  const [, latHem, latDeg, latMinOrWhole, latSec, lonHem, lonDeg, lonMinOrWhole, lonSec] = match;

  // With seconds present, latMinOrWhole/lonMinOrWhole are whole minutes and
  // *Sec is decimal seconds (D° M' S" form). Without, they're decimal
  // minutes on their own (D° M.MM' form).
  const latMinutes = latSec !== undefined ? Number(latMinOrWhole) + Number(latSec) / 60 : Number(latMinOrWhole);
  const lonMinutes = lonSec !== undefined ? Number(lonMinOrWhole) + Number(lonSec) / 60 : Number(lonMinOrWhole);

  let lat = Number(latDeg) + latMinutes / 60;
  if (latHem === "S") {
    lat = -lat;
  }
  let lon = Number(lonDeg) + lonMinutes / 60;
  if (lonHem === "W") {
    lon = -lon;
  }
  return { lat, lon };
}

/**
 * Parses the standard FSX/P3D-lineage .PLN schema (confirmed against a real
 * file on this machine - see docs/SDK-FINDINGS.md #1).
 */
export function parsePlnXml(xml: string, sourcePath: string): FlightPlanSummary {
  const doc: PlnNode = parser.parse(xml);
  const plan: PlnNode = doc?.["SimBase.Document"]?.["FlightPlan.FlightPlan"];

  if (!plan) {
    throw new Error("Not a recognized .PLN flight plan file.");
  }

  const rawWaypoints = plan.ATCWaypoint;
  const waypointList: PlnNode[] = Array.isArray(rawWaypoints) ? rawWaypoints : rawWaypoints ? [rawWaypoints] : [];

  const waypoints: FlightPlanWaypoint[] = waypointList.map((wp) => {
    const position = parseWorldPosition(wp.WorldPosition);
    // Real-world PLN files identify a waypoint two different ways: an
    // `id="..."` XML attribute on <ATCWaypoint> (MSFS-native / Little
    // Navmap exports), or a nested <ICAO><ICAOIdent> element with no `id`
    // attribute at all (confirmed against a real SimBrief-exported PLN,
    // where every <ATCWaypoint> lacked `id` entirely). Only checking the
    // attribute meant every waypoint silently fell back to "UNKNOWN" for
    // that format - and since the join/save-file writer reuses this same
    // id for its own output <ATCWaypoint id="..."> and <ICAOIdent>, a
    // joining pilot's saved file ended up with 15+ duplicate "UNKNOWN"
    // waypoints instead of the real route.
    const icaoIdent = typeof wp.ICAO?.ICAOIdent === "string" ? wp.ICAO.ICAOIdent : undefined;
    return {
      id: wp["@_id"] ?? icaoIdent ?? "UNKNOWN",
      type: wp.ATCWaypointType,
      lat: position?.lat,
      lon: position?.lon,
    };
  });

  const departureId = plan.DepartureID ?? "";
  const destinationId = plan.DestinationID ?? "";

  return {
    title: plan.Title || `${departureId} - ${destinationId}`,
    description: plan.Descr,
    departureId,
    destinationId,
    flightPlanType: plan.FPType,
    cruisingAltitude: plan.CruisingAlt !== undefined ? Number(plan.CruisingAlt) : undefined,
    waypoints,
    sourcePath,
  };
}
