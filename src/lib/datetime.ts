/*
 * Every date and time on screen goes through these helpers, in the viewer's timezone.
 *
 * The API sends timestamps as ISO 8601 UTC ("2026-11-07T04:30:00Z"). Calendar dates
 * without a time ("2026-11-07": a leave day, a joining date) are shown as they are and
 * never shifted between timezones.
 *
 * The viewer's timezone comes from /auth/me (own setting, else the company's) and is set
 * by the AuthProvider with setViewerTimeZone(). Before sign-in the browser's is used.
 */

type DateInput = string | number | Date | null | undefined;

const LOCALE = "en-IN";
let viewerTz: string | undefined;

/** Current IANA names for the legacy ones some browsers still report. */
const LEGACY_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv", "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

export function canonicalTimeZone(tz: string): string {
  return LEGACY_ZONES[tz] ?? tz;
}

export function browserTimeZone(): string {
  try {
    return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
  } catch {
    return "Asia/Kolkata";
  }
}

export function setViewerTimeZone(tz: string | null | undefined) {
  viewerTz = tz && isValidTimeZone(tz) ? tz : undefined;
}

export function viewerTimeZone(): string {
  return viewerTz ?? browserTimeZone();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** True when two timezone names are the same zone (e.g. Asia/Calcutta and Asia/Kolkata). */
export function sameTimeZone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const canon = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
    return canon(a) === canon(b);
  } catch {
    return false;
  }
}

/** All IANA timezones the browser knows, for pickers. */
export function allTimeZones(): string[] {
  const withSupported = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const raw = withSupported.supportedValuesOf?.("timeZone") ?? ["Asia/Kolkata", "UTC"];
  const list = Array.from(new Set(raw.map(canonicalTimeZone))).sort();
  return list.includes("UTC") ? list : [...list, "UTC"];
}

/** "GMT+5:30" style offset of a timezone right now. */
export function timeZoneOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(at).find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return new Date(value);
  // A timestamp without a zone from an older endpoint is UTC.
  const s = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmt(value: DateInput, options: Intl.DateTimeFormatOptions, tz?: string): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    // calendar date: format at noon UTC in UTC so it never moves a day
    const d = new Date(`${value}T12:00:00Z`);
    return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(d);
  }
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: tz ?? viewerTimeZone() }).format(d);
}

/** 7 Nov 2026 */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}, tz?: string): string {
  return fmt(value, { day: "numeric", month: "short", year: "numeric", ...options }, tz);
}

/** 7 Nov (no year) */
export function formatDayMonth(value: DateInput, tz?: string): string {
  return fmt(value, { day: "numeric", month: "short" }, tz);
}

/** Saturday, 7 November */
export function formatLongDate(value: DateInput, tz?: string): string {
  return fmt(value, { weekday: "long", day: "numeric", month: "long" }, tz);
}

/** November 2026 */
export function formatMonth(value: DateInput, tz?: string): string {
  return fmt(value, { month: "long", year: "numeric" }, tz);
}

/** 10:30 am */
export function formatTime(value: DateInput, tz?: string): string {
  return fmt(value, { hour: "numeric", minute: "2-digit", hour12: true }, tz);
}

/** 7 Nov 2026, 10:30 am */
export function formatDateTime(value: DateInput, tz?: string): string {
  return fmt(value, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }, tz);
}

/** "just now", "5 minutes ago", "in 2 days", then the date for anything older than a week. */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "";
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}

/** Today's calendar date (YYYY-MM-DD) in the viewer's timezone. */
export function todayISO(tz?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? viewerTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Hour of the day (0-23) in the viewer's timezone, e.g. for a greeting. */
export function currentHour(tz?: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz ?? viewerTimeZone(), hour: "2-digit", hour12: false }).format(new Date())) % 24;
}
