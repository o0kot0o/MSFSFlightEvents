import { ArraySubject, DisplayComponent, FSComponent, Subject, Subscribable, VNode } from "@microsoft/msfs-sdk";
import { DropdownButton, List, TextBox, TTButton } from "@efb/efb-api";
import { formatRouteIds } from "./flightPlanFormat";
import { drawRoutePreview } from "./routePreview";
import { formatScheduledDate, formatScheduledInstant } from "./scheduleFormat";
import { FlightEventSummary, FlightPlanPayload } from "./types";
import "./JoinEventSection.scss";

const ROUTE_PREVIEW_WIDTH = 260;
const ROUTE_PREVIEW_HEIGHT = 130;

const COMPANION_BASE_URL = "http://127.0.0.1:48219";

const COMPANION_UNREACHABLE_MESSAGE =
  "Could not reach the companion app on localhost. Make sure it's running (see companion/README.md).";

interface JoinEventSectionProps {
  /** True whenever this section is the one currently shown. */
  isActive: Subscribable<boolean>;
}

interface PendingAccept {
  eventName: string;
  flightPlan: FlightPlanPayload;
}

type SortOption = "Newest" | "Oldest" | "Name";

const SORT_OPTIONS: SortOption[] = ["Newest", "Oldest", "Name"];

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour12: false });
}

/**
 * No live push yet (host notifications over WebSocket) - the list only
 * updates when this section becomes active or the pilot hits Refresh.
 * Sections stay mounted the whole time (see FlightEventsPage's comment on
 * why), so "becomes active" has to be driven by the isActive prop rather
 * than a mount/lifecycle hook.
 */
export class JoinEventSection extends DisplayComponent<JoinEventSectionProps> {
  private readonly allEvents = ArraySubject.create<FlightEventSummary>([]);
  private readonly visibleEvents = ArraySubject.create<FlightEventSummary>([]);
  private readonly visibleCount = Subject.create(0);
  private readonly statusMessage = Subject.create("");
  private readonly searchText = Subject.create("");
  private readonly sortOption = Subject.create<SortOption>("Newest");
  private readonly lastUpdated = Subject.create("");

  /** Which event's card currently shows an inline password field, if any. */
  private readonly pendingPasswordEventId = Subject.create<string | null>(null);
  private readonly passwordInput = Subject.create("");

  /** Which event's card is currently expanded, if any - only one at a time. */
  private readonly expandedEventId = Subject.create<string | null>(null);

  /** The flight plan awaiting Accept/Close after a successful join. */
  private readonly pendingAccept = Subject.create<PendingAccept | null>(null);
  private readonly showAcceptPrompt = this.pendingAccept.map((v) => (v ? "" : "display:none"));
  private readonly acceptTitle = this.pendingAccept.map((v) => v?.flightPlan.title ?? "");

