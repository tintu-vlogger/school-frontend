"use client";

/*
 * Portal messages: a parent writes to their child's class teacher, subject teachers or the
 * office; a student writes to their teachers when the school allows it. Never to other
 * families or students.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Clock, MessagesSquare, PenSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Button, Field, Modal, ModalCancel, RadioCards, Skeleton, TextInput, Textarea } from "@/components/ui-kit";
import { Inbox } from "@/components/comms/inbox";
import { AttachmentPicker, ChildSwitcher, errText, useChild, type FileRef, type OfficeHours } from "@/components/comms/shared";

type Contacts = { enabled: boolean; office: boolean; office_hours: OfficeHours; staff: { employee_id: number; name: string; roles: string[] }[] };

export default function MyMessagesPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><MyMessagesInner /></Suspense>;
}

function MyMessagesInner() {
  const params = useSearchParams();
  const { term } = useInstitution();
  const child = useChild();
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [initial, setInitial] = useState<string | null>(() => params.get("thread"));
  useEffect(() => {
    if (!child.ready) return;
    const p = child.isParent && child.studentId ? `?student_id=${child.studentId}` : "";
    api.get<Contacts>(`/comms/portal/messages/contacts${p}`).then(setContacts).catch(() => setContacts(null));
  }, [child.ready, child.isParent, child.studentId]);

  const canWrite = !!contacts?.enabled && (contacts.staff.length > 0 || contacts.office);
  return (
    <div>
      <PageHeader title="Messages" description={child.isParent ? `Write privately to your child's ${term("teachers").toLowerCase()} or the office.` : `Ask your ${term("teachers").toLowerCase()} a question.`}
        actions={<><ChildSwitcher child={child} />{canWrite && <Button variant="primary" icon={PenSquare} onClick={() => setNewOpen(true)}>New message</Button>}</>} />
      {contacts?.office_hours.enabled && !contacts.office_hours.within && (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-amber-700"><Clock size={14} strokeWidth={1.5} />Office hours are {contacts.office_hours.label}. You can still write; replies may take longer.</p>
      )}
      {!child.ready || contacts === null ? <Skeleton className="h-96 w-full rounded-2xl" /> : !contacts.enabled ? (
        <Paper><EmptyState icon={MessagesSquare} title="Messaging is switched off" hint="Your school has turned off messages for this sign-in. Speak to your teacher in class or contact the office." /></Paper>
      ) : (
        <Inbox key={initial ?? ""} side="portal" base="/comms/portal/messages" studentId={child.isParent ? child.studentId : null} reloadKey={reload} initialThread={initial}
          onNewClick={canWrite ? () => setNewOpen(true) : undefined} emptyHint={`Start a conversation with a ${term("teacher").toLowerCase()} or the office.`} />
      )}
      {contacts && <NewModal open={newOpen} contacts={contacts} studentId={child.studentId} onClose={() => setNewOpen(false)}
        onSent={(uuid) => { setNewOpen(false); setInitial(uuid); setReload((r) => r + 1); }} />}
    </div>
  );
}

function NewModal({ open, contacts, studentId, onClose, onSent }: { open: boolean; contacts: Contacts; studentId: number | null; onClose: () => void; onSent: (uuid: string) => void }) {
  const toast = useToast();
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setTo(null); setSubject(""); setBody(""); setFiles([]); } }, [open]);
  const options = [
    ...contacts.staff.map((s) => ({ value: String(s.employee_id), label: s.name, description: s.roles.join(", ") })),
    ...(contacts.office ? [{ value: "office", label: "The office", description: "Fees, certificates, transport and anything else", icon: Building2 }] : []),
  ];
  async function send() {
    if (!to || !subject.trim() || (!body.trim() && !files.length)) { toast.error("Pick who to write to and add a subject and message"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ uuid: string }>("/comms/portal/messages/threads", {
        employee_id: to === "office" ? null : Number(to), to_office: to === "office", student_id: studentId, subject, body, attachments: files.map((f) => f.uuid),
      });
      toast.success("Message sent");
      onSent(r.uuid);
    } catch (e) { toast.error("Couldn't send", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="New message" busy={saving} dirty={!!(subject || body)}
      footer={<><ModalCancel /><Button variant="primary" onClick={send} loading={saving}>Send</Button></>}>
      <div className="space-y-4">
        <Field label="To"><RadioCards columns={1} value={to} onChange={setTo} options={options} /></Field>
        <Field label="Subject"><TextInput value={subject} onValueChange={setSubject} maxLength={200} placeholder="e.g. Question about homework" /></Field>
        <Field label="Message"><Textarea value={body} onValueChange={setBody} rows={5} autoGrow /></Field>
        <AttachmentPicker value={files} onChange={setFiles} portal onError={(m) => toast.error(m)} />
      </div>
    </Modal>
  );
}
