"use client";
import { useEffect } from "react";

/** Open on the tab named in the address (?tab=...), e.g. from a help guide or a shared link. */
export function useUrlTab<T extends string>(valid: readonly T[], setTab: (t: T) => void, param = "tab") {
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get(param) as T | null;
    if (t && valid.includes(t)) setTimeout(() => setTab(t), 0);
    // run once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
