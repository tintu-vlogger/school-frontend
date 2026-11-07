"use client";

/*
 * Shared bits of the fees pages: types, the currency formatter (institution currency),
 * status badges, pickers and file helpers.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, type BadgeTone, type SelectOption } from "@/components/ui-kit";

export type Money = number | string;

export type FeeMeta = {
  currency: string;
  modes: Record<string, string>;
  head_kinds: Record<string, string>;
  reasons: Record<string, string>;
  plans: Record<string, string>;
  allow_advance: boolean;
  bounce_charge: number;
  concession_approval: boolean;
};

export type InvoiceLine = {
  id: number; head_id: number; head: string | null; head_code: string | null; description: string; amount: Money;
  concession: Money; concession_note: string | null; tax_rate: Money | null; tax: Money; net: Money; credited: Money;
  paid: Money; due: Money; refunded: Money; kind: string;
};

export type Invoice = {
  id: number; uuid: string; number: string | null; title: string; issue_date: string; due_date: string;
  gross: Money; concession: Money; tax: Money; total: Money; credited: Money; paid: Money; balance: Money;
  status: "open" | "partial" | "paid" | "cancelled"; source: string; student_id: number; student_uuid: string | null;
  student_name: string | null; admission_no: string | null; section_label: string | null; notes: string | null;
  cancel_reason: string | null; cancelled_at: string | null; cancelled_by_name: string | null; created_by_name: string | null;
  created_at: string; lines?: InvoiceLine[]; late_fee?: Money; payable?: Money;
  adjustments?: { uuid: string; number: string | null; kind: string; amount: Money; reason: string; head: string | null; created_by_name: string | null; created_at: string }[];
  payments?: { uuid: string; number: string | null; paid_on: string; status: string; amount: Money }[];
};

export type PaymentMode = { mode: string; label: string; amount: Money; reference: string | null; bank: string | null; instrument_date: string | null; status: string };

export type Payment = {
  id: number; uuid: string; number: string | null; paid_on: string; amount: Money; wallet_used: Money; allocated: Money;
  late_fee: Money; advance: Money; mode: string; mode_label: string; source: string; status: "paid" | "cancelled" | "bounced";
  notes: string | null; collected_by_name: string | null; cancel_reason: string | null; cancelled_at: string | null;
  cancelled_by_name: string | null; student_id: number; student_uuid: string | null; student_name: string | null;
  admission_no: string | null; created_at: string; modes: PaymentMode[];
  allocations?: { invoice_uuid: string; invoice_number: string | null; invoice_title: string; head: string | null; description: string; amount: Money; reversed: boolean }[];
};

export type Concession = {
  id: number; uuid: string; student_id: number; student_uuid: string | null; student_name: string | null; admission_no: string | null;
  name: string; reason: string; reason_label: string; kind: "percent" | "fixed"; value: Money; head_id: number | null; head: string | null;
  valid_from: string | null; valid_to: string | null; status: string; auto: boolean; notes: string | null;
  requested_by_name: string | null; decided_at: string | null; created_at: string;
};

export type Refund = {
  id: number; uuid: string; number: string | null; student_id: number; student_uuid: string | null; student_name: string | null;
  source: string; amount: Money; reason: string; status: string; mode: string | null; reference: string | null; paid_on: string | null;
  requested_by_name: string | null; paid_by_name: string | null; created_at: string;
};

export type StudentBrief = {
  id: number; uuid: string; admission_no: string; name: string; photo_url?: string | null; section_label: string | null;
  program_name?: string | null; roll_no?: string | null; status?: string; due?: Money; overdue?: Money;
};

export type Account = {
  student: StudentBrief; currency: string; today: string; open: Invoice[]; paid: Invoice[]; payments: Payment[];
  total_due: Money; late_fee: Money; overdue: Money; wallet: Money;
  concessions?: Concession[]; deposit_refundable?: Money; refunds?: Refund[]; opt_ins?: number[];
};

export type Head = { id: number; uuid: string; name: string; code: string; kind: string; tax_rate: Money | null; tax_code: string | null; ledger_account: string | null; description: string | null; is_system: boolean; sort_order: number; active: boolean };

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export const n = (v: Money | null | undefined) => Number(v ?? 0) || 0;

let metaCache: Promise<FeeMeta> | null = null;
export function loadMeta(): Promise<FeeMeta> {
  if (!metaCache) metaCache = api.get<FeeMeta>("/fees/meta").catch((e) => { metaCache = null; throw e; });
  return metaCache;
}

export function useFeeMeta(): FeeMeta | null {
  const [meta, setMeta] = useState<FeeMeta | null>(null);
  useEffect(() => { let live = true; loadMeta().then((m) => { if (live) setMeta(m); }).catch(() => {}); return () => { live = false; }; }, []);
  return meta;
}

const formatters = new Map<string, Intl.NumberFormat>();
/** Money in the institution's currency (Indian grouping for INR). */
export function money(v: Money | null | undefined, currency = "INR", opts: { decimals?: boolean } = {}) {
  const key = `${currency}:${opts.decimals ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
        style: "currency", currency, minimumFractionDigits: opts.decimals ? 2 : 0, maximumFractionDigits: 2,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    formatters.set(key, f);
  }
  return f.format(n(v));
}

/** Short form for charts: ₹1.2L, ₹45K. */
export function moneyShort(v: number, currency = "INR") {
  const sym = money(0, currency).replace(/[\d.,\s]/g, "") || "";
  if (currency === "INR") {
    if (Math.abs(v) >= 1e7) return `${sym}${(v / 1e7).toFixed(1)}Cr`;
    if (Math.abs(v) >= 1e5) return `${sym}${(v / 1e5).toFixed(1)}L`;
  } else if (Math.abs(v) >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${sym}${(v / 1e3).toFixed(0)}K`;
  return `${sym}${Math.round(v)}`;
}

