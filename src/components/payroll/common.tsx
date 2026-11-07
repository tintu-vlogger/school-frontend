"use client";

/*
 * Shared bits for payroll, tax, statutory, expenses, loans and settlement pages:
 * money formatting (Indian grouping), status badges, the access hook, employee pickers
 * that return employee uuids, a small bar chart and the download/upload helpers.
 */
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Badge, type BadgeTone, type SelectOption } from "@/components/ui-kit";
export { downloadWithAuth, postForm } from "@/components/people/types";

export type Page<T> = { items: T[]; total: number; page: number; size: number };

/** ₹1,23,456 (Indian grouping); decimals only when there are paise. */
export function inr(v: string | number | null | undefined, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const hasPaise = Math.round(Math.abs(n) * 100) % 100 !== 0;
  const s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: opts.decimals || hasPaise ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : opts.sign && n > 0 ? "+" : ""}₹${s}`;
}

/** ₹12.4 L / ₹1.2 Cr for big totals on cards. */
export function inrShort(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
}

export function monthLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function currentFY(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(-2)}`;
}

export function fyOptions(): SelectOption<string>[] {
  const now = currentFY();
  const y = Number(now.slice(0, 4));
  return [y + 1, y, y - 1, y - 2].map((x) => ({ value: `${x}-${String(x + 1).slice(-2)}`, label: `FY ${x}-${String(x + 1).slice(-2)}` }));
}

const RUN_TONE: Record<string, BadgeTone> = {
  draft: "neutral", inputs: "info", checked: "info", calculating: "accent", review: "warn", pending_approval: "warn",
  approved: "good", locked: "good", paid: "good", cancelled: "neutral", failed: "bad",
};
const RUN_LABEL: Record<string, string> = {
  draft: "Draft", inputs: "Collecting inputs", checked: "Checked", calculating: "Calculating", review: "In review",
  pending_approval: "Waiting for approval", approved: "Approved", locked: "Locked", paid: "Paid", cancelled: "Cancelled", failed: "Failed",
};
export function RunStatus({ status }: { status: string }) {
  return <Badge tone={RUN_TONE[status] ?? "neutral"} dot>{RUN_LABEL[status] ?? status}</Badge>;
}

const GENERIC_TONE: Record<string, BadgeTone> = {
  draft: "neutral", pending: "warn", pending_approval: "warn", submitted: "info", proofs_submitted: "warn", approved: "good",
  verified: "good", paid: "good", active: "accent", closed: "neutral", rejected: "bad", cancelled: "neutral", settled: "good",
  not_started: "neutral", late: "bad", filed: "good", not_applicable: "neutral", held: "warn", calculated: "good", skipped: "neutral",
  error: "bad", deducted: "good", due: "neutral", skipped_instalment: "warn", prepaid: "info", recovered: "info",
};
const GENERIC_LABEL: Record<string, string> = {
  draft: "Draft", pending: "Pending", pending_approval: "Waiting for approval", submitted: "Declared", proofs_submitted: "Proofs sent",
  approved: "Approved", verified: "Verified", paid: "Paid", active: "Running", closed: "Closed", rejected: "Rejected",
  cancelled: "Withdrawn", settled: "Settled", not_started: "Not started", late: "Late", filed: "Filed", not_applicable: "Not needed",
  held: "On hold", calculated: "Ready", skipped: "Left out", error: "Error", deducted: "Deducted", due: "Due", prepaid: "Prepaid",
  recovered: "Recovered",
};
export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge tone={GENERIC_TONE[status] ?? "neutral"} dot>{label ?? GENERIC_LABEL[status] ?? status.replace(/_/g, " ")}</Badge>;
}

export type PayrollAccess = { permissions: Record<string, boolean>; is_employee: boolean; employee_id: number | null };
let cachedAccess: PayrollAccess | null = null;
export function usePayrollAccess(): PayrollAccess | null {
  const [a, setA] = useState<PayrollAccess | null>(cachedAccess);
  useEffect(() => {
    api.get<PayrollAccess>("/payroll/access").then((x) => { cachedAccess = x; setA(x); })
      .catch(() => setA({ permissions: {}, is_employee: true, employee_id: null }));
  }, []);
  return a;
}
export const can = (a: PayrollAccess | null, p: string) => !!a?.permissions?.[p];

