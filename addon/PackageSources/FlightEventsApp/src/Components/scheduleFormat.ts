function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * "Today"/"Tomorrow"/"Yesterday" relative to the viewer's own clock, or a
 * readable date otherwise - compares using the Date object's local (not
 * UTC) calendar day throughout, so this gives the right answer regardless
 * of which side of UTC the viewer is on.
 */
function formatRelativeDay(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameCalendarDay(date, today)) {
    return "Today";
  }
  if (isSameCalendarDay(date, tomorrow)) {
    return "Tomorrow";
  }
  if (isSameCalendarDay(date, yesterday)) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Returns today's date as "YYYY-MM-DD" in local time - used to fill in a
 * blank Date field at event-creation time so "no date entered" reliably
 * means "today" rather than leaving the field empty/unparseable.
 */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a host-entered date as "Today"/"Tomorrow"/"Yesterday" relative to
 * the viewer's own clock, or a readable date otherwise. Falls back to the
 * raw string unchanged if it isn't a date `Date` can parse - the field is
 * freeform text, not a validated date picker, so this has to degrade
 * gracefully rather than show "Invalid Date". Only used as a fallback for
 * events created before scheduledAtUtc existed, or where the host's Time
 * text couldn't be parsed into one - see formatScheduledInstant below for
 * the timezone-aware path.
 */
export function formatScheduledDate(dateStr: string): string {
  // "new Date('2026-07-10')" parses a bare YYYY-MM-DD string as UTC
  // midnight (ISO 8601 date-only rule), which can land on the wrong local
  // calendar day entirely for anyone west of UTC - e.g. showing "Yesterday"
  // for an event that's actually today. Parse that specific shape as local
  // time instead; anything else (freeform text) falls back to the native
  // parser, accepting the ambiguity since it's not a validated format.
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    : new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }
  return formatRelativeDay(parsed);
}

/**
 * Parses a host-entered time into 24-hour hour/minute components,
 * interpreted in the host's own local time (whatever timezone their PC's
 * clock is set to). Not a strict format - mirrors the freeform Date field.
 *
 * Accepts:
 *   "8:00 AM" / "8:00am"  -> 8:00
 *   "8:00 PM" / "8:00pm"  -> 20:00
 *   "12:00 AM"            -> 0:00 (midnight)
 *   "12:00 PM"            -> 12:00 (noon)
 *   "8:00"    (no AM/PM)  -> 8:00  - a bare hour/minute with no suffix is
 *   "12:00"   (no AM/PM)  -> 12:00   read as literal 24-hour time, so "8:00"
 *   "20:00"   (no AM/PM)  -> 20:00   is 8am and "12:00" is noon - only an
 *                                    explicit "12:00 AM" means midnight
 *   "24:00"   (no AM/PM)  -> 0:00  - accepted as the end-of-day equivalent
 *                                    of midnight
 * Returns null if the text doesn't look like a time at all.
 */
export function parseHostTime(raw: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw.trim());
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (minute > 59) {
    return null;
  }

  if (meridiem === "AM") {
    if (hour < 1 || hour > 12) {
      return null;
    }
    hour = hour === 12 ? 0 : hour;
  } else if (meridiem === "PM") {
    if (hour < 1 || hour > 12) {
      return null;
    }
    hour = hour === 12 ? 12 : hour + 12;
  } else if (hour === 24 && minute === 0) {
    hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

/**
 * Combines a host-entered Date ("YYYY-MM-DD" or freeform text) and Time
 * (see parseHostTime) into an absolute instant, returned as an ISO UTC
 * string. Both are interpreted in whatever timezone the host's own PC is
 * set to - the `new Date(y, m, d, h, mi)` constructor always builds a Date
 * from local time components, so this naturally captures "8pm where the
 * host is," not "8pm UTC." Every viewer's own app then converts that same
 * instant back to *their* local time for display (see
 * formatScheduledInstant) - no timezone picker needed on either end.
 *
 * Returns undefined if the time couldn't be parsed - a scheduled time is
 * optional, so "couldn't parse it" degrades to "not scheduled" rather than
 * blocking the post.
 */
export function computeScheduledAtUtc(dateStr: string, timeStr: string): string | undefined {
  const time = parseHostTime(timeStr);
  if (!time) {
    return undefined;
  }

  const isoMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year: number;
  let month: number;
  let day: number;
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]) - 1;
    day = Number(isoMatch[3]);
  } else {
    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) {
      return undefined;
    }
    year = parsedDate.getFullYear();
    month = parsedDate.getMonth();
    day = parsedDate.getDate();
  }

  const localInstant = new Date(year, month, day, time.hour, time.minute, 0, 0);
  if (Number.isNaN(localInstant.getTime())) {
    return undefined;
  }
  return localInstant.toISOString();
}

/**
 * Formats an absolute instant (see computeScheduledAtUtc) for display,
 * converting it to the *viewer's* own local time and calendar day - this is
 * what makes the schedule timezone-aware: the host's "8:00 PM" and a
 * joining pilot six timezones away both read a correct, correctly-labeled
 * time for their own clock, computed from the same underlying instant.
 */
export function formatScheduledInstant(utcIso: string): string | null {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const dayLabel = formatRelativeDay(date);
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel} · ${timeLabel}`;
}
