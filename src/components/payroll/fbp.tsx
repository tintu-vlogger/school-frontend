"use client";

/*
 * Flexible benefit plan pieces: the employee's panel (split the yearly amount among the
 * benefits, the ledger per benefit, bills sent) with a phone-friendly bill upload (camera on
 * mobile), and the bill preview used by payroll when verifying.
 */
import { useCallback, useEffect, useState } from "react";
import { Camera, Plus, Receipt, Send, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, DateInput, Field, FileDrop, FormGrid, Modal, ModalCancel, NumberInput, Select, Skeleton, TextInput, type Column } from "@/components/ui-kit";
import { StatusPill, errMsg, inr, postForm } from "@/components/payroll/common";

export type FbpClaim = {
  uuid: string; employee_id: number; employee_name: string | null; fy: string; component_code: string; component_name: string;
  bill_date: string; bill_number: string | null; vendor: string | null; amount: string; approved_amount: string | null; paid_amount: string;
  description: string | null; file_ids: string[]; status: string; status_label: string; hr_comment: string | null;
  verified_by_name: string | null; paid_on: string | null; created_at: string | null;
};
export type FbpLedgerRow = { code: string; name: string; limit: string | null; allocated: string; due_so_far: string; accrued: string;
  pending: string; approved: string; paid: string; can_claim: string; tax_free_regimes: string[] };
export type FbpSummary = { fy: string; enabled: boolean; basket: string; allocated: string; accrued: string; balance_paid: string;
  components: FbpLedgerRow[]; declaration: { status: string; allocation: Record<string, string> } | null;
  window: { declaration_from: string; declaration_to: string; declaration_open: boolean; claim_last_date: string; claims_open: boolean };
  choices?: { code: string; name: string; fbp_max: string | null; fbp_tax_free_regimes: string[] }[] };

const CLAIM_TONE: Record<string, string> = { submitted: "pending", approved: "approved", partly_approved: "held", rejected: "rejected", paid: "paid", withdrawn: "cancelled" };
export function ClaimStatus({ c }: { c: FbpClaim }) { return <StatusPill status={CLAIM_TONE[c.status] ?? c.status} label={c.status_label} />; }

