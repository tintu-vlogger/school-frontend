"use client";

/*
 * Custom services as menu entries: each service the person may use shows under the
 * section chosen for it (Home by default). Used by the app shell.
 *   const extra = useServiceNav(signedIn);   visibleSections(access, extra)
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ExtraPage } from "@/lib/hr-nav";
import { serviceIcon } from "./icons";
import type { NavService } from "./types";

export function useServiceNav(enabled: boolean): ExtraPage[] {
  const [items, setItems] = useState<ExtraPage[]>([]);
  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    let live = true;
    const load = () => api.getCached<NavService[]>("/custom-forms/nav", 60)
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        setItems(rows.map((s) => ({ label: s.name, href: `/dashboard/services/${s.code}`, icon: serviceIcon(s.icon), sectionKey: s.nav_section || "home" })));
      }).catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    return () => { live = false; clearInterval(t); };
  }, [enabled]);
  return items;
}
