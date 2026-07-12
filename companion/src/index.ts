import { initLogger } from "./logger";
import { startServer } from "./server";
import { startSimWatcher } from "./simWatcher";
import { startTray } from "./tray";

initLogger();

startServer();

startTray(() => {
  console.log("Exit requested from tray icon.");
  process.exit(0);
});

startSimWatcher(() => {
  console.log("MSFS 2024 closed - shutting down the companion app.");
  process.exit(0);
});
