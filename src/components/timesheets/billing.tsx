"use client";

/*
 * Timesheet billing: summary with unbilled time, invoices (new invoice with a live GST
 * preview, invoice view with status actions and PDF), hourly rates, and billing settings.
 * Used by the Billing tab of /dashboard/timesheets (timesheet admins only).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, IndianRupee, Plus, RefreshCw, Send, Settings2, Timer, Undo2, XCircle } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, DateRangeInput, Field, FilterBar, FormGrid, FormSection, Modal, ModalCancel,
  NumberInput, Select, StatCard, StatGrid, Tabs, TextInput, Textarea, Toggle, useConfirm,
  type BadgeTone, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { errorText } from "@/components/attendance/shared";
import type { Client, Project } from "@/components/attendance/timesheet-modals";

const SW = 1.4;

/** ₹ with Indian digit grouping. */
export function inr(v: string | number | null | undefined): string {
  const n = Number(v || 0);
  return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Summary = {
  by_status: Partial<Record<"draft" | "sent" | "paid" | "void", { count: number; total: string }>>;
  unbilled: { client_uuid: string; client_name: string; hours: string; from: string; to: string }[];
  settings: BillingSettings; states: Record<string, string>;
};
type BillingSettings = {
  supplier_name: string; supplier_gstin: string; supplier_state: string; supplier_address: string; gst_rate: number;
  sac_code: string; payment_terms_days: number; invoice_prefix: string; bank_details: string;
};
type Line = { project_name: string; employee_name: string | null; hours: string; rate: string; amount: string; from: string; to: string };
type Preview = {
  lines: Line[]; missing_rates: string[]; hours: string; subtotal: string; cgst: string; sgst: string; igst: string; total: string;
  tax_mode: "intra" | "inter"; place_of_supply_name: string; gst_rate: string;
};
type Invoice = {
  uuid: string; number: string | null; status: "draft" | "sent" | "paid" | "void"; status_label: string; client: { uuid: string; name: string; gstin: string | null } | null;
  period_start: string; period_end: string; issue_date: string; due_date: string | null; hours: string; subtotal: string;
  cgst: string; sgst: string; igst: string; total: string; tax_mode: "intra" | "inter"; gst_rate: string; place_of_supply_name: string;
  paid_reference: string | null; paid_at: string | null; sent_at: string | null;
};
type InvoiceFull = Invoice & {
  lines: Line[]; supplier: { name?: string; gstin?: string; state_name?: string; address?: string; bank_details?: string };
  sac_code: string | null; notes: string | null; client_address: string | null;
};
type Rate = { uuid: string; project_id: number | null; project_name: string | null; employee_id: number | null; employee_name: string | null;
  rate: string; effective_from: string; note: string | null; active: boolean; applies_to: string };

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", sent: "info", paid: "good", void: "bad" };

export function InvoiceStatus({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{label ?? status}</Badge>;
}

async function downloadFile(path: string, name: string) {
  const token = localStorage.getItem("hrms_token");
  const r = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error("Couldn't download");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function lookupPeople(q: string): Promise<SelectOption<string>[]> {
  const rows = await api.get<{ value: number; label: string; hint?: string; uuid: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}&limit=20`);
  return rows.map((r) => ({ value: r.uuid, label: r.label, description: r.hint }));
}

function stateOptions(states: Record<string, string>) {
  return Object.entries(states).map(([code, name]) => ({ value: code, label: name, description: code }));
}

function monthRange(): { from: string; to: string } {
  const t = todayISO();
  const d = new Date(`${t.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(`${t.slice(0, 7)}-01T12:00:00Z`); end.setUTCDate(0);
  return { from, to: end.toISOString().slice(0, 10) };
}

// ── Totals block (preview and invoice) ──────────────────────────────

function Totals({ v }: { v: Pick<Preview, "subtotal" | "cgst" | "sgst" | "igst" | "total" | "tax_mode" | "gst_rate"> }) {
  const rate = Number(v.gst_rate);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-6 py-1 ${strong ? "border-t border-line pt-2 text-[15px] text-ink" : "text-muted"}`}>
      <span>{label}</span><span className="tabular">{value}</span>
    </div>
  );
  return (
    <div className="ml-auto w-full max-w-xs text-[13.5px]">
      {row("Taxable value", inr(v.subtotal))}
      {v.tax_mode === "inter" ? row(`IGST @ ${rate}%`, inr(v.igst)) : <>{row(`CGST @ ${rate / 2}%`, inr(v.cgst))}{row(`SGST @ ${rate / 2}%`, inr(v.sgst))}</>}
      {row("Total", inr(v.total), true)}
    </div>
  );
}

function LinesTable({ lines }: { lines: Line[] }) {
  if (!lines.length) return <p className="py-6 text-center text-[13.5px] text-faint">No approved billable hours with a rate in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13.5px]">
        <thead><tr className="border-b border-line text-left text-[12.5px] text-muted">
          <th className="py-2 font-normal">Work</th><th className="py-2 text-right font-normal">Hours</th>
          <th className="py-2 text-right font-normal">Rate</th><th className="py-2 text-right font-normal">Amount</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              <td className="py-2"><p className="text-ink">{l.project_name}</p><p className="text-[12.5px] text-muted">{l.employee_name} · {formatDate(l.from, { year: undefined })} – {formatDate(l.to)}</p></td>
              <td className="tabular py-2 text-right">{Number(l.hours).toFixed(2)}</td>
              <td className="tabular py-2 text-right text-muted">{inr(l.rate)}</td>
              <td className="tabular py-2 text-right text-ink">{inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── New invoice ─────────────────────────────────────────────────────

export function NewInvoiceModal({ open, clients, initial, onClose, onCreated }: {
  open: boolean; clients: Client[]; initial?: { client_uuid?: string; from?: string; to?: string };
  onClose: () => void; onCreated: (inv: InvoiceFull) => void;
}) {
  const toast = useToast();
  const [client, setClient] = useState<string | null>(initial?.client_uuid ?? null);
  const [range, setRange] = useState(initial?.from && initial?.to ? { from: initial.from, to: initial.to } : monthRange());
  const [issue, setIssue] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [pv, setPv] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!client || !range.from || !range.to) { setPv(null); return; }
    let live = true;
    setLoading(true);
    api.post<Preview>("/timesheets/billing/invoices/preview", { client_uuid: client, period_start: range.from, period_end: range.to })
      .then((r) => { if (live) setPv(r); })
      .catch((e) => { if (live) { setPv(null); toast.error(errorText(e, "Couldn't work out the invoice")); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client, range, toast]);
  async function create() {
    if (!client) return;
    setSaving(true);
    try {
      const r = await api.post<InvoiceFull>("/timesheets/billing/invoices", { client_uuid: client, period_start: range.from, period_end: range.to, issue_date: issue || undefined, notes: notes || undefined });
      toast.success("Draft invoice created");
      onCreated(r);
    } catch (e) { toast.error(errorText(e, "Couldn't create the invoice")); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title="New invoice" description="Approved billable hours not on an invoice yet."
      footer={<><ModalCancel /><Button variant="primary" icon={FileText} loading={saving} disabled={!pv || !pv.lines.length || loading} onClick={create}>Create draft</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Client" required><Select value={client} onChange={setClient} placeholder="Choose a client"
            options={clients.filter((c) => c.active).map((c) => ({ value: c.uuid, label: c.name, description: c.gstin ?? undefined }))} /></Field>
          <Field label="Period" required><DateRangeInput value={range} onChange={setRange} clearable={false} /></Field>
          <Field label="Invoice date"><DateInput value={issue} onChange={setIssue} /></Field>
          <Field label="Notes" hint="Printed on the invoice"><TextInput value={notes} onValueChange={setNotes} placeholder="PO 4512" /></Field>
        </FormGrid>
        {pv?.missing_rates.length ? (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={SW} />
            <div><p>No rate for: {pv.missing_rates.join(", ")}.</p><p className="text-amber-700">Add a rate on the Rates tab to bill these hours.</p></div>
          </div>
        ) : null}
        {!client ? <p className="py-6 text-center text-[13.5px] text-faint">Choose a client to see what will be billed.</p>
          : loading && !pv ? <div className="h-32 animate-pulse rounded-xl bg-sunken" />
          : pv && (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <LinesTable lines={pv.lines} />
              {pv.lines.length > 0 && <>
                <Totals v={pv} />
                <p className="text-[12.5px] text-faint">Place of supply: {pv.place_of_supply_name || "same state"} · {pv.tax_mode === "inter" ? "IGST (another state)" : "CGST and SGST (same state)"}</p>
              </>}
            </div>
          )}
      </div>
    </Modal>
  );
}

// ── Invoice view ────────────────────────────────────────────────────

export function InvoiceModal({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [inv, setInv] = useState<InvoiceFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ issue_date: string; due_date: string; notes: string } | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  useEffect(() => {
    if (!uuid) { setInv(null); return; }
    let live = true;
    api.get<InvoiceFull>(`/timesheets/billing/invoices/${uuid}`).then((r) => { if (live) setInv(r); }).catch((e) => toast.error(errorText(e)));
    return () => { live = false; };
  }, [uuid, toast]);
  async function status(s: string, reference?: string) {
    if (!inv) return;
    if (s === "void" && !(await confirm({ title: "Void this invoice?", message: "Its hours can be billed again on a new invoice. This can't be undone.", confirmLabel: "Void", tone: "danger" }))) return;
    setBusy(true);
    try {
      const r = await api.post<InvoiceFull>(`/timesheets/billing/invoices/${inv.uuid}/status`, { status: s, reference });
      setInv(r); setPaying(null);
      toast.success({ sent: "Marked as sent", paid: "Marked as paid", void: "Invoice voided", draft: "Back to draft" }[s] ?? "Saved");
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  async function save(refreshOnly = false) {
    if (!inv) return;
    setBusy(true);
    try {
      const body = refreshOnly || !edit ? {} : { issue_date: edit.issue_date || undefined, due_date: edit.due_date || null, notes: edit.notes };
      const r = await api.put<InvoiceFull>(`/timesheets/billing/invoices/${inv.uuid}`, body);
      setInv(r); setEdit(null);
      toast.success(refreshOnly ? "Hours brought up to date" : "Invoice saved");
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  const s = inv?.supplier ?? {};
  const pdf = () => inv && downloadFile(`/timesheets/billing/invoices/${inv.uuid}/pdf`, `invoice-${(inv.number ?? "draft").replace(/\//g, "-")}.pdf`).catch(() => toast.error("Couldn't download"));
  const footer = inv && (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" icon={Download} onClick={pdf}>PDF</Button>
      <div className="flex flex-wrap gap-2">
        {inv.status === "draft" && !edit && <>
          <Button variant="ghost" icon={XCircle} disabled={busy} onClick={() => status("void")}>Void</Button>
          <Button icon={RefreshCw} loading={busy} onClick={() => save(true)}>Refresh hours</Button>
          <Button onClick={() => setEdit({ issue_date: inv.issue_date, due_date: inv.due_date ?? "", notes: inv.notes ?? "" })}>Edit</Button>
          <Button variant="primary" icon={Send} loading={busy} onClick={() => status("sent")}>Mark as sent</Button>
        </>}
        {inv.status === "draft" && edit && <>
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => save(false)}>Save</Button>
        </>}
        {inv.status === "sent" && paying === null && <>
          <Button variant="ghost" icon={XCircle} disabled={busy} onClick={() => status("void")}>Void</Button>
          <Button icon={Undo2} loading={busy} onClick={() => status("draft")}>Back to draft</Button>
          <Button variant="primary" icon={CheckCircle2} onClick={() => setPaying("")}>Mark as paid</Button>
        </>}
        {inv.status === "sent" && paying !== null && <>
          <Button variant="ghost" onClick={() => setPaying(null)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => status("paid", paying || undefined)}>Confirm payment</Button>
        </>}
        {inv.status === "paid" && <Button icon={Undo2} loading={busy} onClick={() => status("sent")}>Mark as unpaid</Button>}
      </div>
    </div>
  );
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={busy}
      title={inv ? (inv.number ? `Invoice ${inv.number}` : "Draft invoice") : "Invoice"}
      headerActions={inv && <InvoiceStatus status={inv.status} label={inv.status_label} />} footer={footer}>
      {!inv ? <div className="h-64 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-6">
          {paying !== null && (
            <Field label="Payment reference" hint="UTR, cheque number or a note (optional)">
              <TextInput value={paying} onValueChange={setPaying} data-autofocus placeholder="UTR 4581 2290 1123" />
            </Field>
          )}
          {edit && (
            <FormGrid>
              <Field label="Invoice date"><DateInput value={edit.issue_date} onChange={(x) => setEdit({ ...edit, issue_date: x })} /></Field>
              <Field label="Due date"><DateInput value={edit.due_date} onChange={(x) => setEdit({ ...edit, due_date: x })} clearable /></Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea value={edit.notes} onValueChange={(x) => setEdit({ ...edit, notes: x })} rows={2} autoGrow /></Field>
            </FormGrid>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-faint">From</p>
              <p className="mt-1 text-ink">{s.name || "Set your company details in billing settings"}</p>
              {s.address && <p className="whitespace-pre-line text-[13px] text-muted">{s.address}</p>}
              <p className="text-[12.5px] text-muted">GSTIN {s.gstin || "not registered"}{s.state_name ? ` · ${s.state_name}` : ""}</p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-wide text-faint">Bill to</p>
              <p className="mt-1 text-ink">{inv.client?.name}</p>
              {inv.client_address && <p className="whitespace-pre-line text-[13px] text-muted">{inv.client_address}</p>}
              <p className="text-[12.5px] text-muted">GSTIN {inv.client?.gstin || "unregistered"} · Place of supply {inv.place_of_supply_name || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-sunken/60 px-4 py-3 text-[13px] sm:grid-cols-4">
            <div><p className="text-faint">Invoice date</p><p className="text-ink">{formatDate(inv.issue_date)}</p></div>
            <div><p className="text-faint">Due</p><p className="text-ink">{inv.due_date ? formatDate(inv.due_date) : "—"}</p></div>
            <div className="col-span-2"><p className="text-faint">Period</p><p className="text-ink">{formatDate(inv.period_start, { year: undefined })} – {formatDate(inv.period_end)}</p></div>
          </div>
          <LinesTable lines={inv.lines} />
          <Totals v={inv} />
          {inv.notes && !edit && <p className="text-[13px] text-muted">Notes: {inv.notes}</p>}
          {inv.status === "paid" && <p className="text-[13px] text-emerald-700">Paid{inv.paid_at ? ` on ${formatDate(inv.paid_at)}` : ""}{inv.paid_reference ? ` · ${inv.paid_reference}` : ""}</p>}
        </div>
      )}
    </Modal>
  );
}

// ── Rates ───────────────────────────────────────────────────────────

function RateModal({ rate, projects, onClose, onSaved }: { rate: Rate | null; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    project_uuid: rate?.project_id ? projects.find((p) => p.id === rate.project_id)?.uuid ?? null : null as string | null,
    employee_uuid: null as string | null, rate: rate ? Number(rate.rate) : null as number | null,
    effective_from: rate?.effective_from ?? todayISO(), note: rate?.note ?? "", active: rate?.active ?? true,
  });
  const [person, setPerson] = useState<SelectOption<string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!rate?.employee_id) return;
    api.get<{ uuid: string; label: string }[]>(`/employees/lookup?ids=${rate.employee_id}&active_only=false`).then((r) => {
      if (r[0]) { setPerson({ value: r[0].uuid, label: r[0].label }); setV((o) => ({ ...o, employee_uuid: r[0].uuid })); }
    }).catch(() => {});
  }, [rate]);
  const set = (x: Partial<typeof v>) => setV((o) => ({ ...o, ...x }));
  async function save() {
    setSaving(true);
    try {
      const body = { ...v, note: v.note || null };
      if (rate) await api.put(`/timesheets/billing/rates/${rate.uuid}`, body); else await api.post("/timesheets/billing/rates", body);
      toast.success("Rate saved");
      onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={rate ? "Edit rate" : "Add rate"}
      description="A person's rate on a project wins over the project's rate, which wins over the person's own rate."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v.rate || (!v.project_uuid && !v.employee_uuid)} onClick={save}>Save</Button></>}>
      <FormGrid>
        <Field label="Project" hint="Leave empty for the person's rate on every project"><Select value={v.project_uuid} onChange={(x) => set({ project_uuid: x })} clearable placeholder="Any project"
          options={projects.filter((p) => p.billable).map((p) => ({ value: p.uuid, label: p.name, description: p.client_name ?? undefined }))} /></Field>
        <Field label="Person" hint="Leave empty for everyone on the project"><Select value={v.employee_uuid} onChange={(x, o) => { set({ employee_uuid: x }); setPerson(o); }} clearable placeholder="Anyone"
          loadOptions={lookupPeople} selectedOption={person} /></Field>
        <Field label="Hourly rate" required><NumberInput value={v.rate} onChange={(x) => set({ rate: x })} min={0} step={50} suffix="₹ / h" /></Field>
        <Field label="From" required><DateInput value={v.effective_from} onChange={(x) => set({ effective_from: x })} /></Field>
        <Field label="Note" className="sm:col-span-2"><TextInput value={v.note} onValueChange={(x) => set({ note: x })} placeholder="As per the 2026 rate card" /></Field>
        {rate && <div className="sm:col-span-2"><Toggle checked={v.active} onChange={(x) => set({ active: x })} label="In use" /></div>}
      </FormGrid>
    </Modal>
  );
}

function Rates() {
  const [rows, setRows] = useState<Rate[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<{ r: Rate | null; k: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<{ items: Rate[] }>("/timesheets/billing/rates").then((r) => { if (live) setRows(r.items); }).catch(() => { if (live) setRows([]); });
    api.get<Project[]>("/timesheets/projects").then((r) => { if (live) setProjects(r); }).catch(() => {});
    return () => { live = false; };
  }, [nonce]);
  const cols: Column<Rate>[] = [
    { key: "for", header: "Applies to", cell: (r) => <div><p className="text-ink">{[r.project_name, r.employee_name].filter(Boolean).join(" · ")}</p><p className="text-[12.5px] text-muted">{r.applies_to === "person on project" ? "Person on this project" : r.applies_to === "project" ? "Everyone on this project" : "This person, any project"}</p></div> },
    { key: "rate", header: "Rate", align: "right", sortable: true, sortValue: (r) => Number(r.rate), cell: (r) => <span className="tabular text-ink">{inr(r.rate)} <span className="text-faint">/ h</span></span> },
    { key: "from", header: "From", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDate(r.effective_from)}</span> },
    { key: "note", header: "Note", hideBelow: "md", cell: (r) => <span className="text-muted">{r.note || "—"}</span> },
    { key: "active", header: "", cell: (r) => r.active ? null : <Badge>Not in use</Badge> },
  ];
  return (
    <>
      <FilterBar actions={<Button icon={Plus} onClick={() => setForm({ r: null, k: Date.now() })}>Add rate</Button>} />
      <DataTable rows={rows ?? []} rowKey={(r) => r.uuid} columns={cols} loading={!rows} onRowClick={(r) => setForm({ r, k: Date.now() })}
        emptyIcon={IndianRupee} emptyTitle="No rates yet" emptyHint="Set hourly rates for projects or people to bill their time." />
      {form && <RateModal key={form.k} rate={form.r} projects={projects} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNonce((n) => n + 1); }} />}
    </>
  );
}

