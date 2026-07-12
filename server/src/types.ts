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
