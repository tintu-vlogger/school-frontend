"use client";

/*
 * Hiring requests: a manager asks for a new or replacement position with a budget; it goes
 * through the approval flow. Approved requests become job openings.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, FilePlus2, Plus, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, MasterSelect, Modal, ModalCancel, NumberInput,
  RadioCards, Select, Tabs, Textarea, TextInput, formatDisplayDate, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { useOrgOptions } from "@/components/people/hooks";
import { loadEmployees } from "@/components/workplace/pickers";
import { useHiringMeta } from "@/components/recruitment/common";
import { useEmployeeOptions } from "@/components/recruitment/interviews";
import { JobFormModal } from "@/components/recruitment/job-form";
import { REQ_TONE, errText, lakhs, range, type Page, type Requisition } from "@/components/recruitment/types";

export default function RequisitionsPage() {
  const toast = useToast();
  const meta = useHiringMeta();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [data, setData] = useState<Page<Requisition> | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [view, setView] = useState<Requisition | null>(null);
  const [form, setForm] = useState<{ open: boolean; row: Requisition | null }>({ open: false, row: null });
  const [jobFrom, setJobFrom] = useState<Requisition | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), size: "25", scope: meta?.is_admin ? scope : "mine" });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    api.get<Page<Requisition>>(`/recruitment/requisitions?${p}`).then(setData).catch((e) => toast.error(errText(e)));
  }, [scope, q, filters, page, nonce, toast, meta?.is_admin]);

  const columns: Column<Requisition>[] = [
    { key: "t", header: "Position", cell: (r) => <div><p className="text-ink">{r.title}</p><p className="text-[12.5px] text-faint">{[r.number, r.department].filter(Boolean).join(" · ")}</p></div> },
    { key: "o", header: "Openings", align: "right", cell: (r) => <span className="tabular">{r.openings}</span> },
    { key: "k", header: "Kind", cell: (r) => <span className="text-muted">{r.kind === "replacement" ? `Replacing ${r.replacement_for ?? ""}` : "New position"}</span>, hideBelow: "md" },
    { key: "b", header: "Budget", cell: (r) => <span className="tabular text-muted">{range(r.budget_min, r.budget_max)}</span>, hideBelow: "lg" },
    { key: "by", header: "Raised by", cell: (r) => <span className="text-muted">{r.requested_by_name}</span>, hideBelow: "lg" },
    { key: "s", header: "Status", cell: (r) => <Badge tone={REQ_TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
  ];
  async function act(r: Requisition, what: "submit" | "cancel") {
    try { setView(await api.post<Requisition>(`/recruitment/requisitions/${r.uuid}/${what}`)); toast.success(what === "submit" ? "Sent for approval" : "Request cancelled"); refresh(); }
    catch (e) { toast.error(errText(e)); }
  }
  const statuses = Object.entries(meta?.requisition_statuses ?? {}).map(([value, label]) => ({ value, label }));
  return (
    <div>
      <PageHeader title="Hiring requests" description="Ask for a new or replacement position. It goes for approval before a job is opened."
        actions={<>
          {meta?.is_admin && <Tabs variant="pill" value={scope} onChange={setScope} items={[{ value: "all", label: "All" }, { value: "mine", label: "Mine" }]} />}
          <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, row: null })}>New request</Button>
        </>} />
      <FilterBar searchPlaceholder="Search requests" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: statuses, multiple: true }]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!data} onRowClick={setView}
        emptyIcon={FilePlus2} emptyTitle="No hiring requests" emptyHint="Raise one when your team needs a new person."
        pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined} />

      <Modal open={!!view} onClose={() => setView(null)} size="lg" title={view?.title} description={view?.number ?? undefined}
        headerActions={view && <Badge tone={REQ_TONE[view.status] ?? "neutral"}>{view.status_label}</Badge>}
        footerStart={view && !["filled", "cancelled"].includes(view.status) ? <Button variant="ghost" onClick={() => act(view, "cancel")}>Cancel request</Button> : undefined}
        footer={view && <>
          {(view.status === "draft" || view.status === "rejected") && <Button variant="secondary" onClick={() => { setForm({ open: true, row: view }); setView(null); }}>Edit</Button>}
          {view.status === "draft" && <Button variant="primary" icon={Send} onClick={() => act(view, "submit")}>Send for approval</Button>}
          {view.status === "approved" && meta?.is_admin && !view.jobs.length && <Button variant="primary" icon={Briefcase} onClick={() => { setJobFrom(view); setView(null); }}>Create job</Button>}
        </>}>
        {view && <KeyValue items={[
          { label: "Openings", value: view.openings }, { label: "Kind", value: view.kind === "replacement" ? `Replacement for ${view.replacement_for ?? "—"}` : "New position" },
          { label: "Department", value: view.department }, { label: "Designation", value: view.designation },
          { label: "Location", value: view.location }, { label: "Employment type", value: view.employment_type },
          { label: "Annual CTC budget", value: range(view.budget_min, view.budget_max) },
          { label: "Experience", value: view.min_experience !== null || view.max_experience !== null ? `${view.min_experience ?? 0}–${view.max_experience ?? "+"} years` : null },
          { label: "Needed by", value: view.needed_by ? formatDisplayDate(view.needed_by) : null }, { label: "Hiring manager", value: view.hiring_manager },
          { label: "Raised by", value: `${view.requested_by_name ?? ""} on ${formatDate(view.created_at)}` },
          { label: "Decision", value: view.decided_at ? `${formatDate(view.decided_at)}${view.decision_note ? ` · ${view.decision_note}` : ""}` : null },
          { label: "Why", value: view.justification, span: 2 },
          { label: "Jobs", value: view.jobs.length ? <span className="flex flex-wrap gap-2">{view.jobs.map((j) => <Link key={j.uuid} href={`/dashboard/recruitment/pipeline?job=${j.uuid}`} className="text-primary hover:underline">{j.title}</Link>)}</span> : null, span: 2 },
        ]} />}
      </Modal>
      <RequisitionForm open={form.open} row={form.row} onClose={() => setForm({ open: false, row: null })}
        onSaved={(r) => { setForm({ open: false, row: null }); refresh(); setView(r); }} />
      <JobFormModal open={!!jobFrom} job={null} requisition={jobFrom} onClose={() => setJobFrom(null)}
        onSaved={() => { setJobFrom(null); refresh(); toast.success("Job created. Publish it from Hiring."); }} />
    </div>
  );
}

function RequisitionForm({ open, row, onClose, onSaved }: { open: boolean; row: Requisition | null; onClose: () => void; onSaved: (r: Requisition) => void }) {
  const toast = useToast();
  const org = useOrgOptions();
  const [f, setF] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const empOpts = useEmployeeOptions([f.hiring_manager_id as number, f.replacement_for_id as number]);
  useEffect(() => {
    if (!open) return;
    setF(row ? { ...row, budget_min: row.budget_min ? Number(row.budget_min) : null, budget_max: row.budget_max ? Number(row.budget_max) : null }
      : { title: "", openings: 1, kind: "new", justification: "", needed_by: "" });
    setDirty(false);
  }, [open, row]);
  const set = (k: string, v: unknown) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  async function save(submit: boolean) {
    setBusy(true);
    try {
      const body = { title: f.title, department_id: f.department_id ?? null, designation_id: f.designation_id ?? null, location_id: f.location_id ?? null,
        employment_type_id: f.employment_type_id ?? null, openings: f.openings ?? 1, kind: f.kind, replacement_for_id: f.replacement_for_id ?? null,
        budget_min: f.budget_min ?? null, budget_max: f.budget_max ?? null, min_experience: f.min_experience ?? null, max_experience: f.max_experience ?? null,
        needed_by: f.needed_by || null, justification: f.justification, hiring_manager_id: f.hiring_manager_id ?? null, submit };
      const r = row ? await api.put<Requisition>(`/recruitment/requisitions/${row.uuid}`, body) : await api.post<Requisition>("/recruitment/requisitions", body);
      toast.success(submit ? "Sent for approval" : "Saved as draft");
      setDirty(false);
      onSaved(r);
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  const s = (k: string) => (f[k] as string) ?? "";
  const n = (k: string) => (f[k] as number | null) ?? null;
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={busy} title={row ? "Edit hiring request" : "New hiring request"}
      footer={<><ModalCancel /><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button>
        <Button variant="primary" icon={Send} loading={busy} onClick={() => save(true)}>Send for approval</Button></>}>
      <div className="space-y-4">
        <RadioCards value={s("kind") || "new"} onChange={(v) => set("kind", v)} options={[
          { value: "new", label: "New position", description: "Growing the team" }, { value: "replacement", label: "Replacement", description: "Someone is leaving" }]} />
        <FormGrid>
          <Field label="Position" required><TextInput value={s("title")} onValueChange={(v) => set("title", v)} data-autofocus /></Field>
          <Field label="Openings"><NumberInput value={n("openings")} onChange={(v) => set("openings", v)} min={1} /></Field>
          {s("kind") === "replacement" && <Field label="Replacing" required><Select value={n("replacement_for_id")} onChange={(v) => set("replacement_for_id", v)} loadOptions={loadEmployees} selectedOption={empOpts.find((o) => o.value === n("replacement_for_id")) ?? null} /></Field>}
          <Field label="Department"><Select value={n("department_id")} onChange={(v) => set("department_id", v)} options={org.departments} clearable /></Field>
          <Field label="Designation"><Select value={n("designation_id")} onChange={(v) => set("designation_id", v)} options={org.designations} clearable /></Field>
          <Field label="Location"><Select value={n("location_id")} onChange={(v) => set("location_id", v)} options={org.locations} clearable /></Field>
          <Field label="Employment type"><MasterSelect type="employment_type" value={n("employment_type_id")} onChange={(v) => set("employment_type_id", v)} clearable /></Field>
          <Field label="Annual CTC from"><NumberInput value={n("budget_min")} onChange={(v) => set("budget_min", v)} min={0} suffix="₹" /></Field>
          <Field label="Annual CTC up to" hint={n("budget_max") ? lakhs(n("budget_max")) : undefined}><NumberInput value={n("budget_max")} onChange={(v) => set("budget_max", v)} min={0} suffix="₹" /></Field>
          <Field label="Minimum experience"><NumberInput value={n("min_experience")} onChange={(v) => set("min_experience", v)} min={0} suffix="yrs" /></Field>
          <Field label="Maximum experience"><NumberInput value={n("max_experience")} onChange={(v) => set("max_experience", v)} min={0} suffix="yrs" /></Field>
          <Field label="Needed by"><DateInput value={s("needed_by")} onChange={(v) => set("needed_by", v)} clearable /></Field>
          <Field label="Hiring manager"><Select value={n("hiring_manager_id")} onChange={(v) => set("hiring_manager_id", v)} loadOptions={loadEmployees} selectedOption={empOpts.find((o) => o.value === n("hiring_manager_id")) ?? null} clearable /></Field>
        </FormGrid>
        <Field label="Why is this position needed?" required><Textarea value={s("justification")} onValueChange={(v) => set("justification", v)} rows={3} /></Field>
      </div>
    </Modal>
  );
}
