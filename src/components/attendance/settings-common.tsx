"use client";

/*
 * Versioned time settings (/attendance/settings/{key}): load, edit and save as a new
 * version from a date. <SettingPanel> wraps a form with the "applies from" date, the save
 * button and the version history.
 */
import { useEffect, useState, type ReactNode } from "react";
import { History, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Button, DateInput, Field, NumberInput, Skeleton, TextInput } from "@/components/ui-kit";
import { errorText } from "./shared";

export type Version = { uuid: string; version: number; effective_from: string; change_note: string | null; created_by_name: string | null; created_at: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Config = Record<string, any>;

export function useSetting(key: string) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<{ config: Config; versions: Version[] }>(`/attendance/settings/${key}`).then((r) => {
      if (!live) return;
      setConfig(r.config);
      setSaved(r.config);
      setVersions(r.versions);
    }).catch(() => {});
    return () => { live = false; };
  }, [key, nonce]);
  const set = (k: string, v: unknown) => setConfig((c) => ({ ...(c || {}), [k]: v }));
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  return { config, set, setConfig, versions, dirty, reload: () => setNonce((n) => n + 1) };
}

export function SettingPanel({
  settingKey, title, description, state, children,
}: {
  settingKey: string; title: string; description?: ReactNode; state: ReturnType<typeof useSetting>; children: ReactNode;
}) {
  const toast = useToast();
  const [from, setFrom] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/attendance/settings/${settingKey}`, { config: state.config, effective_from: from, note: note || null });
      toast.success(`Saved as a new version from ${formatDate(from)}`);
      setNote("");
      state.reload();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper className="mb-5">
      <PaperHeader title={title} action={state.versions.length > 0 && (
        <Button size="sm" variant="ghost" icon={History} onClick={() => setShowHistory((s) => !s)}>{state.versions.length} version{state.versions.length === 1 ? "" : "s"}</Button>
      )} />
      <div className="space-y-5 px-5 py-5">
        {description && <p className="max-w-2xl text-[13.5px] text-muted">{description}</p>}
        {state.config ? children : <Skeleton className="h-32 w-full" />}
        {showHistory && (
          <ul className="space-y-1.5 rounded-xl border border-line bg-sunken/40 px-4 py-3 text-[13px]">
            {state.versions.map((v) => (
              <li key={v.uuid} className="flex flex-wrap gap-x-3 text-muted">
                <span className="text-ink">Version {v.version}</span>
                <span>from {formatDate(v.effective_from)}</span>
                {v.change_note && <span>· {v.change_note}</span>}
                <span className="text-faint">· {v.created_by_name || "System"}, {formatDateTime(v.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-3.5">
        <Field label="Applies from" className="w-44"><DateInput value={from} onChange={setFrom} /></Field>
        <Field label="Note" className="min-w-[200px] flex-1"><TextInput value={note} onValueChange={setNote} placeholder="What changed (optional)" /></Field>
        <Button variant="primary" icon={Save} loading={saving} disabled={!state.config || !state.dirty} onClick={save}>Save</Button>
      </div>
    </Paper>
  );
}

/** A number field bound to a config key. */
export function Num({ state, k, label, hint, suffix, min = 0, max, step }: {
  state: ReturnType<typeof useSetting>; k: string; label: string; hint?: string; suffix?: string; min?: number; max?: number; step?: number;
}) {
  const v = state.config?.[k];
  return (
    <Field label={label} hint={hint}>
      <NumberInput value={v === null || v === undefined ? null : Number(v)} onChange={(x) => state.set(k, x ?? 0)} min={min} max={max} step={step} suffix={suffix} />
    </Field>
  );
}
