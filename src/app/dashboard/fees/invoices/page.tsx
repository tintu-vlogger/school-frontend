"use client";

/*
 * Invoices (fee demands): list with filters, bulk generation from the fee structures, a
 * one-off invoice, and a detail modal with credit / debit notes, cancel and PDF.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, Download, Eye, FilePlus2, HandCoins, MinusCircle, PlusCircle, Receipt, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, NumberInput,
  RadioCards, Section, Select, Skeleton, TextInput, Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  type Invoice, type Page, InvoiceStatus, useFetch, downloadFile, errMsg, money, n, searchStudents, useFeeMeta, useHeads,
  useProgramOptions, useSectionOptions,
} from "@/components/fees/shared";

export default function InvoicesPage() {
  return <Suspense fallback={null}><Invoices /></Suspense>;
}

function Invoices() {
  const toast = useToast();
  const params = useSearchParams();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const { can } = useAccess();
  const { term } = useInstitution();
  const sections = useSectionOptions();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [section, setSection] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [viewing, setViewing] = useState<string | null>(params.get("view"));
  const [genOpen, setGenOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const today = todayISO();
  const p = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) p.set("q", q);
  const st = filters.status?.[0];
  if (st === "overdue") p.set("overdue", "true");
  else if (st) p.set("status", st === "due" ? "open,partial" : st);
  if (filters.source?.[0]) p.set("source", filters.source[0]);
  if (section) p.set("section_id", String(section));
  const { data, loading, reload: refresh } = useFetch<Page<Invoice>>(`/fees/invoices?${p}`,
    (e) => toast.error("Couldn't load invoices", { description: errMsg(e) }));

  const columns: Column<Invoice>[] = [
    { key: "student", header: term("student"), cell: (i) => <div className="min-w-0"><p className="truncate text-ink">{i.student_name}</p><p className="truncate text-[12.5px] text-muted">{[i.admission_no, i.section_label].filter(Boolean).join(" · ")}</p></div> },
    { key: "title", header: "For", cell: (i) => <div><p className="text-ink/90">{i.title}</p><p className="font-mono text-[12px] text-faint">{i.number}</p></div> },
    { key: "due", header: "Due date", hideBelow: "md", cell: (i) => <span className="text-muted">{formatDate(i.due_date)}</span> },
    { key: "total", header: "Amount", align: "right", cell: (i) => <span className="tabular">{money(i.total, cur)}</span> },
    { key: "balance", header: "Balance", align: "right", cell: (i) => <span className={`tabular ${n(i.balance) > 0 && i.status !== "cancelled" ? "text-ink" : "text-faint"}`}>{i.status === "cancelled" ? "—" : money(i.balance, cur)}</span> },
    { key: "status", header: "Status", cell: (i) => <InvoiceStatus inv={i} today={today} /> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Fees" title="Invoices" description="Fee demands for each instalment. Invoices are never deleted; cancel them with a reason."
        actions={can("fees.manage") ? <>
          <Button icon={FilePlus2} onClick={() => setNewOpen(true)}>One-off invoice</Button>
          <Button variant="primary" icon={Sparkles} onClick={() => setGenOpen(true)}>Generate invoices</Button>
        </> : undefined} />
      <FilterBar searchPlaceholder={`Search by ${term("student").toLowerCase()}, admission no. or invoice no.`}
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", options: [{ value: "due", label: "Due" }, { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }] },
          { key: "source", label: "Type", options: [{ value: "structure", label: "From structure" }, { value: "charge", label: "Charges" }, { value: "manual", label: "One-off" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="w-56"><Select<number> value={section} onChange={(v) => { setSection(v); setPage(1); }} options={sections} clearable placeholder={`All ${term("sections").toLowerCase()}`} /></div>} />
      <DataTable rows={data?.items ?? []} rowKey={(i) => i.uuid} columns={columns} loading={loading} onRowClick={(i) => setViewing(i.uuid)}
        rowActions={(i) => [
          { label: "View details", icon: Eye, onSelect: () => setViewing(i.uuid) },
          { label: "Download PDF", icon: Download, onSelect: () => downloadFile(`/fees/invoices/${i.uuid}/pdf`, "invoice.pdf").catch((e) => toast.error(errMsg(e))) },
        ]}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Receipt} emptyTitle={q || filters.status?.length || section ? "No invoices match" : "No invoices yet"}
        emptyHint={q || filters.status?.length ? "Try another search or clear the filters." : "Set up fee structures, then generate invoices for a session, class or section."}
        emptyAction={can("fees.manage") && !q ? <Button variant="primary" icon={Sparkles} onClick={() => setGenOpen(true)}>Generate invoices</Button> : undefined} />

      <InvoiceDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} currency={cur} />
      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} onDone={() => { setGenOpen(false); refresh(); }} currency={cur} />
      <ManualInvoiceModal open={newOpen} onClose={() => setNewOpen(false)} onDone={(u) => { setNewOpen(false); refresh(); setViewing(u); }} />
    </div>
  );
}

function InvoiceDetail({ uuid, onClose, onChanged, currency }: { uuid: string | null; onClose: () => void; onChanged: () => void; currency: string }) {
  const toast = useToast();
  const { can } = useAccess();
  const [adjust, setAdjust] = useState<"credit" | "debit" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const today = todayISO();

  const { data, reload: load } = useFetch<Invoice>(uuid ? `/fees/invoices/${uuid}` : null, (e) => toast.error(errMsg(e)));
  const inv = data && data.uuid === uuid ? data : null;

  const live = inv && (inv.status === "open" || inv.status === "partial");
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={inv ? inv.title : "Invoice"}
        description={inv ? `${inv.number} · ${inv.student_name}${inv.section_label ? ` · ${inv.section_label}` : ""}` : undefined}
        footer={inv && <>
          <Button icon={Download} onClick={() => downloadFile(`/fees/invoices/${inv.uuid}/pdf`, "invoice.pdf").catch((e) => toast.error(errMsg(e)))}>PDF</Button>
          {live && can("fees.manage") && <Button icon={MinusCircle} onClick={() => setAdjust("credit")}>Credit note</Button>}
          {inv.status !== "cancelled" && can("fees.manage") && <Button icon={PlusCircle} onClick={() => setAdjust("debit")}>Debit note</Button>}
          {inv.status !== "cancelled" && n(inv.paid) === 0 && can("fees.manage") && <Button variant="danger" icon={Ban} onClick={() => setCancelOpen(true)}>Cancel invoice</Button>}
          {live && can("fees.collect") && inv.student_uuid && <Link href={`/dashboard/fees/collect?student=${inv.student_uuid}`}><Button variant="primary" icon={HandCoins}>Collect</Button></Link>}
        </>}>
        {!inv ? <Skeleton className="h-60 w-full" /> : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <InvoiceStatus inv={inv} today={today} />
              {inv.status === "cancelled" && <span className="text-[13px] text-muted">{inv.cancel_reason} · {inv.cancelled_by_name}</span>}
            </div>
            <KeyValue columns={3} items={[
              { label: "Issued", value: formatDate(inv.issue_date) }, { label: "Due", value: formatDate(inv.due_date) },
              { label: "Balance", value: <span className="tabular">{money(inv.balance, currency, { decimals: true })}</span> },
            ]} />
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line text-left text-[12px] text-faint">
                <th className="py-2 font-normal">Fee</th><th className="py-2 text-right font-normal">Amount</th><th className="py-2 text-right font-normal">Concession</th>
                <th className="py-2 text-right font-normal">Tax</th><th className="py-2 text-right font-normal">Net</th><th className="py-2 text-right font-normal">Paid</th>
              </tr></thead>
              <tbody>
                {(inv.lines ?? []).map((ln) => (
                  <tr key={ln.id} className="border-b border-line/70">
                    <td className="py-2 text-ink/90">{ln.description}{ln.concession_note && <span className="block text-[12px] text-emerald-700">{ln.concession_note}</span>}</td>
                    <td className="py-2 text-right tabular">{money(ln.amount, currency)}</td>
                    <td className="py-2 text-right tabular text-emerald-700">{n(ln.concession) ? `−${money(ln.concession, currency)}` : "—"}</td>
                    <td className="py-2 text-right tabular text-muted">{n(ln.tax) ? money(ln.tax, currency) : "—"}</td>
                    <td className="py-2 text-right tabular">{money(ln.net, currency)}</td>
                    <td className="py-2 text-right tabular text-muted">{money(ln.paid, currency)}</td>
                  </tr>
                ))}
                <tr><td className="py-2 text-ink">Total</td><td className="py-2 text-right tabular">{money(inv.gross, currency)}</td>
                  <td className="py-2 text-right tabular text-emerald-700">{n(inv.concession) ? `−${money(inv.concession, currency)}` : "—"}</td>
                  <td className="py-2 text-right tabular text-muted">{money(inv.tax, currency)}</td><td className="py-2 text-right tabular">{money(inv.total, currency)}</td>
                  <td className="py-2 text-right tabular">{money(inv.paid, currency)}</td></tr>
              </tbody>
            </table>
            {n(inv.late_fee) > 0 && <p className="text-[13px] text-amber-700">A late fee of {money(inv.late_fee, currency)} will be added when this is paid today.</p>}
            {(inv.adjustments ?? []).length > 0 && (
              <Section title="Credit and debit notes">
                <ul className="divide-y divide-line text-[13.5px]">
                  {inv.adjustments!.map((a) => (
                    <li key={a.uuid} className="flex justify-between gap-3 py-2">
                      <span><Badge tone={a.kind === "credit" ? "good" : "warn"}>{a.kind === "credit" ? "Credit" : "Debit"}</Badge> <span className="ml-1 text-ink/90">{a.reason}</span>
                        <span className="block text-[12px] text-faint">{a.number} · {a.created_by_name} · {formatDateTime(a.created_at)}</span></span>
                      <span className="tabular">{money(a.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {(inv.payments ?? []).length > 0 && (
              <Section title="Receipts">
                <ul className="divide-y divide-line text-[13.5px]">
                  {inv.payments!.map((p) => (
                    <li key={p.uuid} className="flex justify-between py-2">
                      <span className={p.status !== "paid" ? "text-faint line-through" : "text-ink/90"}>{p.number} · {formatDate(p.paid_on)}</span>
                      <span className="tabular">{money(p.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {inv.created_by_name && <p className="text-[12px] text-faint">Created by {inv.created_by_name} · {formatDateTime(inv.created_at)}</p>}
          </div>
        )}
      </Modal>
      {inv && <AdjustModal key={`${adjust}`} inv={inv} kind={adjust} onClose={() => setAdjust(null)} currency={currency} onDone={() => { setAdjust(null); load(); onChanged(); }} />}
      {inv && <CancelInvoiceModal open={cancelOpen} inv={inv} onClose={() => setCancelOpen(false)} onDone={async () => {
        setCancelOpen(false); load(); onChanged();
      }} />}
    </>
  );
}

function AdjustModal({ inv, kind, onClose, onDone, currency }: { inv: Invoice; kind: "credit" | "debit" | null; onClose: () => void; onDone: () => void; currency: string }) {
  const toast = useToast();
  const heads = useHeads();
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [head, setHead] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !reason.trim()) { toast.error("Enter the amount and a reason"); return; }
    setSaving(true);
    try {
      await api.post(`/fees/invoices/${inv.uuid}/adjust`, { kind, amount, reason: reason.trim(), head_id: head });
      toast.success(kind === "credit" ? "Credit note added" : "Debit note added");
      onDone();
    } catch (err) { toast.error("Couldn't save the note", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!kind} onClose={onClose} size="sm" busy={saving} dirty={!!reason || !!amount}
      title={kind === "credit" ? "Credit note" : "Debit note"}
      description={kind === "credit" ? `Reduce what is due (balance ${money(inv.balance, currency)}).` : "Add a charge to this invoice."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="adjust-form" loading={saving}>Save</Button></>}>
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <Field label="Amount" required><NumberInput value={amount} onChange={setAmount} min={0} /></Field>
        <Field label="Fee head" aside={kind === "credit" ? "Optional" : "Optional, default Other charges"}>
          <Select<number> value={head} onChange={setHead} clearable options={heads.filter((h) => h.active).map((h) => ({ value: h.id, label: h.name }))} />
        </Field>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
      </form>
    </Modal>
  );
}

function CancelInvoiceModal({ open, inv, onClose, onDone }: { open: boolean; inv: Invoice; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (reason.trim().length < 2) { toast.error("Say why the invoice is cancelled"); return; }
    setSaving(true);
    try { await api.post(`/fees/invoices/${inv.uuid}/cancel`, { reason: reason.trim() }); toast.success("Invoice cancelled"); setReason(""); onDone(); }
    catch (e) { toast.error("Couldn't cancel", { description: errMsg(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title={`Cancel ${inv.number}?`}
      description="The invoice stays on record as cancelled. This cannot be undone."
      footer={<><ModalCancel>Keep it</ModalCancel><Button variant="danger" loading={saving} onClick={submit}>Cancel invoice</Button></>}>
      <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={3} autoFocus /></Field>
    </Modal>
  );
}

function GenerateModal({ open, onClose, onDone, currency }: { open: boolean; onClose: () => void; onDone: () => void; currency: string }) {
  const toast = useToast();
  const { term } = useInstitution();
  const programs = useProgramOptions();
  const sections = useSectionOptions();
  const [scope, setScope] = useState<"all" | "program" | "section">("all");
  const [program, setProgram] = useState<number | null>(null);
  const [section, setSection] = useState<number | null>(null);
  const [seqs, setSeqs] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (scope === "program" && !program) { toast.error(`Pick a ${term("program").toLowerCase()}`); return; }
    if (scope === "section" && !section) { toast.error(`Pick a ${term("section").toLowerCase()}`); return; }
    setSaving(true);
    try {
      const r = await api.post<{ created: number; learners: number; without_structure: number; amount: number }>("/fees/invoices/generate", {
        program_id: scope === "program" ? program : null, section_id: scope === "section" ? section : null, instalment_seqs: seqs.length ? seqs : null,
      });
      toast.success(r.created ? `${r.created} invoices made for ${money(r.amount, currency)}` : "Nothing new to bill",
        { description: r.without_structure ? `${r.without_structure} ${term("students").toLowerCase()} have no matching fee structure.` : undefined });
      onDone();
    } catch (e) { toast.error("Couldn't generate invoices", { description: errMsg(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Generate invoices"
      description="Bills each enrolled learner from their fee structure, with concessions applied. Instalments already billed are skipped."
      footer={<><ModalCancel /><Button variant="primary" icon={Sparkles} loading={saving} onClick={submit}>Generate</Button></>}>
      <div className="space-y-4">
        <RadioCards<"all" | "program" | "section"> value={scope} onChange={setScope} columns={3} options={[
          { value: "all", label: "Whole session" }, { value: "program", label: `One ${term("program").toLowerCase()}` }, { value: "section", label: `One ${term("section").toLowerCase()}` },
        ]} />
        {scope === "program" && <Field label={term("program")}><Select<number> value={program} onChange={setProgram} options={programs} /></Field>}
        {scope === "section" && <Field label={term("section")}><Select<number> value={section} onChange={setSection} options={sections} /></Field>}
        <Field label="Instalments" hint="Leave empty to bill every instalment of the session.">
          <MultiSelect<number> value={seqs} onChange={setSeqs} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Instalment ${i + 1}` }))} placeholder="All instalments" />
        </Field>
      </div>
    </Modal>
  );
}

type LineDraft = { key: number; head: number | null; amount: number | null; description: string };
let lk = 1;

function ManualInvoiceModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (uuid: string) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const heads = useHeads();
  const [student, setStudent] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayISO());
  const [lines, setLines] = useState<LineDraft[]>([{ key: lk++, head: null, amount: null, description: "" }]);
  const [saving, setSaving] = useState(false);
  const headOpts = heads.filter((h) => h.active).map((h) => ({ value: h.id, label: h.name }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !title.trim() || lines.some((l) => !l.head || !l.amount)) { toast.error("Fill in the learner, title and each line"); return; }
    setSaving(true);
    try {
      const r = await api.post<Invoice>("/fees/invoices", { student_uuid: student, title: title.trim(), due_date: due,
        lines: lines.map((l) => ({ head_id: l.head, amount: l.amount, description: l.description.trim() || null })) });
      toast.success("Invoice created");
      setStudent(null); setTitle(""); setLines([{ key: lk++, head: null, amount: null, description: "" }]);
      onDone(r.uuid);
    } catch (err) { toast.error("Couldn't create the invoice", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={!!student || !!title} title="One-off invoice"
      description="Bill a learner for something outside the fee structure, such as a trip, uniform or a replacement ID card."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="manual-invoice" loading={saving}>Create invoice</Button></>}>
      <form id="manual-invoice" onSubmit={submit} className="space-y-4">
        <FormGrid>
          <Field label={term("student")} required className="sm:col-span-2"><Select<string> value={student} onChange={setStudent} loadOptions={searchStudents} placeholder="Search" /></Field>
          <Field label="Title" required><TextInput value={title} onValueChange={setTitle} placeholder="e.g. Science trip" /></Field>
          <Field label="Due date" required><DateInput value={due} onChange={setDue} /></Field>
        </FormGrid>
        {lines.map((l) => (
          <div key={l.key} className="flex items-end gap-2">
            <Field label="Fee head" className="flex-1"><Select<number> value={l.head} onChange={(v) => setLines(lines.map((x) => x.key === l.key ? { ...x, head: v } : x))} options={headOpts} /></Field>
            <Field label="Description" className="flex-1"><TextInput value={l.description} onValueChange={(v) => setLines(lines.map((x) => x.key === l.key ? { ...x, description: v } : x))} placeholder="Optional" /></Field>
            <Field label="Amount" className="w-32"><NumberInput value={l.amount} onChange={(v) => setLines(lines.map((x) => x.key === l.key ? { ...x, amount: v } : x))} min={0} /></Field>
            {lines.length > 1 && <Button variant="ghost" icon={Trash2} aria-label="Remove line" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} />}
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={PlusCircle} onClick={() => setLines([...lines, { key: lk++, head: null, amount: null, description: "" }])}>Add line</Button>
      </form>
    </Modal>
  );
}
