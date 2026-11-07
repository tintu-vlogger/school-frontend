"use client";

/*
 * Class diary: the class teacher's short daily note for a section (homework, things to bring,
 * reminders). Parents and students see it in the portal.
 */
import { useEffect, useState } from "react";
import { NotebookPen, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatRelative } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Button, DateInput, Field, Modal, ModalCancel, Select, Skeleton, Textarea, formatDisplayDate, toISODate } from "@/components/ui-kit";
import { AttachmentList, AttachmentPicker, errText, type FileRef } from "@/components/comms/shared";

type Entry = { uuid: string; section_id: number; date: string; body: string; attachments: FileRef[]; author_name: string | null; updated_at: string };

export default function DiaryPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const [sections, setSections] = useState<{ id: number; label: string }[] | null>(null);
  const [section, setSection] = useState<number | null>(null);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<{ date: string; body: string; files: FileRef[] } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<{ id: number; label: string }[]>("/comms/diary/sections").then((r) => { setSections(r); setSection(r[0]?.id ?? null); }).catch(() => setSections([]));
  }, []);
  useEffect(() => {
    if (!section) return;
    setRows(null);
    api.get<Entry[]>(`/comms/diary?section_id=${section}`).then(setRows).catch((e) => { setRows([]); toast.error(errText(e)); });
  }, [section, nonce, toast]);

  const today = toISODate(new Date());
  const open = (e?: Entry) => setEditing(e ? { date: e.date, body: e.body, files: e.attachments } : { date: today, body: rows?.find((r) => r.date === today)?.body ?? "", files: rows?.find((r) => r.date === today)?.attachments ?? [] });
  async function save() {
    if (!editing || !section || !editing.body.trim()) return;
    setSaving(true);
    try {
      await api.put("/comms/diary", { section_id: section, date: editing.date, body: editing.body, attachments: editing.files.map((f) => f.uuid) });
      toast.success("Diary saved"); setEditing(null); setNonce((n) => n + 1);
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Communicate" title="Class diary" description={`A short daily note for each ${term("section").toLowerCase()}: homework, things to bring and reminders.`}
        actions={section && <Button variant="primary" icon={Pencil} onClick={() => open()}>Write today&rsquo;s note</Button>} />
      {sections === null ? <Skeleton className="h-40 w-full rounded-2xl" /> : sections.length === 0 ? (
        <Paper><EmptyState icon={NotebookPen} title={`You don't lead any ${term("sections").toLowerCase()}`} hint={`The diary is written by ${term("teachers").toLowerCase()} for their own ${term("sections").toLowerCase()}.`} /></Paper>
      ) : (
        <>
          {sections.length > 1 && <div className="mb-4 w-full sm:w-72"><Select value={section} onChange={setSection} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></div>}
          {rows === null ? <Skeleton className="h-40 w-full rounded-2xl" /> : rows.length === 0 ? (
            <Paper><EmptyState icon={NotebookPen} title="No diary notes yet" hint="Write today's note; families see it in the app." action={<Button variant="primary" onClick={() => open()}>Write today&rsquo;s note</Button>} /></Paper>
          ) : (
            <ul className="space-y-3">
              {rows.map((e) => (
                <li key={e.uuid}>
                  <Paper className="p-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[14px] text-ink">{e.date === today ? "Today" : formatDisplayDate(e.date)}</p>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(e)}>Edit</Button>
                    </div>
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink/85">{e.body}</p>
                    <div className="mt-2"><AttachmentList files={e.attachments} /></div>
                    <p className="mt-2 text-[12px] text-faint">{e.author_name} · {formatRelative(e.updated_at)}</p>
                  </Paper>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} size="md" title="Diary note" busy={saving}
        footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!editing?.body.trim()}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Date"><DateInput value={editing.date} onChange={(x) => setEditing({ ...editing, date: x })} max={today} /></Field>
            <Field label="Note"><Textarea autoFocus value={editing.body} onValueChange={(x) => setEditing({ ...editing, body: x })} rows={5} autoGrow maxLength={3000} placeholder="e.g. Maths: exercise 4.2. Bring an atlas tomorrow." /></Field>
            <AttachmentPicker value={editing.files} onChange={(f) => setEditing({ ...editing, files: f })} onError={(m) => toast.error(m)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
