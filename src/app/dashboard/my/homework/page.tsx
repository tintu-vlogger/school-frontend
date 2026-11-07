"use client";

/*
 * Homework (portal). Students see their homework, hand work in (text + files) and read marks and
 * feedback once returned. Parents see the same list for each child (read only).
 */
import { useEffect, useState } from "react";
import { ClipboardPen, Send } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Button, Field, Modal, ModalCancel, Section, Select, Skeleton, Tabs, Textarea } from "@/components/ui-kit";
import { AttachmentPicker, Attachments, ChildSwitcher, RichText, StateBadge, useChild } from "@/components/lms/shared";
import { KIND_LABELS, type FileRef, type PortalHomework } from "@/components/lms/lib";

export default function MyHomeworkPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const child = useChild();
  const [tab, setTab] = useState("due");
  const [subject, setSubject] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<{ key: string; items: PortalHomework[] } | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const sid = child.studentId;
  const key = `${sid}:${tab}:${subject}:${tick}`;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    const p = new URLSearchParams({ student_id: String(sid) });
    if (tab !== "all") p.set("status", tab);
    if (subject) p.set("subject_id", String(subject));
    api.get<{ items: PortalHomework[] }>(`/lms/portal/homework?${p}`).then((r) => live && setData({ key, items: r.items }))
      .catch((e) => { toast.error(e.message); if (live) setData({ key, items: [] }); });
    return () => { live = false; };
  }, [key, sid, tab, subject, toast]);
  useEffect(() => {
    if (!sid) return;
    api.get<{ id: number; name: string }[]>(`/lms/portal/subjects?student_id=${sid}`).then(setSubjects).catch(() => {});
  }, [sid]);
  const items = data?.key === key ? data.items : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Homework" description={child.isParent ? "Homework set for your child and how it's going." : "Your homework. Hand it in here before it's due."}
        actions={<ChildSwitcher child={child} />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" value={tab} onChange={setTab} items={[{ value: "due", label: "To do" }, { value: "done", label: "Handed in" }, { value: "all", label: "All" }]} />
        {subjects.length > 1 && <div className="w-full sm:w-56"><Select value={subject} onChange={setSubject} clearable placeholder={`All ${term("subjects").toLowerCase()}`} options={subjects.map((s) => ({ value: s.id, label: s.name }))} /></div>}
      </div>
      {!items ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div> : items.length === 0 ? (
        <Paper><EmptyState icon={ClipboardPen} title={tab === "due" ? "Nothing to do right now" : "No homework here"} hint={tab === "due" ? "New homework shows up here as soon as it is set." : undefined} /></Paper>
      ) : (
        <ul className="space-y-3">
          {items.map((h) => (
            <li key={h.uuid}>
              <button type="button" onClick={() => setOpen(h.uuid)} className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{h.subject_name} · {KIND_LABELS[h.kind]}</p>
                    <p className="mt-1 text-[15px] text-ink">{h.title}</p>
                  </div>
                  <StateBadge state={h.state} />
                </div>
                <p className={`mt-2 text-[13px] ${h.is_overdue && ["pending", "resubmit"].includes(h.state) ? "text-rose-600" : "text-muted"}`}>
                  Due {formatDateTime(h.due_at)} · {formatRelative(h.due_at)}{h.submission_type === "offline" ? " · hand in on paper" : ""}
                </p>
                {h.submission?.marks && <p className="mt-1 text-[13px] text-ink">Marks: {h.submission.marks}{h.max_marks ? ` / ${h.max_marks}` : ""}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <HomeworkModal uuid={open} studentId={sid} canSubmit={child.isStudent} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />
    </div>
  );
}

function HomeworkModal({ uuid, studentId, canSubmit, onClose, onChanged }: { uuid: string | null; studentId: number | null; canSubmit: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ uuid: string; h: PortalHomework } | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!uuid || !studentId) return;
    let live = true;
    api.get<PortalHomework>(`/lms/portal/homework/${uuid}?student_id=${studentId}`).then((h) => {
      if (!live) return;
      setState({ uuid, h });
      setText(h.submission && h.submission.status !== "returned" ? h.submission.content ?? "" : "");
      setFiles(h.submission && h.submission.status !== "returned" ? h.submission.attachments : []);
    }).catch((e) => { toast.error(e.message); onClose(); });
    return () => { live = false; };
  }, [uuid, studentId, toast, onClose]);
  const h = state && state.uuid === uuid ? state.h : null;
  const sub = h?.submission;
  async function submit() {
    if (!h) return;
    if (!text.trim() && !files.length) { toast.error("Write your answer or attach a file"); return; }
    setSaving(true);
    try {
      const r = await api.post<PortalHomework>(`/lms/portal/homework/${h.uuid}/submit`, { content: text, attachments: files.map((f) => f.uuid) });
      setState({ uuid: h.uuid, h: r }); toast.success(r.state === "late" ? "Handed in (late)" : "Handed in"); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't hand it in"); }
    finally { setSaving(false); }
  }
  const showForm = canSubmit && h?.can_submit;
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={saving} title={h?.title ?? "Homework"}
      description={h ? `${h.subject_name} · due ${formatDateTime(h.due_at)}` : undefined}
      footer={showForm ? <><ModalCancel /><Button variant="primary" icon={Send} onClick={submit} loading={saving}>{sub ? "Hand in again" : "Hand in"}</Button></> : undefined}>
      {!h ? <Skeleton className="h-40 w-full" /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2"><StateBadge state={h.state} />{h.max_marks && <span className="text-[13px] text-muted">Out of {h.max_marks} marks</span>}</div>
          {h.instructions && <RichText text={h.instructions} />}
          {h.attachments.length > 0 && <div className="mt-4"><Attachments files={h.attachments} /></div>}
          {sub && (sub.marks || sub.feedback) && (
            <Section title="From your teacher" className="mt-5 border-t border-line">
              {sub.marks && <p className="tabular text-[24px] font-extralight text-ink">{sub.marks}{h.max_marks ? <span className="text-[15px] text-muted"> / {h.max_marks}</span> : null}</p>}
              {sub.feedback && <p className="mt-1 text-[14px] text-ink/85">{sub.feedback}</p>}
            </Section>
          )}
          {sub && (
            <Section title={canSubmit ? "Your work" : "Work handed in"} description={sub.submitted_at ? `Handed in ${formatDateTime(sub.submitted_at)}${sub.is_late ? " (late)" : ""}` : undefined} className="mt-2 border-t border-line">
              {sub.content && <div className="rounded-xl border border-line bg-sunken/40 p-4"><RichText text={sub.content} /></div>}
              <div className="mt-3"><Attachments files={sub.attachments} /></div>
            </Section>
          )}
          {h.submission_type === "offline" && <p className="mt-5 rounded-lg bg-sunken/60 px-4 py-3 text-[13px] text-muted">Hand this in on paper at school.</p>}
          {showForm && (
            <div className="mt-5 space-y-4 border-t border-line pt-5">
              {h.state === "resubmit" && <p className="text-[13px] text-amber-700">Your teacher asked you to send this again.</p>}
              <Field label="Your answer"><Textarea value={text} onValueChange={setText} rows={6} autoGrow placeholder="Type your answer here" /></Field>
              <Field label="Files" aside="Optional"><AttachmentPicker value={files} onChange={setFiles} portal max={5} /></Field>
            </div>
          )}
          {!canSubmit && h.state === "pending" && <p className="mt-5 text-[13px] text-muted">Not handed in yet.</p>}
        </>
      )}
    </Modal>
  );
}
