"use client";

/*
 * Shared bits for the library pages: API types, a small loader hook, money and status labels.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, type BadgeTone } from "@/components/ui-kit";

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export type Book = {
  id: number; uuid: string; title: string; subtitle: string | null; authors: string | null; isbn: string | null;
  publisher: string | null; edition: string | null; year: number | null; category_id: number | null; category_name: string | null;
  subject: string | null; language: string | null; pages: number | null; shelf: string | null; cover_url: string | null;
  description: string | null; kind: string; price: string | null; reference_only: boolean; tags: string[]; active: boolean;
  copies: number; available: number;
};
export type Copy = {
  id: number; uuid: string; accession_no: string; status: string; condition: string | null; shelf: string | null;
  acquired_on: string | null; source: string | null; price: string | null; last_seen_on: string | null; notes: string | null;
  title?: string | null;
  loan?: { uuid: string; member: string; member_uuid: string; due_on: string; issued_on: string; late_days?: number; fine_if_returned?: string; renew_count?: number };
};
export type BookDetail = Book & { copy_list: Copy[]; holds: Hold[]; times_borrowed: number };
export type Loan = {
  id: number; uuid: string; book_uuid: string; title: string; authors: string | null; cover_url: string | null; accession_no: string;
  issued_on: string; due_on: string; returned_on: string | null; status: string; renew_count: number; overdue_days: number;
  member_uuid?: string; member_name?: string; member_type?: string; card_no?: string; fine_so_far?: string; renewals_left?: number;
};
export type Fine = {
  id: number; uuid: string; kind: string; amount: string; days: number | null; status: string; reason: string | null;
  settled_on: string | null; settled_by: string | null; fee_ref: string | null; created_at: string; title: string | null;
  member_uuid?: string | null; member_name?: string | null; member_type?: string | null; card_no?: string | null;
};
export type Hold = {
  id: number; uuid: string; status: string; reserved_at: string; ready_on: string | null; expires_on: string | null;
  book_uuid: string; title: string; authors: string | null; accession_no: string | null;
  member_uuid?: string; member_name?: string; card_no?: string;
};
export type Policy = {
  id: number; uuid: string; member_type: string; name: string; max_books: number; loan_days: number; fine_per_day: string;
  grace_days: number; max_fine: string | null; max_renewals: number; renew_when_overdue: boolean; hold_days: number;
  max_reservations: number; block_fine_above: string | null;
};
export type MemberDetail = {
  id: number; uuid: string; member_type: string; card_no: string; name: string; active: boolean; max_books: number | null;
  notes: string | null; photo_url: string | null; detail: string | null; limit: number; on_loan: number; overdue: number;
  fines_due: string; policy: Policy; loans: Loan[]; fines: Fine[]; holds: Hold[]; history?: Loan[];
};
export type Named = { id: number; uuid: string; name: string; active: boolean };

/** GET a path; `null` path = don't load. `reload()` refetches (the last data stays on screen meanwhile). */
export function useGet<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = path ? `${path}#${nonce}` : "";
  const [state, setState] = useState<{ key: string; data: T | null; error: boolean }>({ key: "", data: null, error: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T>(path)
      .then((data) => { if (live) setState({ key: `${path}#${nonce}`, data, error: false }); })
      .catch(() => { if (live) setState((s) => ({ key: `${path}#${nonce}`, data: s.data, error: true })); });
    return () => { live = false; };
  }, [path, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: path ? state.data : null, loading: !!path && state.key !== key, error: state.key === key && state.error, reload };
}

export const inr = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : undefined);

const COPY_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  available: { label: "On shelf", tone: "good" }, issued: { label: "On loan", tone: "info" }, on_hold: { label: "Kept for hold", tone: "accent" },
  lost: { label: "Lost", tone: "bad" }, damaged: { label: "Damaged", tone: "warn" }, repair: { label: "In repair", tone: "warn" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};
export function CopyStatus({ status }: { status: string }) {
  const s = COPY_STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const FINE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Due", tone: "warn" }, paid: { label: "Paid", tone: "good" }, waived: { label: "Waived", tone: "neutral" },
  billed: { label: "Added to fees", tone: "info" },
};
export function FineStatus({ status }: { status: string }) {
  const s = FINE_STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const FINE_KIND: Record<string, string> = { overdue: "Late return", lost: "Lost book", damaged: "Damaged book", other: "Other" };
export const KIND_LABEL: Record<string, string> = { book: "Book", reference: "Reference", magazine: "Magazine", journal: "Journal", cd: "CD / DVD", other: "Other" };

export function DueBadge({ loan }: { loan: Loan }) {
  if (loan.status === "returned") return <Badge tone="neutral">Returned</Badge>;
  if (loan.status === "lost") return <Badge tone="bad">Lost</Badge>;
  if (loan.overdue_days > 0) return <Badge tone="bad" dot>{loan.overdue_days} {loan.overdue_days === 1 ? "day" : "days"} late</Badge>;
  return <Badge tone="good" dot>On loan</Badge>;
}

/** Plain book cover: the image when there is one, else a soft tile with initials. */
export function Cover({ url, title, size = 40 }: { url?: string | null; title: string; size?: number }) {
  const h = Math.round(size * 1.4);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={h} className="shrink-0 rounded-md border border-line object-cover" style={{ width: size, height: h }} />;
  }
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center rounded-md border border-line bg-primary-soft/50 text-[11px] text-primary" style={{ width: size, height: h }}>
      {initials}
    </span>
  );
}
