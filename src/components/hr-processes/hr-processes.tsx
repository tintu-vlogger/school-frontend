"use client";

/*
 * HR processes: change processes (transfer, promotion …) and the changes raised under them.
 *
 *   const meta = useProcessMeta();                                   // fields, letter templates, statuses
 *   <ProcessTypeModal open target={type | "new"} meta onClose onSaved />
 *   <StartChangeModal open types meta initialType? onClose onSaved />
 *   <ChangeDetailModal uuid onClose onChanged />                     // before/after, approval, Revoke
 *
 * API: /hr-processes/meta, /types, /requests, /requests/{uuid}/revoke, /current.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, RotateCcw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Avatar, Badge, Button, DateInput, Field, FormGrid, FormSection, KeyValue, MasterSelect, Modal, ModalCancel, MultiSelect,
  NumberInput, Select, Skeleton, TextInput, Textarea, Toggle, useConfirm, type BadgeTone, type SelectOption,
} from "@/components/ui-kit";
import { lookupEmployees, useOrgOptions } from "@/components/people/hooks";
import { WORK_MODES } from "@/components/people/types";

export type FieldMeta = {
  value: string; label: string; kind: string; field_type?: string; master_type_key?: string | null;
  options?: (string | { value: string; label: string })[];
};
export type ProcessMeta = {
  fields: FieldMeta[]; change_types: SelectOption[]; target_statuses: SelectOption[]; letter_templates: SelectOption[];
  statuses: SelectOption[]; work_modes: SelectOption[];
};
export type ProcessType = {
  uuid: string; code: string; name: string; description: string | null; change_type: string; fields: string[];
  field_labels: string[]; key_field: string | null; target_status: string | null; letter_template_uuids: string[];
  revocable: boolean; needs_approval: boolean; is_system: boolean; active: boolean; sort_order: number; requests: number;
};
export type ChangeRow = {
  uuid: string; process: { uuid: string; code: string; name: string; revocable: boolean };
  employee: { id: number; uuid: string; name: string; code: string | null; photo: string | null };
  effective_date: string; status: string; status_label: string; reason: string | null; fields: string[];
  batch_id: string | null; created_by_name: string | null; created_at: string; applied_at: string | null;
  revoked_at: string | null; can_revoke: boolean;
};
type ChangeDetail = ChangeRow & {
  changes: { field: string; label: string; old: string | null; new: string | null }[];
  remarks: string | null; note: string | null; revoked_by_name: string | null; revoke_reason: string | null;
  letters: string[]; workflow: { uuid: string; reference_no: string | null; status: string } | null;
};

export const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warn", scheduled: "info", applied: "good", rejected: "bad", cancelled: "neutral", revoked: "neutral",
};

export function useProcessMeta() {
  const [meta, setMeta] = useState<ProcessMeta | null>(null);
  useEffect(() => { api.get<ProcessMeta>("/hr-processes/meta").then(setMeta).catch(() => {}); }, []);
  return meta;
}

/* ── Process type editor ─────────────────────────────────────────────── */

