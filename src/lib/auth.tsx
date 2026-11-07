"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";
import { browserTimeZone, sameTimeZone, setViewerTimeZone } from "./datetime";
import CompanyNotFound from "@/components/company-not-found";
import { ForcePasswordChange } from "@/components/account/force-password";

export interface AuthUser {
  email: string;
  role: string;
  company_id: number;
  company_name: string;
  full_name: string;
  slug?: string;
  /** false until the company has a name and a web address (then every page goes to onboarding) */
  setup_complete?: boolean;
  /** The signed-in person's employee record (the company owner has one too). */
  employee_id?: number | null;
  /** The company owner (full admin rights, signs in with the company's email). */
  is_owner?: boolean;
  employee_uuid?: string | null;
  /** Company feature flags, e.g. { advanced: true } turns on extra modules. */
  features?: { advanced?: boolean } | null;
  /** Effective timezone: own setting, else the company's. All times are shown in it. */
  timezone?: string;
  timezone_source?: "own" | "company";
  company_timezone?: string;
  /** Parent / student portal sign-ins (role "parent" or "student"); null for staff. */
  portal_id?: number | null;
  student_id?: number | null;
  guardian_id?: number | null;
  /** A portal account signed in with the one-time password it was given: it must choose its own. */
  must_change_password?: boolean;
  subscription?: { plan: string; paid?: boolean; whatsapp?: boolean; status: "active" | "trial" | "grace" | "expired"; trial_ends_at: string | null; paid_until: string | null; days_left: number | null; plan_name?: string } | null;
}

const ROOT_DOMAINS = (
  process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app"]);

function getCurrentSubdomain(): string | null {
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

function getRootDomainForHost(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname.endsWith(`.${root}`)) return root;
  }
  return null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ access_token: string; user: AuthUser }>;
  logout: () => void;
  /** Reload the signed-in person (after changing name, timezone, ...). */
  refresh: () => Promise<void>;
  /** The browser's timezone when it differs from the saved one and the person has not
   *  chosen their own yet; the app offers to save it. Null otherwise. */
  timezoneSuggestion: string | null;
  dismissTimezoneSuggestion: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  industry?: string;
  ref_code?: string;
  /** school, preschool, college, university, coaching, training */
  institution_type?: string;
  /** approximate number of learners, e.g. "101-500" */
  learners?: string;
  country?: string;
  timezone?: string;
  phone?: string;
  /** the web address (sub-domain) asked for */
  slug?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [tzDismissed, setTzDismissed] = useState(false);
  const setUser = (u: AuthUser | null) => {
    setViewerTimeZone(u?.timezone);
    setUserState(u);
  };
  const [loading, setLoading] = useState(true);
  // set when the server says this company was removed ("gone") or disabled; replaces every page
  const [blocked, setBlocked] = useState<"gone" | "disabled" | null>(null);
  useEffect(() => {
    const on = (e: Event) => setBlocked((e as CustomEvent<"gone" | "disabled">).detail);
    window.addEventListener("company-blocked", on);
    return () => window.removeEventListener("company-blocked", on);
  }, []);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("hrms_token");
    if (token) {
      // A server restart or a network blip must not log anyone out: only a real
      // auth failure clears the session; anything else is retried for a while.
      let attempts = 0;
      const check = () => {
        api.get<AuthUser>("/auth/me")
          .then((u) => { setUser(u); setLoading(false); })
          .catch((err) => {
            const msg = String(err?.message || "");
            // the company was removed or disabled: no retrying, show the full-page message
            if (/does not exist|has been disabled/i.test(msg)) {
              api.clearToken();
              setBlocked(/does not exist/i.test(msg) ? "gone" : "disabled");
              setUser(null);
              setLoading(false);
              return;
            }
            const authFailure = msg.includes("401") || msg.includes("Invalid token") || msg.includes("Not authenticated");
            if (authFailure) {
              api.clearToken();
              setUser(null);
              setLoading(false);
              return;
            }
            attempts += 1;
            if (attempts < 20) setTimeout(check, 3000); // keep the session; try again shortly
            else { setUser(null); setLoading(false); }
          });
      };
      check();
    } else {
      setLoading(false);
    }
  }, []);

  // Redirect to login if accessing dashboard without auth
  useEffect(() => {
    if (!loading && !user && pathname?.startsWith("/dashboard")) {
      router.push("/login");
    }
  }, [loading, user, pathname, router]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: AuthUser }>("/auth/login", { email, password });
    api.setToken(res.access_token);
    setUser(res.user);

    // Apex owner login → bounce to their own subdomain so the rest of the
    // session happens on the company's URL.
    const currentSub = getCurrentSubdomain();
    const root = getRootDomainForHost();
    if (!currentSub && root && res.user.slug) {
      const proto = window.location.protocol;
      const port = window.location.port ? `:${window.location.port}` : "";
      // Pass token via a short-lived callback so the new origin can pick it up.
      window.location.href = `${proto}//${res.user.slug}.${root}${port}/auth/callback?token=${encodeURIComponent(res.access_token)}&redirect=/dashboard`;
    }
  };

  const register = async (data: RegisterData) => {
    const res = await api.post<{ access_token: string; user: AuthUser }>("/auth/register", data);
    api.setToken(res.access_token);
    setUser(res.user);
    return res;
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    router.push("/login");
  };

  const refresh = async () => {
    const u = await api.get<AuthUser>("/auth/me");
    setUser(u);
  };

  // First sign-in on a device in another timezone: offer to save the browser's zone.
  const browserTz = typeof window === "undefined" ? null : browserTimeZone();
  let dismissed = tzDismissed;
  if (!dismissed && typeof window !== "undefined" && browserTz) {
    try { dismissed = localStorage.getItem("hrms_tz_dismissed") === browserTz; } catch { /* storage blocked */ }
  }
  const timezoneSuggestion =
    user && browserTz && user.timezone_source !== "own" && user.timezone && !sameTimeZone(browserTz, user.timezone) && !dismissed ? browserTz : null;
  const dismissTimezoneSuggestion = () => {
    try { if (browserTz) localStorage.setItem("hrms_tz_dismissed", browserTz); } catch { /* storage blocked */ }
    setTzDismissed(true);
  };

  if (blocked) return <CompanyNotFound variant={blocked} />;

  // Parents and students given a one-time password choose their own before anything else.
  const mustChange = !!(user?.must_change_password && pathname?.startsWith("/dashboard"));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, timezoneSuggestion, dismissTimezoneSuggestion }}>
      {mustChange ? <ForcePasswordChange /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
