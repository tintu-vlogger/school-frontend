"use client";

/* Files, policies and letters settings, and how much space personal lockers use. */
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Button, Field, FormGrid, FormSection, NumberInput, Skeleton, TextInput, Toggle, formatBytes } from "@/components/ui-kit";
import { Paper } from "@/components/shell/page";
import { errText } from "./shared";

type Settings = {
  personal_locker: boolean; personal_file_limit: number; department_heads_can_share: boolean; default_ack_days: number;
  default_reminder_days: number; expiry_reminder_days: number; self_service_letters: boolean; esign_link_days: number;
  signatory_name: string; signatory_designation: string;
};

export function DocumentSettingsTab() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<Settings>("/documents/settings").then((r) => { setS(r); setInitial(JSON.stringify(r)); }).catch(() => {}); }, []);
  if (!s) return <Skeleton className="h-80 w-full" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  async function save() {
    setSaving(true);
    try { const r = await api.put<Settings>("/documents/settings", s); setS(r); setInitial(JSON.stringify(r)); toast.success("Settings saved"); }
    catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Paper className="space-y-8 p-6">
        <FormSection title="Files">
          <div className="space-y-4">
            <Toggle checked={s.personal_locker} onChange={(v) => set("personal_locker", v)} label="Personal lockers" description="A private space for each employee that even admins can't open" />
            <FormGrid>
              <Field label="Files per locker"><NumberInput value={s.personal_file_limit} onChange={(v) => set("personal_file_limit", v ?? 1)} min={1} max={365} /></Field>
              <Field label="Remind before a file expires"><NumberInput value={s.expiry_reminder_days} onChange={(v) => set("expiry_reminder_days", v ?? 1)} min={1} max={90} suffix="days" /></Field>
            </FormGrid>
            <Toggle checked={s.department_heads_can_share} onChange={(v) => set("department_heads_can_share", v)} label="Department heads can share files with their department" />
          </div>
        </FormSection>
        <FormSection title="Policies" description="Defaults for new policies; each policy can change them.">
          <FormGrid>
            <Field label="Acknowledge within"><NumberInput value={s.default_ack_days} onChange={(v) => set("default_ack_days", v ?? 1)} min={1} max={365} suffix="days" /></Field>
            <Field label="Remind every"><NumberInput value={s.default_reminder_days} onChange={(v) => set("default_reminder_days", v ?? 1)} min={1} max={30} suffix="days" /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Letters and signatures">
          <div className="space-y-4">
            <Toggle checked={s.self_service_letters} onChange={(v) => set("self_service_letters", v)} label="Employees can request letters" description="Salary certificate, address proof and other self-service letters, after approval" />
            <FormGrid>
              <Field label="Default signatory"><TextInput value={s.signatory_name} onValueChange={(v) => set("signatory_name", v)} placeholder="e.g. Anita Rao" /></Field>
              <Field label="Signatory's designation"><TextInput value={s.signatory_designation} onValueChange={(v) => set("signatory_designation", v)} /></Field>
              <Field label="Signing links work for"><NumberInput value={s.esign_link_days} onChange={(v) => set("esign_link_days", v ?? 1)} min={1} max={90} suffix="days" /></Field>
            </FormGrid>
          </div>
        </FormSection>
        <div className="flex justify-end"><Button variant="primary" icon={Save} loading={saving} disabled={JSON.stringify(s) === initial} onClick={save}>Save settings</Button></div>
      </Paper>
      <LockerUsage />
    </div>
  );
}

function LockerUsage() {
  const [rows, setRows] = useState<{ items: { employee_id: number; employee_name: string | null; files: number; bytes: number }[]; limit: number } | null>(null);
  useEffect(() => { api.get<typeof rows>("/documents/lockers").then(setRows).catch(() => setRows({ items: [], limit: 0 })); }, []);
  return (
    <Paper className="h-fit">
      <div className="border-b border-line px-5 py-3.5"><p className="text-[15px] text-ink">Locker use</p><p className="text-[12.5px] text-muted">Counts only. Nobody but the owner can open a locker.</p></div>
      {!rows ? <Skeleton className="m-5 h-20" /> : rows.items.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted">No one has used their locker yet.</p> : (
        <ul className="divide-y divide-line">
          {rows.items.map((r) => (
            <li key={r.employee_id} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]">
              <span className="truncate text-ink">{r.employee_name}</span>
              <span className="tabular text-muted">{r.files}/{rows.limit} · {formatBytes(r.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </Paper>
  );
}