/** Employees for pickers on payroll screens: value is the employee uuid. */
export async function loadPayrollEmployees(q: string): Promise<SelectOption<string>[]> {
  const r = await api.get<Page<{ employee_uuid: string; name: string; employee_code: string | null; designation: string | null }>>(
    `/payroll/salaries?size=30&q=${encodeURIComponent(q)}`);
  return r.items.map((x) => ({ value: x.employee_uuid, label: x.name, description: [x.employee_code, x.designation].filter(Boolean).join(" · ") || undefined }));
}

export function Money({ value, className = "", muted }: { value: string | number | null | undefined; className?: string; muted?: boolean }) {
  return <span className={`tabular ${muted ? "text-muted" : "text-ink"} ${className}`}>{inr(value)}</span>;
}

/** A label/value row used in statements. */
export function Row({ label, value, sub, strong, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={`text-[14px] ${strong ? "text-ink" : "text-ink/85"}`}>{label}</p>
        {sub && <p className="text-[12.5px] text-faint">{sub}</p>}
      </div>
      <span className={`tabular shrink-0 text-[14px] ${strong ? "text-ink" : "text-muted"} ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : ""}`}>{value}</span>
    </div>
  );
}

/** Minimal bars for a monthly trend: gross (light) with net (accent) inside. */
export function TrendBars({ data }: { data: { label: string; gross: number; net: number; cost: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.cost || d.gross));
  if (!data.length) return <p className="px-5 py-10 text-center text-[13.5px] text-muted">The trend appears after the first pay run.</p>;
  return (
    <div className="flex h-48 items-end gap-3 px-5 pb-2 pt-6">
      {data.map((d) => (
        <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="relative flex h-36 w-full max-w-[44px] items-end justify-center">
            <div className="absolute bottom-0 w-full rounded-t-md bg-primary/10" style={{ height: `${(d.cost / max) * 100}%` }} title={`Employer cost ${inr(d.cost)}`} />
            <div className="absolute bottom-0 w-2/3 rounded-t-md bg-primary/30" style={{ height: `${(d.gross / max) * 100}%` }} title={`Gross ${inr(d.gross)}`} />
            <div className="absolute bottom-0 w-1/3 rounded-t-md bg-primary" style={{ height: `${(d.net / max) * 100}%` }} title={`Net ${inr(d.net)}`} />
            <span className="pointer-events-none absolute -top-6 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">{inrShort(d.cost)}</span>
          </div>
          <span className="truncate text-[11.5px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-[12.5px] text-muted">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${i.className}`} />{i.label}</span>)}
    </div>
  );
}

export function errMsg(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error ? e.message : fallback;
}

export const KIND_OPTIONS = [
  { value: "earning", label: "Earning" }, { value: "deduction", label: "Deduction" },
  { value: "employer", label: "Employer contribution" }, { value: "reimbursement", label: "Reimbursement" },
];
export const STATES: SelectOption<string>[] = [
  ["AP", "Andhra Pradesh"], ["AR", "Arunachal Pradesh"], ["AS", "Assam"], ["BR", "Bihar"], ["CG", "Chhattisgarh"], ["GA", "Goa"],
  ["GJ", "Gujarat"], ["HR", "Haryana"], ["HP", "Himachal Pradesh"], ["JH", "Jharkhand"], ["KA", "Karnataka"], ["KL", "Kerala"],
  ["MP", "Madhya Pradesh"], ["MH", "Maharashtra"], ["MN", "Manipur"], ["ML", "Meghalaya"], ["MZ", "Mizoram"], ["NL", "Nagaland"],
  ["OD", "Odisha"], ["PB", "Punjab"], ["RJ", "Rajasthan"], ["SK", "Sikkim"], ["TN", "Tamil Nadu"], ["TS", "Telangana"],
  ["TR", "Tripura"], ["UP", "Uttar Pradesh"], ["UK", "Uttarakhand"], ["WB", "West Bengal"], ["AN", "Andaman and Nicobar"],
  ["CH", "Chandigarh"], ["DH", "Dadra and Nagar Haveli and Daman and Diu"], ["DL", "Delhi"], ["JK", "Jammu and Kashmir"],
  ["LA", "Ladakh"], ["LD", "Lakshadweep"], ["PY", "Puducherry"],
].map(([value, label]) => ({ value, label }));