export function ProcessTypeModal({ open, target, meta, onClose, onSaved }: {
  open: boolean; target: ProcessType | "new" | null; meta: ProcessMeta | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const editing = target && target !== "new" ? target : null;
  const [v, setV] = useState(() => ({
    code: editing?.code ?? "", name: editing?.name ?? "", description: editing?.description ?? "",
    change_type: editing?.change_type ?? "other", fields: editing?.fields ?? [], key_field: editing?.key_field ?? null,
    target_status: editing?.target_status ?? null, letter_template_uuids: editing?.letter_template_uuids ?? [],
    revocable: editing?.revocable ?? true, needs_approval: editing?.needs_approval ?? true, active: editing?.active ?? true,
  }));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setDirty(true); };
  const fieldOpts: SelectOption[] = (meta?.fields ?? []).map((f) => ({ value: f.value, label: f.label, description: f.kind === "custom" ? "Custom field" : undefined }));
  const keyOpts = fieldOpts.filter((o) => v.fields.includes(o.value));

  async function save() {
    setSaving(true);
    try {
      const body = { ...v, description: v.description || null, key_field: v.fields.includes(v.key_field ?? "") ? v.key_field : null };
      if (editing) await api.put(`/hr-processes/types/${editing.uuid}`, body); else await api.post("/hr-processes/types", body);
      toast.success(editing ? "Process saved" : "Process added");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? `Edit ${editing.name}` : "New HR process"}
      description="What changes, who approves (in Approval flows, as “HR process”), and the letters issued when it is approved."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <FormSection title="Basics">
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Transfer" maxLength={100} /></Field>
          <Field label="Code" required hint="Short and fixed, used in approval flow conditions">
            <TextInput value={v.code} onValueChange={(x) => set("code", x.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 10))} placeholder="TRF" />
          </Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={2} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="What changes">
        <FormGrid>
          <Field label="Fields it changes" className="sm:col-span-2" hint="Job fields, probation and confirmation dates, or employee custom fields">
            <MultiSelect value={v.fields} onChange={(x) => set("fields", x)} options={fieldOpts} placeholder="Pick fields" max={10} />
          </Field>
          <Field label="Key field" hint="Must be given every time"><Select value={v.key_field} onChange={(x) => set("key_field", x)} options={keyOpts} placeholder="None" clearable /></Field>
          <Field label="Moves people to" hint="Optional stage change"><Select value={v.target_status} onChange={(x) => set("target_status", x)} options={meta?.target_statuses ?? []} placeholder="No stage change" clearable /></Field>
          <Field label="Shows in job history as"><Select value={v.change_type} onChange={(x) => set("change_type", x ?? "other")} options={meta?.change_types ?? []} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="When approved">
        <FormGrid>
          <Field label="Letters to issue" className="sm:col-span-2" hint={meta && !meta.letter_templates.length ? "No letter templates yet. Add them under Settings › Templates." : "Generated and filed in the employee's documents"}>
            <MultiSelect value={v.letter_template_uuids} onChange={(x) => set("letter_template_uuids", x)} options={meta?.letter_templates ?? []} placeholder="No letters" />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={v.needs_approval} onChange={(x) => set("needs_approval", x)} label="Needs approval" description="Off: the change is applied as soon as it is raised." />
            <Toggle checked={v.revocable} onChange={(x) => set("revocable", x)} label="Can be revoked" description="Revoke puts the previous values back with one click." />
            <Toggle checked={v.active} onChange={(x) => set("active", x)} label="In use" description="Switched off, it can't be used for new changes." />
          </div>
        </FormGrid>
      </FormSection>
    </Modal>
  );
}

/* ── Start a change ──────────────────────────────────────────────────── */

