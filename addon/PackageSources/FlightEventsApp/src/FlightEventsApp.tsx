import { App, AppBootMode, AppInstallProps, AppSuspendMode, AppView, AppViewProps, Efb, RequiredProps, TVNode } from "@efb/efb-api";
import { FSComponent, VNode } from "@microsoft/msfs-sdk";
import { FlightEventsPage } from "./Components/FlightEventsPage";

import "./FlightEventsApp.scss";

/**
 * BASE_URL is a global var defined in build.js - points to this app's dist
 * folder at runtime. Used to load assets (icons, fonts, etc).
 */
declare const BASE_URL: string;

class FlightEventsAppView extends AppView<RequiredProps<AppViewProps, "bus">> {
  protected defaultView = "FlightEventsHome";

  protected registerViews(): void {
    this.appViewService.registerPage("FlightEventsHome", () => (
      <FlightEventsPage appViewService={this.appViewService} />
    ));
  }

  public render(): VNode {
    return <div class="flight-events-app">{super.render()}</div>;
  }
}

class FlightEventsApp extends App {
  public get name(): string {
    return "Flight Events";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public BootMode = AppBootMode.COLD;
  public SuspendMode = AppSuspendMode.SLEEP;

  public async install(_props: AppInstallProps): Promise<void> {
    Efb.loadCss(`${BASE_URL}/FlightEventsApp.css`);
    return Promise.resolve();
  }

  public get compatibleAircraftModels(): string[] | undefined {
    // Milestone 1: no flight-plan wiring yet, so the app is not aircraft-specific.
    return undefined;
  }

  public render(): TVNode<FlightEventsAppView> {
    return <FlightEventsAppView bus={this.bus} />;
  }
}

/**
 * App definition to be injected into the EFB.
 */
Efb.use(FlightEventsApp);
