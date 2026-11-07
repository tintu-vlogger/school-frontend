/*
 * Sample-data mode for help previews.
 *
 * When a page is opened with ?demo=1 inside the help frame, every request to the API is answered
 * from /help-demo/fixtures.json instead of the server: the company's own data is never loaded,
 * and saves, changes and deletes do nothing. Dates in the sample data move forward so "today"
 * always looks current. Only works inside a frame (never in the app itself).
 *
 * The fixtures are recorded from the demo company with scripts/help-record.mjs. When a page
 * changes, update its guide (components/help/topics) and record again.
 */

export const BASE_DATE = "2026-11-07"; // the day the sample data was recorded
const KEY = "hrms-help-demo";

function demoWanted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self === window.top) return false;           // only inside the help frame
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("demo") === "1") { sessionStorage.setItem(KEY, "1"); return true; }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const DEMO = demoWanted();

type Fixtures = Record<string, unknown>;
let fixtures: Promise<Fixtures> | null = null;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const shape = (p: string) => p.replace(UUID, ":id").replace(/\/\d+(?=\/|$|\?)/g, "/:n");

function dayDelta(): number {
  const base = new Date(BASE_DATE + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - base.getTime()) / 86400000);
}
function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftAll<T>(v: T, days: number): T {
  if (!days) return v;
  if (typeof v === "string") return v.replace(/\b(20\d{2}-\d{2}-\d{2})/g, (m) => shiftDate(m, days)) as T;
  if (Array.isArray(v)) return v.map((x) => shiftAll(x, days)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftAll(x, days)])) as T;
  return v;
}

function lookup(fx: Fixtures, path: string): unknown {
  const days = dayDelta();
  const asked = shiftAll(path, -days);                    // dates asked for today = the recorded day
  if (asked in fx) return fx[asked];
  const bare = (p: string) => p.replace(/\/+(\?|$)/, "$1");
  const askedBare = bare(asked);
  const exact = Object.keys(fx).find((k) => bare(k) === askedBare);
  if (exact) return fx[exact];
  const pathname = bare(asked.split("?")[0]);
  const noQuery = Object.keys(fx).find((k) => bare(k.split("?")[0]) === pathname);
  if (noQuery) return fx[noQuery];
  const want = shape(pathname);
  const sameShape = Object.keys(fx).find((k) => shape(bare(k.split("?")[0])) === want);
  if (sameShape) return fx[sameShape];
  return /\/$|s$|s\/|list|search|history|log/.test(pathname) ? [] : {};
}

function install() {
  const API = process.env.NEXT_PUBLIC_API_URL || "";
  const real = window.fetch.bind(window);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!API || !url.startsWith(API)) return real(input, init);
    const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();
    if (method !== "GET") return reply({ ok: true, demo: true });
    fixtures ||= real("/help-demo/fixtures.json").then((r) => r.json()).catch(() => ({}));
    const fx = await fixtures;
    return reply(shiftAll(lookup(fx, url.slice(API.length)), dayDelta()));
  };
  // live connections stay quiet in sample mode
  if (typeof window.EventSource === "function") {
    window.EventSource = function () { return { close() {}, addEventListener() {}, removeEventListener() {}, readyState: 2 }; } as unknown as typeof EventSource;
  }
}

if (DEMO) install();
