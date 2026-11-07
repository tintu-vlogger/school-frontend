"use client";

/*
 * Shared pieces of the communication pages (staff and portal).
 *   useChild() / <ChildSwitcher />         a parent's child picker (from /students/mine)
 *   <Markdown text=... />                   safe, small markdown renderer for notice bodies
 *   <AttachmentPicker /> / <AttachmentList />  upload files (staff or portal endpoint) and show them
 *   <AudienceBuilder value onChange />      who a notice or event is for
 *   categoryTone(), fmtWhen()               display helpers
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatTime } from "@/lib/datetime";
import {
  Checkbox, Field, MultiSelect, RadioCards, Select, Skeleton, formatBytes, formatDisplayDate,
  type BadgeTone, type SelectOption,
} from "@/components/ui-kit";
import { fileHref } from "@/components/workplace/files";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type FileRef = { uuid: string; name: string; size: number; content_type: string; url?: string | null; download_url?: string | null };

export type Audience = {
  everyone: boolean;
  staff: { scope: "none" | "all" | "filter"; department_ids: number[]; roles: string[]; employee_ids: number[] };
  learners: { parents: boolean; students: boolean; scope: "all" | "programs" | "sections" | "students"; program_ids: number[]; section_ids: number[]; student_ids: number[] };
};

export const EMPTY_AUDIENCE: Audience = {
  everyone: false,
  staff: { scope: "none", department_ids: [], roles: [], employee_ids: [] },
  learners: { parents: true, students: false, scope: "sections", program_ids: [], section_ids: [], student_ids: [] },
};

export function normAudience(a?: Partial<Audience> | null): Audience {
  return {
    everyone: !!a?.everyone,
    staff: { ...EMPTY_AUDIENCE.staff, ...(a?.staff ?? {}) },
    learners: { ...EMPTY_AUDIENCE.learners, ...(a?.learners ?? {}) },
  };
}

export type Notice = {
  id: number; uuid: string; title: string; body: string; excerpt: string; category: string; category_label: string;
  attachments: FileRef[]; audience: Audience; audience_label: string | null; channels: string[]; status: string;
  publish_at: string | null; published_at: string | null; expires_at: string | null; pinned: boolean; require_ack: boolean;
  author_name: string | null; author_employee_id: number | null; recipient_count: number; expired: boolean;
  delivery: Record<string, { sent?: number; skipped?: number; failed?: number; note?: string }>;
  stats?: { recipients: number; read: number; acknowledged: number };
  read_at?: string | null; acknowledged_at?: string | null; can_edit?: boolean; is_recipient?: boolean;
  created_at: string;
};

export type CalEvent = {
  id: number; uuid: string; title: string; description: string | null; category: string; category_label: string;
  all_day: boolean; start_date: string; end_date: string; start_at: string | null; end_at: string | null;
  location: string | null; audience: Audience; audience_label: string | null; rsvp_required: boolean;
  rsvp_deadline: string | null; status: string; ptm_day_id: number | null; created_by: string | null;
  rsvp: { yes: number; no: number; maybe: number; guests: number } | null;
  my_rsvp: { response: string; guests: number; note: string | null } | null;
};

export type Thread = {
  id: number; uuid: string; subject: string; status: "open" | "closed"; to_office: boolean; party_kind: "parent" | "student";
  party_name: string; staff_name: string; staff_employee_id: number | null; about_student_id: number | null;
  about_student_name: string | null; unread: number; message_count: number; last_message_at: string | null;
  last_message_preview: string | null; is_broadcast: boolean; closed_by: string | null;
  office_hours?: OfficeHours | null;
};
export type ChatMessage = {
  id: number; uuid: string; sender_kind: string; sender_name: string | null; body: string; mine: boolean;
  attachments: FileRef[]; created_at: string;
};
export type ThreadFull = Thread & { messages: ChatMessage[]; can_reply: boolean; read_only_reason?: string | null };
export type OfficeHours = { enabled: boolean; within: boolean; label: string };

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/* ── Display helpers ───────────────────────────────────────────────────── */

const TONES: Record<string, BadgeTone> = {
  emergency: "bad", holiday: "good", exam: "warn", fee: "info", academic: "accent", event: "accent",
  general: "neutral", ptm: "info", sports: "good", trip: "accent", meeting: "neutral", cultural: "accent", other: "neutral",
};
export const categoryTone = (c: string): BadgeTone => TONES[c] ?? "neutral";

