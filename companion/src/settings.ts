import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface CompanionSettings {
  backendUrl: string | null;
  pilotName: string | null;
}

const CONFIG_DIR = path.join(os.homedir(), ".flight-events-companion");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULT_SETTINGS: CompanionSettings = { backendUrl: null, pilotName: null };

export function getSettings(): CompanionSettings {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(partial: Partial<CompanionSettings>): CompanionSettings {
  const next: CompanionSettings = { ...getSettings(), ...partial };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

/**
 * Accepts "host", "host:port", or a full "http(s)://host[:port]" and
 * normalizes it to a base URL. Defaults to http:// and port 4000 (the
 * default /server listens on) when not specified.
 */
export function normalizeBackendUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Server address cannot be empty.");
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  if (!url.port) {
    url.port = "4000";
  }
  return url.origin;
}
