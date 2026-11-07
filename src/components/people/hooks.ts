"use client";

/*
 * Data hooks for the people module: organisation option lists (cached), the employee
 * picker loader and the full profile.
 *
 *   const { locations, departments } = useOrgOptions();          // SelectOption<number>[] each
 *   <Select loadOptions={lookupEmployees(excludeId)} ... />
 *   const { profile, reload, error } = useProfile(uuid, { self }); // GET /employees/{uuid}/profile or /me/profile/full
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SelectOption } from "@/components/ui-kit";
import type { Profile, TagRef } from "./types";

type Raw = Record<string, unknown>;

function useList(path: string, map: (r: Raw) => SelectOption<number> | null, ttl = 60) {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    let live = true;
    api.getCached<Raw[]>(path, ttl)
      .then((r) => { if (live) setOpts((Array.isArray(r) ? r : []).map(map).filter((x): x is SelectOption<number> => !!x)); })
      .catch(() => {});
    return () => { live = false; };
    // map is a stable module-level function per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ttl]);
  return opts;
}

const active = (r: Raw) => r.active !== false;
const byName = (key: string, hint?: string) => (r: Raw) => active(r)
  ? { value: Number(r.id), label: String(r[key]), description: hint && r[hint] ? String(r[hint]) : undefined } : null;

export function useOrgOptions() {
  return {
    locations: useList("/organization/locations", byName("name", "city")),
    entities: useList("/organization/legal-entities", byName("name")),
    grades: useList("/organization/grades", (r) => active(r) ? { value: Number(r.id), label: r.code ? `${r.code} · ${r.name}` : String(r.name) } : null),
    costCentres: useList("/organization/cost-centres", (r) => active(r) ? { value: Number(r.id), label: r.code ? `${r.code} · ${r.name}` : String(r.name) } : null),
    teams: useList("/organization/teams", byName("name")),
    departments: useList("/departments/", (r) => active(r) ? { value: Number(r.id), label: String(r.department_name), description: r.parent_name ? `in ${r.parent_name}` : undefined } : null),
    designations: useList("/designations/", (r) => ({ value: Number(r.id), label: String(r.designation_name), description: r.grade_name ? String(r.grade_name) : undefined })),
  };
}

export type TagOption = TagRef & { depth: number; path: string; active: boolean; usage?: number };

/** Tags ordered as a tree (parents first, children indented), for pickers and filters. */
export function useTags(entityType = "employees") {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<(TagRef & { active: boolean; usage: number; sort_order: number })[]>(`/organization/tags?entity_type=${entityType}`)
      .then((rows) => {
        if (!live) return;
        const kids = new Map<number | null, typeof rows>();
        for (const t of rows) {
          const k = t.parent_id ?? null;
          kids.set(k, [...(kids.get(k) ?? []), t]);
        }
        const out: TagOption[] = [];
        const walk = (parent: number | null, depth: number, path: string) => {
          for (const t of kids.get(parent) ?? []) {
            const p = path ? `${path} › ${t.name}` : t.name;
            out.push({ ...t, depth, path: p });
            walk(t.id, depth + 1, p);
          }
        };
        walk(null, 0, "");
        setTags(out);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [entityType, nonce]);
  return { tags, reload: () => setNonce((n) => n + 1) };
}

export const tagOptions = (tags: TagOption[]): SelectOption<number>[] =>
  tags.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name, description: t.depth ? t.path.split(" › ").slice(0, -1).join(" › ") : undefined }));

/** Async loader for employee pickers (GET /employees/lookup). */
export const lookupEmployees = (exclude?: number | null) => async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<{ value: number; label: string; hint?: string }[]>(`/employees/lookup?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).filter((e) => e.value !== exclude).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
};

export function useProfile(uuid: string | null, opts: { self?: boolean } = {}) {
  const [state, setState] = useState<{ key: string; profile: Profile | null; error?: string } | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${opts.self ? "me" : uuid}:${version}`;
  useEffect(() => {
    if (!uuid && !opts.self) return;
    let live = true;
    api.get<Profile>(opts.self ? "/me/profile/full" : `/employees/${uuid}/profile`)
      .then((p) => { if (live) setState({ key, profile: p }); })
      .catch((e) => { if (live) setState({ key, profile: null, error: e instanceof Error ? e.message : "Couldn't load" }); });
    return () => { live = false; };
  }, [uuid, opts.self, key]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // While reloading, keep showing the last profile of the same person (no flicker after a save).
  const current = state?.profile ?? null;
  const sameEmployee = !!current && (opts.self || current.uuid === uuid);
  return {
    profile: sameEmployee ? current : null,
    error: state?.key === key ? state.error : undefined,
    loading: state?.key !== key,
    reload,
    setProfile: (p: Profile) => setState({ key, profile: p }),
  };
}
