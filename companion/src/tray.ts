import { spawn } from "child_process";
import * as path from "path";
import SysTray from "systray2";
import { LOG_PATH } from "./logger";

function isPackaged(): boolean {
  return Boolean((process as unknown as { pkg?: unknown }).pkg);
}

// The tray helper is a real, separate OS process spawned outside pkg's
// virtual snapshot filesystem - it needs a real path on disk, so once
// packaged this has to be resolved relative to the actual .exe's location
// (process.execPath), not __dirname (which pkg redirects into its
// snapshot). Dev mode doesn't have that problem.
function iconPath(): string {
  return isPackaged()
    ? path.join(path.dirname(process.execPath), "assets", "tray-icon.ico")
    : path.join(__dirname, "..", "assets", "tray-icon.ico");
}

function openLog(): void {
  // notepad.exe ships on every Windows install - no need to depend on
  // whatever's registered as the default handler for .log files.
  spawn("notepad.exe", [LOG_PATH], { detached: true, stdio: "ignore" }).unref();
}

/**
 * Once this runs as a double-clicked .exe instead of something launched
 * from a terminal, there's no window and no obvious way to know it's
 * running or to close it - the tray icon is the entire UI for that.
 */
export function startTray(onExit: () => void): void {
  // pkg sets process.pkg when running as the packaged exe. systray2 looks
  // for its native helper binary at "./traybin/<name>" relative to the
  // current working directory (falling back to its own package folder,
  // which doesn't exist once bundled) - so when packaged, point the CWD at
  // the exe's own folder, where the packaging script places a matching
  // traybin/ directory alongside it. Dev mode (`npm start`) doesn't need
  // this - the fallback already finds node_modules/systray2/traybin.
  if (isPackaged()) {
    process.chdir(path.dirname(process.execPath));
  }

  const systray = new SysTray({
    menu: {
      icon: iconPath(),
      title: "Flight Events Companion",
      tooltip: "Flight Events Companion - running",
      items: [
        { title: "Show Log", tooltip: "Open the companion app's log file", checked: false, enabled: true },
        SysTray.separator,
        { title: "Exit", tooltip: "Stop the companion app", checked: false, enabled: true },
      ],
    },
    copyDir: true,
  });

  systray.onClick((action) => {
    if (action.item.title === "Show Log") {
      openLog();
    } else if (action.item.title === "Exit") {
      onExit();
      void systray.kill(true);
    }
  });
}
