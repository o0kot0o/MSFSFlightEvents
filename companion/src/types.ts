/**
 * Mirrors the FlightPlanSummary shape the EFB app expects
 * (addon/PackageSources/FlightEventsApp/src/Components/types.ts). The two
 * projects build independently (different toolchains), so this is
 * duplicated rather than shared - keep them in sync by hand.
 */
export interface FlightPlanWaypoint {
  id: string;
  type?: string;
  lat?: number;
  lon?: number;
  /**
   * ICAO region code (e.g. "GM", "LE"). Real navdata fixes with no
   * coordinates of their own (airway-routed IFR/VFR plans - e.g. SimBrief
   * exports) rely on MSFS resolving the identifier against its own navdata,
   * and short idents like "ALT" aren't globally unique - dropping this on
   * write-out left MSFS unable to resolve any waypoint, producing an empty
   * route for the joining pilot despite the ids themselves being correct.
   */
  icaoRegion?: string;
  /** Published airway connecting this waypoint to the previous one, if any. */
  airway?: string;
}

export interface FlightPlanSummary {
  title: string;
  description?: string;
  departureId: string;
  destinationId: string;
  flightPlanType?: string;
  cruisingAltitude?: number;
  waypoints: FlightPlanWaypoint[];
  sourcePath: string;
  /**
   * ISO timestamp of the source file's last write. MSFS only rewrites
   * CUSTOMFLIGHT.PLN when a flight actually spawns in - editing the route
   * afterward in the same session doesn't necessarily flush it back to
   * disk, so "Get Current Flight Plan" can silently return a stale plan.
   * Surfaced so the host can judge freshness instead of trusting it blindly.
   */
  lastModified?: string;
}

/**
 * Same shape minus `sourcePath` - mirrors the backend's FlightPlanPayload
 * (server/src/types.ts). What a joining pilot's EFB app sends us to load
 * into their own sim; there's no local source file for it.
 */
export interface FlightPlanPayload {
  title: string;
  description?: string;
  departureId: string;
  destinationId: string;
  flightPlanType?: string;
  cruisingAltitude?: number;
  waypoints: FlightPlanWaypoint[];
}
