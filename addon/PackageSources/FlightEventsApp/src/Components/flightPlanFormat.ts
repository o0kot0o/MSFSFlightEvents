import { FlightPlanWaypoint } from "./types";

const EARTH_RADIUS_NM = 3440.065;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/**
 * Sums great-circle distance leg-to-leg. Returns null if fewer than two
 * waypoints have coordinates - either the plan has no filed route (MSFS's
 * quick "Custom Flight" only writes ATCWaypoint entries for a filed
 * multi-waypoint route, not a simple direct-to), or WorldPosition parsing
 * failed for some other reason.
 */
export function totalDistanceNm(waypoints: FlightPlanWaypoint[]): number | null {
  const points = waypoints.filter(
    (wp): wp is FlightPlanWaypoint & { lat: number; lon: number } =>
      typeof wp.lat === "number" && typeof wp.lon === "number"
  );
  if (points.length < 2) {
    return null;
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineNm(points[i - 1], points[i]);
  }
  return total;
}

export interface FlightPlanRouteSummary {
  start: string;
  end: string;
  legs: number;
  distanceNm: number | null;
}

/**
 * legs = number of ATCWaypoint-to-ATCWaypoint segments. When the plan has no
 * filed waypoint list (see totalDistanceNm's comment), falls back to a
 * single direct leg between departure/destination.
 */
export function summarizeRoute(plan: {
  departureId: string;
  destinationId: string;
  waypoints: FlightPlanWaypoint[];
}): FlightPlanRouteSummary {
  const { waypoints } = plan;
  const start = waypoints[0]?.id ?? plan.departureId;
  const end = waypoints[waypoints.length - 1]?.id ?? plan.destinationId;
  const legs = waypoints.length > 1 ? waypoints.length - 1 : 1;
  return { start, end, legs, distanceNm: totalDistanceNm(waypoints) };
}

export function formatRouteSummary(summary: FlightPlanRouteSummary): string {
  const legLabel = summary.legs === 1 ? "1 leg" : `${summary.legs} legs`;
  const distanceLabel = summary.distanceNm !== null ? `, ${Math.round(summary.distanceNm)} NM` : "";
  return `${summary.start} to ${summary.end} (${legLabel}${distanceLabel})`;
}

/**
 * Same start/end/legs treatment as formatRouteSummary, but for the Join
 * list's FlightEventSummary.route (waypoint ids only - the backend's public
 * EventSummary carries no coordinates, so no distance here).
 */
export function formatRouteIds(route: string[]): string {
  if (route.length === 0) {
    return "Unknown route";
  }
  const start = route[0];
  const end = route[route.length - 1];
  const legs = route.length > 1 ? route.length - 1 : 1;
  const legLabel = legs === 1 ? "1 leg" : `${legs} legs`;
  return `${start} to ${end} (${legLabel})`;
}