export const CATEGORY_DOT: Record<string, string> = {
  holiday: "bg-emerald-500", exam: "bg-amber-500", ptm: "bg-sky-500", sports: "bg-lime-500", trip: "bg-violet-500",
  meeting: "bg-slate-400", cultural: "bg-pink-500", event: "bg-indigo-500", other: "bg-slate-400",
};

export function eventWhen(e: CalEvent): string {
  const sameDay = e.start_date === e.end_date;
  if (e.all_day || !e.start_at) {
    return sameDay ? `${formatDisplayDate(e.start_date)} · All day` : `${formatDisplayDate(e.start_date)} – ${formatDisplayDate(e.end_date)}`;
  }
  return `${formatDate(e.start_at)} · ${formatTime(e.start_at)}${e.end_at ? ` – ${formatTime(e.end_at)}` : ""}`;
}

/* ── Child picker for parents ──────────────────────────────────────────── */

type Child = { id: number; uuid: string; name: string; first_name: string; section_label: string | null; photo_url: string | null };

export function useChild() {
  const { portalRole } = useAccess();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Child[]>("/students/mine").then((r) => {
      if (!live) return;
      const rows = Array.isArray(r) ? r : [];
      setChildren(rows);
      let saved: number | null = null;
      try { saved = Number(sessionStorage.getItem("portal_child")) || null; } catch { /* storage blocked */ }
      setPicked(rows.find((c) => c.id === saved)?.id ?? rows[0]?.id ?? null);
    }).catch(() => { if (live) setChildren([]); });
    return () => { live = false; };
  }, []);
  const pick = (id: number) => { setPicked(id); try { sessionStorage.setItem("portal_child", String(id)); } catch { /* ignore */ } };
  const current = useMemo(() => children?.find((c) => c.id === picked) ?? null, [children, picked]);
  return { children, studentId: picked, current, pick, isParent: portalRole === "parent", ready: children !== null };
}

export function ChildSwitcher({ child }: { child: ReturnType<typeof useChild> }) {
  if (!child.ready) return <Skeleton className="h-9 w-48" />;
  if (!child.isParent || (child.children?.length ?? 0) < 2) return null;
  return (
    <div className="w-full sm:w-64">
      <Select value={child.studentId} onChange={(v) => v && child.pick(v)} aria-label="Child"
        options={(child.children ?? []).map((c) => ({ value: c.id, label: c.name, description: c.section_label ?? undefined }))} />
    </div>
  );
}

/* ── Markdown (headings, bold, italics, lists, links, paragraphs) ─────── */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<span key={`${key}-${i++}`} className="text-ink [font-weight:500]">{t.slice(2, -2)}</span>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      out.push(<a key={`${key}-${i++}`} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">{label}</a>);
    } else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = (text || "").replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={`space-y-3 text-[14.5px] leading-relaxed text-ink/85 ${className}`}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return <ul key={bi} className="list-disc space-y-1 pl-5">{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${bi}-${li}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return <ol key={bi} className="list-decimal space-y-1 pl-5">{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `${bi}-${li}`)}</li>)}</ol>;
        }
        const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) return <p key={bi} className="text-[16px] text-ink">{inline(h[2], `${bi}`)}</p>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}

/* ── Attachments ───────────────────────────────────────────────────────── */

async function upload(file: File, portal: boolean): Promise<FileRef> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const host = typeof window !== "undefined" ? window.location.hostname.split(".") : [];
  if (host.length > 1 && !["www", "app", "api", "admin"].includes(host[0])) headers["X-Company-Slug"] = host[0];
  const res = await fetch(`${API_BASE}/comms/${portal ? "portal/" : ""}uploads`, { method: "POST", headers, body: form });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(b?.detail || "Upload failed");
  }
  return res.json();
}

