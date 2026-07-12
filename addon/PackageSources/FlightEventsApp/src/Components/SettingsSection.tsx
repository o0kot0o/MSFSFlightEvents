import { DisplayComponent, FSComponent, Subject, VNode } from "@microsoft/msfs-sdk";
import { TextBox, TTButton } from "@efb/efb-api";
import "./SettingsSection.scss";

const COMPANION_BASE_URL = "http://127.0.0.1:48219";

const COMPANION_UNREACHABLE_MESSAGE =
  "Could not reach the companion app on localhost. Make sure it's running (see companion/README.md).";

/**
 * The server address and pilot name live in the companion app's own config
 * file (companion/src/settings.ts), not in this panel - this screen is just
 * a thin editor for it. The backend URL is what the companion app uses when
 * posting/listing/joining events (see /companion's backend/client.ts).
 */
export class SettingsSection extends DisplayComponent<Record<string, never>> {
  private readonly serverAddress = Subject.create("");
  private readonly pilotName = Subject.create("");
  private readonly statusMessage = Subject.create("");

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.loadSettings();
  }

  private loadSettings = async (): Promise<void> => {
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/settings`);
      const data = await response.json();
      this.serverAddress.set(data.backendUrl ?? "");
      this.pilotName.set(data.pilotName ?? "");
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private onSave = async (): Promise<void> => {
    this.statusMessage.set("Saving...");
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backendUrl: this.serverAddress.get(),
          pilotName: this.pilotName.get(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not save settings.");
        return;
      }
      this.serverAddress.set(data.backendUrl ?? "");
      this.pilotName.set(data.pilotName ?? "");
      this.statusMessage.set("Saved.");
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  public render(): VNode {
    return (
      <div class="fe-settings">
        <div class="fe-section-label">Connection</div>

        <div class="fe-field">
          <label class="fe-label">Server Address</label>
          <div class="fe-input-row">
            <TextBox model={this.serverAddress} placeholder="ip or ip:port" />
          </div>
        </div>

        <div class="fe-field">
          <label class="fe-label">Your Name</label>
          <div class="fe-input-row">
            <TextBox model={this.pilotName} placeholder="Shown to other pilots" />
          </div>
        </div>

        <TTButton key="Save" type="primary" class="fe-save-btn" callback={this.onSave} />

        <div class="fe-status">{this.statusMessage}</div>
      </div>
    );
  }
}
