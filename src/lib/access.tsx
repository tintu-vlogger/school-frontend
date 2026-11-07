"use client";

/*
 * What the signed-in person may use, from /roles/my-permissions. Loaded once per sign-in
 * and kept for the session (and in sessionStorage so a reload draws the menu at once);
 * the navigation, the route guard and pages read it through useAccess().
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Access } from "./hr-nav";

export type MyPermissions = {
  role: string;
  roles: string[];
  permissions: string[];
  scopes: Record<string, string>;
  field_access: Record<string, "hidden" | "masked" | "full">;
  is_owner: boolean;
  employee_id: number | null;
  is_manager: boolean;
};

type AccessState = Access & {
  ready: boolean;
  role: string;
  scopes: Record<string, string>;
  fieldAccess: Record<string, "hidden" | "masked" | "full">;
  /** True when the person holds any of the permissions. */
  can: (...perms: string[]) => boolean;
  reload: () => void;
};

const STORE = "hrms_access";
let memo: { key: string; data: MyPermissions } | null = null;

function readStored(key: string): MyPermissions | null {
  if (memo?.key === key) return memo.data;
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; data: MyPermissions };
    return parsed.key === key ? parsed.data : null;
  } catch {
    return null;
  }
}

function store(key: string, data: MyPermissions) {
  memo = { key, data };
  try { sessionStorage.setItem(STORE, JSON.stringify({ key, data })); } catch { /* storage blocked */ }
}

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // One cache entry per signed-in identity (a role change needs a new sign-in or reload()).
  const key = user ? `${user.company_id}:${user.email}:${user.employee_id ?? "-"}:${user.role}` : "";
  // A reload draws the menu from the stored copy at once (the browser only; the server
  // renders the loading screen anyway while the sign-in is checked).
  const [data, setData] = useState<MyPermissions | null>(() => (typeof window !== "undefined" && key ? readStored(key) : null));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) { setData(null); return; }
    const cached = tick === 0 ? readStored(key) : null;
    if (cached) { setData(cached); return; }
    let live = true;
    api.get<MyPermissions>("/roles/my-permissions")
      .then((d) => { if (!live) return; store(key, d); setData(d); })
      .catch(() => {
        // Never lock people out over a network blip: fall back to the role alone.
        if (!live || !user) return;
        setData({ role: user.role, roles: [user.role], permissions: [], scopes: {}, field_access: {},
          is_owner: false, employee_id: user.employee_id ?? null, is_manager: false });
      });
    return () => { live = false; };
  }, [key, tick, user]);

  const value = useMemo<AccessState>(() => {
    const perms = new Set(data?.permissions ?? []);
    const isAdmin = (data?.role ?? user?.role) === "admin";
    return {
      ready: !!data,
      role: data?.role ?? user?.role ?? "employee",
      permissions: perms,
      isAdmin,
      isOwner: !!data?.is_owner,
      hasEmployee: !!(data?.employee_id ?? user?.employee_id),
      isManager: !!data?.is_manager,
      scopes: data?.scopes ?? {},
      fieldAccess: data?.field_access ?? {},
      can: (...p: string[]) => isAdmin || p.some((x) => perms.has(x)),
      reload: () => {
        memo = null;
        try { sessionStorage.removeItem(STORE); } catch { /* storage blocked */ }
        setTick((t) => t + 1);
      },
    };
  }, [data, user]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside the app shell");
  return ctx;
}