const INVOICE_TONE: Record<string, [BadgeTone, string]> = {
  open: ["warn", "Due"], partial: ["info", "Part paid"], paid: ["good", "Paid"], cancelled: ["neutral", "Cancelled"],
};
export function InvoiceStatus({ inv, today }: { inv: Pick<Invoice, "status" | "due_date">; today?: string }) {
  if ((inv.status === "open" || inv.status === "partial") && today && inv.due_date < today) return <Badge tone="bad" dot>Overdue</Badge>;
  const [tone, label] = INVOICE_TONE[inv.status] ?? ["neutral", inv.status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function PaymentStatus({ status }: { status: string }) {
  const map: Record<string, [BadgeTone, string]> = { paid: ["good", "Paid"], cancelled: ["neutral", "Cancelled"], bounced: ["bad", "Bounced"] };
  const [tone, label] = map[status] ?? ["neutral", status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function ApprovalStatus({ status }: { status: string }) {
  const map: Record<string, [BadgeTone, string]> = {
    pending: ["warn", "Waiting for approval"], approved: ["good", "Approved"], paid: ["good", "Paid out"],
    rejected: ["bad", "Rejected"], cancelled: ["neutral", "Cancelled"],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

/** Search learners for pickers (name, admission no., phone, parent's phone). */
export async function searchStudents(q: string): Promise<SelectOption<string>[]> {
  if (!q.trim()) return [];
  const rows = await api.get<StudentBrief[]>(`/fees/students/search?q=${encodeURIComponent(q)}`);
  return rows.map((s) => ({ value: s.uuid, label: s.name, description: [s.admission_no, s.section_label].filter(Boolean).join(" · ") }));
}

export function useSectionOptions(): SelectOption<number>[] {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    let live = true;
    api.getCached<{ id: number; label: string }[]>("/academics/section-options", 120)
      .then((r) => { if (live) setOpts(r.map((s) => ({ value: s.id, label: s.label }))); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return opts;
}

export function useProgramOptions(): SelectOption<number>[] {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    let live = true;
    api.getCached<Page<{ id: number; name: string; active: boolean }>>("/academics/programs?all=true", 120)
      .then((r) => { if (live) setOpts(r.items.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return opts;
}

export type SessionRow = { id: number; uuid: string; name: string; start_date: string; end_date: string; is_current: boolean };
export function useSessions(): SessionRow[] {
  const [rows, setRows] = useState<SessionRow[]>([]);
  useEffect(() => {
    let live = true;
    api.getCached<Page<SessionRow>>("/academics/sessions?all=true", 120).then((r) => { if (live) setRows(r.items); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return rows;
}

export function useHeads(): Head[] {
  const [rows, setRows] = useState<Head[]>([]);
  useEffect(() => {
    let live = true;
    api.get<Page<Head>>("/fees/heads?all=true").then((r) => { if (live) setRows(r.items); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return rows;
}

async function authedFetch(path: string): Promise<Response> {
  const { API_BASE } = await import("@/lib/api");
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    let msg = "Couldn't open the file";
    try { msg = (await res.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res;
}

/** Download (or open in a new tab) a protected file such as a receipt PDF or a CSV export. */
export async function downloadFile(path: string, fallbackName: string, open = false) {
  const res = await authedFetch(path);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener");
  else { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Print a receipt: loads the printable page into a hidden frame and opens the print dialog. */
export async function printReceipt(uuid: string) {
  const res = await authedFetch(`/fees/payments/${uuid}/print`);
  const html = await res.text();
  const frame = document.createElement("iframe");
  frame.style.position = "fixed"; frame.style.right = "0"; frame.style.bottom = "0"; frame.style.width = "0"; frame.style.height = "0"; frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 250);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Load JSON from the API for `path` (null = nothing). `loading` is true until the response for
 *  the current path and reload count has arrived; `reload()` fetches again. */
export function useFetch<T>(path: string | null, onError?: (e: unknown) => void) {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const key = `${path}#${tick}`;
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T>(path).then((d) => { if (live) setRes({ key, data: d, error: null }); })
      .catch((e) => { if (live) { setRes((r) => ({ key, data: r?.data ?? null, error: errMsg(e) })); onError?.(e); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    data: path ? (res?.data ?? null) : null,
    loading: !!path && res?.key !== key,
    error: res?.key === key ? res.error : null,
    reload: () => setTick((t) => t + 1),
  };
}
