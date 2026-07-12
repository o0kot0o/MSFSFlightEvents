function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
 * gracefully rather than show "Invalid Date".
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

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameCalendarDay(parsed, today)) {
    return "Today";
  }
  if (isSameCalendarDay(parsed, tomorrow)) {
    return "Tomorrow";
  }
  if (isSameCalendarDay(parsed, yesterday)) {
    return "Yesterday";
  }

  return parsed.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
