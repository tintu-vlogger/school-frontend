"use client";

/* Committees (Grievance Redressal Committee, POSH Internal Committee) and grievance settings. */
import { useCallback, useEffect, useState } from "react";
import { Info, Pencil, Plus, Save, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, Skeleton, TextInput,
  Toggle, formatDisplayDate,
} from "@/components/ui-kit";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import type { Committee, GrievanceMe } from "./types";

type Settings = Record<string, number | boolean>;

export function CommitteeCards({ committees, roles, onEdit }: { committees: Committee[]; roles: Record<string, string>; onEdit?: (c: Committee) => void }) {
  const active = committees.filter((c) => c.active);
  if (!active.length) return (
    <Paper className="p-5"><p className="flex items-center gap-2 text-[13.5px] text-muted"><Info size={15} strokeWidth={1.4} /> No committee is set up yet. HR will name the members.</p></Paper>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {active.map((c) => (
        <Paper key={c.uuid}>
          <PaperHeader title={<span className="flex items-center gap-2">{c.name}<Badge tone={c.kind === "posh_ic" ? "bad" : "accent"}>{c.kind === "posh_ic" ? "POSH" : "Grievances"}</Badge></span>}
            action={onEdit && <IconButton icon={Pencil} label="Edit committee" size="sm" onClick={() => onEdit(c)} />} />
          <ul className="divide-y divide-line">
            {c.members.map((m) => (
              <li key={m.uuid} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar name={m.name || "?"} size={28} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{m.name}</span>
                  {(m.external_org || m.is_external) && <span className="block truncate text-[12px] text-faint">{m.external_org || "External member"}</span>}</span>
                <span className="text-[12.5px] text-muted">{roles[m.role] ?? m.role_label}</span>
              </li>
            ))}
          </ul>
          {(c.constituted_on || c.valid_until) && (
            <p className="border-t border-line px-5 py-2.5 text-[12px] text-faint">
              {c.constituted_on ? `Formed ${formatDisplayDate(c.constituted_on)}` : ""}{c.valid_until ? ` · term until ${formatDisplayDate(c.valid_until)}` : ""}
            </p>
          )}
        </Paper>
      ))}
    </div>
  );
}

export function GrievanceSettings({ me, committees, onCommitteesChanged }: { me: GrievanceMe; committees: Committee[]; onCommitteesChanged: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Committee | "grievance" | "posh_ic" | null>(null);
  const load = useCallback(() => { api.get<Settings>("/grievances/settings").then(setS).catch(() => setS({})); }, []);
  useEffect(() => { if (me.is_manager) load(); }, [load, me.is_manager]);

  async function save() {
    if (!s) return;
    setSaving(true);
    try { setS(await api.put<Settings>("/grievances/settings", s)); toast.success("Settings saved"); }
    catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }
  const num = (k: string, label: string, suffix: string, hint?: string) => (
    <Field label={label} hint={hint}><NumberInput value={(s?.[k] as number) ?? null} onChange={(x) => setS({ ...s!, [k]: x ?? 0 })} min={0} suffix={suffix} /></Field>
  );
  const hasIc = committees.some((c) => c.kind === "posh_ic" && c.active);
  const hasGrc = committees.some((c) => c.kind === "grievance" && c.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[16px] text-ink">Committees</p>
          <p className="text-[13px] text-muted">Grievances go to the Grievance Redressal Committee; POSH complaints only to the Internal Committee.</p>
        </div>
        <div className="flex gap-2">
          {!hasGrc && <Button icon={Plus} onClick={() => setEditing("grievance")}>Grievance committee</Button>}
          {!hasIc && <Button icon={Plus} variant="primary" onClick={() => setEditing("posh_ic")}>Internal Committee</Button>}
        </div>
      </div>
      <CommitteeCards committees={committees} roles={me.roles} onEdit={(c) => setEditing(c)} />

      {me.is_manager && (
        <Paper>
          <PaperHeader title="Rules and time limits" action={<Button size="sm" variant="primary" icon={Save} loading={saving} onClick={save} disabled={!s}>Save</Button>} />
          {!s ? <div className="p-5"><Skeleton className="h-40 w-full" /></div> : (
            <div className="space-y-6 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle checked={!!s.allow_anonymous} onChange={(x) => setS({ ...s, allow_anonymous: x })} label="Allow anonymous grievances" description="POSH complaints always carry a name." />
                <Toggle checked={!!s.posh_enabled} onChange={(x) => setS({ ...s, posh_enabled: x })} label="Accept POSH complaints" />
                <Toggle checked={!!s.owner_sees_posh} onChange={(x) => setS({ ...s, owner_sees_posh: x })} label="Company owner can see POSH complaints" description="By law only the Internal Committee handles them. Leave this off unless the owner sits on it." />
                <Toggle checked={!!s.notify_committee} onChange={(x) => setS({ ...s, notify_committee: x })} label="Tell the committee about new cases" />
              </div>
              <div>
                <p className="mb-3 text-[13px] text-muted">POSH time limits (defaults from the POSH Act, 2013)</p>
                <FormGrid columns={3}>
                  {num("posh_filing_months", "Complaint within", "months", "Of the incident")}
                  {num("posh_extension_months", "Extension allowed", "months", "With recorded reasons")}
                  {num("posh_acknowledge_days", "Acknowledge within", "days")}
                  {num("posh_inquiry_days", "Inquiry within", "days", "Of the complaint")}
                  {num("posh_report_days", "Report within", "days", "Of completing the inquiry")}
                  {num("posh_action_days", "Act on the report within", "days")}
                </FormGrid>
              </div>
              <FormGrid columns={3}>{num("grievance_resolution_days", "Resolve grievances within", "days", "Industrial Relations Code: 30 days")}</FormGrid>
            </div>
          )}
        </Paper>
      )}
      <CommitteeModal target={editing} roles={me.roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onCommitteesChanged(); }} />
    </div>
  );
}

