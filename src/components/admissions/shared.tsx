"use client";

/*
 * Shared bits for the admissions and certificates pages: types, status words and tones,
 * pickers (staff, sections, programs open), PDF viewing and the activity timeline.
 *   const meta = useAdmissionsMeta();            // stages, statuses, sessions, default session
 *   <StageBadge stage="contacted" />  <StatusBadge status="offered" />
 *   const url = await fetchPdf("/certificates/issued/<uuid>/pdf");
 */
import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, CircleDot, FileText, Mail, MessageSquare, Phone, UserRound, XCircle } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { Badge, Modal, Button, Skeleton, Timeline, type BadgeTone, type SelectOption, type TimelineItem } from "@/components/ui-kit";
import { companyAddress } from "@/components/workplace/files";

export type Option = { key: string; label: string };
export type Meta = {
  stages: Option[]; statuses: Option[]; allowed: Record<string, string[]>; certificate_kinds: Option[];
  sessions: { id: number; name: string; is_current: boolean }[]; default_session_id: number | null;
};

export type Enquiry = {
  id: number; uuid: string; number: string | null; child_name: string; child_first_name: string; child_last_name: string | null;
  child_dob: string | null; child_gender: string | null; parent_name: string | null; parent_relation: string | null;
  phone: string | null; email: string | null; stage: string; stage_label: string; source_id: number | null;
  source_label: string | null; source_detail: string | null; session_id: number | null; session_name: string | null;
  program_id: number | null; program_name: string | null; next_follow_up: string | null; visit_at: string | null;
  counsellor_id: number | null; counsellor_name: string | null; lost_reason: string | null; application_id: number | null;
  created_at: string; stage_changed_at: string | null; archived: boolean;
  current_institution?: string | null; city?: string | null; address?: string | null; notes?: string | null;
  activities?: Activity[]; application?: Application | null;
};

export type Activity = {
  id: number; uuid: string; kind: string; body: string | null; from_value: string | null; to_value: string | null;
  actor_name: string | null; created_at: string; on: "enquiry" | "application";
};

export type Guardian = { relation: string; first_name: string; last_name?: string | null; phone?: string | null; email?: string | null; occupation?: string | null; is_primary?: boolean };
export type AppDocument = { key: string; label: string; required?: boolean; uuid?: string | null; name?: string; size?: number; verified?: boolean; url?: string | null; download_url?: string | null };

export type Application = {
  id: number; uuid: string; application_no: string; name: string; first_name: string; last_name: string | null;
  gender: string | null; date_of_birth: string | null; status: string; status_label: string; channel: string;
  session_id: number; session_name: string | null; program_id: number; program_name: string | null;
  contact_phone: string | null; contact_email: string | null; fee_amount: string; fee_paid: boolean;
  test_at: string | null; interview_at: string | null; test_score: string | null; test_max: string | null;
  interview_score: string | null; interview_max: string | null; merit_score: string | null; merit_rank: number | null;
  offer_state: string; offered_at: string | null; offer_expires_on: string | null; submitted_at: string | null;
  created_at: string; student_id: number | null; student_uuid: string | null; primary_guardian: string | null;
  documents_pending: number;
  // full
  middle_name?: string | null; blood_group?: string | null; nationality?: string | null; religion?: string | null;
  category?: string | null; mother_tongue?: string | null; previous_institution?: string | null; previous_program?: string | null;
  previous_marks?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
  fee_paid_on?: string | null; fee_reference?: string | null; test_venue?: string | null; interviewer_id?: number | null;
  interviewer_name?: string | null; interview_notes?: string | null; offer_note?: string | null; accepted_at?: string | null;
  decision_reason?: string | null; section_id?: number | null; section_label?: string | null; enrolled_at?: string | null;
  remarks?: string | null; national_id?: string | null; guardians?: Guardian[]; custom?: Record<string, unknown>;
  documents?: AppDocument[]; enquiry_uuid?: string | null; allowed?: string[]; can_offer?: boolean;
  seats?: { seats: number; taken: number; available: number; has_offering: boolean };
  activities?: Activity[];
};