/** A bill image or PDF fetched with the signed-in token. */
export function BillPreview({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [type, setType] = useState("");
  useEffect(() => {
    let gone = false; let made: string | null = null;
    (async () => {
      const { API_BASE } = await import("@/lib/api");
      const token = localStorage.getItem("hrms_token");
      const res = await fetch(`${API_BASE}/payroll/fbp/files/${fileId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok || gone) return;
      const blob = await res.blob();
      made = URL.createObjectURL(blob);
      setType(blob.type); setUrl(made);
    })().catch(() => {});
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [fileId]);
  if (!url) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (type === "application/pdf") return <iframe src={url} title="Bill" className="h-[420px] w-full rounded-xl border border-line" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bill" className="max-h-[420px] w-full rounded-xl border border-line object-contain" /></a>;
}

export function ClaimFormModal({ open, onClose, onSaved, rows }: { open: boolean; onClose: () => void; onSaved: () => void; rows: FbpLedgerRow[] }) {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number | null>(null);
  const [num, setNum] = useState("");
  const [vendor, setVendor] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setCode(rows.find((r) => Number(r.can_claim) > 0)?.code ?? null); setAmount(null); setFiles([]); setNum(""); setVendor(""); } }, [open, rows]);
  const row = rows.find((r) => r.code === code);
  async function send() {
    setBusy(true);
    const fd = new FormData();
    fd.append("component_code", code!); fd.append("bill_date", date); fd.append("amount", String(amount));
    if (num) fd.append("bill_number", num);
    if (vendor) fd.append("vendor", vendor);
    files.forEach((f) => fd.append("files", f));
    try { await postForm("/payroll/me/fbp/claims", fd); toast.success("Bill sent for verification"); onSaved(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Send a bill" busy={busy} dirty={files.length > 0 || !!amount}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={busy} disabled={!code || !amount || !files.length} onClick={send}>Send</Button></>}>
      <div className="space-y-5">
        <Field label="Benefit" required hint={row ? `You can claim up to ${inr(row.can_claim)} more this year` : undefined}>
          <Select value={code} onChange={setCode} options={rows.map((r) => ({ value: r.code, label: r.name, description: `${inr(r.can_claim)} left`, disabled: Number(r.can_claim) <= 0 }))} />
        </Field>
        <FormGrid>
          <Field label="Bill date" required><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Amount" required><NumberInput value={amount} onChange={setAmount} min={0} /></Field>
        </FormGrid>
        <FormGrid>
          <Field label="Bill number"><TextInput value={num} onValueChange={setNum} /></Field>
          <Field label="Shop or supplier"><TextInput value={vendor} onValueChange={setVendor} /></Field>
        </FormGrid>
        <Field label="Photo or PDF of the bill" required>
          <FileDrop value={files} onChange={setFiles} accept="image/*,application/pdf" multiple maxFiles={4} maxSizeMb={8}
            title="Take a photo or choose a file" hint="On a phone this opens the camera. JPG, PNG or PDF up to 8 MB." />
        </Field>
        <p className="flex items-center gap-2 text-[12.5px] text-faint"><Camera size={14} strokeWidth={1.4} />Make sure the amount, date and shop name can be read.</p>
      </div>
    </Modal>
  );
}

/** The employee's flexible benefits: split, ledger and bills. */
export function MyFlexibleBenefits() {
  const toast = useToast();
  const [s, setS] = useState<FbpSummary | null>(null);
  const [claims, setClaims] = useState<FbpClaim[] | null>(null);
  const [split, setSplit] = useState<Record<string, number | null>>({});
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.get<FbpSummary>("/payroll/me/fbp").then((x) => {
      setS(x);
      const alloc = x.declaration?.status !== "draft" && x.declaration ? x.declaration.allocation : Object.fromEntries(x.components.map((c) => [c.code, c.allocated]));
      setSplit(Object.fromEntries((x.choices ?? []).map((c) => [c.code, alloc[c.code] ? Number(alloc[c.code]) : null])));
    }).catch((e) => toast.error(errMsg(e)));
    api.get<{ items: FbpClaim[] }>("/payroll/me/fbp/claims").then((r) => setClaims(r.items)).catch(() => setClaims([]));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const total = Object.values(split).reduce<number>((a, b) => a + (b ?? 0), 0);
  async function save(submit: boolean) {
    setBusy(true);
    try { await api.put("/payroll/me/fbp", { allocation: split, submit }); toast.success(submit ? "Your choice is saved" : "Draft saved"); setEditing(false); load(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function withdraw(c: FbpClaim) {
    try { await api.post(`/payroll/me/fbp/claims/${c.uuid}/withdraw`); toast.success("Bill withdrawn"); load(); } catch (e) { toast.error(errMsg(e)); }
  }
  if (!s) return <Skeleton className="h-64 rounded-2xl" />;
  if (!s.enabled || Number(s.basket) === 0) return (
    <Paper className="p-8 text-center"><Receipt size={26} strokeWidth={1.2} className="mx-auto mb-3 text-faint" /><p className="text-ink">No flexible benefits in your salary</p>
      <p className="mt-1 text-[13.5px] text-muted">When your salary has fuel, phone, meal or book allowances you can split them here and claim them tax-free with bills.</p></Paper>);
  const columns: Column<FbpClaim>[] = [
    { key: "what", header: "Bill", cell: (c) => <div><p className="text-ink">{c.component_name}</p><p className="text-[12.5px] text-faint">{formatDate(c.bill_date)}{c.vendor ? ` · ${c.vendor}` : ""}</p></div> },
    { key: "amt", header: "Amount", align: "right", cell: (c) => <div className="text-right"><p className="tabular text-ink">{inr(c.amount)}</p>{c.approved_amount !== null && c.approved_amount !== c.amount && <p className="tabular text-[12.5px] text-faint">Approved {inr(c.approved_amount)}</p>}</div> },
    { key: "paid", header: "Paid", align: "right", hideBelow: "sm", cell: (c) => <span className="tabular text-muted">{Number(c.paid_amount) ? inr(c.paid_amount) : "—"}</span> },
    { key: "st", header: "Status", cell: (c) => <div><ClaimStatus c={c} />{c.hr_comment && <p className="mt-1 text-[12px] text-faint">{c.hr_comment}</p>}</div> },
    { key: "x", header: "", cell: (c) => c.status === "submitted" ? <Button size="sm" variant="ghost" icon={Undo2} onClick={() => withdraw(c)}>Withdraw</Button> : null },
  ];
  const declared = s.declaration && s.declaration.status !== "draft";
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Paper className="p-5"><p className="text-[13px] text-muted">Flexible benefits a year</p><p className="tabular mt-2 text-[24px] font-extralight text-ink">{inr(s.basket)}</p><p className="text-[12.5px] text-faint">FY {s.fy}</p></Paper>
        <Paper className="p-5"><p className="text-[13px] text-muted">Built up so far</p><p className="tabular mt-2 text-[24px] font-extralight text-ink">{inr(s.accrued)}</p><p className="text-[12.5px] text-faint">Held back from monthly pay</p></Paper>
        <Paper className="p-5"><p className="text-[13px] text-muted">Bills by</p><p className="mt-2 text-[24px] font-extralight text-ink">{formatDate(s.window.claim_last_date)}</p><p className="text-[12.5px] text-faint">What is not claimed is paid as taxable pay in March</p></Paper>
      </div>
      <Paper>
        <PaperHeader title="Your benefits" action={<div className="flex gap-2">
          {s.window.declaration_open && <Button size="sm" variant="secondary" onClick={() => setEditing(!editing)}>{editing ? "Close" : declared ? "Change split" : "Choose split"}</Button>}
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setSending(true)}>Send a bill</Button></div>} />
        {editing ? (
          <div className="space-y-4 p-5">
            <p className="text-[13.5px] text-muted">Split {inr(s.basket)} among the benefits you will spend on. Anything not split is paid as taxable pay at the year end.</p>
            {(s.choices ?? []).map((c) => (
              <div key={c.code} className="grid items-center gap-3 sm:grid-cols-[1fr_200px]">
                <div><p className="text-[14px] text-ink">{c.name}</p><p className="text-[12.5px] text-faint">{c.fbp_max ? `Up to ${inr(c.fbp_max)} a year · ` : ""}{c.fbp_tax_free_regimes.length === 2 ? "Tax-free in both regimes" : c.fbp_tax_free_regimes.includes("old") ? "Tax-free in the old regime only" : "Taxable"}</p></div>
                <NumberInput value={split[c.code] ?? null} onChange={(v) => setSplit({ ...split, [c.code]: v })} min={0} max={c.fbp_max ? Number(c.fbp_max) : undefined} />
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className={`text-[13.5px] ${total > Number(s.basket) ? "text-rose-700" : "text-muted"}`}>Split {inr(total)} of {inr(s.basket)}</p>
              <div className="flex gap-2"><Button variant="ghost" loading={busy} onClick={() => save(false)}>Save draft</Button><Button variant="primary" loading={busy} disabled={total > Number(s.basket)} onClick={() => save(true)}>Confirm split</Button></div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {s.components.map((c) => {
              const pct = Number(c.allocated) ? Math.min(100, (Number(c.approved) / Number(c.allocated)) * 100) : 0;
              return (
                <li key={c.code} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[14px] text-ink">{c.name}</p><p className="tabular text-[13.5px] text-muted">{inr(c.approved)} approved of {inr(c.allocated)}</p></div>
                  <div className="mt-2 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1.5 text-[12.5px] text-faint">Paid {inr(c.paid)} · waiting {inr(c.pending)} · can still claim {inr(c.can_claim)}</p>
                </li>);
            })}
            {!declared && <li className="px-5 py-3 text-[13px] text-muted">{s.window.declaration_open ? `Choose your split by ${formatDate(s.window.declaration_to)}; until then your salary's split applies.` : "Your salary's split applies this year."}</li>}
          </ul>
        )}
      </Paper>
      <div>
        <p className="mb-2 text-[13px] text-muted">Bills sent</p>
        <DataTable rows={claims ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!claims} emptyIcon={Receipt} emptyTitle="No bills yet" emptyHint="Send a photo of each bill; payroll checks it and pays it with your salary." />
      </div>
      <ClaimFormModal open={sending} onClose={() => setSending(false)} onSaved={load} rows={s.components} />
      {s.declaration?.status === "locked" && <Badge>Locked by payroll</Badge>}
    </div>
  );
}
