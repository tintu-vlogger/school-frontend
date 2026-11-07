"use client";

/*
 * Expense claim modals (employee and HR).
 *   <ClaimFormModal open target onClose onSaved />   draft or edit a claim: bills with receipt photos, GST, mileage
 *   <ClaimDetailModal uuid open onClose onChanged /> lines, receipts, policy warnings, approval steps, pay
 *   <AdvanceModal open onClose onSaved />            ask for a travel advance
 */
import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Paperclip, Plus, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { Badge, Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea } from "@/components/ui-kit";
import { StatusPill, downloadWithAuth, errMsg, inr } from "./common";

type Cat = { uuid: string; code: string; name: string; kind: string; mileage_rates: Record<string, number>; gst_applicable: boolean;
  receipt_required_above: string | null; my_limit?: { per_claim: string | null; per_day: string | null; per_month: string | null } };
type LineIn = { uuid?: string; category_uuid: string | null; expense_date: string; amount: number | null; description: string; merchant: string;
  distance_km: number | null; vehicle: string | null; from_place: string; to_place: string; gstin: string; invoice_number: string;
  gst_amount: number | null; receipt: string | null; receipt_name: string | null; has_receipt?: boolean };
export type Claim = { uuid: string; number: string | null; employee_name: string | null; title: string; status: string; status_label: string;
  total: string; approved_total: string; pay_via: string; policy_flags: { category: string; message: string }[]; paid_on: string | null;
  payment_ref: string | null; submitted_at: string | null; lines_count: number; created_at: string; trip_from: string | null; trip_to: string | null;
  lines?: (Omit<LineIn, "amount"> & { uuid: string; category_name: string; amount: string; approved_amount: string | null; flags: string[] })[];
  approval?: { status: string; steps: { uuid: string; name: string; status: string; approver: string | null; comment: string | null; mine: boolean }[] };
  can_manage?: boolean; decided_note?: string | null };

const blank = (): LineIn => ({ category_uuid: null, expense_date: todayISO(), amount: null, description: "", merchant: "", distance_km: null, vehicle: "car",
  from_place: "", to_place: "", gstin: "", invoice_number: "", gst_amount: null, receipt: null, receipt_name: null });

function readFile(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
}

