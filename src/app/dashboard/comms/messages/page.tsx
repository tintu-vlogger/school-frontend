"use client";

/*
 * Messages (staff): private conversations with parents and students. Boxes: my
 * conversations, the office inbox (office staff) and all conversations (safeguarding review).
 * New message picks a learner from the teacher's sections, then a parent or the learner.
 * Class message sends one message to every family of a section; replies come back privately.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, PenSquare, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Button, Field, Modal, ModalCancel, RadioCards, Select, Tabs, TextInput, Textarea, type SelectOption } from "@/components/ui-kit";
import { Inbox } from "@/components/comms/inbox";
import { AttachmentPicker, errText, type FileRef } from "@/components/comms/shared";

type Boxes = {
  boxes: { key: string; label: string; unread: number }[]; can_broadcast: boolean; broadcast_sections: { id: number; label: string }[];
  has_profile: boolean; office_hours: { enabled: boolean; within: boolean; label: string };
};
type Contact = { id: number; name: string; section_label: string | null; has_sign_in: boolean; guardians: { id: number; name: string; relation: string; has_sign_in: boolean }[] };

export default function StaffMessagesPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><MessagesInner /></Suspense>;
}

function MessagesInner() {
  const params = useSearchParams();
  const { term } = useInstitution();
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const [box, setBox] = useState("mine");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);
  const [initial, setInitial] = useState<string | null>(() => params.get("thread"));
  useEffect(() => { api.get<Boxes>("/comms/messages/boxes").then(setBoxes).catch(() => {}); }, [reload]);

  return (
    <div>
      <PageHeader eyebrow="Communicate" title="Messages" description={`Private conversations with ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()}. Every message is kept.`}
        actions={boxes?.has_profile && <>
          {boxes.can_broadcast && <Button icon={Megaphone} onClick={() => setBcOpen(true)}>Class message</Button>}
          <Button variant="primary" icon={PenSquare} onClick={() => setNewOpen(true)}>New message</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {boxes && boxes.boxes.length > 1 ? (
          <Tabs value={box} onChange={(v) => { setBox(v); setInitial(null); }} items={boxes.boxes.map((b) => ({ value: b.key, label: b.label, count: b.unread || undefined }))} />
        ) : <span />}
        <Tabs variant="pill" value={status || "all"} onChange={(v) => setStatus(v === "all" ? "" : v)}
          items={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} />
      </div>
      {box === "all" && <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted"><ShieldCheck size={15} strokeWidth={1.4} />Safeguarding view: you can read every conversation but not reply.</p>}
      <Inbox key={`${box}|${initial ?? ""}`} side="staff" base="/comms/messages" box={box} status={status} reloadKey={reload} initialThread={initial}
        onNewClick={boxes?.has_profile ? () => setNewOpen(true) : undefined}
        emptyHint={box === "office" ? "Messages families send to the office appear here." : `Start a conversation with a ${term("guardian").toLowerCase()}, or wait for one to write.`} />
      <NewMessageModal open={newOpen} onClose={() => setNewOpen(false)} onSent={(uuid) => { setNewOpen(false); setBox("mine"); setInitial(uuid); setReload((r) => r + 1); }} />
      {boxes && <BroadcastModal open={bcOpen} sections={boxes.broadcast_sections} onClose={() => setBcOpen(false)} onSent={() => { setBcOpen(false); setReload((r) => r + 1); }} />}
    </div>
  );
}

function NewMessageModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (uuid: string) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<Contact | null>(null);
  const [to, setTo] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [cache, setCache] = useState<Record<number, Contact>>({});
  useEffect(() => { if (open) { setStudent(null); setTo(""); setSubject(""); setBody(""); setFiles([]); } }, [open]);

  const load = async (q: string): Promise<SelectOption<number>[]> => {
    const rows = await api.get<Contact[]>(`/comms/messages/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setCache((c) => ({ ...c, ...Object.fromEntries(rows.map((r) => [r.id, r])) }));
    return rows.map((r) => ({ value: r.id, label: r.name, description: r.section_label ?? undefined }));
  };
  const options = student ? [
    ...student.guardians.map((g) => ({ value: `g${g.id}`, label: g.name, description: `${g.relation[0].toUpperCase()}${g.relation.slice(1)}${g.has_sign_in ? "" : " · no app sign-in yet"}` })),
    { value: "s", label: student.name, description: `The ${term("student").toLowerCase()}${student.has_sign_in ? "" : " · no app sign-in yet"}` },
  ] : [];

  async function send() {
    if (!student || !to || !subject.trim() || (!body.trim() && !files.length)) { toast.error("Pick who to write to, and add a subject and message"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ uuid: string }>("/comms/messages/threads", {
        student_id: student.id, guardian_id: to.startsWith("g") ? Number(to.slice(1)) : null, subject, body, attachments: files.map((f) => f.uuid),
      });
      toast.success("Message sent");
      onSent(r.uuid);
    } catch (e) { toast.error("Couldn't send", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="New message" dirty={!!(body || subject)} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" onClick={send} loading={saving}>Send</Button></>}>
      <div className="space-y-4">
        <Field label={term("student")} hint={`Learners in your ${term("sections").toLowerCase()}.`}>
          <Select value={student?.id ?? null} loadOptions={load} placeholder={`Search ${term("students").toLowerCase()}`}
            onChange={(v) => { setStudent(v ? cache[v] ?? null : null); setTo(""); }} />
        </Field>
        {student && (
          <Field label="Write to">
            <RadioCards columns={1} value={to || null} onChange={setTo} options={options} />
          </Field>
        )}
        <Field label="Subject"><TextInput value={subject} onValueChange={setSubject} maxLength={200} placeholder="e.g. Homework this week" /></Field>
        <Field label="Message"><Textarea value={body} onValueChange={setBody} rows={5} autoGrow /></Field>
        <AttachmentPicker value={files} onChange={setFiles} onError={(m) => toast.error(m)} />
      </div>
    </Modal>
  );
}

function BroadcastModal({ open, sections, onClose, onSent }: { open: boolean; sections: { id: number; label: string }[]; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [section, setSection] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setSection(sections[0]?.id ?? null); setSubject(""); setBody(""); setFiles([]); } }, [open, sections]);
  async function send() {
    if (!section || !subject.trim() || !body.trim()) { toast.error("Pick a section and write a subject and message"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ families: number }>("/comms/messages/broadcasts", { section_id: section, subject, body, attachments: files.map((f) => f.uuid) });
      toast.success(`Sent to ${r.families} families`, { description: "Replies arrive as separate conversations." });
      onSent();
    } catch (e) { toast.error("Couldn't send", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Class message" busy={saving} dirty={!!(subject || body)}
      description={`One message to the ${term("guardians").toLowerCase()} of every ${term("student").toLowerCase()} in a ${term("section").toLowerCase()}. Each family replies privately.`}
      footer={<><ModalCancel /><Button variant="primary" icon={Megaphone} onClick={send} loading={saving}>Send to all families</Button></>}>
      <div className="space-y-4">
        <Field label={term("section")}><Select value={section} onChange={setSection} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        <Field label="Subject"><TextInput value={subject} onValueChange={setSubject} maxLength={200} /></Field>
        <Field label="Message"><Textarea value={body} onValueChange={setBody} rows={6} autoGrow /></Field>
        <AttachmentPicker value={files} onChange={setFiles} onError={(m) => toast.error(m)} />
      </div>
    </Modal>
  );
}
