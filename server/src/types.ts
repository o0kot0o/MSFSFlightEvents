/**
 * Mirrors the FlightPlanSummary shape from the companion app
 * (companion/src/types.ts) minus `sourcePath` - that's a local file path on
 * the host's own machine and has no business leaving it.
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

export interface FlightPlanPayload {
  title: string;
  description?: string;
  departureId: string;
  destinationId: string;
  flightPlanType?: string;
  cruisingAltitude?: number;
  waypoints: FlightPlanWaypoint[];
}

export interface EventRecord {
  id: string;
  name: string;
  description?: string;
  hostName: string;
  password?: string;
  maxPlayers?: number;
  players: string[];
  flightPlan: FlightPlanPayload;
  hostToken: string;
  createdAt: number;
  /** Freeform text the host typed (e.g. "May 17, 2026") - not parsed/validated. */
  scheduledDate?: string;
  /** Freeform text the host typed (e.g. "19:00 Local") - not parsed/validated. */
  scheduledTime?: string;
}

/**
 * Public-facing shape - no password, no hostToken. Matches the addon's
 * FlightEventSummary (addon/PackageSources/FlightEventsApp/src/Components/types.ts)
 * field-for-field so the EFB app can render it directly.
 */
export interface EventSummary {
  id: string;
  name: string;
  description?: string;
  hostName: string;
  route: string[];
  playerCount: number;
  maxPlayers?: number;
  passwordProtected: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
}
