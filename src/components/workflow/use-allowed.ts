"use client";

/*
 * Whether the signed-in person may use a settings screen, found by asking the API for
 * something only those people can read (a refusal means no access).
 *   const { ready, allowed } = useAllowed("/automation/meta");
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useAllowed(path: string): { ready: boolean; allowed: boolean } {
  const [state, setState] = useState({ ready: false, allowed: false });
  useEffect(() => {
    let live = true;
    api.get(path).then(() => live && setState({ ready: true, allowed: true }))
      .catch(() => live && setState({ ready: true, allowed: false }));
    return () => { live = false; };
  }, [path]);
  return state;
}