export type Offering = {
  id: number; uuid: string; session_id: number; session_name: string | null; program_id: number; program_name: string | null;
  seats: number; application_fee: string; fee_required: boolean; open_online: boolean; opens_on: string | null;
  closes_on: string | null; test_required: boolean; interview_required: boolean; min_age_years: string | null;
  max_age_years: string | null; age_as_on: string | null; notes: string | null; active: boolean;
  applied: number; offered: number; accepted: number; enrolled: number; pending_offers: number; in_progress: number;
  taken: number; available: number;
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export const STAGE_TONE: Record<string, BadgeTone> = {
  new: "info", contacted: "accent", visit_scheduled: "warn", applied: "accent", converted: "good", lost: "neutral",
};
export const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral", submitted: "info", under_review: "info", test_scheduled: "warn", interview: "warn",
  shortlisted: "accent", offered: "accent", accepted: "good", enrolled: "good", rejected: "bad", waitlisted: "warn",
  withdrawn: "neutral",
};
export const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", visit_scheduled: "Visit scheduled", applied: "Applied", converted: "Converted", lost: "Lost",
};
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", under_review: "Under review", test_scheduled: "Test scheduled", interview: "Interview",
  shortlisted: "Shortlisted", offered: "Offered", accepted: "Accepted", enrolled: "Enrolled", rejected: "Rejected",
  waitlisted: "Waitlisted", withdrawn: "Withdrawn",
};
export const STAGES = Object.keys(STAGE_LABEL);
export const STATUSES = Object.keys(STATUS_LABEL);

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"} dot>{STAGE_LABEL[stage] ?? stage}</Badge>;
}
export function StatusBadge({ status, pending }: { status: string; pending?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{STATUS_LABEL[status] ?? status}</Badge>
      {pending && <Badge tone="warn">Offer awaiting approval</Badge>}
    </span>
  );
}