export function ClaimFormModal({ open, target, onClose, onSaved }: { open: boolean; target: Claim | null; onClose: () => void; onSaved: (c: Claim) => void }) {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<LineIn[]>([blank()]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<Cat[]>("/expenses/categories").then(setCats).catch(() => {});
    if (target?.lines) {
      setTitle(target.title);
      setLines(target.lines.map((l) => ({ ...blank(), ...l, amount: Number(l.amount), distance_km: l.distance_km ? Number(l.distance_km) : null, gst_amount: l.gst_amount ? Number(l.gst_amount) : null, receipt: null })));
    } else { setTitle(""); setLines([blank()]); }
  }, [open, target]);
  const set = (i: number, patch: Partial<LineIn>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => {
    const c = cats.find((x) => x.uuid === l.category_uuid);
    return a + (c?.kind === "mileage" ? (l.distance_km ?? 0) * (c.mileage_rates[l.vehicle ?? "car"] ?? 0) : l.amount ?? 0);
  }, 0);
  async function save(submit: boolean) {
    setBusy(true);
    try {
      const body = { title, submit, lines: lines.map((l) => ({ ...l, keep_receipt_of: l.uuid && !l.receipt ? l.uuid : undefined, gstin: l.gstin || undefined })) };
      const c = target ? await api.put<Claim>(`/expenses/claims/${target.uuid}`, body) : await api.post<Claim>("/expenses/claims", body);
      toast.success(submit ? "Claim sent for approval" : "Draft saved");
      onSaved(c);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="xl" title={target ? "Edit claim" : "New expense claim"} busy={busy} dirty
      footer={<><span className="mr-auto tabular text-[14px] text-ink">Total {inr(total)}</span><ModalCancel /><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button><Button variant="primary" loading={busy} disabled={!title || lines.some((l) => !l.category_uuid)} onClick={() => save(true)}>Send for approval</Button></>}>
      <div className="space-y-5">
        <Field label="What is this claim for?" required><TextInput value={title} onValueChange={setTitle} placeholder="e.g. Client visit to Mumbai" /></Field>
        {lines.map((l, i) => {
          const c = cats.find((x) => x.uuid === l.category_uuid);
          const limit = c?.my_limit?.per_claim ?? c?.my_limit?.per_day;
          return (
            <div key={i} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-[13.5px] text-muted">Bill {i + 1}{limit ? ` · limit ${inr(limit)}` : ""}</p>
                {lines.length > 1 && <IconButton icon={Trash2} label="Remove bill" size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} />}</div>
              <FormGrid columns={3}>
                <Field label="Category" required><Select value={l.category_uuid} onChange={(v) => set(i, { category_uuid: v })} options={cats.map((x) => ({ value: x.uuid, label: x.name }))} /></Field>
                <Field label="Date" required><DateInput value={l.expense_date} onChange={(v) => set(i, { expense_date: v })} max={todayISO()} /></Field>
                {c?.kind === "mileage" ? (
                  <Field label="Distance (km)" required hint={`${inr(c.mileage_rates[l.vehicle ?? "car"] ?? 0)} per km`}><NumberInput value={l.distance_km} onChange={(v) => set(i, { distance_km: v })} min={0} /></Field>
                ) : <Field label="Amount (₹)" required><NumberInput value={l.amount} onChange={(v) => set(i, { amount: v })} min={0} /></Field>}
                {c?.kind === "mileage" ? (<>
                  <Field label="Vehicle"><Select value={l.vehicle} onChange={(v) => set(i, { vehicle: v })} options={Object.keys(c.mileage_rates).map((k) => ({ value: k, label: k.replace(/_/g, " ") }))} /></Field>
                  <Field label="From"><TextInput value={l.from_place} onValueChange={(v) => set(i, { from_place: v })} /></Field>
                  <Field label="To"><TextInput value={l.to_place} onValueChange={(v) => set(i, { to_place: v })} /></Field>
                </>) : (<>
                  <Field label="Shop or vendor"><TextInput value={l.merchant} onValueChange={(v) => set(i, { merchant: v })} /></Field>
                  <Field label="Description"><TextInput value={l.description} onValueChange={(v) => set(i, { description: v })} /></Field>
                  {c?.gst_applicable !== false && <Field label="Vendor GSTIN"><TextInput value={l.gstin} onValueChange={(v) => set(i, { gstin: v.toUpperCase() })} placeholder="29ABCDE1234F1Z5" /></Field>}
                  {c?.gst_applicable !== false && <Field label="Invoice number"><TextInput value={l.invoice_number} onValueChange={(v) => set(i, { invoice_number: v })} /></Field>}
                  {c?.gst_applicable !== false && <Field label="GST amount"><NumberInput value={l.gst_amount} onChange={(v) => set(i, { gst_amount: v })} /></Field>}
                </>)}
              </FormGrid>
              <div className="mt-3 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted hover:border-primary hover:text-primary">
                  <Camera size={15} strokeWidth={1.4} />{l.receipt_name || l.has_receipt ? "Change receipt" : "Photo or PDF of the bill"}
                  <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    if (f.size > 2 * 1024 * 1024) { toast.error("Receipts must be 2 MB or smaller"); return; }
                    set(i, { receipt: await readFile(f), receipt_name: f.name });
                  }} />
                </label>
                {(l.receipt_name || l.has_receipt) && <span className="flex items-center gap-1 text-[12.5px] text-emerald-700"><Paperclip size={13} strokeWidth={1.4} />{l.receipt_name ?? "Attached"}</span>}
              </div>
            </div>
          );
        })}
        <Button variant="ghost" icon={Plus} onClick={() => setLines([...lines, blank()])}>Add another bill</Button>
      </div>
    </Modal>
  );
}

