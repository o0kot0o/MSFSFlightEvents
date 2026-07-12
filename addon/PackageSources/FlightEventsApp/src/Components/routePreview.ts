import { GeoPoint, MapProjection } from "@microsoft/msfs-sdk";
import { FlightPlanWaypoint } from "./types";

const EARTH_RADIUS_NM = 3440.065;
// A single very short leg (e.g. two waypoints a few miles apart) would
// otherwise zoom the projection in absurdly - floor the visible span so the
// route always reads as a shape, not a single dot filling the canvas.
const MIN_RANGE_RAD = 40 / EARTH_RADIUS_NM;
const PADDING_FACTOR = 1.35;

/**
 * Draws a simple route-shape preview onto the given canvas: waypoints
 * connected by a line, using the SDK's real MapProjection (the same
 * Mercator projection math backing in-sim moving maps) rather than a naive
 * linear lat/lon normalization. This is geometry only - no basemap
 * imagery/terrain, see docs/SDK-FINDINGS.md for why (MapBingLayer exists in
 * the SDK, but is designed for cockpit panel/gauge contexts and unconfirmed
 * to work inside an EFB webview).
 *
 * Returns false (and draws nothing) if fewer than two waypoints have
 * coordinates - airway-routed plans from tools like SimBrief often have
 * none at all, relying on MSFS's own navdata instead of raw lat/lon, so
 * there's nothing to plot.
 */
export function drawRoutePreview(canvas: HTMLCanvasElement, waypoints: FlightPlanWaypoint[]): boolean {
  const points = waypoints.filter(
    (wp): wp is FlightPlanWaypoint & { lat: number; lon: number } =>
      typeof wp.lat === "number" && typeof wp.lon === "number"
  );
  if (points.length < 2) {
    return false;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const target = new GeoPoint(
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2
  );

  let maxDistanceRad = 0;
  for (const p of points) {
    const d = target.distance(p);
    if (d > maxDistanceRad) {
      maxDistanceRad = d;
    }
  }
  const range = Math.max(maxDistanceRad * 2 * PADDING_FACTOR, MIN_RANGE_RAD);

  const projection = new MapProjection(width, height);
  projection.set({
    target,
    targetProjectedOffset: new Float64Array([0, 0]),
    range,
    rangeEndpoints: new Float64Array([0, 0, 1, 1]),
    rotation: 0,
    projectedSize: new Float64Array([width, height]),
  });

  const out = new Float64Array(2);
  const projected = points.map((p) => {
    projection.project(p, out);
    return [out[0], out[1]] as const;
  });

  ctx.strokeStyle = "rgba(120, 190, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  projected.forEach(([x, y], i) => {
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  projected.forEach(([x, y], i) => {
    const isEndpoint = i === 0 || i === projected.length - 1;
    ctx.beginPath();
    ctx.arc(x, y, isEndpoint ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isEndpoint ? "#ffffff" : "rgba(120, 190, 255, 0.9)";
    ctx.fill();
  });

  return true;
}