let metaCache: Meta | null = null;
export function useAdmissionsMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(metaCache);
  useEffect(() => {
    let live = true;
    api.get<Meta>("/admissions/meta").then((m) => { metaCache = m; if (live) setMeta(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return meta;
}

export function useOfferings(sessionId: number | null | undefined, nonce = 0): Offering[] | null {
  const [rows, setRows] = useState<{ key: string; rows: Offering[] } | null>(null);
  const key = `${sessionId ?? ""}:${nonce}`;
  useEffect(() => {
    let live = true;
    api.get<Offering[]>(`/admissions/offerings${sessionId ? `?session_id=${sessionId}` : ""}`)
      .then((r) => { if (live) setRows({ key, rows: r }); }).catch(() => { if (live) setRows({ key, rows: [] }); });
    return () => { live = false; };
  }, [key, sessionId]);
  return rows?.key === key ? rows.rows : null;
}

type Emp = { id: number; first_name: string; last_name: string; designation_name?: string | null; email?: string | null };
export const searchStaff = async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<Emp[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name ?? ""}`.trim(), description: e.designation_name || e.email || undefined }));
};

export function useSectionOptions(sessionId: number | null | undefined, programId?: number | null) {
  const [rows, setRows] = useState<{ id: number; label: string; program_id: number }[] | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    api.get<{ id: number; label: string; program_id: number }[]>(`/academics/section-options?session_id=${sessionId}`)
      .then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [sessionId]);
  return (sessionId ? rows ?? [] : []).filter((s) => !programId || s.program_id === programId).map((s) => ({ value: s.id, label: s.label }));
}

export function usePrograms() {
  const [rows, setRows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    api.get<{ items: { id: number; name: string }[] }>("/academics/programs?all=true")
      .then((r) => { if (live) setRows(r.items ?? []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return rows;
}

/** Combine a calendar date and an "HH:MM" time (viewer's clock) into an ISO UTC string. */
export function toIso(day: string, time: string): string | null {
  if (!day) return null;
  const [h, m] = (time || "10:00").split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0).toISOString();
}
export function splitIso(iso: string | null | undefined): { day: string; time: string } {
  if (!iso) return { day: "", time: "10:00" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  if (token) h.Authorization = `Bearer ${token}`;
  const slug = companyAddress();
  if (slug) h["X-Company-Slug"] = slug;
  return h;
}

/** GET a PDF with the sign-in token and return an object URL for a frame or a download. */
export async function fetchPdf(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "The document could not be made.");
  }
  return URL.createObjectURL(await res.blob());
}

/** A modal showing a PDF from the API, with download and print. */
export function PdfModal({ path, title, open, onClose, filename }: { path: string | null; title: string; open: boolean; onClose: () => void; filename?: string }) {
  const [state, setState] = useState<{ path: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!open || !path) return;
    let live = true; let made: string | null = null;
    fetchPdf(path).then((u) => { made = u; if (live) setState({ path, url: u }); })
      .catch((e) => { if (live) setState({ path, error: e instanceof Error ? e.message : "Not available" }); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [open, path]);
  const cur = state?.path === path ? state : null;
  return (
    <Modal open={open} onClose={onClose} size="xl" title={title} flush
      footer={<>
        {cur?.url && <a href={cur.url} download={filename || "document.pdf"}><Button>Download</Button></a>}
        {cur?.url && <Button variant="primary" onClick={() => window.open(cur.url, "_blank")}>Open to print</Button>}
      </>}>
      <div className="h-[70vh] bg-sunken">
        {!cur ? <div className="p-6"><Skeleton className="h-full min-h-[50vh] w-full" /></div>
          : cur.error ? <p className="p-10 text-center text-[14px] text-rose-700">{cur.error}</p>
          : <iframe src={`${cur.url}#view=FitH`} title={title} className="h-full w-full border-0" />}
      </div>
    </Modal>
  );
}

/** An HTML page (srcdoc) preview, e.g. a certificate. */
export function HtmlPreview({ html, className = "h-[62vh]" }: { html: string | null; className?: string }) {
  if (html === null) return <Skeleton className={`w-full ${className}`} />;
  return <iframe srcDoc={html} title="Preview" sandbox="" className={`w-full rounded-xl border border-line bg-[#eceae6] ${className}`} />;
}

const KIND_ICON = { call: Phone, email: Mail, visit: UserRound, meeting: UserRound, note: MessageSquare, sms: MessageSquare, whatsapp: MessageSquare,
  stage: CircleDot, status: CircleDot, assign: UserRound, follow_up: CalendarClock, system: FileText } as const;
const KIND_WORD: Record<string, string> = { call: "Call", email: "Email", visit: "Visit", meeting: "Meeting", note: "Note", sms: "SMS", whatsapp: "WhatsApp" };

export function ActivityTimeline({ items, context = "application" }: { items: Activity[] | undefined; context?: "enquiry" | "application" }) {
  if (!items) return <Skeleton className="h-24 w-full" />;
  if (!items.length) return <p className="text-[13.5px] text-muted">Nothing recorded yet.</p>;
  const label = (v: string | null) => (v ? STAGE_LABEL[v] || STATUS_LABEL[v] || v : "");
  const rows: TimelineItem[] = items.map((a) => {
    const moved = (a.kind === "stage" || a.kind === "status") && a.to_value;
    const tone: TimelineItem["tone"] = a.to_value === "lost" || a.to_value === "rejected" ? "bad"
      : a.to_value === "converted" || a.to_value === "enrolled" || a.to_value === "accepted" ? "good"
      : moved ? "accent" : "neutral";
    const title = moved
      ? (a.from_value ? `${label(a.from_value)} → ${label(a.to_value)}` : label(a.to_value))
      : KIND_WORD[a.kind] ?? (a.body || "Update");
    const showBody = moved || KIND_WORD[a.kind];
    return {
      id: a.id, tone,
      icon: a.to_value === "lost" || a.to_value === "rejected" ? XCircle : a.to_value === "enrolled" ? CheckCircle2 : KIND_ICON[a.kind as keyof typeof KIND_ICON] ?? FileText,
      title: <span>{title}{a.on !== context && <span className="ml-2 text-[12px] text-faint">{a.on}</span>}</span>,
      description: showBody && a.body ? a.body : undefined,
      time: `${a.actor_name ? `${a.actor_name} · ` : ""}${formatDateTime(a.created_at)}`,
    };
  });
  return <Timeline items={rows} />;
}

export const money = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—";
};

export const GENDERS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }];
export const RELATIONS = [{ value: "father", label: "Father" }, { value: "mother", label: "Mother" }, { value: "guardian", label: "Guardian" },
  { value: "grandparent", label: "Grandparent" }, { value: "other", label: "Other" }];
