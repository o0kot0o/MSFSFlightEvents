import { spawn } from "child_process";

/**
 * Node has no built-in native file dialog, and this project deliberately
 * avoids pulling in Electron just for one dialog. Windows ships PowerShell
 * with System.Windows.Forms available, so we shell out to it instead -
 * -Sta is required because WinForms dialogs need a single-threaded
 * apartment.
 */
const PICK_FILE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = 'Flight Plan (*.pln)|*.pln'
$dialog.Title = 'Select a Flight Plan'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;

/**
 * Opens a native "Open File" dialog filtered to .PLN files.
 * @returns the selected path, or null if the user cancelled.
 */
export function pickPlnFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Sta", "-Command", PICK_FILE_SCRIPT]);
    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && errorOutput.trim().length > 0) {
        reject(new Error(`File picker failed: ${errorOutput.trim()}`));
        return;
      }
      const filePath = output.trim();
      resolve(filePath.length > 0 ? filePath : null);
    });
  });
}
