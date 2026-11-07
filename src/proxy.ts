import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAINS = (
  process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app"]);

function extractSubdomain(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname === root) return null;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      if (!sub || RESERVED_SUBDOMAINS.has(sub)) return null;
      if (sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}

// Backend address for server-side calls. In Docker the browser address (localhost:8001)
// isn't reachable from this server, so API_INTERNAL_URL points at the backend service.
const API_SERVER = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";

// slug -> (exists, checked at). Known companies are re-checked every minute, unknown ones
// every 15 s, so a newly created company shows up quickly and a removed one disappears.
const companyCache = new Map<string, { exists: boolean; at: number }>();

async function companyExists(slug: string): Promise<boolean> {
  const hit = companyCache.get(slug);
  const now = Date.now();
  if (hit && now - hit.at < (hit.exists ? 60_000 : 15_000)) return hit.exists;
  try {
    const res = await fetch(`${API_SERVER}/public/companies/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.status === 404) { companyCache.set(slug, { exists: false, at: now }); return false; }
    if (res.ok) companyCache.set(slug, { exists: true, at: now });
    return true; // other errors: don't block the company over a backend hiccup
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const slug = extractSubdomain(request.headers.get("host"));
  const { pathname } = request.nextUrl;

  if (!slug) return NextResponse.next();

  // No company at this address: every page on it is the "Company not found" page (404).
  if (!(await companyExists(slug))) {
    const url = request.nextUrl.clone();
    url.pathname = "/company-not-found";
    url.search = "";
    return NextResponse.rewrite(url, { status: 404 });
  }

  // Registration is apex-only: new companies can't be created from a subdomain.
  if (pathname === "/register" || pathname.startsWith("/register/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-company-slug", slug);

  // The company's own address opens its organisation website (with an employee sign-in).
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site";
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|icon.png|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
