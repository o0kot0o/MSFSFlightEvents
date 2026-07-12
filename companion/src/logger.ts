import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".flight-events-companion");
export const LOG_PATH = path.join(CONFIG_DIR, "companion.log");

// Caps the log file so a long-running session (companion left open for
// hours) doesn't grow forever - truncated to the last MAX_LOG_BYTES on
// startup rather than ever deleted outright, so "Show Log" always has
// something recent to display.
const MAX_LOG_BYTES = 1024 * 1024;

function timestamp(): string {
  return new Date().toISOString();
}

function appendLine(line: string): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch {
    // Logging must never crash the app it's logging for.
  }
}

function trimLogIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= MAX_LOG_BYTES) {
      return;
    }
    const contents = fs.readFileSync(LOG_PATH, "utf-8");
    fs.writeFileSync(LOG_PATH, contents.slice(-MAX_LOG_BYTES));
  } catch {
    // No existing log yet, or a transient read/write failure - not fatal.
  }
}

/**
 * Wraps console.log/error so every log line also lands in a file the tray
 * icon's "Show Log" menu item can open - once this is a double-clicked .exe
 * instead of something run from a terminal, there's no console window to
 * read output from otherwise.
 */
export function initLogger(): void {
  trimLogIfNeeded();

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]): void => {
    originalLog(...args);
    appendLine(`[${timestamp()}] ${args.map(String).join(" ")}`);
  };

  console.error = (...args: unknown[]): void => {
    originalError(...args);
    appendLine(`[${timestamp()}] ERROR: ${args.map(String).join(" ")}`);
  };
}