type MemberRow = { key: string; employee_id: number | null; external: boolean; external_name: string; external_org: string; external_email: string; role: string; label?: string };

function CommitteeModal({ target, roles, onClose, onSaved }: { target: Committee | "grievance" | "posh_ic" | null; roles: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const existing = target && typeof target === "object" ? target : null;
  const kind = existing ? existing.kind : (target as "grievance" | "posh_ic" | null) ?? "grievance";
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setName(existing?.name ?? (kind === "posh_ic" ? "Internal Committee (POSH)" : "Grievance Redressal Committee"));
    setFrom(existing?.constituted_on ?? "");
    setUntil(existing?.valid_until ?? "");
    setRows((existing?.members ?? []).map((m) => ({
      key: m.uuid, employee_id: m.employee_id, external: m.is_external, external_name: m.external_name ?? "", label: m.name ?? undefined,
      external_org: m.external_org ?? "", external_email: m.external_email ?? "", role: m.role,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const [known, setKnown] = useState<Record<number, string>>({});
  useEffect(() => {
    const ids = rows.map((r) => r.employee_id).filter((x): x is number => !!x && !known[x]);
    if (ids.length) employeeOptionsFor(ids).then((o) => setKnown((k) => ({ ...k, ...Object.fromEntries(o.map((x) => [x.value, x.label])) }))).catch(() => {});
  }, [rows, known]);

  const roleOptions = Object.entries(roles).map(([value, label]) => ({ value, label }));
  const set = (i: number, patch: Partial<MemberRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (external: boolean) => setRows([...rows, { key: Math.random().toString(36).slice(2), employee_id: null, external, external_name: "", external_org: "", external_email: "", role: external ? "external_member" : "member" }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        kind, name: name.trim(), constituted_on: from || null, valid_until: until || null, active: true,
        members: rows.filter((r) => (r.external ? r.external_name.trim() : r.employee_id)).map((r) => r.external
          ? { external_name: r.external_name.trim(), external_org: r.external_org || null, external_email: r.external_email || null, role: r.role }
          : { employee_id: r.employee_id, role: r.role }),
      };
      if (existing) await api.put(`/grievances/committees/${existing.uuid}`, body);
      else await api.post("/grievances/committees", body);
      toast.success("Committee saved");
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!target} onClose={onClose} size="lg" busy={saving} title={existing ? `Edit ${existing.name}` : kind === "posh_ic" ? "Set up the Internal Committee" : "Set up the grievance committee"}
      leading={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Users size={18} strokeWidth={1.4} /></span>}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="committee-form" loading={saving}>Save committee</Button></>}>
      <form id="committee-form" onSubmit={submit} className="space-y-5" noValidate>
        {kind === "posh_ic" && (
          <p className="rounded-xl border border-primary/15 bg-primary-soft/40 px-4 py-3 text-[13px] text-ink/80">
            The POSH Act needs a presiding officer (a senior woman employee), at least two employees, and one external member from an NGO
            or a person familiar with women&apos;s issues or law. At least half the members must be women. The term is up to three years.
          </p>
        )}
        <FormGrid columns={3}>
          <Field label="Name" required className="sm:col-span-3"><TextInput value={name} onValueChange={setName} /></Field>
          <Field label="Formed on"><DateInput value={from} onChange={setFrom} clearable /></Field>
          <Field label="Term until"><DateInput value={until} onChange={setUntil} clearable /></Field>
        </FormGrid>
        <div>
          <p className="mb-2 text-[13px] text-muted">Members</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_190px_32px]">
                {r.external ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <TextInput value={r.external_name} onValueChange={(x) => set(i, { external_name: x })} placeholder="Name" />
                    <TextInput value={r.external_org} onValueChange={(x) => set(i, { external_org: x })} placeholder="Organisation" />
                    <TextInput value={r.external_email} onValueChange={(x) => set(i, { external_email: x })} placeholder="Email" type="email" />
                  </div>
                ) : (
                  <Select value={r.employee_id} onChange={(x) => set(i, { employee_id: x })} loadOptions={loadEmployees} placeholder="Search employees"
                    selectedOption={r.employee_id ? { value: r.employee_id, label: known[r.employee_id] || r.label || "Employee" } : null} />
                )}
                <Select value={r.role} onChange={(x) => set(i, { role: x || "member" })} options={roleOptions} />
                <IconButton icon={Trash2} label="Remove member" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" icon={UserPlus} onClick={() => add(false)}>Add employee</Button>
            <Button size="sm" icon={Plus} onClick={() => add(true)}>Add external member</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
