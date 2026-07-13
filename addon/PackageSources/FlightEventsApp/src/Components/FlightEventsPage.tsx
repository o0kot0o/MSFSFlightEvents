import { GamepadUiView, IconButton, RequiredProps, TTButton, TVNode, UiViewProps } from "@efb/efb-api";
import { FSComponent, Subject, VNode } from "@microsoft/msfs-sdk";
import { CreateEventSection } from "./CreateEventSection";
import { HomeSection } from "./HomeSection";
import { JoinEventSection } from "./JoinEventSection";
import { SettingsSection } from "./SettingsSection";
import "./FlightEventsPage.scss";

declare const BASE_URL: string;

type Section = "home" | "create" | "join" | "settings";

type FlightEventsPageProps = RequiredProps<UiViewProps, "appViewService">;

const SECTION_TITLES: Record<Section, string> = {
  home: "Flight Events",
  create: "Create Flight Event",
  join: "Join Flight Event",
  settings: "Settings",
};

/**
 * The EFB app only ever talks to the companion process on localhost - it
 * never reaches the backend server directly (see docs/ARCHITECTURE.md) - so
 * "Server" reachability has to be asked of the companion rather than checked
 * here directly.
 */
const COMPANION_BASE_URL = "http://127.0.0.1:48219";
const STATUS_POLL_INTERVAL_MS = 8000;

type ConnectionState = "checking" | "ok" | "down" | "unknown";

const STATUS_LABEL: Record<ConnectionState, string> = {
  checking: "checking...",
  ok: "connected",
  down: "not connected",
  unknown: "unknown - companion app is not reachable",
};

// Coherent GT's JS engine doesn't reliably support fetch's abort/timeout
// machinery - both `AbortSignal.timeout()` and a plain `fetch(url, {
// signal })` with a manually-built AbortController were confirmed in-sim to
// make every request fail immediately regardless of whether the target was
// actually reachable (status badges stayed on their initial state forever).
// No other fetch call in this codebase uses a timeout/signal either -
// polling below matches that established, working pattern instead.

/**
 * Top-level layout: a header (back arrow + title + settings gear), a content
 * area that swaps between Home/Create/Join/Settings, and a bottom nav where
 * Create/Join stay visible at all times. Navigation is plain internal state
 * (a Subject), not AppViewService pages - that keeps the bottom nav
 * persistent across sections instead of being replaced by each page.
 */
export class FlightEventsPage extends GamepadUiView<HTMLDivElement, FlightEventsPageProps> {
  public readonly tabName = FlightEventsPage.name;

  private readonly activeSection = Subject.create<Section>("home");
  private readonly headerTitle = this.activeSection.map((section) => SECTION_TITLES[section]);
  private readonly showBackArrow = this.activeSection.map((section) => section !== "home");
  private readonly isHomeVisible = this.activeSection.map((section) => (section === "home" ? "" : "display:none"));
  private readonly isCreateVisible = this.activeSection.map((section) =>
    section === "create" ? "" : "display:none"
  );
  private readonly isJoinVisible = this.activeSection.map((section) => (section === "join" ? "" : "display:none"));
  private readonly isSettingsVisible = this.activeSection.map((section) =>
    section === "settings" ? "" : "display:none"
  );
  private readonly isCreateSelected = this.activeSection.map((section) => section === "create");
  private readonly isJoinSelected = this.activeSection.map((section) => section === "join");

  private readonly companionStatus = Subject.create<ConnectionState>("checking");
  private readonly serverStatus = Subject.create<ConnectionState>("checking");
  private readonly companionDotClass = this.companionStatus.map((s) => `fe-status-dot fe-status-dot--${s}`);
  private readonly serverDotClass = this.serverStatus.map((s) => `fe-status-dot fe-status-dot--${s}`);
  private readonly companionTitle = this.companionStatus.map((s) => `Companion App: ${STATUS_LABEL[s]}`);
  private readonly serverTitle = this.serverStatus.map((s) => `Server: ${STATUS_LABEL[s]}`);

  private goHome = (): void => this.activeSection.set("home");
  private goCreate = (): void => this.activeSection.set("create");
  private goJoin = (): void => this.activeSection.set("join");
  private goSettings = (): void => this.activeSection.set("settings");

  /**
   * Server reachability can only be checked through the companion (the EFB
   * app never talks to the internet directly, per docs/ARCHITECTURE.md), so
   * it's only worth asking once the companion itself is confirmed reachable.
   * If the companion is down, the server's own state is genuinely unknown -
   * showing it as "down" would falsely claim a server outage when the real
   * problem is just that the companion isn't running to check.
   */
  private async pollConnectionStatus(): Promise<void> {
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/health`);
      this.companionStatus.set(response.ok ? "ok" : "down");
    } catch {
      this.companionStatus.set("down");
    }

    if (this.companionStatus.get() !== "ok") {
      this.serverStatus.set("unknown");
      return;
    }

    try {
      const response = await fetch(`${COMPANION_BASE_URL}/health/backend`);
      const data = await response.json();
      this.serverStatus.set(response.ok && data.reachable ? "ok" : "down");
    } catch {
      this.serverStatus.set("down");
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    void this.pollConnectionStatus();
    setInterval(() => void this.pollConnectionStatus(), STATUS_POLL_INTERVAL_MS);
  }

  public render(): TVNode<HTMLDivElement> {
    return (
      <div ref={this.gamepadUiViewRef} class="flight-events-page">
        <header class="fe-header">
          <IconButton
            class="fe-back-btn"
            iconPath={`${BASE_URL}/Assets/back-arrow.svg`}
            visible={this.showBackArrow}
            callback={this.goHome}
          />
          <h1>{this.headerTitle}</h1>

          <div class="fe-status-badges">
            <div class="fe-status-badge" title={this.companionTitle}>
              <img class="fe-status-icon" src={`${BASE_URL}/Assets/companion.svg`} />
              <span class={this.companionDotClass} />
            </div>
            <div class="fe-status-badge" title={this.serverTitle}>
              <img class="fe-status-icon" src={`${BASE_URL}/Assets/server.svg`} />
              <span class={this.serverDotClass} />
            </div>
          </div>

          <IconButton class="fe-settings-btn" iconPath={`${BASE_URL}/Assets/gear.svg`} callback={this.goSettings} />
        </header>

        <main class="fe-content">
          <div class="fe-section" style={this.isHomeVisible}>
            <HomeSection />
          </div>
          <div class="fe-section" style={this.isCreateVisible}>
            <CreateEventSection />
          </div>
          <div class="fe-section" style={this.isJoinVisible}>
            <JoinEventSection isActive={this.isJoinSelected} />
          </div>
          <div class="fe-section" style={this.isSettingsVisible}>
            <SettingsSection />
          </div>
        </main>

        <nav class="fe-tabbar">
          <TTButton key="Create Flight Event" type="primary" selected={this.isCreateSelected} callback={this.goCreate} />
          <TTButton key="Join Flight Event" type="secondary" selected={this.isJoinSelected} callback={this.goJoin} />
        </nav>
      </div>
    );
  }
}
