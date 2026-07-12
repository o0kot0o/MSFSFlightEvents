/**
 * Mirrors the companion app's FlightPlanSummary shape
 * (companion/src/types.ts). The two projects build independently (different
 * toolchains), so this is duplicated rather than shared - keep them in sync
 * by hand.
 */
export interface FlightPlanWaypoint {
  id: string;
  type?: string;
  lat?: number;
  lon?: number;
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
 * Same shape minus `sourcePath` - mirrors companion/server's
 * FlightPlanPayload. What comes back from joining an event: there's no
 * local source file for someone else's flight plan.
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

/**
 * Mirrors the backend's EventSummary shape (server/src/types.ts), plus
 * `isMine` which the companion app adds locally (see
 * companion/src/hostedEvents.ts) - the backend itself doesn't track who's
 * asking, only who created each event.
 */
export interface FlightEventSummary {
  id: string;
  name: string;
  description?: string;
  hostName: string;
  route: string[];
  playerCount: number;
  maxPlayers?: number;
  passwordProtected?: boolean;
  isMine?: boolean;
  /** Freeform text the host typed (e.g. "May 17, 2026") - not parsed/validated. */
  scheduledDate?: string;
  /** Freeform text the host typed (e.g. "19:00 Local") - not parsed/validated. */
  scheduledTime?: string;
}
