"use client";

/*
 * Benefits and insurance for HR: plans (group health, accident, life, top-up, parental)
 * with insurer, policy, tiers and premiums; enrolments (enrol someone, change their tier
 * and family, end cover); and the monthly additions and deletions file for the insurer.
 * ?tab= keeps the tab, ?plan=<uuid> opens a plan.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, HeartPulse, Pencil, Plus, ShieldCheck, Users, Wand2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, KeyValue, Modal, ModalCancel, Select, StatCard, Tabs,
  useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { downloadWithAuth, errMsg, inr, loadPayrollEmployees, type Page } from "@/components/payroll/common";
import { PlanModal, type Plan } from "@/components/benefits/plan-modal";

type Enrolment = { uuid: string; plan_uuid: string; plan_name: string; employee_id: number; employee_uuid: string; employee_name: string;
  employee_code: string | null; tier: string; tier_label: string; dependents: { family_member_id: number; name: string; relation: string }[]; sum_insured: string;
  annual_premium: string; employer_share: string; employee_share: string; monthly_deduction: string; status: string; status_label: string;
  source: string; start_date: string; end_date: string | null; waiver_reason: string | null };
type Family = { id: number; name: string; relation: string | null; relation_kind: string; date_of_birth: string | null };

export default function BenefitsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "plans";
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const toast = useToast();
  const loadPlans = useCallback(() => { api.get<Plan[]>("/benefits/plans").then(setPlans).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { loadPlans(); }, [loadPlans]);
  const go = (t: string) => router.replace(`/dashboard/benefits${t === "plans" ? "" : `?tab=${t}`}`, { scroll: false });
  const enrolled = plans?.reduce((a, p) => a + p.enrolled, 0) ?? 0;
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Benefits and insurance" description="Group health, accident and life cover, who is enrolled, and the monthly file for the insurer." />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Plans running" value={plans?.filter((p) => p.active).length ?? "—"} icon={ShieldCheck} />
        <StatCard label="Enrolments" value={plans ? enrolled : "—"} icon={Users} />
        <StatCard label="Premium this year" value={plans ? inr(plans.reduce((a, p) => a + Number(p.premium_total), 0)) : "—"}
          hint={plans ? `${inr(plans.reduce((a, p) => a + Number(p.employee_premium_total), 0))} paid by employees` : undefined} />
      </div>
      <Tabs value={tab} onChange={go} className="mb-5" items={[{ value: "plans", label: "Plans" }, { value: "enrolments", label: "Enrolments" }, { value: "insurer", label: "Insurer file" }]} />
      {tab === "plans" && <Plans plans={plans} reload={loadPlans} />}
      {tab === "enrolments" && <Enrolments plans={plans ?? []} onChanged={loadPlans} />}
      {tab === "insurer" && <InsurerFile plans={plans ?? []} />}
    </div>
  );
}

function Plans({ plans, reload }: { plans: Plan[] | null; reload: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState<Plan | null | "new">(null);
  const viewing = plans?.find((p) => p.uuid === params.get("plan")) ?? null;
  const setViewing = (u: string | null) => router.replace(`/dashboard/benefits${u ? `?plan=${u}` : ""}`, { scroll: false });
  const columns: Column<Plan>[] = [
    { key: "name", header: "Plan", cell: (p) => <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/8 text-primary"><HeartPulse size={17} strokeWidth={1.4} /></span>
      <div><p className="text-ink">{p.name}</p><p className="text-[12.5px] text-faint">{p.kind_label}{p.insurer ? ` · ${p.insurer}` : ""}</p></div></div> },
    { key: "si", header: "Sum insured", align: "right", hideBelow: "md", cell: (p) => <span className="tabular text-muted">{p.sum_insured_basis === "salary_multiple" ? `${Number(p.salary_multiple)}× CTC` : inr(p.sum_insured)}</span> },
    { key: "year", header: "Policy year", hideBelow: "lg", cell: (p) => <span className="text-muted">{formatDate(p.policy_start)} to {formatDate(p.policy_end)}</span> },
    { key: "n", header: "Enrolled", align: "right", cell: (p) => <span className="tabular text-ink">{p.enrolled}{p.waived ? <span className="text-faint"> · {p.waived} opted out</span> : null}</span> },
    { key: "flags", header: "", cell: (p) => <span className="flex flex-wrap gap-1.5">{p.mandatory && <Badge tone="accent">Compulsory</Badge>}{p.renewal_open && <Badge tone="info">Window open</Badge>}{!p.active && <Badge>Off</Badge>}</span> },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New plan</Button></div>
      <DataTable rows={plans ?? []} rowKey={(p) => p.uuid} columns={columns} loading={!plans} onRowClick={(p) => setViewing(p.uuid)}
        emptyIcon={ShieldCheck} emptyTitle="No plans yet" emptyHint="Add your group health policy to start enrolling people." />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="lg" title={viewing?.name ?? ""} description={viewing ? `${viewing.kind_label} · ${viewing.policy_number ?? "no policy number"}` : undefined}
        footer={viewing && <Button variant="primary" icon={Pencil} onClick={() => setEditing(viewing)}>Edit</Button>}>
        {viewing && (
          <div className="space-y-6">
            {viewing.description && <p className="text-[14px] text-muted">{viewing.description}</p>}
            <KeyValue items={[
              { label: "Insurer", value: viewing.insurer ?? "—" }, { label: "TPA", value: viewing.tpa ?? "—" }, { label: "Broker", value: viewing.broker ?? "—" },
              { label: "Policy year", value: `${formatDate(viewing.policy_start)} to ${formatDate(viewing.policy_end)}` },
              { label: "Sum insured", value: viewing.sum_insured_basis === "salary_multiple" ? `${Number(viewing.salary_multiple)} × annual CTC` : inr(viewing.sum_insured) },
              { label: "Employer pays", value: viewing.employer_share_type === "percent" ? `${Number(viewing.employer_share_value)}% of the premium` : `${inr(viewing.employer_share_value)} a year` },
              { label: "Eligibility", value: viewing.eligibility_rule || "Everyone" },
              { label: "Renewal window", value: viewing.renewal_window_from ? `${formatDate(viewing.renewal_window_from)} to ${formatDate(viewing.renewal_window_to!)}` : "Not set" },
            ]} />
            <div>
              <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Tiers</p>
              <div className="divide-y divide-line rounded-xl border border-line">{viewing.tiers.map((t) => (
                <div key={t.code} className="flex items-center justify-between px-4 py-2.5"><span className="text-[14px] text-ink">{t.label}</span><span className="tabular text-[14px] text-muted">{viewing.age_bands.length && t.parents ? "By age" : `${inr(t.premium)} a year`}</span></div>))}</div>
              {viewing.age_bands.length > 0 && <p className="mt-2 text-[12.5px] text-faint">Per parent: {viewing.age_bands.map((b) => `${b.min_age}–${b.max_age}: ${inr(b.premium)}`).join(" · ")}</p>}
            </div>
          </div>
        )}
      </Modal>
      <PlanModal open={!!editing} plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(p) => { setEditing(null); reload(); setViewing(p.uuid); }} />
    </>
  );
}

function Enrolments({ plans, onChanged }: { plans: Plan[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<FilterValues>({ status: ["enrolled"] });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Enrolment> | null>(null);
  const [form, setForm] = useState<Enrolment | "new" | null>(null);
  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), size: "25" });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (filters.plan?.[0]) qs.set("plan", filters.plan[0]);
    if (q) qs.set("q", q);
    api.get<Page<Enrolment>>(`/benefits/enrolments?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [page, filters, q, toast]);
  useEffect(() => { load(); }, [load]);
  async function autoEnrol() {
    try { const r = await api.post<{ enrolled: number; ended: number }>("/benefits/auto-enrol"); toast.success(`${r.enrolled} enrolled, ${r.ended} ended`); load(); onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function end(x: Enrolment) {
    if (!(await confirm({ title: `End ${x.employee_name}'s cover?`, message: `${x.plan_name} ends today and goes into this month's deletions.`, confirmLabel: "End cover", tone: "danger" }))) return;
    try { await api.post(`/benefits/enrolments/${x.uuid}/terminate`, { end_date: todayISO(), reason: "Ended by HR" }); toast.success("Cover ended"); load(); onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  const columns: Column<Enrolment>[] = [
    { key: "who", header: "Employee", cell: (x) => <span className="flex items-center gap-3"><Avatar name={x.employee_name} size={30} /><span><span className="block text-ink">{x.employee_name}</span><span className="block text-[12.5px] text-faint">{x.plan_name}</span></span></span> },
    { key: "tier", header: "Cover", cell: (x) => <div><p className="text-ink/85">{x.tier_label}</p><p className="text-[12.5px] text-faint">{x.dependents.length ? x.dependents.map((d) => d.relation).join(", ") : x.waiver_reason ?? "Self"}</p></div> },
    { key: "si", header: "Sum insured", align: "right", hideBelow: "md", cell: (x) => <span className="tabular text-muted">{x.status === "waived" ? "—" : inr(x.sum_insured)}</span> },
    { key: "ded", header: "Monthly deduction", align: "right", hideBelow: "sm", cell: (x) => <span className="tabular text-muted">{Number(x.monthly_deduction) ? inr(x.monthly_deduction) : "—"}</span> },
    { key: "from", header: "From", hideBelow: "lg", cell: (x) => <span className="text-muted">{formatDate(x.start_date)}{x.end_date ? ` to ${formatDate(x.end_date)}` : ""}</span> },
    { key: "st", header: "Status", cell: (x) => <Badge tone={x.status === "enrolled" ? "good" : x.status === "waived" ? "warn" : "neutral"} dot>{x.status_label}</Badge> },
  ];
  return (
    <>
      <FilterBar search={q} onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search people" values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "plan", label: "Plan", options: plans.map((p) => ({ value: p.uuid, label: p.name })) },
          { key: "status", label: "Status", multiple: true, options: [{ value: "enrolled", label: "Enrolled" }, { value: "waived", label: "Opted out" }, { value: "terminated", label: "Ended" }] }]}
        actions={<><Button variant="secondary" icon={Wand2} onClick={autoEnrol}>Run auto-enrol</Button><Button variant="primary" icon={Plus} onClick={() => setForm("new")}>Enrol</Button></>} />
      <DataTable rows={data?.items ?? []} rowKey={(x) => x.uuid} columns={columns} loading={!data} onRowClick={(x) => x.status === "enrolled" && setForm(x)}
        rowActions={(x) => x.status === "enrolled" ? [{ label: "Change cover", icon: Pencil, onSelect: () => setForm(x) }, { label: "End cover", icon: XCircle, danger: true, onSelect: () => end(x) }] : []}
        pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined}
        emptyIcon={Users} emptyTitle="No enrolments" emptyHint="Enrol people here, run auto-enrol, or let them enrol from My benefits when a window is open." />
      <EnrolModal open={!!form} current={form === "new" ? null : form} plans={plans} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); onChanged(); }} />
    </>
  );
}

function EnrolModal({ open, current, plans, onClose, onSaved }: { open: boolean; current: Enrolment | null; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<string | null>(null);
  const [emp, setEmp] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [family, setFamily] = useState<Family[]>([]);
  const [deps, setDeps] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPlan(current?.plan_uuid ?? plans[0]?.uuid ?? null); setEmp(current?.employee_uuid ?? null); setTier(current?.tier ?? null);
    setDeps(current ? current.dependents.map((d) => d.family_member_id) : []);
  }, [open, current, plans]);
  useEffect(() => { if (emp) api.get<Family[]>(`/benefits/family/${emp}`).then(setFamily).catch(() => setFamily([])); else setFamily([]); }, [emp]);
  const p = plans.find((x) => x.uuid === plan);
  async function save() {
    setBusy(true);
    const body = { plan_uuid: plan, employee_uuid: emp, tier, dependent_ids: deps };
    try { if (current) await api.put(`/benefits/enrolments/${current.uuid}`, body); else await api.post("/benefits/enrolments", body); toast.success("Saved"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title={current ? `${current.employee_name} · ${current.plan_name}` : "Enrol an employee"} busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!plan || !emp} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        {!current && <Field label="Plan" required><Select value={plan} onChange={setPlan} options={plans.filter((x) => x.active).map((x) => ({ value: x.uuid, label: x.name }))} /></Field>}
        {!current && <Field label="Employee" required><Select value={emp} onChange={setEmp} loadOptions={loadPayrollEmployees} placeholder="Search" /></Field>}
        <Field label="Tier"><Select value={tier ?? p?.tiers[0]?.code ?? null} onChange={setTier} options={(p?.tiers ?? []).map((t) => ({ value: t.code, label: t.label, description: `${inr(t.premium)} a year` }))} /></Field>
        {family.length > 0 && (
          <Field label="Family members covered">
            <div className="space-y-2">{family.filter((f) => f.relation_kind !== "other").map((f) => (
              <Checkbox key={f.id} checked={deps.includes(f.id)} onChange={(v) => setDeps(v ? [...deps, f.id] : deps.filter((x) => x !== f.id))}
                label={`${f.name}`} description={`${f.relation ?? ""}${f.date_of_birth ? ` · born ${formatDate(f.date_of_birth)}` : ""}`} />))}</div>
          </Field>
        )}
        {emp && !family.length && <p className="text-[13px] text-muted">No family members on the employee's profile.</p>}
      </div>
    </Modal>
  );
}

function InsurerFile({ plans }: { plans: Plan[] }) {
  const toast = useToast();
  const [plan, setPlan] = useState<string | null>(null);
  const [month, setMonth] = useState(todayISO().slice(0, 8) + "01");
  const [rows, setRows] = useState<{ header: string[]; rows: (string | number)[][]; additions: number; deletions: number } | null>(null);
  useEffect(() => { if (!plan && plans[0]) setPlan(plans[0].uuid); }, [plans, plan]);
  useEffect(() => {
    if (!plan || !month) return;
    setRows(null);
    api.get<typeof rows>(`/benefits/plans/${plan}/insurer-file?month=${month.slice(0, 8)}01&format=json`).then(setRows).catch((e) => toast.error(errMsg(e)));
  }, [plan, month, toast]);
  return (
    <Paper>
      <PaperHeader title="Additions and deletions" action={<Button size="sm" variant="primary" icon={Download} disabled={!plan || !rows?.rows.length}
        onClick={() => downloadWithAuth(`/benefits/plans/${plan}/insurer-file?month=${month.slice(0, 8)}01`, "endorsements.xlsx").catch((e) => toast.error(errMsg(e)))}>Excel for the insurer</Button>} />
      <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-[1fr_200px]">
        <Field label="Plan"><Select value={plan} onChange={setPlan} options={plans.map((p) => ({ value: p.uuid, label: p.name }))} /></Field>
        <Field label="Month (any day in it)"><DateInput value={month} onChange={setMonth} /></Field>
      </div>
      {!rows ? <p className="px-5 py-8 text-center text-muted">Loading…</p> : !rows.rows.length ? <p className="px-5 py-10 text-center text-[13.5px] text-muted">Nobody joined or left the cover this month.</p> : (
        <div className="overflow-x-auto">
          <p className="px-5 pt-4 text-[13px] text-muted">{rows.additions} to add, {rows.deletions} to remove (one row per insured person).</p>
          <table className="mt-2 w-full min-w-[720px] text-[13.5px]">
            <thead><tr className="border-b border-line text-left text-[12px] text-faint">{rows.header.slice(0, 9).map((h) => <th key={h} className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{rows.rows.map((r, i) => <tr key={i}>{r.slice(0, 9).map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? (c === "Addition" ? "text-emerald-700" : "text-rose-700") : "text-ink/85"}`}>{j === 8 ? inr(c) : String(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </Paper>
  );
}

