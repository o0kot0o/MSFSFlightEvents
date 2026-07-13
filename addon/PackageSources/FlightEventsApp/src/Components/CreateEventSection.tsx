import { DisplayComponent, FSComponent, Subject, VNode } from "@microsoft/msfs-sdk";
import { Button, TextArea, TextBox, TTButton } from "@efb/efb-api";
import { formatRouteSummary, summarizeRoute } from "./flightPlanFormat";
import { computeScheduledAtUtc, todayIsoDate } from "./scheduleFormat";
import { FlightPlanSummary } from "./types";
import "./CreateEventSection.scss";

/**
 * The companion app (see /companion) listens here. It must be started
 * separately (`npm start` in /companion) - this panel only ever talks to
 * localhost, never the internet directly, per docs/ARCHITECTURE.md.
 */
const COMPANION_BASE_URL = "http://127.0.0.1:48219";

const COMPANION_UNREACHABLE_MESSAGE =
  "Could not reach the companion app on localhost. Make sure it's running (see companion/README.md).";

const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 250;

/**
 * MSFS only rewrites CUSTOMFLIGHT.PLN when a flight actually spawns in -
 * editing the route afterward in the same session doesn't necessarily
 * flush it back to disk, so "Load Current Plan" can silently return a
 * stale plan (confirmed by a pilot: edited the route mid-session without
 * restarting, and the old route loaded). Surfacing the file's age lets the
 * host notice instead of trusting it blindly.
 */
function formatPlanAge(lastModified: string | undefined): string | null {
  if (!lastModified) {
    return null;
  }
  const ageMs = Date.now() - new Date(lastModified).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) {
    return null;
  }
  if (ageMs < 60_000) {
    return "saved just now";
  }
  if (ageMs < 60 * 60_000) {
    return `saved ${Math.round(ageMs / 60_000)} min ago`;
  }
  if (ageMs < 24 * 60 * 60_000) {
    return `saved ${Math.round(ageMs / (60 * 60_000))} hr ago`;
  }
  return `saved ${Math.round(ageMs / (24 * 60 * 60_000))} day(s) ago`;
}

const STALE_PLAN_THRESHOLD_MS = 2 * 60_000;

function describeFlightPlan(plan: FlightPlanSummary): string {
  const age = formatPlanAge(plan.lastModified);
  const base = `${plan.title} — ${formatRouteSummary(summarizeRoute(plan))}`;
  return age ? `${base} (${age})` : base;
}

export class CreateEventSection extends DisplayComponent<Record<string, never>> {
  private readonly title = Subject.create("");
  private readonly description = Subject.create("");
  private readonly password = Subject.create("");
  private readonly scheduledDate = Subject.create("");
  private readonly scheduledTime = Subject.create("");
  private readonly flightPlanSummary = Subject.create("No flight plan loaded.");
  private readonly flightPlanHint = Subject.create("Load a plan using one of the buttons above.");
  private readonly hasFlightPlan = Subject.create(false);
  private readonly statusMessage = Subject.create("");
  private capturedFlightPlan: FlightPlanSummary | null = null;

  private readonly titleCount = this.title.map((v) => `${v.length}/${TITLE_MAX_LENGTH}`);
  private readonly descriptionCount = this.description.map((v) => `${v.length}/${DESCRIPTION_MAX_LENGTH}`);

  private onGetCurrentFlightPlan = async (): Promise<void> => {
    this.statusMessage.set("Reading the active flight plan...");
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/flightplan/current`);
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not read the active flight plan.");
        return;
      }
      const plan = data as FlightPlanSummary;
      this.applyFlightPlan(plan);

      const ageMs = plan.lastModified ? Date.now() - new Date(plan.lastModified).getTime() : null;
      if (ageMs !== null && !Number.isNaN(ageMs) && ageMs > STALE_PLAN_THRESHOLD_MS) {
        this.statusMessage.set(
          `Loaded the active flight plan, but it was last saved ${formatPlanAge(plan.lastModified)} - ` +
            "MSFS only saves this when a flight spawns in, so route edits since then may not be reflected. " +
            "If this looks wrong, restart the flight after editing, or use Load .PLN File instead."
        );
      } else {
        this.statusMessage.set("Loaded the active flight plan.");
      }
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private onLoadPlnFile = async (): Promise<void> => {
    this.statusMessage.set("Waiting for file selection...");
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/flightplan/pick-file`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not load the selected flight plan.");
        return;
      }
      if (data.cancelled) {
        this.statusMessage.set("File selection cancelled.");
        return;
      }
      this.applyFlightPlan(data as FlightPlanSummary);
      this.statusMessage.set("Loaded flight plan from file.");
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private onClearFlightPlan = (): void => {
    this.capturedFlightPlan = null;
    this.hasFlightPlan.set(false);
    this.flightPlanSummary.set("No flight plan loaded.");
    this.flightPlanHint.set("Load a plan using one of the buttons above.");
    this.statusMessage.set("Cleared the selected flight plan.");
  };

