/*
 * Date + time in the viewer's timezone <-> UTC ISO, for meeting pickers.
 *   zonedToUtc("2026-11-12", "10:30")  -> "2026-11-12T05:00:00.000Z" (viewer in Asia/Kolkata)
 *   utcToZoned("2026-11-12T05:00:00Z") -> { date: "2026-11-12", time: "10:30" }
 */
import { viewerTimeZone } from "@/lib/datetime";

function partsIn(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function zonedToUtc(date: string, time: string, tz: string = viewerTimeZone()): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const [ph, pmin] = p.time.split(":").map(Number);
    const shown = Date.UTC(py, pm - 1, pd, ph, pmin);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

export function utcToZoned(iso: string, tz: string = viewerTimeZone()) {
  return partsIn(new Date(iso), tz);
}