export function AttachmentPicker({ value, onChange, portal = false, max = 5, compact = false, onError }: {
  value: FileRef[]; onChange: (v: FileRef[]) => void; portal?: boolean; max?: number; compact?: boolean; onError?: (m: string) => void;
}) {
  const [busy, setBusy] = useState(0);
  async function pick(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).slice(0, Math.max(0, max - value.length));
    setBusy((b) => b + list.length);
    const done: FileRef[] = [];
    for (const f of list) {
      try { done.push(await upload(f, portal)); } catch (e) { onError?.(errText(e)); }
      setBusy((b) => b - 1);
    }
    onChange([...value, ...done]);
  }
  return (
    <div className={compact ? "flex flex-wrap items-center gap-1.5" : "space-y-2"}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((f) => (
            <span key={f.uuid} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-line bg-sunken/50 px-2 py-1 text-[12.5px] text-ink/80">
              <FileText size={13} strokeWidth={1.4} className="shrink-0 text-faint" />
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(value.filter((x) => x.uuid !== f.uuid))} className="text-faint hover:text-ink"><X size={12} strokeWidth={1.6} /></button>
            </span>
          ))}
        </div>
      )}
      {value.length < max && (
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg ${compact ? "p-2 text-muted hover:bg-sunken hover:text-ink" : "border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted hover:border-primary/40 hover:text-ink"}`}
          title="Attach files">
          {busy ? <Loader2 size={15} strokeWidth={1.4} className="animate-spin" /> : <Paperclip size={15} strokeWidth={1.4} />}
          {!compact && <span>{busy ? "Uploading…" : "Attach files"}</span>}
          <input type="file" multiple className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

export function AttachmentList({ files, tone = "light" }: { files: FileRef[]; tone?: "light" | "dark" }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f) => (
        <a key={f.uuid} href={fileHref(f.url)} target="_blank" rel="noreferrer"
          className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border px-2 py-1 text-[12.5px] transition-colors ${tone === "dark" ? "border-white/25 text-white/90 hover:bg-white/10" : "border-line bg-surface text-ink/80 hover:border-line-strong"}`}>
          <FileText size={13} strokeWidth={1.4} className="shrink-0 opacity-70" />
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 opacity-60">{formatBytes(f.size)}</span>
        </a>
      ))}
    </div>
  );
}

/* ── Audience builder ──────────────────────────────────────────────────── */

type Opt = SelectOption<number>;