  private onPostEvent = async (): Promise<void> => {
    const title = this.title.get().trim();
    if (title.length === 0) {
      this.statusMessage.set("Enter a title before posting.");
      return;
    }
    if (!this.capturedFlightPlan) {
      this.statusMessage.set("Load a flight plan before posting an event.");
      return;
    }

    this.statusMessage.set("Posting event...");
    const effectiveDate = this.scheduledDate.get() || todayIsoDate();
    try {
      const response = await fetch(`${COMPANION_BASE_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title,
          description: this.description.get(),
          password: this.password.get() || undefined,
          // A blank Date field means "today" - store an actual date so Join
          // cards can show a relative "Today"/"Tomorrow"/"Yesterday" label
          // instead of just omitting it.
          scheduledDate: effectiveDate,
          scheduledTime: this.scheduledTime.get() || undefined,
          // Computed from the same Date/Time text, interpreted in this
          // host's own local timezone - lets every viewer see it converted
          // to their own local time instead of a copy of this literal text.
          // Absent (not sent) if the Time field couldn't be parsed - see
          // parseHostTime's accepted formats.
          scheduledAtUtc: computeScheduledAtUtc(effectiveDate, this.scheduledTime.get()),
          flightPlan: this.capturedFlightPlan,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.statusMessage.set(data.error ?? "Could not post the event.");
        return;
      }
      this.statusMessage.set(`Posted "${data.event.name}" - other pilots can now find it under Join.`);
    } catch {
      this.statusMessage.set(COMPANION_UNREACHABLE_MESSAGE);
    }
  };

  private applyFlightPlan(plan: FlightPlanSummary): void {
    this.capturedFlightPlan = plan;
    this.hasFlightPlan.set(true);
    this.flightPlanSummary.set(plan.title);
    this.flightPlanHint.set(describeFlightPlan(plan));
    if (this.title.get().length === 0) {
      this.title.set(plan.title);
    }
  }

  public render(): VNode {
    return (
      <div class="fe-create">
        <div class="fe-create-columns">
          <div class="fe-create-col">
            <div class="fe-field">
              <div class="fe-field-header">
                <label class="fe-label">Title *</label>
                <span class="fe-char-count">{this.titleCount}</span>
              </div>
              <div class="fe-input-row">
                <TextBox model={this.title} placeholder="Enter event title..." />
              </div>
            </div>

            <div class="fe-field">
              <div class="fe-field-header">
                <label class="fe-label">Description</label>
                <span class="fe-char-count">{this.descriptionCount}</span>
              </div>
              <TextArea model={this.description} placeholder="Enter description..." rows={2} />
            </div>

            <div class="fe-field">
              <label class="fe-label">Password (optional)</label>
              <div class="fe-input-row">
                <TextBox model={this.password} placeholder="Enter password..." />
              </div>
            </div>

            <div class="fe-field-row">
              <div class="fe-field">
                <label class="fe-label">Date (optional)</label>
                <div class="fe-input-row">
                  <TextBox model={this.scheduledDate} placeholder="YYYY-MM-DD (blank = today)" />
                </div>
              </div>
              <div class="fe-field">
                <label class="fe-label">Time (local)</label>
                <div class="fe-input-row">
                  <TextBox model={this.scheduledTime} placeholder="e.g. 8:00 PM or 20:00" />
                </div>
              </div>
            </div>
          </div>

          <div class="fe-create-col">
            <div class="fe-section-label">Flight Plan Source</div>

            <Button class="fe-source-btn" callback={(): void => void this.onGetCurrentFlightPlan()}>
              <div class="fe-source-btn-text">
                <div class="fe-source-btn-title">Load Current Plan</div>
                <div class="fe-source-btn-subtitle">Load the plan currently in the EFB</div>
              </div>
            </Button>

            <Button class="fe-source-btn" callback={(): void => void this.onLoadPlnFile()}>
              <div class="fe-source-btn-text">
                <div class="fe-source-btn-title">Load .PLN File</div>
                <div class="fe-source-btn-subtitle">Browse and select a .pln file</div>
              </div>
            </Button>

            <div class="fe-selected-plan">
              <div class="fe-selected-plan-header">
                <span>Selected Flight Plan</span>
                <TTButton
                  key="Clear"
                  type="secondary"
                  disabled={this.hasFlightPlan.map((v) => !v)}
                  callback={this.onClearFlightPlan}
                />
              </div>
              <div class="fe-selected-plan-title">{this.flightPlanSummary}</div>
              <div class="fe-selected-plan-hint">{this.flightPlanHint}</div>
            </div>
          </div>
        </div>

        <TTButton
          key="Post Event"
          type="primary"
          class="fe-post-event"
          callback={(): void => void this.onPostEvent()}
        />

        <div class="fe-status">{this.statusMessage}</div>
      </div>
    );
  }
}
