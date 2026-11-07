import "./help-demo/demo-fetch"; // sample data for help previews (?demo=1 inside the help frame), never live data
export const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

/** Convert a backend-returned image URL to something the browser can load.
 *  Absolute URLs (http://, https://, data:) are returned as-is.
 *  Relative URLs starting with "/api/v1/..." are prefixed with the API origin. */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:)/i.test(url)) return url;
  if (url.startsWith("/api/v1/")) {
    // API_BASE already contains .../api/v1 — strip /api/v1 from path and concat.
    const origin = API_BASE.replace(/\/api\/v1\/?$/, "");
    return `${origin}${url}`;
  }
  return url;
}

const ROOT_DOMAINS = (
  process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app"]);

function getCompanySlugFromHost(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname === root) return null;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      if (!sub || RESERVED_SUBDOMAINS.has(sub) || sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}

/** Move this browser session to the company's own address (e.g. after its slug
 *  changed). localStorage is per address, so the token travels in the URL to
 *  /auth/callback, which stores it and continues to `path`. */
export function moveToCompanyHost(slug: string, token: string, path?: string): boolean {
  if (typeof window === "undefined" || !slug) return false;
  const current = getCompanySlugFromHost();
  if (current === slug) return false;
  const { protocol, hostname, port, pathname, search } = window.location;
  const root = ROOT_DOMAINS.find((r) => hostname === r || hostname.endsWith(`.${r}`));
  if (!root) return false;
  const next = path || (pathname.startsWith("/onboarding") ? "/dashboard" : pathname + search);
  window.location.replace(`${protocol}//${slug}.${root}${port ? `:${port}` : ""}/auth/callback?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(next)}`);
  return true;
}

let movingHost = false;

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("hrms_token");
  }

  setToken(token: string) {
    localStorage.setItem("hrms_token", token);
  }

  clearToken() {
    localStorage.removeItem("hrms_token");
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const companySlug = getCompanySlugFromHost();
    // The backend still names this header after its original route; it carries the company slug.
    if (companySlug) headers["X-Company-Slug"] = companySlug;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
      throw new Error("Unable to connect to server. Please check your connection and try again.");
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ detail: "Something went wrong. Please try again." }));
      let message = typeof errorBody.detail === "string" ? errorBody.detail : `Request failed (${res.status})`;
      // A read the person's role doesn't allow: say so plainly instead of showing the raw reason.
      if (res.status === 403 && (!options.method || options.method === "GET") && /^Permission denied|Admin access required/.test(message)) {
        message = "You don't have access to this.";
      }

      // Signed in to this company but on another company's address (typically the
      // company's web address changed during onboarding or in settings): find
      // the company's current address and continue there instead of erroring.
      if (res.status === 403 && message === "Token does not belong to this company" && token && !movingHost) {
        movingHost = true;
        try {
          const r = await fetch(`${API_BASE}/company/profile`, { headers: { Authorization: `Bearer ${token}` } });
          const p = r.ok ? await r.json() : null;
          if (p?.slug && moveToCompanyHost(p.slug, token)) return new Promise<T>(() => {});
        } catch { /* fall through to the error */ }
        movingHost = false;
      }

      // The company was removed or disabled while someone was using it: every page shows
      // the full-page message (see AuthProvider) instead of erroring or spinning.
      if (typeof window !== "undefined" && /does not exist|has been disabled/i.test(message) && !path.startsWith("/auth/login")) {
        this.clearToken();
        window.dispatchEvent(new CustomEvent("company-blocked", { detail: /does not exist/i.test(message) ? "gone" : "disabled" }));
        throw new Error(message);
      }

      // Only redirect on 401 if this is NOT an auth endpoint (login/register)
      // For auth endpoints, just throw the error so the form can display it
      if (res.status === 401 && !path.startsWith("/auth/")) {
        this.clearToken();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }

      throw new Error(message);
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) {
    const p = this.request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    p.finally(() => this._invalidatePrefix(path)).catch(() => { /* the caller handles the error */ });
    return p;
  }
  put<T>(path: string, body?: unknown) {
    const p = this.request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
    p.finally(() => this._invalidatePrefix(path)).catch(() => { /* the caller handles the error */ });
    return p;
  }
  patch<T>(path: string, body?: unknown) {
    const p = this.request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
    p.finally(() => this._invalidatePrefix(path)).catch(() => { /* the caller handles the error */ });
    return p;
  }
  delete<T>(path: string) {
    const p = this.request<T>(path, { method: "DELETE" });
    p.finally(() => this._invalidatePrefix(path)).catch(() => { /* the caller handles the error */ });
    return p;
  }

  // ── In-memory stale-while-revalidate cache ──────────────────────
  // Pages that re-mount on navigation can call `api.getCached(path, ttlSec)` to
  // get the fresh-enough value immediately and let the refresh happen in the
  // background. Invalidate for a specific path with `api.invalidate(path)` or
  // clear everything with `api.invalidate()`.
  private cache = new Map<string, { ts: number; data: unknown; inflight?: Promise<unknown> }>();

  async getCached<T>(path: string, ttlSec: number = 30): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(path);
    if (entry && now - entry.ts < ttlSec * 1000) {
      return entry.data as T;
    }
    if (entry?.inflight) return entry.inflight as Promise<T>;
    const inflight = this.request<T>(path).then((data) => {
      this.cache.set(path, { ts: Date.now(), data });
      return data;
    }).catch((err) => {
      // If we have stale data, return it — otherwise re-throw.
      if (entry) { this.cache.set(path, { ts: entry.ts, data: entry.data }); return entry.data as T; }
      throw err;
    });
    this.cache.set(path, { ts: entry?.ts ?? 0, data: entry?.data, inflight });
    return inflight;
  }

  invalidate(path?: string) {
    if (!path) { this.cache.clear(); return; }
    this.cache.delete(path);
  }

  /** Internal: after a POST/PUT/DELETE to /foo/bar, drop any cached GET whose
   *  path starts with /foo so the next read hits the backend. */
  private _invalidatePrefix(path: string) {
    const root = "/" + path.replace(/^\//, "").split("/")[0];
    for (const key of this.cache.keys()) {
      if (key === root || key.startsWith(root + "/") || key.startsWith(root + "?")) {
        this.cache.delete(key);
      }
    }
  }
}

export const api = new ApiClient();