// ── Settings ────────────────────────────────────────────────────────

function SettingsModal({ states, onClose, onSaved }: { states: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<BillingSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<{ config: BillingSettings }>("/attendance/settings/billing").then((r) => setV(r.config)).catch((e) => toast.error(errorText(e)));
  }, [toast]);
  const set = (x: Partial<BillingSettings>) => { setV((o) => (o ? { ...o, ...x } : o)); setDirty(true); };
  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      await api.put("/attendance/settings/billing", { config: v, effective_from: todayISO() });
      toast.success("Billing settings saved");
      onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" dirty={dirty} busy={saving} title="Billing settings" description="Printed on every invoice."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v} onClick={save}>Save</Button></>}>
      {!v ? <div className="h-64 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-6">
          <FormSection title="Your company">
            <FormGrid>
              <Field label="Name on invoices"><TextInput value={v.supplier_name} onValueChange={(x) => set({ supplier_name: x })} data-autofocus /></Field>
              <Field label="GSTIN"><TextInput value={v.supplier_gstin} onValueChange={(x) => set({ supplier_gstin: x.toUpperCase() })} maxLength={15} /></Field>
              <Field label="State" hint="Same state as the client: CGST and SGST. Another state: IGST.">
                <Select value={v.supplier_state || null} onChange={(x) => set({ supplier_state: x ?? "" })} options={stateOptions(states)} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea value={v.supplier_address} onValueChange={(x) => set({ supplier_address: x })} rows={2} autoGrow /></Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Tax and terms">
            <FormGrid>
              <Field label="GST rate"><NumberInput value={Number(v.gst_rate)} onChange={(x) => set({ gst_rate: x ?? 0 })} min={0} max={28} suffix="%" /></Field>
              <Field label="SAC code" hint="998311 is management consulting"><TextInput value={v.sac_code} onValueChange={(x) => set({ sac_code: x })} /></Field>
              <Field label="Payment due after"><NumberInput value={Number(v.payment_terms_days)} onChange={(x) => set({ payment_terms_days: x ?? 0 })} min={0} max={365} suffix="days" /></Field>
              <Field label="Invoice number prefix" hint="e.g. INV/26-27/0001"><TextInput value={v.invoice_prefix} onValueChange={(x) => set({ invoice_prefix: x })} /></Field>
              <Field label="Bank details" className="sm:col-span-2"><Textarea value={v.bank_details} onValueChange={(x) => set({ bank_details: x })} rows={2} autoGrow placeholder="Account name, number, IFSC" /></Field>
            </FormGrid>
          </FormSection>
        </div>
      )}
    </Modal>
  );
}

