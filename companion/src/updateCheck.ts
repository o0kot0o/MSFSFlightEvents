import { COMPANION_VERSION } from "./version";

const RELEASES_URL = "https://api.github.com/repos/o0kot0o/MSFSFlightEvents/releases/latest";

// Refresh only occasionally - version availability doesn't change within a
// session, and GitHub's unauthenticated API is rate-limited (60/hr), so
// there's no reason to hit it on every EFB poll cycle.
const CACHE_TTL_MS = 30 * 60_000;

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}

let cached: { result: UpdateCheckResult; checkedAt: number } | null = null;

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const result: UpdateCheckResult = {
    currentVersion: COMPANION_VERSION,
    latestVersion: null,
    updateAvailable: false,
  };

  try {
    // GitHub's API rejects requests with no User-Agent header.
    const response = await fetch(RELEASES_URL, {
      headers: { "User-Agent": "flight-events-companion" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.tag_name === "string") {
        const latestVersion: string = data.tag_name.replace(/^v/i, "");
        result.latestVersion = latestVersion;
        result.updateAvailable = isNewer(latestVersion, COMPANION_VERSION);
      }
    }
  } catch {
    // GitHub unreachable, rate-limited, etc. - report "nothing known" rather
    // than failing the caller; the EFB badge shows this as "unknown".
  }

  cached = { result, checkedAt: Date.now() };
  return result;
}
