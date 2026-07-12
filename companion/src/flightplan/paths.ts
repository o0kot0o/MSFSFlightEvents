import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Confirmed on a real machine (see docs/SDK-FINDINGS.md #1): MSFS 2024
 * writes the active/custom flight plan to this path for a Steam/boxed
 * install. The Microsoft Store package folder name wasn't confirmed for
 * MSFS 2024 specifically, so rather than hardcode a guessed GUID we scan
 * %LOCALAPPDATA%\Packages for anything that looks like it.
 */
function steamOrBoxedPath(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(
    appData,
    "Microsoft Flight Simulator 2024",
    "MISSIONS",
    "Custom",
    "CustomFlight",
    "CUSTOMFLIGHT.PLN"
  );
}

function storePackagePaths(): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const packagesRoot = path.join(localAppData, "Packages");

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(packagesRoot);
  } catch {
    return [];
  }

  return entries
    .filter((name) => /flightsimulator/i.test(name) || /limitless/i.test(name))
    .map((name) =>
      path.join(packagesRoot, name, "LocalState", "MISSIONS", "Custom", "CustomFlight", "CUSTOMFLIGHT.PLN")
    );
}

/**
 * Returns the path to the active flight plan file, or null if none of the
 * known candidate locations have one yet (e.g. no flight has been started).
 */
export function findActiveFlightPlanPath(): string | null {
  const candidates = [steamOrBoxedPath(), ...storePackagePaths()];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