  // The route preview needs real waypoint coordinates, which only exist in
  // the *full* flight plan a join actually returns - the public event list
  // (FlightEventSummary.route) is deliberately just bare waypoint id
  // strings, with no coordinates, so a password-protected event's route
  // can't be inferred by anyone browsing the list without the password.
  // That means this can only ever be shown post-join, not on the
  // expandable event cards.
  private readonly routeCanvasRef = FSComponent.createRef<HTMLCanvasElement>();
  private readonly hasRoutePreview = Subject.create(false);
  private readonly showRoutePreview = this.hasRoutePreview.map((v) => (v ? "" : "display:none"));
  private readonly showNoRoutePreview = this.hasRoutePreview.map((v) => (v ? "display:none" : ""));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.isActive.sub((active) => {
      if (active) {
        this.refresh();
      }
    });
    this.searchText.sub(() => this.applyFilterAndSort());
    this.sortOption.sub(() => this.applyFilterAndSort());
    this.pendingAccept.sub((pending) => {
      const canvas = this.routeCanvasRef.getOrDefault();
      if (!pending || !canvas) {
        this.hasRoutePreview.set(false);
        return;
      }
      this.hasRoutePreview.set(drawRoutePreview(canvas, pending.flightPlan.waypoints));
    });
  }

  private refresh = async (): Promise<void> => {
    this.statusMessage.set("Loading events...");
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/events`);
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not load events.");
        return;
      }
      this.allEvents.set(data.events as FlightEventSummary[]);
      this.lastUpdated.set(formatClockTime(new Date()));
      this.applyFilterAndSort();
      this.statusMessage.set(data.events.length === 0 ? "No events posted yet." : "");
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private applyFilterAndSort(): void {
    const query = this.searchText.get().trim().toLowerCase();
    let filtered = this.allEvents.getArray();
    if (query.length > 0) {
      filtered = filtered.filter(
        (event) => event.name.toLowerCase().includes(query) || event.hostName.toLowerCase().includes(query)
      );
    }

    const sorted = [...filtered];
    switch (this.sortOption.get()) {
      case "Oldest":
        sorted.reverse();
        break;
      case "Name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "Newest":
      default:
        // The backend already returns newest-first.
        break;
    }

    this.visibleEvents.set(sorted);
    this.visibleCount.set(sorted.length);
  }

  private toggleExpanded = (eventId: string): void => {
    const isCollapsing = this.expandedEventId.get() === eventId;
    this.expandedEventId.set(isCollapsing ? null : eventId);
    // Don't leave a stale inline password field open on a card that just
    // collapsed, or on whichever card was previously expanded.
    this.pendingPasswordEventId.set(null);
  };

  private onJoinClick = (event: FlightEventSummary): void => {
    if (event.passwordProtected && this.pendingPasswordEventId.get() !== event.id) {
      this.passwordInput.set("");
      this.pendingPasswordEventId.set(event.id);
      return;
    }
    void this.performJoin(event, this.passwordInput.get() || undefined);
    this.pendingPasswordEventId.set(null);
  };

  private performJoin = async (event: FlightEventSummary, password?: string): Promise<void> => {
    this.statusMessage.set(`Joining "${event.name}"...`);
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/events/${encodeURIComponent(event.id)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not join the event.");
        return;
      }
      const flightPlan = data.flightPlan as FlightPlanPayload;
      this.pendingAccept.set({ eventName: event.name, flightPlan });
      this.refresh();
      this.statusMessage.set(`Joined "${event.name}" - review the flight plan below.`);
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private onAcceptFlightPlan = async (): Promise<void> => {
    const pending = this.pendingAccept.get();
    if (!pending) {
      return;
    }
    this.statusMessage.set("Saving the flight plan...");
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/flightplan/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightPlan: pending.flightPlan, eventName: pending.eventName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not save the flight plan.");
        return;
      }
      // MSFS 2024 has no programmatic way to load a .PLN into the EFB's own
      // Flight Plan display - only manual button interaction (confirmed by
      // Asobo/Working Title staff, see docs/SDK-FINDINGS.md #2). So instead
      // of a false "loaded" claim, tell the pilot exactly where to find it.
      this.statusMessage.set(
        `Saved to ${data.filePath} - open the EFB's flight planner and use Import -> Load PLN File -> ` +
          `Load from PC to select it.`
      );
      this.pendingAccept.set(null);
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private onDeclineFlightPlan = (): void => {
    this.pendingAccept.set(null);
    this.statusMessage.set("Closed.");
  };

  private onDelete = async (event: FlightEventSummary): Promise<void> => {
    this.statusMessage.set(`Deleting "${event.name}"...`);
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not delete the event.");
        return;
      }
      this.statusMessage.set(`Deleted "${event.name}".`);
      this.refresh();
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private renderEvent = (event: FlightEventSummary): VNode => {
    const isExpanded = this.expandedEventId.map((id) => id === event.id);
    const showExpanded = isExpanded.map((v) => (v ? "" : "display:none"));
    const chevron = isExpanded.map((v) => (v ? "▴" : "▾"));

    const isAwaitingPassword = this.pendingPasswordEventId.map((id) => id === event.id);
    const showActions = isAwaitingPassword.map((v) => (v ? "display:none" : ""));
    const showPasswordRow = isAwaitingPassword.map((v) => (v ? "" : "display:none"));

    // Prefer the timezone-aware instant when available - it's converted to
    // *this viewer's* own local time/day, not just a copy of what the host
    // typed. Falls back to the raw text for events posted before this
    // existed, or where the host's Time text couldn't be parsed.
    const scheduledFromInstant = event.scheduledAtUtc ? formatScheduledInstant(event.scheduledAtUtc) : null;
    const scheduled =
      scheduledFromInstant ??
      [event.scheduledDate ? formatScheduledDate(event.scheduledDate) : undefined, event.scheduledTime]
        .filter((v) => v && v.length > 0)
        .join(" · ");

    const cardRef = FSComponent.createRef<HTMLDivElement>();

    const vnode = (
      <div class={{ "fe-event-card": true, "fe-event-card--expanded": isExpanded }} ref={cardRef}>
        <div class="fe-event-top-row">
          <div class="fe-event-name">
            <span>{event.name}</span>
            {event.passwordProtected ? <span class="fe-event-locked">Locked</span> : null}
            {event.isMine ? <span class="fe-event-mine">(yours)</span> : null}
          </div>
          <div class="fe-event-top-row-right">
            {scheduled.length > 0 ? <div class="fe-event-time">{scheduled}</div> : null}
            <span class="fe-event-chevron">{chevron}</span>
          </div>
        </div>
        <div class="fe-event-detail">Hosted by {event.hostName}</div>
        <div class="fe-event-route">{formatRouteIds(event.route)}</div>

        <div class="fe-event-expanded" style={showExpanded}>
          {event.description ? <div class="fe-event-description">{event.description}</div> : null}
          <div class="fe-event-detail">
            Players: {event.playerCount}
            {event.maxPlayers ? ` / ${event.maxPlayers}` : ""}
          </div>

          <div class="fe-password-row" style={showPasswordRow}>
            <TextBox model={this.passwordInput} placeholder="Event password" />
            <TTButton key="Submit" type="primary" callback={(): void => this.onJoinClick(event)} />
            <TTButton key="Cancel" type="secondary" callback={(): void => this.pendingPasswordEventId.set(null)} />
          </div>

          <div class="fe-event-actions" style={showActions}>
            <TTButton key="Join" type="primary" callback={(): void => this.onJoinClick(event)} />
            {event.isMine ? (
              <TTButton key="Delete Event" type="secondary" callback={(): void => void this.onDelete(event)} />
            ) : null}
          </div>
        </div>
      </div>
    );

    // Whole card toggles expand/collapse, except the interactive controls
    // inside the expanded section (Join/Delete/password field) - those
    // handle their own clicks and would otherwise also bubble up and
    // immediately re-toggle the card right after, say, joining.
    cardRef.instance.addEventListener("click", (evt) => {
      const target = evt.target as HTMLElement | null;
      if (target?.closest(".fe-event-actions, .fe-password-row")) {
        return;
      }
      this.toggleExpanded(event.id);
    });

    return vnode;
  };

  public render(): VNode {
    return (
      <div class="fe-join">
        <div class="fe-toolbar">
          <div class="fe-search">
            <TextBox model={this.searchText} placeholder="Search events..." />
          </div>
          <DropdownButton<SortOption>
            title={this.sortOption.map((v) => `Sort by: ${v}`)}
            listDataset={ArraySubject.create(SORT_OPTIONS)}
            getItemLabel={(v): string => v}
            onItemClick={(v): void => this.sortOption.set(v)}
            showArrowIcon
          />
          <TTButton key="Refresh" type="secondary" callback={this.refresh} />
        </div>

        <List<FlightEventSummary>
          class="fe-event-list"
          data={this.visibleEvents}
          renderItem={this.renderEvent}
          isScrollable
        />

        <div class="fe-status">{this.statusMessage}</div>

        <div class="fe-footer">
          <span>Showing {this.visibleCount} events</span>
          <span class="fe-footer-updated">
            <span class="fe-live-dot" />
            Last updated: {this.lastUpdated}
          </span>
        </div>

        <div class="fe-accept-prompt" style={this.showAcceptPrompt}>
          <div class="fe-accept-box">
            <div class="fe-accept-heading">Flight plan received</div>
            <div class="fe-accept-title">{this.acceptTitle}</div>

            <canvas
              class="fe-route-preview"
              ref={this.routeCanvasRef}
              width={ROUTE_PREVIEW_WIDTH}
              height={ROUTE_PREVIEW_HEIGHT}
              style={this.showRoutePreview}
            />
            <div class="fe-route-preview-empty" style={this.showNoRoutePreview}>
              No coordinate data available to preview this route.
            </div>

            <div class="fe-accept-hint">
              MSFS doesn't allow add-ons to load a flight plan into your EFB automatically yet. Save it to a file,
              then use Import → Load PLN File → Load from PC to select it.
            </div>

            <div class="fe-accept-buttons">
              <TTButton key="Save File" type="primary" callback={(): void => void this.onAcceptFlightPlan()} />
              <TTButton key="Close" type="secondary" callback={this.onDeclineFlightPlan} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