export function StartChangeModal({ open, types, meta, initialType, onClose, onSaved }: {
  open: boolean; types: ProcessType[]; meta: ProcessMeta | null; initialType?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const o = useOrgOptions();
  const active = types.filter((t) => t.active);
  const [typeId, setTypeId] = useState<string | null>(initialType ?? active[0]?.uuid ?? null);
  const [people, setPeople] = useState<number[]>([]);
  const [peopleOpts, setPeopleOpts] = useState<SelectOption<number>[]>([]);
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [now, setNow] = useState<Record<string, string | null> | null>(null);
  const [saving, setSaving] = useState(false);
  const ptype = types.find((t) => t.uuid === typeId) ?? null;
  const fields = useMemo(() => (ptype?.fields ?? []).map((f) => meta?.fields.find((m) => m.value === f) ?? { value: f, label: f, kind: "text" }), [ptype, meta]);

  useEffect(() => {
    if (!ptype || people.length !== 1) { setNow(null); return; }
    let live = true;
    api.get<{ labels: Record<string, string | null> }>(`/hr-processes/current?employee_id=${people[0]}&process=${ptype.uuid}`)
      .then((r) => { if (live) setNow(r.labels); }).catch(() => setNow(null));
    return () => { live = false; };
  }, [ptype, people]);

  async function save() {
    if (!ptype) return;
    setSaving(true);
    try {
      const body = { process_type_uuid: ptype.uuid, employee_ids: people, effective_date: date, reason: reason || null, remarks: remarks || null,
        values: Object.fromEntries(Object.entries(values).filter(([k, x]) => ptype.fields.includes(k) && x !== undefined && x !== "")) };
      const r = await api.post<{ items: ChangeRow[] }>("/hr-processes/requests", body);
      const st = r.items[0]?.status;
      toast.success(r.items.length > 1 ? `${r.items.length} changes raised` : "Change raised",
        { description: st === "pending" ? "It is waiting for approval." : st === "scheduled" ? `It takes effect on ${formatDate(date)}.` : "It has been applied." });
      onSaved();
    } catch (e) { toast.error("Couldn't raise the change", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }

  const input = (f: FieldMeta) => {
    const val = (values[f.value] ?? null) as never;
    const set = (x: unknown) => setValues((s) => ({ ...s, [f.value]: x }));
    switch (f.kind) {
      case "designation": return <Select<number> value={val} onChange={set} options={o.designations} placeholder="Pick" clearable />;
      case "department": return <Select<number> value={val} onChange={set} options={o.departments} placeholder="Pick" clearable />;
      case "location": return <Select<number> value={val} onChange={set} options={o.locations} placeholder="Pick" clearable />;
      case "legal_entity": return <Select<number> value={val} onChange={set} options={o.entities} placeholder="Pick" clearable />;
      case "grade": return <Select<number> value={val} onChange={set} options={o.grades} placeholder="Pick" clearable />;
      case "cost_centre": return <Select<number> value={val} onChange={set} options={o.costCentres} placeholder="Pick" clearable />;
      case "employment_type": return <MasterSelect type="employment_type" value={val} onChange={set} />;
      case "employee": return <Select<number> value={val} onChange={set} loadOptions={lookupEmployees(people.length === 1 ? people[0] : null)} placeholder="Search people" clearable />;
      case "work_mode": return <Select value={val} onChange={set} options={WORK_MODES} placeholder="Pick" clearable />;
      case "number": return <NumberInput value={val} onChange={set} min={0} max={365} suffix="days" />;
      case "date": return <DateInput value={(val as string | null) ?? ""} onChange={set} />;
      case "custom": return <CustomInput f={f} value={values[f.value]} onChange={set} />;
      default: return <TextInput value={(val as string | null) ?? ""} onValueChange={set} />;
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={people.length > 0} title="Start a change"
      description="Pick the process, the people and the new values. It goes for approval, then applies on the effective date."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!ptype || !people.length}>{ptype?.needs_approval === false ? "Apply change" : "Send for approval"}</Button></>}>
      <FormGrid>
        <Field label="Process" required>
          <Select value={typeId} onChange={(x) => { setTypeId(x); setValues({}); }} options={active.map((t) => ({ value: t.uuid, label: t.name, description: t.code }))} />
        </Field>
        <Field label="Takes effect on" required hint={date > todayISO() ? "Applied on this date after approval" : undefined}><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Employees" required className="sm:col-span-2" hint="One or many; each gets their own request">
          <MultiSelect<number> value={people} onChange={(ids, opts) => { setPeople(ids); setPeopleOpts(opts); }} selectedOptions={peopleOpts}
            loadOptions={lookupEmployees(null)} placeholder="Search people" max={200} />
        </Field>
        {ptype?.target_status && (
          <p className="text-[13px] text-muted sm:col-span-2">This process also moves people to <span className="text-ink">{meta?.target_statuses.find((s) => s.value === ptype.target_status)?.label ?? ptype.target_status}</span>.</p>
        )}
        {fields.map((f) => (
          <Field key={f.value} label={`New ${f.label.toLowerCase()}`} required={ptype?.key_field === f.value}
            hint={now ? `Now: ${now[f.value] ?? "Not set"}` : ptype?.key_field === f.value ? "Key field" : "Leave empty to keep as is"}>
            {input(f)}
          </Field>
        ))}
        <Field label="Reason" required className="sm:col-span-2"><TextInput value={reason} onValueChange={setReason} placeholder="e.g. New office opened in Pune" maxLength={300} /></Field>
        <Field label="Remarks" aside="Optional" className="sm:col-span-2"><Textarea value={remarks} onValueChange={setRemarks} rows={2} /></Field>
      </FormGrid>
    </Modal>
  );
}

function CustomInput({ f, value, onChange }: { f: FieldMeta; value: unknown; onChange: (x: unknown) => void }) {
  const opts: SelectOption[] = (f.options ?? []).map((x) => (typeof x === "string" ? { value: x, label: x } : { value: String(x.value), label: x.label }));
  switch (f.field_type) {
    case "number": return <NumberInput value={(value as number | null) ?? null} onChange={onChange} />;
    case "date": return <DateInput value={(value as string | null) ?? ""} onChange={onChange} />;
    case "boolean": return <Toggle checked={!!value} onChange={onChange} label={f.label} />;
    case "single_choice":
      return f.master_type_key ? <MasterSelect type={f.master_type_key} value={(value as number | null) ?? null} onChange={onChange} />
        : <Select value={(value as string | null) ?? null} onChange={onChange} options={opts} clearable />;
    case "multi_choice":
      return f.master_type_key ? <MasterSelect type={f.master_type_key} multiple value={(value as number[] | null) ?? []} onChange={onChange} />
        : <MultiSelect value={(value as string[] | null) ?? []} onChange={onChange} options={opts} />;
    case "textarea": return <Textarea value={(value as string | null) ?? ""} onValueChange={onChange} rows={2} />;
    default: return <TextInput value={(value as string | null) ?? ""} onValueChange={onChange} />;
  }
}

/* ── Change details ──────────────────────────────────────────────────── */

export function ChangeDetailModal({ uuid, canRevoke, onClose, onChanged }: { uuid: string | null; canRevoke: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<ChangeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    setD(null);
    api.get<ChangeDetail>(`/hr-processes/requests/${uuid}`).then((r) => { if (live) setD(r); }).catch(() => onClose());
    return () => { live = false; };
  }, [uuid, onClose]);

  async function revoke() {
    if (!d) return;
    const ok = await confirm({
      title: `Revoke this ${d.process.name.toLowerCase()}?`,
      message: d.status === "applied" ? "The previous values are put back and the revoke is recorded in the job history. Letters already issued stay." : "It won't take effect.",
      confirmLabel: "Revoke", tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setD(await api.post<ChangeDetail>(`/hr-processes/requests/${d.uuid}/revoke`, { reason: null }));
      toast.success("Change revoked");
      onChanged();
    } catch (e) { toast.error("Couldn't revoke", { description: e instanceof Error ? e.message : undefined }); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="md" busy={busy}
      title={d ? `${d.process.name}: ${d.employee.name}` : "Change"}
      description={d ? `${d.process.code} · takes effect on ${formatDate(d.effective_date)}` : undefined}
      leading={d && <Avatar name={d.employee.name} src={d.employee.photo} size={40} />}
      footer={d && canRevoke && d.can_revoke ? <Button icon={RotateCcw} onClick={revoke} loading={busy}>Revoke</Button> : undefined}>
      {!d ? <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status_label}</Badge>
            {d.status === "scheduled" && <span className="flex items-center gap-1 text-[13px] text-muted"><CalendarClock size={14} strokeWidth={1.4} /> Applies on {formatDate(d.effective_date)}</span>}
          </div>
          <div className="rounded-xl border border-line">
            {d.changes.map((c) => (
              <div key={c.field} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <div className="min-w-0"><p className="text-[12px] text-faint">{c.label}</p><p className="truncate text-[13.5px] text-muted">{c.old ?? (c.field === "status" ? "" : "Not set")}</p></div>
                <ArrowRight size={14} strokeWidth={1.4} className="text-faint" />
                <p className="truncate text-[13.5px] text-ink">{c.new ?? "Cleared"}</p>
              </div>
            ))}
          </div>
          <KeyValue items={[
            { label: "Reason", value: d.reason ?? "—" },
            ...(d.remarks ? [{ label: "Remarks", value: d.remarks }] : []),
            { label: "Raised by", value: `${d.created_by_name ?? "—"} · ${formatDateTime(d.created_at)}` },
            ...(d.workflow ? [{ label: "Approval", value: <Link className="text-primary hover:underline" href="/dashboard/inbox">{d.workflow.reference_no ?? "Request"} · {d.workflow.status}</Link> }] : []),
            ...(d.applied_at ? [{ label: "Applied", value: formatDateTime(d.applied_at) }] : []),
            ...(d.letters.length ? [{ label: "Letters", value: <span className="flex items-center gap-1"><FileText size={14} strokeWidth={1.4} /> {d.letters.length} issued, in the employee's documents</span> }] : []),
            ...(d.revoked_at ? [{ label: "Revoked", value: `${d.revoked_by_name ?? ""} · ${formatDateTime(d.revoked_at)}${d.revoke_reason ? ` · ${d.revoke_reason}` : ""}` }] : []),
          ]} />
          {d.note && <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-muted">{d.note}</p>}
          {d.batch_id && <p className="flex items-center gap-1.5 text-[12.5px] text-faint"><Users size={13} strokeWidth={1.4} /> Raised together with others</p>}
        </div>
      )}
    </Modal>
  );
}
