import { exec } from "child_process";

const SIM_PROCESS_NAME = "FlightSimulator2024.exe";
const POLL_INTERVAL_MS = 15_000;

function isSimRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    // tasklist ships with every Windows install - no extra dependency needed
    // just to check if a process is running.
    exec(`tasklist /FI "IMAGENAME eq ${SIM_PROCESS_NAME}" /NH`, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.toLowerCase().includes(SIM_PROCESS_NAME.toLowerCase()));
    });
  });
}

/**
 * MSFS does not close applications it launches (via EXE.xml or otherwise)
 * when the sim itself exits - confirmed by how other community tools
 * (FSUIPC etc.) all have to self-manage their own shutdown instead of
 * relying on the sim to do it. This polls for the sim process and calls
 * `onSimClosed` once it disappears - but only after having actually seen it
 * running at least once, so someone starting the companion app for testing
 * (with MSFS not open at all) doesn't get it exiting out from under them
 * immediately.
 */
export function startSimWatcher(onSimClosed: () => void): void {
  let hasSeenSimRunning = false;

  const intervalId = setInterval(async () => {
    const running = await isSimRunning();
    if (running) {
      hasSeenSimRunning = true;
      return;
    }
    if (hasSeenSimRunning) {
      clearInterval(intervalId);
      onSimClosed();
    }
  }, POLL_INTERVAL_MS);
}