// ── The Billing tab ─────────────────────────────────────────────────

type Sub = "invoices" | "rates";
type Page<T> = { items: T[]; total: number };

export function Billing() {
  const [sub, setSub] = useState<Sub>("invoices");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [creating, setCreating] = useState<{ k: number; client_uuid?: string; from?: string; to?: string } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api.get<Summary>("/timesheets/billing/summary").then((r) => { if (live) setSummary(r); }).catch(() => {});
    api.get<Client[]>("/timesheets/clients").then((r) => { if (live) setClients(r); }).catch(() => {});
    return () => { live = false; };
  }, [nonce]);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ page: String(page), size: "25" });
    if (filters.status?.[0]) q.set("status", filters.status[0]);
    if (filters.client?.[0]) q.set("client_uuid", filters.client[0]);
    api.get<Page<Invoice>>(`/timesheets/billing/invoices?${q}`).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData({ items: [], total: 0 }); });
    return () => { live = false; };
  }, [filters, page, nonce]);
  const bs = summary?.by_status ?? {};
  const unbilledHours = useMemo(() => (summary?.unbilled ?? []).reduce((a, u) => a + Number(u.hours), 0), [summary]);
  const cols: Column<Invoice>[] = [
    { key: "no", header: "Invoice", cell: (i) => <div><p className="text-ink">{i.number ?? "Draft"}</p><p className="text-[12.5px] text-muted">{formatDate(i.issue_date)}</p></div> },
    { key: "client", header: "Client", cell: (i) => <span className="text-ink">{i.client?.name}</span> },
    { key: "period", header: "Period", hideBelow: "md", cell: (i) => <span className="text-muted">{formatDate(i.period_start, { year: undefined })} – {formatDate(i.period_end)}</span> },
    { key: "hours", header: "Hours", align: "right", hideBelow: "sm", cell: (i) => <span className="tabular text-muted">{Number(i.hours).toFixed(2)}</span> },
    { key: "gst", header: "GST", align: "right", hideBelow: "lg", cell: (i) => <span className="tabular text-muted">{inr(Number(i.cgst) + Number(i.sgst) + Number(i.igst))}</span> },
    { key: "total", header: "Total", align: "right", sortable: true, sortValue: (i) => Number(i.total), cell: (i) => <span className="tabular text-ink">{inr(i.total)}</span> },
    { key: "status", header: "Status", cell: (i) => <InvoiceStatus status={i.status} label={i.status_label} /> },
  ];
  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard label="Unbilled hours" value={summary ? unbilledHours.toFixed(1) : "–"} icon={Timer} hint={summary ? `${summary.unbilled.length} ${summary.unbilled.length === 1 ? "client" : "clients"}` : undefined} />
        <StatCard label="Drafts" value={summary ? inr(bs.draft?.total) : "–"} icon={FileText} hint={`${bs.draft?.count ?? 0} invoices`} />
        <StatCard label="Waiting for payment" value={summary ? inr(bs.sent?.total) : "–"} icon={Send} hint={`${bs.sent?.count ?? 0} invoices`} />
        <StatCard label="Paid" value={summary ? inr(bs.paid?.total) : "–"} icon={CheckCircle2} hint={`${bs.paid?.count ?? 0} invoices`} />
      </StatGrid>
      {summary && summary.unbilled.length > 0 && (
        <Paper className="px-5 py-4">
          <p className="mb-2 text-[13px] text-muted">Unbilled time</p>
          <ul className="divide-y divide-line">
            {summary.unbilled.map((u) => (
              <li key={u.client_uuid} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div><p className="text-ink">{u.client_name}</p><p className="text-[12.5px] text-muted">{Number(u.hours).toFixed(2)} h · {formatDate(u.from, { year: undefined })} – {formatDate(u.to)}</p></div>
                <Button size="sm" icon={Plus} onClick={() => setCreating({ k: Date.now(), client_uuid: u.client_uuid, from: u.from, to: u.to })}>Create invoice</Button>
              </li>
            ))}
          </ul>
        </Paper>
      )}
      <Tabs<Sub> value={sub} onChange={setSub} items={[{ value: "invoices", label: "Invoices" }, { value: "rates", label: "Rates" }]} />
      {sub === "invoices" && <>
        <FilterBar filters={[
          { key: "status", label: "Status", options: [{ value: "draft", label: "Draft" }, { value: "sent", label: "Sent" }, { value: "paid", label: "Paid" }, { value: "void", label: "Void" }] },
          { key: "client", label: "Client", options: clients.map((c) => ({ value: c.uuid, label: c.name })) },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
          actions={<>
            <Button variant="ghost" icon={Settings2} onClick={() => setSettings(true)}>Billing settings</Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating({ k: Date.now() })}>New invoice</Button>
          </>} />
        <DataTable rows={data?.items ?? []} rowKey={(i) => i.uuid} columns={cols} loading={!data} onRowClick={(i) => setViewing(i.uuid)}
          pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
          emptyIcon={FileText} emptyTitle="No invoices yet" emptyHint="Bill approved hours to a client for a period." />
      </>}
      {sub === "rates" && <Rates />}
      {creating && <NewInvoiceModal key={creating.k} open clients={clients} initial={creating} onClose={() => setCreating(null)}
        onCreated={(inv) => { setCreating(null); refresh(); setViewing(inv.uuid); }} />}
      <InvoiceModal uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} />
      {settings && summary && <SettingsModal states={summary.states} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); refresh(); }} />}
    </div>
  );
}

/** GST states for the client form. */
export function useGstStates(): Record<string, string> {
  const [states, setStates] = useState<Record<string, string>>({});
  useEffect(() => {
    api.getCached<Summary>("/timesheets/billing/summary", 300).then((r) => setStates(r.states)).catch(() => {});
  }, []);
  return states;
}
export { stateOptions };
