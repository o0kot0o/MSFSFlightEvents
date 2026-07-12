// Produces a standalone Windows .exe for non-technical pilots: no Node.js
// install, no npm, no terminal - just a folder they can double-click into.
// Run via `npm run package`.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "release");
const EXE_NAME = "FlightEventsCompanion.exe";

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  console.log("== Bundling with esbuild ==");
  run("node build.js");

  console.log("== Packaging with pkg ==");
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const exePath = path.join(RELEASE_DIR, EXE_NAME);
  // node22-win-x64 specifically: @yao-pkg/pkg-fetch only ships prebuilt base
  // binaries for a handful of exact versions (checked against its v3.6
  // release - Node 22/24/26 only, not 18/20). Anything else falls back to
  // compiling Node from source, which needs Visual Studio build tools this
  // environment doesn't have.
  run(`npx pkg dist-bundle/index.cjs --targets node22-win-x64 --output "${exePath}"`);

  console.log("== Copying tray helper binary ==");
  const traybinSrc = path.join(ROOT, "node_modules", "systray2", "traybin", "tray_windows_release.exe");
  const traybinDestDir = path.join(RELEASE_DIR, "traybin");
  fs.mkdirSync(traybinDestDir, { recursive: true });
  fs.copyFileSync(traybinSrc, path.join(traybinDestDir, "tray_windows_release.exe"));

  console.log("== Setting icon ==");
  // Drop a custom app-icon.ico in companion/assets/ to override the
  // generated placeholder (a hand-built solid-circle icon, since no image
  // tools were available to make something nicer) - used for both the tray
  // icon and the .exe's own file icon, so a custom one only needs to be
  // provided once.
  const customIcon = path.join(ROOT, "assets", "app-icon.ico");
  const iconSource = fs.existsSync(customIcon) ? customIcon : path.join(ROOT, "assets", "tray-icon.ico");
  console.log(`Using icon: ${iconSource}`);

  const assetsDestDir = path.join(RELEASE_DIR, "assets");
  fs.mkdirSync(assetsDestDir, { recursive: true });
  // tray.ts always looks for "assets/tray-icon.ico" next to the exe -
  // regardless of the source filename, it lands there under that name.
  fs.copyFileSync(iconSource, path.join(assetsDestDir, "tray-icon.ico"));

  // NOT rcedit: it's a generic PE resource editor that doesn't know about
  // the extra payload pkg appends to the exe (the bundled snapshot/
  // filesystem) - it silently corrupted that trailing data, so the built
  // exe ran fine unmodified but immediately failed with
  // "Pkg: Error reading from file." after rcedit touched it (confirmed by
  // isolating the exact step that broke it). The pkg maintainers'
  // documented working alternative is `resedit` (a different tool -
  // `resedit-cli` on npm), which handles pkg's binaries correctly.
  run(`npx resedit "${exePath}" "${exePath}" --icon "1,${iconSource}"`);

  console.log("== Writing hidden-launch shortcut ==");
  // pkg builds a console-subsystem exe, so double-clicking it directly opens
  // a visible command window. Tried having it re-spawn itself hidden via
  // Node's windowsHide option, but pkg patches child_process.spawn
  // specially when the target is process.execPath (itself), and that patched
  // path reliably breaks ("Pkg: Error reading from file") regardless of how
  // it's invoked - confirmed by reproducing it outside our own code, via
  // plain PowerShell Start-Process too. A .vbs launcher sidesteps this
  // entirely: it's a separate, trivial OS-level "run this hidden" call that
  // never goes through pkg's spawn patching at all. The raw .exe still works
  // too (just shows a console) for anyone who wants to watch live output.
  const vbsContent = [
    "Dim fso, scriptDir, exePath",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    "scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)",
    `exePath = scriptDir & "\\${EXE_NAME}"`,
    'CreateObject("WScript.Shell").Run """" & exePath & """", 0, False',
  ].join("\r\n");
  fs.writeFileSync(path.join(RELEASE_DIR, "Start Flight Events Companion.vbs"), vbsContent);

  console.log(`\nDone. Distributable folder: ${RELEASE_DIR}`);
  console.log(
    "Ship the whole 'release' folder together - the exe alone won't find its tray icon or helper binary."
  );
  console.log('Pilots should double-click "Start Flight Events Companion.vbs" to launch without a console window.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
