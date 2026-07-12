import { GamepadUiView, IconButton, RequiredProps, TTButton, TVNode, UiViewProps } from "@efb/efb-api";
import { FSComponent, Subject } from "@microsoft/msfs-sdk";
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

  private goHome = (): void => this.activeSection.set("home");
  private goCreate = (): void => this.activeSection.set("create");
  private goJoin = (): void => this.activeSection.set("join");
  private goSettings = (): void => this.activeSection.set("settings");

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
