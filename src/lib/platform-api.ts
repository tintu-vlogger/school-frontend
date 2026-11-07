"use client";

import { API_BASE } from "@/lib/api";

/** Client for the platform area (admins and marketing executives). Its token is
 *  stored apart from company logins and never carries a company slug. */
const KEY = "hrms_platform_token";

export type PlatformUser = {
  id: number; name: string; email: string; phone: string | null; role: "admin" | "executive";
  ref_code: string | null; upi_id: string | null; is_active: boolean; last_login_at: string | null; created_at: string | null;
};

export const platformToken = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(KEY)),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

async function request<T>(path: string, options: RequestInit = {}, loginPath = "/admin/login"): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((options.headers as Record<string, string>) || {}) };
  const token = platformToken.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(`${API_BASE}/platform${path}`, { ...options, headers }); }
  catch { throw new Error("Unable to connect to the server."); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      platformToken.clear();
      if (typeof window !== "undefined" && !window.location.pathname.endsWith("/login")) window.location.href = loginPath;
    }
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export function platformApi(loginPath: string) {
  return {
    get: <T,>(path: string) => request<T>(path, {}, loginPath),
    post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, loginPath),
    put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, loginPath),
  };
}

export const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