function useOptions(path: string | null, map: (r: Record<string, unknown>) => Opt): Opt[] {
  const [rows, setRows] = useState<Opt[]>([]);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<unknown>(path).then((r) => {
      const list = (Array.isArray(r) ? r : (r as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];
      if (live) setRows(list.map(map));
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return rows;
}

const searchStaff = async (q: string): Promise<Opt[]> => {
  const r = await api.get<{ id: number; first_name: string; last_name: string; designation_name?: string | null }[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim(), description: e.designation_name ?? undefined }));
};
const searchStudents = async (q: string): Promise<Opt[]> => {
  const r = await api.get<Paged<{ id: number; name: string; section_label: string | null }>>(`/students?size=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (r.items ?? []).map((s) => ({ value: s.id, label: s.name, description: s.section_label ?? undefined }));
};

export function AudienceBuilder({ value, onChange, teacherOnly = false, mySectionIds = [], staffRoles = [] }: {
  value: Audience; onChange: (a: Audience) => void; teacherOnly?: boolean; mySectionIds?: number[]; staffRoles?: string[];
}) {
  const { term } = useInstitution();
  const sections = useOptions("/academics/section-options", (r) => ({ value: r.id as number, label: r.label as string }));
  const programs = useOptions(teacherOnly ? null : "/academics/programs?size=200", (r) => ({ value: r.id as number, label: r.name as string }));
  const depts = useOptions(teacherOnly ? null : "/departments/", (r) => ({ value: r.id as number, label: r.department_name as string }));
  const a = value;
  const setL = (p: Partial<Audience["learners"]>) => onChange({ ...a, everyone: false, learners: { ...a.learners, ...p } });
  const setS = (p: Partial<Audience["staff"]>) => onChange({ ...a, everyone: false, staff: { ...a.staff, ...p } });
  const mode = a.everyone ? "everyone" : "custom";
  const sectionOpts = teacherOnly ? sections.filter((s) => mySectionIds.includes(s.value)) : sections;
  const scopeOptions = teacherOnly
    ? [{ value: "sections", label: `Whole ${term("section").toLowerCase()}` }, { value: "students", label: `Some ${term("students").toLowerCase()}` }]
    : [{ value: "all", label: "All" }, { value: "programs", label: `By ${term("program").toLowerCase()}` },
       { value: "sections", label: `By ${term("section").toLowerCase()}` }, { value: "students", label: `Some ${term("students").toLowerCase()}` }];
  return (
    <div className="space-y-4">
      {!teacherOnly && (
        <RadioCards columns={2} value={mode} onChange={(v) => onChange(v === "everyone" ? { ...a, everyone: true } : { ...a, everyone: false })}
          options={[{ value: "everyone", label: "Everyone", description: `All staff, ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()}` },
                    { value: "custom", label: "Choose", description: "Pick groups or people" }]} />
      )}
      {mode === "custom" && (
        <>
          {!teacherOnly && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[13px] text-muted">Staff</p>
              <div className="flex flex-wrap gap-2">
                {(["none", "all", "filter"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setS({ scope: s })}
                    className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${a.staff.scope === s ? "border-primary/40 bg-primary-soft/60 text-primary" : "border-line text-muted hover:text-ink"}`}>
                    {s === "none" ? "No staff" : s === "all" ? "All staff" : "Some staff"}
                  </button>
                ))}
              </div>
              {a.staff.scope === "filter" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Departments"><MultiSelect value={a.staff.department_ids} onChange={(v) => setS({ department_ids: v })} options={depts} placeholder="Any" /></Field>
                  <Field label="Roles"><MultiSelect value={a.staff.roles} onChange={(v) => setS({ roles: v })} options={staffRoles.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} placeholder="Any" /></Field>
                  <Field label="People"><MultiSelect value={a.staff.employee_ids} onChange={(v) => setS({ employee_ids: v })} loadOptions={searchStaff} placeholder="Search staff" /></Field>
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-[13px] text-muted">{term("guardians")} and {term("students").toLowerCase()}</p>
            <div className="flex flex-wrap gap-4">
              <Checkbox checked={a.learners.parents} onChange={(v) => setL({ parents: v })} label={term("guardians")} />
              <Checkbox checked={a.learners.students} onChange={(v) => setL({ students: v })} label={term("students")} />
            </div>
            {(a.learners.parents || a.learners.students) && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {scopeOptions.map((o) => (
                    <button key={o.value} type="button" onClick={() => setL({ scope: o.value as Audience["learners"]["scope"] })}
                      className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${a.learners.scope === o.value ? "border-primary/40 bg-primary-soft/60 text-primary" : "border-line text-muted hover:text-ink"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {a.learners.scope === "programs" && <MultiSelect value={a.learners.program_ids} onChange={(v) => setL({ program_ids: v })} options={programs} placeholder={`Pick ${term("programs").toLowerCase()}`} />}
                {a.learners.scope === "sections" && <MultiSelect value={a.learners.section_ids} onChange={(v) => setL({ section_ids: v })} options={sectionOpts} placeholder={`Pick ${term("sections").toLowerCase()}`} />}
                {a.learners.scope === "students" && <MultiSelect value={a.learners.student_ids} onChange={(v) => setL({ student_ids: v })} loadOptions={searchStudents} placeholder={`Search ${term("students").toLowerCase()}`} />}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Live count of who an audience reaches. */
export function AudiencePreview({ audience }: { audience: Audience }) {
  const [p, setP] = useState<{ label: string; staff: number; parents: number; students: number; total: number; allowed: boolean; reason?: string | null; portal_sign_ins?: number } | null>(null);
  const key = JSON.stringify(audience);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.post<typeof p>("/comms/audience/preview", { audience: JSON.parse(key) }).then((r) => { if (live) setP(r); }).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  if (!p) return <Skeleton className="h-5 w-56" />;
  if (!p.allowed) return <p className="text-[13px] text-rose-700">{p.reason}</p>;
  if (!p.total) return <p className="text-[13px] text-muted">No one yet. Pick who should get it.</p>;
  const bits = [p.staff && `${p.staff} staff`, p.parents && `${p.parents} parents`, p.students && `${p.students} learners`].filter(Boolean).join(", ");
  return <p className="text-[13px] text-muted"><span className="text-ink">{p.total}</span> people · {bits}{p.label ? ` · ${p.label}` : ""}</p>;
}