export function ClaimDetailModal({ uuid, open, onClose, onChanged, onEdit }: { uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; onEdit?: (c: Claim) => void }) {
  const toast = useToast();
  const [c, setC] = useState<Claim | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [ref, setRef] = useState("");
  const load = () => uuid && api.get<Claim>(`/expenses/claims/${uuid}`).then(setC).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { if (open) { setC(null); load(); } }, [open, uuid]); // eslint-disable-line react-hooks/exhaustive-deps
  async function post(path: string, body?: unknown, ok?: string) {
    try { await api.post(path, body); if (ok) toast.success(ok); load(); onChanged(); return true; } catch (e) { toast.error(errMsg(e)); return false; }
  }
  const mine = c?.approval?.steps.find((s) => s.mine);
  return (
    <Modal open={open} onClose={onClose} size="lg" title={c?.title ?? "Expense claim"} description={c ? `${c.employee_name ?? ""}${c.number ? ` · ${c.number}` : ""}` : undefined}
      headerActions={c && <StatusPill status={c.status} label={c.status_label} />}
      footer={c && (<>
        {["draft", "rejected"].includes(c.status) && onEdit && <Button variant="secondary" onClick={() => onEdit(c)}>Edit</Button>}
        {["draft", "pending"].includes(c.status) && !c.can_manage && <Button variant="ghost" onClick={() => post(`/expenses/claims/${c.uuid}/withdraw`, undefined, "Withdrawn")}>Withdraw</Button>}
        {mine && <><Button variant="secondary" onClick={() => post(`/workflow/tasks/${mine.uuid}/decision`, { decision: "reject" }, "Rejected")}>Reject</Button>
          <Button variant="primary" icon={CheckCircle2} onClick={() => post(`/workflow/tasks/${mine.uuid}/decision`, { decision: "approve" }, "Approved")}>Approve</Button></>}
        {c.can_manage && c.status === "approved" && c.pay_via === "direct" && <Button variant="primary" icon={Wallet} onClick={() => setPayOpen(true)}>Mark paid</Button>}
      </>)}>
      {!c ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-3">
            <div><p className="text-[12px] text-muted">Claimed</p><p className="tabular text-[19px] font-light text-ink">{inr(c.total)}</p></div>
            <div><p className="text-[12px] text-muted">Approved</p><p className="tabular text-[19px] font-light text-ink">{["approved", "paid"].includes(c.status) ? inr(c.approved_total) : "—"}</p></div>
            <div><p className="text-[12px] text-muted">Paid</p><p className="text-[14px] text-ink">{c.pay_via === "payroll" ? "With salary" : "By bank transfer"}</p>{c.paid_on && <p className="text-[12px] text-faint">{formatDate(c.paid_on)} · {c.payment_ref}</p>}</div>
          </div>
          {c.policy_flags.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">{c.policy_flags.map((f, i) => <p key={i}>{f.category}: {f.message}</p>)}</div>}
          <ul className="divide-y divide-line">
            {c.lines?.map((l) => (
              <li key={l.uuid} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-ink">{l.category_name} · {formatDate(l.expense_date)}</p>
                  <p className="text-[12.5px] text-faint">{[l.merchant, l.description, l.distance_km ? `${Number(l.distance_km)} km by ${l.vehicle}` : null, l.from_place && l.to_place ? `${l.from_place} → ${l.to_place}` : null, l.gstin ? `GSTIN ${l.gstin}` : null, l.invoice_number ? `Invoice ${l.invoice_number}` : null].filter(Boolean).join(" · ")}</p>
                  {l.flags.length > 0 && <p className="text-[12px] text-amber-700">{l.flags.join(" · ")}</p>}
                </div>
                {l.has_receipt && <Button size="sm" variant="ghost" icon={Paperclip} onClick={() => downloadWithAuth(`/expenses/claims/${c.uuid}/lines/${l.uuid}/receipt`, "receipt", true)}>Receipt</Button>}
                <div className="text-right"><p className="tabular text-[14px] text-ink">{inr(l.amount)}</p>{l.approved_amount && l.approved_amount !== l.amount && <p className="tabular text-[12px] text-emerald-700">{inr(l.approved_amount)} approved</p>}</div>
              </li>
            ))}
          </ul>
          {c.approval && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[13.5px] text-muted">Approval</p>
              {c.approval.steps.map((s) => <div key={s.uuid} className="flex items-center justify-between py-1 text-[13.5px]"><span className="text-ink">{s.name}<span className="text-faint"> · {s.approver}</span>{s.comment ? <span className="text-muted"> · {s.comment}</span> : null}</span><StatusPill status={s.status} /></div>)}
            </div>
          )}
          {c.decided_note && <p className="text-[13px] text-muted">Note: {c.decided_note}</p>}
        </div>
      )}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="sm" title="Mark claim paid" zIndex={60}
        footer={<><ModalCancel /><Button variant="primary" onClick={async () => { if (c && await post(`/expenses/claims/${c.uuid}/pay`, { reference: ref }, "Marked paid")) setPayOpen(false); }}>Save</Button></>}>
        <Field label="Bank reference"><TextInput value={ref} onValueChange={setRef} /></Field>
      </Modal>
    </Modal>
  );
}

export function AdvanceModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [purpose, setPurpose] = useState("");
  const [needed, setNeeded] = useState("");
  async function save() {
    try { await api.post("/expenses/advances", { amount, purpose, needed_by: needed || undefined }); toast.success("Advance requested"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Ask for a travel advance" footer={<><ModalCancel /><Button variant="primary" disabled={!amount || !purpose} onClick={save}>Send</Button></>}>
      <div className="space-y-4">
        <Field label="Amount (₹)" required><NumberInput value={amount} onChange={setAmount} /></Field>
        <Field label="What for" required><Textarea value={purpose} onValueChange={setPurpose} rows={2} /></Field>
        <Field label="Needed by"><DateInput value={needed} onChange={setNeeded} /></Field>
        <p className="text-[12.5px] text-muted">Settle it later by linking your claim; anything unspent is recovered.</p>
      </div>
    </Modal>
  );
}

void Badge;
