"use client";

/*
 * Shared pieces for teaching and learning pages.
 *   const { options, reload } = useLmsOptions()        // section + subject pairs the person may use
 *   <RichText text={hw.instructions} />                 // headings, bullets, links, paragraphs
 *   <Attachments files={hw.attachments} />
 *   <AttachmentPicker value={refs} onChange={setRefs} portal />
 *   const child = useChild()                            // portal: picked child (parents) or the student
 *   <ChildSwitcher child={child} />
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, FileText, Paperclip, X } from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useToast } from "@/lib/toast-context";
import { Badge, FileDrop, Select, Skeleton, formatBytes, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import { uploadLmsFile, uniqueBy, type Allocation, type FileRef, type LmsOptions } from "./lib";

/* ── Options ──────────────────────────────────────────────────────────── */

let optionsMemo: LmsOptions | null = null;

export function useLmsOptions() {
  const [options, setOptions] = useState<LmsOptions | null>(optionsMemo);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<LmsOptions>("/lms/options").then((o) => { optionsMemo = o; if (live) setOptions(o); }).catch(() => {
      if (live) setOptions({ allocations: [], can_manage: false, can_teach: false, can_settings: false, employee_id: null,
        settings: { video_provider: "jitsi", jitsi_domain: "meet.jit.si", homework_allow_late: true, homework_default_due_hour: 9,
          quiz_default_time_limit: 30, quiz_show_answers: "after_close", join_early_minutes: 10 } });
    });
    return () => { live = false; };
  }, [tick]);
  return { options, reload: () => setTick((t) => t + 1) };
}

export function sectionOptions(allocs: Allocation[], subjectId?: number | null): SelectOption<number>[] {
  return uniqueBy(allocs.filter((a) => !subjectId || a.subject_id === subjectId), (a) => a.section_id)
    .map((a) => ({ value: a.section_id, label: a.section_label }));
}

export function subjectOptions(allocs: Allocation[], sectionIds?: number[]): SelectOption<number>[] {
  const rows = sectionIds?.length ? allocs.filter((a) => sectionIds.includes(a.section_id)) : allocs;
  return uniqueBy(rows, (a) => a.subject_id).map((a) => ({ value: a.subject_id, label: a.subject_name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function programOptions(allocs: Allocation[]): SelectOption<number>[] {
  return uniqueBy(allocs, (a) => a.program_id).map((a) => ({ value: a.program_id, label: a.program_name || "" }));
}

/* ── Rich text (markdown-ish) ─────────────────────────────────────────── */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<span key={`${key}-${i++}`} className="text-ink">{tok.slice(2, -2)}</span>);
    else out.push(<a key={`${key}-${i++}`} href={tok} target="_blank" rel="noreferrer" className="text-primary hover:underline">{tok}</a>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(<ul key={`l${k}`} className="my-2 list-disc space-y-1 pl-5">{list.map((l, j) => <li key={j}>{inline(l, `l${k}-${j}`)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, k) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line) || /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) { list.push(bullet[1]); return; }
    flush(k);
    if (!line.trim()) return;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) blocks.push(<p key={k} className="mt-3 text-[14.5px] text-ink first:mt-0">{h[2]}</p>);
    else blocks.push(<p key={k} className="my-1.5">{inline(line, `p${k}`)}</p>);
  });
  flush(lines.length);
  return <div className={`text-[14px] leading-relaxed text-ink/85 ${className}`}>{blocks}</div>;
}

/* ── Attachments ──────────────────────────────────────────────────────── */

export function Attachments({ files }: { files: FileRef[] | null | undefined }) {
  if (!files?.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.uuid}>
          <a href={f.url ? resolveImageUrl(f.url) : undefined} target="_blank" rel="noreferrer"
            className="inline-flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink transition-colors hover:border-line-strong">
            <FileText size={15} strokeWidth={1.4} className="shrink-0 text-faint" />
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-faint">{formatBytes(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function AttachmentPicker({ value, onChange, portal = false, max = 10 }: { value: FileRef[]; onChange: (v: FileRef[]) => void; portal?: boolean; max?: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function add(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const done: FileRef[] = [];
    for (const f of files.slice(0, max - value.length)) {
      try { done.push(await uploadLmsFile(f, portal)); } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    }
    setBusy(false);
    onChange([...value, ...done]);
  }
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((f) => (
            <li key={f.uuid} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
              <Paperclip size={14} strokeWidth={1.4} className="text-faint" />
              <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
              <span className="text-faint">{formatBytes(f.size)}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x.uuid !== f.uuid))} className="rounded p-0.5 text-faint hover:bg-sunken hover:text-ink"><X size={14} strokeWidth={1.4} /></button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <FileDrop value={[]} onChange={add} multiple maxSizeMb={10} disabled={busy}
          title={busy ? "Uploading…" : "Drop files here or click to upload"} hint="PDF, images, documents. Up to 10 MB each." />
      )}
    </div>
  );
}

export function LinkOut({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{children}<ExternalLink size={13} strokeWidth={1.4} /></a>;
}

/* ── States ───────────────────────────────────────────────────────────── */

const STATE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Not handed in", tone: "warn" }, missing: { label: "Missed", tone: "bad" },
  submitted: { label: "Handed in", tone: "info" }, late: { label: "Handed in late", tone: "warn" },
  graded: { label: "Marked", tone: "accent" }, returned: { label: "Returned", tone: "good" },
  resubmit: { label: "Send again", tone: "warn" },
};

export function StateBadge({ state }: { state: string }) {
  const s = STATE[state] ?? { label: state, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const PHASE: Record<string, { label: string; tone: BadgeTone }> = {
  upcoming: { label: "Scheduled", tone: "neutral" }, open: { label: "Open to join", tone: "info" },
  live: { label: "Live now", tone: "good" }, ended: { label: "Ended", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "bad" },
};

export function PhaseBadge({ phase }: { phase: string }) {
  const p = PHASE[phase] ?? { label: phase, tone: "neutral" as BadgeTone };
  return <Badge tone={p.tone} dot>{p.label}</Badge>;
}

/* ── Portal: which child ──────────────────────────────────────────────── */

export type Child = { id: number; uuid: string; name: string; section_label: string | null; program_name: string | null };

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
  return { children, studentId: picked, current, pick, isParent: portalRole === "parent", isStudent: portalRole === "student", ready: children !== null };
}

export function ChildSwitcher({ child }: { child: ReturnType<typeof useChild> }) {
  if (!child.ready) return <Skeleton className="h-9 w-48" />;
  if (!child.isParent || (child.children?.length ?? 0) < 2) {
    return child.current ? <p className="text-[13px] text-muted">{child.current.name}{child.current.section_label ? ` · ${child.current.section_label}` : ""}</p> : null;
  }
  return (
    <div className="w-full sm:w-64">
      <Select value={child.studentId} onChange={(v) => v && child.pick(v)} aria-label="Child"
        options={(child.children ?? []).map((c) => ({ value: c.id, label: c.name, description: c.section_label ?? undefined }))} />
    </div>
  );
}
