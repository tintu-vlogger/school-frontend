"use client";

/*
 * MasterSelect: pick from a company master list (Masters settings) by its key.
 *
 *   <MasterSelect type="blood_group" value={id} onChange={(id, opt) => ...} clearable />
 *   <MasterSelect type="skill_category" multiple value={ids} onChange={(ids) => ...} />
 *   <MasterSelect type="exit_reason" parentId={resignationId} ... />   // only sub-values of one parent
 *
 * Values are master value ids (numbers). Searches /masters/options/{type} as you type,
 * resolves labels of saved ids with ?ids=, shows the parent of sub-values as a hint, and
 * (for people who can edit masters; default: admins) offers "Add “typed text”" which
 * creates the value in the list and selects it.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { MultiSelect, Select, type SelectOption } from "./select";

type MasterOption = { value: number; label: string; code?: string | null; parent_id?: number | null; parent_label?: string | null; active?: boolean };
type OptionsResponse = { type: { key: string; name: string; hierarchical: boolean }; items: MasterOption[] };

type Common = {
  /** Master list key, e.g. "blood_group". */
  type: string;
  /** Only values under this parent (hierarchical lists). */
  parentId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Show "Add “text”" to create a missing value. Defaults to true for admins. */
  allowCreate?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

export type MasterSelectProps =
  | (Common & { multiple?: false; value: number | null; onChange: (value: number | null, option: SelectOption<number> | null) => void; clearable?: boolean })
  | (Common & { multiple: true; value: number[]; onChange: (value: number[], options: SelectOption<number>[]) => void; clearable?: never });

const toOption = (o: MasterOption): SelectOption<number> => ({
  value: o.value,
  label: o.label,
  description: o.parent_label ? `in ${o.parent_label}` : undefined,
});

/** Resolve labels for saved master value ids (any list). Returns a map id -> option. */
export function useMasterLabels(type: string | null | undefined, ids: number[]) {
  const key = ids.filter((n) => Number.isFinite(n)).sort((a, b) => a - b).join(",");
  const [state, setState] = useState<{ key: string; map: Map<number, SelectOption<number>> } | null>(null);
  useEffect(() => {
    if (!type || !key) return;
    let live = true;
    api.getCached<OptionsResponse>(`/masters/options/${encodeURIComponent(type)}?ids=${key}&limit=200`, 60)
      .then((r) => { if (live) setState({ key: `${type}:${key}`, map: new Map((r?.items ?? []).map((o) => [o.value, toOption(o)])) }); })
      .catch(() => { if (live) setState({ key: `${type}:${key}`, map: new Map() }); });
    return () => { live = false; };
  }, [type, key]);
  return state && state.key === `${type}:${key}` ? state.map : null;
}

export function MasterSelect(props: MasterSelectProps) {
  const { type, parentId, placeholder, disabled, invalid, id, className } = props;
  const { user } = useAuth();
  const toast = useToast();
  const canCreate = props.allowCreate ?? user?.role === "admin";
  const ids = useMemo(() => (props.multiple ? props.value : props.value != null ? [props.value] : []), [props.multiple, props.value]);
  const resolved = useMasterLabels(type, ids);

  const loadOptions = async (q: string) => {
    const qs = new URLSearchParams({ limit: "30" });
    if (q) qs.set("q", q);
    if (parentId != null) qs.set("parent_id", String(parentId));
    const r = await api.get<OptionsResponse>(`/masters/options/${encodeURIComponent(type)}?${qs}`);
    return (r?.items ?? []).map(toOption);
  };

  const onCreate = canCreate ? async (text: string) => {
    try {
      const v = await api.post<{ id: number; label: string; parent_label?: string | null }>(
        `/masters/types/${encodeURIComponent(type)}/values`, { label: text, parent_id: parentId ?? null });
      toast.success(`“${v.label}” added to the list`);
      return { value: v.id, label: v.label, description: v.parent_label ? `in ${v.parent_label}` : undefined };
    } catch (e: unknown) {
      toast.error("Couldn't add the value", { description: e instanceof Error ? e.message : undefined });
      return null;
    }
  } : undefined;

  const common = { loadOptions, onCreate, placeholder, disabled, invalid, id, className, "aria-label": props["aria-label"] };
  if (props.multiple) {
    const selectedOptions = props.value.map((v) => resolved?.get(v)).filter((o): o is SelectOption<number> => !!o);
    return <MultiSelect<number> {...common} value={props.value} onChange={props.onChange} selectedOptions={selectedOptions} />;
  }
  const selectedOption = props.value != null ? resolved?.get(props.value) ?? null : null;
  return <Select<number> {...common} value={props.value} onChange={props.onChange} clearable={props.clearable} selectedOption={selectedOption} />;
}
