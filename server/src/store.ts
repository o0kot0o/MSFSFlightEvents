import { randomUUID } from "crypto";
import { EventRecord, EventSummary, FlightPlanPayload } from "./types";

/**
 * In-memory only, deliberately - see docs/ARCHITECTURE.md ("do not
 * over-engineer the backend initially"). Events don't survive a restart;
 * that's fine for a self-hosted, single-process, small-group tool.
 */
const events = new Map<string, EventRecord>();

export interface CreateEventInput {
  name: string;
  description?: string;
  hostName: string;
  password?: string;
  maxPlayers?: number;
  flightPlan: FlightPlanPayload;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledAtUtc?: string;
}

export function toSummary(record: EventRecord): EventSummary {
  const route =
    record.flightPlan.waypoints.length > 0
      ? record.flightPlan.waypoints.map((wp) => wp.id)
      : [record.flightPlan.departureId, record.flightPlan.destinationId];

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    hostName: record.hostName,
    route,
    playerCount: record.players.length,
    maxPlayers: record.maxPlayers,
    passwordProtected: Boolean(record.password),
    scheduledDate: record.scheduledDate,
    scheduledTime: record.scheduledTime,
    scheduledAtUtc: record.scheduledAtUtc,
  };
}

export function createEvent(input: CreateEventInput): EventRecord {
  const id = randomUUID();
  const record: EventRecord = {
    id,
    name: input.name,
    description: input.description,
    hostName: input.hostName,
    password: input.password,
    maxPlayers: input.maxPlayers,
    players: [input.hostName],
    flightPlan: input.flightPlan,
    hostToken: randomUUID(),
    createdAt: Date.now(),
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    scheduledAtUtc: input.scheduledAtUtc,
  };
  events.set(id, record);
  return record;
}

export function listEvents(): EventSummary[] {
  return Array.from(events.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toSummary);
}

/**
 * Deletes events older than `maxAgeMs`, regardless of who created them.
 * Called on a timer from server.ts (see MAX_EVENT_AGE_HOURS) so abandoned
 * posts - a host closed their companion app, or forgot to delete a stale
 * event - don't accumulate forever on a long-running server.
 */
export function pruneStaleEvents(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  for (const [id, record] of events) {
    if (record.createdAt < cutoff) {
      events.delete(id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Unconditional delete for the server operator - bypasses the hostToken
 * check in deleteEvent() below. Gated behind ADMIN_TOKEN in server.ts, not
 * here, since this module has no concept of auth.
 */
export function deleteEventAsAdmin(id: string): boolean {
  return events.delete(id);
}

export type JoinResult =
  | { ok: true; record: EventRecord }
  | { ok: false; status: number; error: string };

export function joinEvent(id: string, playerName: string, password?: string): JoinResult {
  const record = events.get(id);
  if (!record) {
    return { ok: false, status: 404, error: "Event not found." };
  }
  if (record.password && record.password !== password) {
    return { ok: false, status: 403, error: "Incorrect password." };
  }
  if (record.maxPlayers && record.players.length >= record.maxPlayers) {
    return { ok: false, status: 409, error: "Event is full." };
  }
  record.players.push(playerName);
  return { ok: true, record };
}

export function deleteEvent(id: string, hostToken: string): boolean {
  const record = events.get(id);
  if (!record || record.hostToken !== hostToken) {
    return false;
  }
  return events.delete(id);
}
