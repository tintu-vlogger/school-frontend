"use client";

/*
 * Who something is for: everyone, or chosen groups (department, location, team, tag,
 * employment type, designation, role or specific people), matching any or all groups.
 *   <AudiencePicker value={audience} onChange={setAudience} />
 * Shows how many people are in the audience as you change it.
 */
import { useEffect, useState } from "react";
import { Globe2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { MultiSelect, RadioCards, type SelectOption } from "@/components/ui-kit";
import type { Audience, AudienceGroup } from "./types";

let groupsCache: AudienceGroup[] | null = null;

export function useAudienceGroups() {
  const [groups, setGroups] = useState<AudienceGroup[] | null>(groupsCache);
  useEffect(() => {
    if (groupsCache) return;
    api.get<AudienceGroup[]>("/engagement/audience/groups").then((g) => { groupsCache = g; setGroups(g); }).catch(() => setGroups([]));
  }, []);
  return groups;
}

export function AudiencePicker({ value, onChange, everyoneLabel = "Everyone in the company" }: {
  value: Audience; onChange: (a: Audience) => void; everyoneLabel?: string;
}) {
  const groups = useAudienceGroups();
  const everyone = !value || value.all || !value.rules || Object.keys(value.rules).length === 0;
  const [mode, setMode] = useState<"all" | "groups">(everyone ? "all" : "groups");
  const [preview, setPreview] = useState<{ count: number; label: string } | null>(null);
  const [labels, setLabels] = useState<Record<string, SelectOption<string>[]>>({});
  const rules = value?.rules ?? {};

  useEffect(() => {
    const t = setTimeout(() => {
      api.post<{ count: number; label: string }>("/engagement/audience/preview", { audience: mode === "all" ? { all: true } : value })
        .then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [value, mode]);

  // labels for chosen specific people
  useEffect(() => {
    const ids = rules.employee ?? [];
    if (!ids.length || labels.employee) return;
    api.get<{ value: number; label: string }[]>(`/employees/lookup?ids=${ids.join(",")}`)
      .then((rows) => setLabels((l) => ({ ...l, employee: rows.map((r) => ({ value: String(r.value), label: r.label })) }))).catch(() => {});
  }, [rules.employee, labels.employee]);

  function setRule(key: string, vals: string[]) {
    const next = { ...rules, [key]: vals };
    if (!vals.length) delete next[key];
    onChange({ match: value?.match ?? "any", rules: next });
  }

  return (
    <div className="space-y-4">
      <RadioCards
        columns={2}
        value={mode}
        onChange={(m) => { setMode(m); if (m === "all") onChange({ all: true }); else onChange({ match: "any", rules: {} }); }}
        options={[
          { value: "all", label: everyoneLabel, icon: Globe2 },
          { value: "groups", label: "Chosen groups", description: "Departments, locations, teams, tags…", icon: Users },
        ]}
      />
      {mode === "groups" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          {(groups ?? []).map((g) => (
            <div key={g.key} className="grid gap-1.5 sm:grid-cols-[140px_1fr] sm:items-center">
              <span className="text-[13px] text-muted">{g.label}</span>
              {g.available ? (
                <MultiSelect<string>
                  value={rules[g.key] ?? []}
                  onChange={(v) => setRule(g.key, v)}
                  options={g.searchable ? undefined : g.options}
                  loadOptions={g.searchable ? async (q) => (await api.get<{ value: string; label: string }[]>(`/engagement/audience/options?key=${g.key}&q=${encodeURIComponent(q)}`)) : undefined}
                  selectedOptions={labels[g.key]}
                  placeholder={g.searchable ? "Search people" : `Any ${g.label.toLowerCase()}`}
                  aria-label={g.label}
                />
              ) : <span className="text-[12.5px] text-faint">{g.hint}</span>}
            </div>
          ))}
          {Object.keys(rules).length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px] text-muted">
              People must be in
              {(["any", "all"] as const).map((m) => (
                <button key={m} type="button" onClick={() => onChange({ ...value, match: m })}
                  className={`rounded-full border px-3 py-1 ${(value.match ?? "any") === m ? "border-primary/40 bg-primary-soft text-primary" : "border-line hover:border-line-strong"}`}>
                  {m === "any" ? "any of these groups" : "all of these groups"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {preview && (
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Users size={14} strokeWidth={1.5} /> {preview.count} {preview.count === 1 ? "person" : "people"}
          {mode === "groups" && preview.label !== "Everyone" ? ` · ${preview.label}` : ""}
        </p>
      )}
    </div>
  );
}

export function audienceIsEveryone(a: Audience | null | undefined) {
  return !a || a.all || !a.rules || Object.keys(a.rules).length === 0;
}
