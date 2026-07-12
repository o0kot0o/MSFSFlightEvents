import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * The backend only hands out an event's hostToken once, at creation, to
 * whoever created it (see server/src/store.ts) - it's not retrievable
 * later. So the companion app that created an event is the only place that
 * can still prove it's the host, and it has to remember that across EFB app
 * reloads (the companion process outlives the EFB app's own state).
 */
const CONFIG_DIR = path.join(os.homedir(), ".flight-events-companion");
const STORE_PATH = path.join(CONFIG_DIR, "hosted-events.json");

type HostedEventMap = Record<string, string>;

function readStore(): HostedEventMap {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(store: HostedEventMap): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function rememberHostedEvent(eventId: string, hostToken: string): void {
  const store = readStore();
  store[eventId] = hostToken;
  writeStore(store);
}

export function getHostToken(eventId: string): string | undefined {
  return readStore()[eventId];
}

export function forgetHostedEvent(eventId: string): void {
  const store = readStore();
  delete store[eventId];
  writeStore(store);
}

export function isHostedByMe(eventId: string): boolean {
  return getHostToken(eventId) !== undefined;
}
