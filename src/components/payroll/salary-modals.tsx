"use client";

/*
 * Employee salary modals.
 *   <SalaryDetailModal employeeUuid open onClose onChanged />   current split, history, payroll profile
 *   <AssignSalaryModal employeeUuid open onClose onSaved />      assign or revise with a live CTC split
 */
import { useEffect, useMemo, useState } from "react";
import { History, Pencil, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, FormSection, KeyValue, Modal, ModalCancel, NumberInput, Select, Skeleton, Tabs,
  TextInput, Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { Row, STATES, StatusPill, errMsg, inr } from "./common";

type Comp = { code: string; name: string; kind: string; monthly: string; annual: string };
type Salary = { uuid: string; effective_from: string; effective_to: string | null; annual_ctc: string; monthly_gross: string;
  components: Comp[]; reason: string; note: string | null; warnings: { code: string; message: string }[]; status: string;
  structure_name: string | null; created_by_name: string | null };
type Profile = Record<string, any>;
type Detail = { employee: { uuid: string; name: string; employee_code: string | null; date_of_joining: string | null; pan: string | null; uan: string | null; grade: string | null; state: string | null };
  current: Salary | null; history: Salary[]; profile: Profile };

export function SalaryDetailModal({ employeeUuid, open, onClose, onChanged, canEdit }: { employeeUuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; canEdit: boolean }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState("salary");
  const [assign, setAssign] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<SelectOption<string>[]>([]);
  const load = () => employeeUuid && api.get<Detail>(`/payroll/salaries/${employeeUuid}`).then((x) => { setD(x); setProfile(x.profile); }).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { if (open) { setD(null); setTab("salary"); load(); api.get<{ uuid: string; name: string }[]>("/payroll/pay-groups").then((g) => setGroups(g.map((x) => ({ value: x.uuid, label: x.name })))).catch(() => {}); } }, [open, employeeUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveProfile() {
    if (!profile || !d) return;
    setSaving(true);
    try { const p = await api.put<Profile>(`/payroll/profiles/${d.employee.uuid}`, profile); setProfile(p); toast.success("Payroll settings saved"); onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
  const set = (k: string, v: unknown) => setProfile((p) => ({ ...(p ?? {}), [k]: v }));
  const cur = d?.current;
  const earn = cur?.components.filter((c) => c.kind === "earning" || c.kind === "reimbursement") ?? [];
  const er = cur?.components.filter((c) => c.kind === "employer") ?? [];

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={d?.employee.name ?? "Salary"} description={d ? [d.employee.employee_code, d.employee.grade, d.employee.state].filter(Boolean).join(" · ") : undefined}
        footer={tab === "profile" && canEdit ? <><ModalCancel /><Button variant="primary" loading={saving} onClick={saveProfile}>Save settings</Button></>
          : canEdit ? <Button variant="primary" icon={cur ? TrendingUp : Pencil} onClick={() => setAssign(true)}>{cur ? "Revise salary" : "Assign salary"}</Button> : undefined}>
        {!d ? <Skeleton className="h-64" /> : (
          <div className="space-y-5">
            <Tabs value={tab} onChange={setTab} items={[{ value: "salary", label: "Current salary" }, { value: "history", label: "Revisions", count: d.history.length }, { value: "profile", label: "Payroll settings" }]} />
            {tab === "salary" && (cur ? (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-3">
                  <div><p className="text-[12px] text-muted">Annual CTC</p><p className="tabular text-[20px] font-light text-ink">{inr(cur.annual_ctc)}</p></div>
                  <div><p className="text-[12px] text-muted">Monthly gross</p><p className="tabular text-[20px] font-light text-ink">{inr(cur.monthly_gross)}</p></div>
                  <div><p className="text-[12px] text-muted">From</p><p className="text-[15px] text-ink">{formatDate(cur.effective_from)}</p><p className="text-[12px] text-faint">{cur.structure_name ?? "Typed in"}</p></div>
                </div>
                {cur.warnings.map((w) => <p key={w.code} className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13.5px] text-amber-800">{w.message}</p>)}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="divide-y divide-line"><p className="pb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Monthly earnings</p>
                    {earn.map((c) => <Row key={c.code} label={c.name} value={inr(c.monthly)} sub={`${inr(c.annual)} a year`} />)}</div>
                  <div className="divide-y divide-line"><p className="pb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Employer contributions in CTC</p>
                    {er.length ? er.map((c) => <Row key={c.code} label={c.name} value={inr(c.monthly)} />) : <p className="py-2 text-[13.5px] text-muted">None</p>}</div>
                </div>
              </div>
            ) : <p className="py-8 text-center text-[14px] text-muted">No salary yet. Assign one to include {d.employee.name} in payroll.</p>)}
            {tab === "history" && (
              <ul className="divide-y divide-line">
                {d.history.map((s) => (
                  <li key={s.uuid} className="flex items-start gap-3 py-3">
                    <History size={16} strokeWidth={1.4} className="mt-1 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-ink">{inr(s.annual_ctc)} a year <span className="text-muted">· {s.reason.replace(/_/g, " ")}</span></p>
                      <p className="text-[12.5px] text-faint">{formatDate(s.effective_from)}{s.effective_to ? ` to ${formatDate(s.effective_to)}` : " onwards"} · {s.structure_name ?? "Typed in"} · by {s.created_by_name ?? "—"}</p>
                      {s.note && <p className="text-[12.5px] text-muted">{s.note}</p>}
                    </div>
                    <StatusPill status={s.status === "superseded" ? "closed" : s.status === "cancelled" ? "cancelled" : "active"} label={s.status === "superseded" ? "Earlier" : s.status === "cancelled" ? "Cancelled" : "Current"} />
                  </li>
                ))}
              </ul>
            )}
            {tab === "profile" && profile && (
              <div>
                <FormSection title="Pay">
                  <FormGrid>
                    <Field label="Pay group"><Select value={profile.pay_group_uuid} onChange={(v) => set("pay_group_uuid", v)} options={groups} /></Field>
                    <Field label="Paid by"><Select value={profile.payment_mode} onChange={(v) => set("payment_mode", v)} options={[{ value: "bank", label: "Bank transfer" }, { value: "cheque", label: "Cheque" }, { value: "cash", label: "Cash" }]} /></Field>
                    <Toggle checked={!!profile.metro} onChange={(v) => set("metro", v)} label="Lives in a metro city" description="HRA at 50% of basic (40% elsewhere)" />
                    <Toggle checked={!!profile.fixed_term} onChange={(v) => set("fixed_term", v)} label="Fixed-term employee" description="Gratuity after 1 year" />
                  </FormGrid>
                </FormSection>
                <FormSection title="Provident fund">
                  <FormGrid>
                    <Toggle checked={!!profile.pf_applicable} onChange={(v) => set("pf_applicable", v)} label="PF applies" />
                    <Toggle checked={!!profile.eps_applicable} onChange={(v) => set("eps_applicable", v)} label="Pension (EPS) applies" description="Off at 58 automatically" />
                    <Field label="Employee PF on"><Select value={profile.pf_employee_basis} onChange={(v) => set("pf_employee_basis", v)} options={[{ value: "ceiling", label: "Wages up to ₹15,000" }, { value: "actual", label: "Actual wages" }]} /></Field>
                    <Field label="Employer PF on"><Select value={profile.pf_employer_basis} onChange={(v) => set("pf_employer_basis", v)} options={[{ value: "ceiling", label: "Wages up to ₹15,000 (restricted)" }, { value: "actual", label: "Actual wages" }]} /></Field>
                    <Field label="Voluntary PF (%)"><NumberInput value={Number(profile.vpf_rate) || 0} onChange={(v) => set("vpf_rate", v ?? 0)} min={0} max={88} /></Field>
                    <Field label="PF member ID"><TextInput value={profile.pf_number ?? ""} onValueChange={(v) => set("pf_number", v)} /></Field>
                  </FormGrid>
                </FormSection>
                <FormSection title="ESI, PT and LWF">
                  <FormGrid>
                    <Toggle checked={!!profile.esi_applicable} onChange={(v) => set("esi_applicable", v)} label="ESI applies" description="Only when wages are within the limit" />
                    <Toggle checked={!!profile.disability} onChange={(v) => set("disability", v)} label="Person with disability" description="ESI limit ₹25,000" />
                    <Toggle checked={!!profile.pt_applicable} onChange={(v) => set("pt_applicable", v)} label="Professional Tax applies" />
                    <Field label="PT state" hint="Empty: the work location's state"><Select value={profile.pt_state} onChange={(v) => set("pt_state", v)} options={STATES} clearable /></Field>
                    <Toggle checked={!!profile.lwf_applicable} onChange={(v) => set("lwf_applicable", v)} label="Labour Welfare Fund applies" />
                    <Field label="LWF state"><Select value={profile.lwf_state} onChange={(v) => set("lwf_state", v)} options={STATES} clearable /></Field>
                  </FormGrid>
                </FormSection>
                <FormSection title="Minimum wage check">
                  <FormGrid columns={3}>
                    <Field label="State"><Select value={profile.min_wage_state} onChange={(v) => set("min_wage_state", v)} options={STATES} clearable /></Field>
                    <Field label="Zone"><TextInput value={profile.min_wage_zone ?? ""} onValueChange={(v) => set("min_wage_zone", v)} placeholder="e.g. zone_1" /></Field>
                    <Field label="Skill"><Select value={profile.skill} onChange={(v) => set("skill", v)} options={[{ value: "unskilled", label: "Unskilled" }, { value: "semi_skilled", label: "Semi-skilled" }, { value: "skilled", label: "Skilled" }, { value: "highly_skilled", label: "Highly skilled" }]} /></Field>
                  </FormGrid>
                </FormSection>
              </div>
            )}
          </div>
        )}
      </Modal>
      {d && <AssignSalaryModal employeeUuid={d.employee.uuid} name={d.employee.name} current={cur ?? null} open={assign} onClose={() => setAssign(false)}
        onSaved={() => { setAssign(false); load(); onChanged(); }} />}
    </>
  );
}

type Preview = { annual_ctc: string; monthly_gross: string; components: (Comp & { in_ctc: boolean })[]; warnings: { code: string; message: string }[];
  wage_rule: { core_share: string; compliant: boolean; add_back: string }; minimum_wage: { monthly: string; source: string } | null };

export function AssignSalaryModal({ employeeUuid, name, current, open, onClose, onSaved }: { employeeUuid: string; name: string; current: Salary | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [structures, setStructures] = useState<{ uuid: string; name: string; min_ctc: string | null; max_ctc: string | null }[]>([]);
  const [structure, setStructure] = useState<string | null>(null);
  const [ctc, setCtc] = useState<number | null>(null);
  const [from, setFrom] = useState(todayISO());
  const [reason, setReason] = useState<string | null>(null);
  const [reasons, setReasons] = useState<SelectOption<string>[]>([]);
  const [note, setNote] = useState("");
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<typeof structures>("/payroll/structures").then((s) => {
      setStructures(s);
      setStructure((x) => x ?? s.find((y) => y.name === current?.structure_name)?.uuid ?? s[0]?.uuid ?? null);
    }).catch(() => {});
    api.get<{ revision_reasons: { value: string; label: string }[] }>("/payroll/settings").then((s) => setReasons(s.revision_reasons)).catch(() => {});
    setCtc(current ? Math.round(Number(current.annual_ctc) * 1.1 / 1200) * 1200 : null);
    setReason(current ? "annual_raise" : "first_salary");
    setOverrides({});
  }, [open, current?.annual_ctc]); // eslint-disable-line react-hooks/exhaustive-deps
  const ovClean = useMemo(() => Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined)), [overrides]);
  useEffect(() => {
    if (!open || !ctc || !structure) { setPreview(null); return; }
    const t = setTimeout(() => {
      api.post<Preview>(`/payroll/salaries/${employeeUuid}/preview`, { structure_uuid: structure, annual_ctc: ctc, effective_from: from, overrides: ovClean })
        .then((p) => { setPreview(p); setPErr(null); }).catch((e) => { setPreview(null); setPErr(errMsg(e)); });
    }, 300);
    return () => clearTimeout(t);
  }, [open, ctc, structure, from, ovClean, employeeUuid]);

  async function save() {
    setBusy(true);
    try {
      await api.post(`/payroll/salaries/${employeeUuid}/assign`, { structure_uuid: structure, annual_ctc: ctc, effective_from: from, reason, note: note || undefined, overrides: ovClean });
      toast.success(current ? "Salary revised" : "Salary assigned");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const s = structures.find((x) => x.uuid === structure);
  const hike = current && ctc ? ((ctc - Number(current.annual_ctc)) / Number(current.annual_ctc)) * 100 : null;

  return (
    <Modal open={open} onClose={onClose} size="xl" title={current ? `Revise salary · ${name}` : `Assign salary · ${name}`} busy={busy} dirty={!!ctc}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!ctc || !preview} onClick={save}>{current ? "Save revision" : "Assign salary"}</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <Field label="Salary structure" required hint={s?.min_ctc ? `Range ${inr(s.min_ctc)} to ${inr(s.max_ctc)}` : undefined}>
            <Select value={structure} onChange={setStructure} options={structures.map((x) => ({ value: x.uuid, label: x.name }))} />
          </Field>
          <Field label="Annual CTC (₹)" required hint={hike !== null ? `${hike >= 0 ? "+" : ""}${hike.toFixed(1)}% on ${inr(current!.annual_ctc)}` : undefined}>
            <NumberInput value={ctc} onChange={setCtc} min={0} step={1000} />
          </Field>
          <FormGrid>
            <Field label="Effective from" required hint="A date in a paid month adds arrears to the next run"><DateInput value={from} onChange={setFrom} /></Field>
            <Field label="Reason"><Select value={reason} onChange={setReason} options={reasons} /></Field>
          </FormGrid>
          <Field label="Note"><Textarea value={note} onValueChange={setNote} rows={2} /></Field>
          <details className="rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-[13.5px] text-muted">Change individual parts</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(preview?.components ?? []).filter((c) => c.kind !== "employer").map((c) => (
                <Field key={c.code} label={`${c.name} (monthly)`}>
                  <NumberInput value={overrides[c.code] ?? null} onChange={(v) => setOverrides((o) => ({ ...o, [c.code]: v }))} min={0} placeholder={String(Number(c.monthly))} />
                </Field>
              ))}
            </div>
          </details>
        </div>
        <div className="rounded-xl border border-line">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] text-ink">Monthly split</p>
            {preview && <p className="tabular text-[13px] text-muted">Gross {inr(preview.monthly_gross)}</p>}
          </div>
          {pErr ? <p className="px-4 py-6 text-[13.5px] text-rose-700">{pErr}</p> : !preview ? <p className="px-4 py-10 text-center text-[13.5px] text-muted">Enter a CTC to see the split.</p> : (
            <div className="px-4 py-2">
              <div className="divide-y divide-line">
                {preview.components.map((c) => <Row key={c.code} label={c.name} sub={c.kind === "employer" ? "Employer contribution" : undefined} value={inr(c.monthly)} />)}
                <Row label="Monthly CTC" value={inr(Number(preview.annual_ctc) / 12)} strong />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 pb-2">
                <Badge tone={preview.wage_rule.compliant ? "good" : "warn"}>Basic + DA {preview.wage_rule.core_share}% of pay</Badge>
                {preview.minimum_wage && <Badge tone="neutral">Minimum wage {inr(preview.minimum_wage.monthly)}</Badge>}
              </div>
              {preview.warnings.map((w) => <p key={w.code} className="mb-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">{w.message}</p>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

void KeyValue;
