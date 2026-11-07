"use client";

/*
 * Employee documents: list with verification and expiry, upload, verify and archive.
 *
 *   <DocumentsPanel employeeUuid={p.uuid} docs={p.documents} canEdit canVerify onChanged={reload} />
 *   <DocumentUploadModal open employeeUuid onClose onSaved />
 *   <VerifyModal open doc employeeUuid onClose onSaved />
 */
import { useState } from "react";
import { Archive, BadgeCheck, CalendarClock, Download, Eye, FileText, Plus, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FileDrop, FormGrid, Menu, MasterSelect, Modal, ModalCancel, NumberInput, RadioCards, TextInput, Textarea,
  Toggle, formatBytes, useConfirm, type BadgeTone,
} from "@/components/ui-kit";
import { day, downloadWithAuth, postForm, type DocumentRow } from "./types";

export const VERIFY_TONE: Record<string, BadgeTone> = { pending: "warn", verified: "good", rejected: "bad" };

export function ExpiryBadge({ d }: { d: Pick<DocumentRow, "expiry_state" | "days_to_expiry" | "expiry_date"> }) {
  if (!d.expiry_date) return null;
  if (d.expiry_state === "expired") return <Badge tone="bad">Expired {day(d.expiry_date)}</Badge>;
  if (d.expiry_state === "expiring") return <Badge tone="warn">Expires in {d.days_to_expiry} days</Badge>;
  return <span className="text-[12.5px] text-muted">Valid till {day(d.expiry_date)}</span>;
}

export function DocumentUploadModal({ open, employeeUuid, doc, onClose, onSaved, canHide = false }: {
  open: boolean; employeeUuid: string; doc?: DocumentRow | null; onClose: () => void; onSaved: () => void; canHide?: boolean;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    type: doc?.document_type_id ?? null as number | null, number: doc?.document_number ?? "", title: doc?.title ?? "",
    issue: doc?.issue_date ?? "", expiry: doc?.expiry_date ?? "", issued_by: doc?.issued_by ?? "",
    remind: doc?.remind_days_before ?? 30, visible: doc?.visible_to_employee ?? true,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!v.type) { setError("Pick the document type"); return; }
    setSaving(true);
    try {
      if (doc) {
        await api.put(`/employees/${employeeUuid}/documents/${doc.uuid}`, {
          document_type_id: v.type, document_number: v.number || null, title: v.title || null, issue_date: v.issue || null,
          expiry_date: v.expiry || null, issued_by: v.issued_by || null, remind_days_before: v.remind, ...(canHide ? { visible_to_employee: v.visible } : {}),
        });
        if (files[0]) {
          const fd = new FormData();
          fd.append("file", files[0]);
          await postForm(`/employees/${employeeUuid}/documents/${doc.uuid}/file`, fd);
        }
      } else {
        const fd = new FormData();
        fd.append("document_type_id", String(v.type));
        if (v.number) fd.append("document_number", v.number);
        if (v.title) fd.append("title", v.title);
        if (v.issue) fd.append("issue_date", v.issue);
        if (v.expiry) fd.append("expiry_date", v.expiry);
        if (v.issued_by) fd.append("issued_by", v.issued_by);
        fd.append("remind_days_before", String(v.remind ?? 30));
        fd.append("visible_to_employee", String(v.visible));
        if (files[0]) fd.append("file", files[0]);
        await postForm(`/employees/${employeeUuid}/documents`, fd);
      }
      toast.success(doc ? "Document updated" : "Document added", { description: "It waits for HR to verify it." });
      onSaved();
    } catch (e) {
      toast.error("Couldn't save the document", { description: e instanceof Error ? e.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title={doc ? "Edit document" : "Add a document"}
      description="PDF, JPG or PNG up to 5 MB. Changing the number or dates sends it for verification again."
      footer={<><ModalCancel /><Button variant="primary" icon={Upload} onClick={save} loading={saving}>{doc ? "Save" : "Add document"}</Button></>}>
      <FormGrid>
        <Field label="Document type" required error={error}><MasterSelect type="document_type" value={v.type} onChange={(x) => { setV({ ...v, type: x }); setError(""); }} /></Field>
        <Field label="Number"><TextInput value={v.number} onValueChange={(x) => setV({ ...v, number: x })} className="font-mono" /></Field>
        <Field label="Issued on"><DateInput value={v.issue} onChange={(x) => setV({ ...v, issue: x })} clearable /></Field>
        <Field label="Expires on"><DateInput value={v.expiry} onChange={(x) => setV({ ...v, expiry: x })} clearable /></Field>
        <Field label="Issued by"><TextInput value={v.issued_by} onValueChange={(x) => setV({ ...v, issued_by: x })} placeholder="e.g. Passport Office, Bengaluru" /></Field>
        <Field label="Remind before expiry"><NumberInput value={v.remind} onChange={(x) => setV({ ...v, remind: x ?? 30 })} min={0} max={365} suffix="days" /></Field>
        <Field label="Note" className="sm:col-span-2"><TextInput value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder="Optional" /></Field>
        <div className="sm:col-span-2">
          <FileDrop value={files} onChange={setFiles} accept=".pdf,image/*,.doc,.docx" maxSizeMb={5}
            title={doc?.file ? `Replace ${doc.file.filename}` : "Drop the scan here or click to choose"} hint="One file" />
        </div>
        {canHide && <Toggle checked={v.visible} onChange={(x) => setV({ ...v, visible: x })} label="Employee can see it" description="Switch off for confidential HR files" className="sm:col-span-2" />}
      </FormGrid>
    </Modal>
  );
}

export function VerifyModal({ open, doc, employeeUuid, onClose, onSaved }: { open: boolean; doc: DocumentRow | null; employeeUuid: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<"verified" | "rejected" | "pending">(doc?.verification_status === "pending" ? "verified" : doc?.verification_status ?? "verified");
  const [remarks, setRemarks] = useState(doc?.remarks ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!doc) return;
    setSaving(true);
    try {
      await api.post(`/employees/${employeeUuid}/documents/${doc.uuid}/verify`, { status, remarks: remarks || null });
      toast.success(status === "verified" ? "Marked verified" : status === "rejected" ? "Sent back to the employee" : "Marked as waiting");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={`Verify ${doc?.document_type_name ?? "document"}`}
      description={doc?.employee ? doc.employee.name : doc?.document_number || undefined}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      {doc?.file && (
        <button type="button" onClick={() => downloadWithAuth(`/employees/${employeeUuid}/documents/${doc.uuid}/file`, doc.file!.filename, true).catch((e) => toast.error(e.message))}
          className="mb-5 flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-sunken/60">
          <FileText size={18} strokeWidth={1.4} className="text-faint" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{doc.file.filename}</span><span className="text-[12.5px] text-muted">{formatBytes(doc.file.size)} · open to check</span></span>
          <Eye size={16} strokeWidth={1.4} className="text-muted" />
        </button>
      )}
      <RadioCards value={status} onChange={setStatus} columns={3} options={[
        { value: "verified", label: "Verified", icon: ShieldCheck }, { value: "rejected", label: "Rejected", icon: ShieldAlert },
        { value: "pending", label: "Waiting", icon: CalendarClock }]} />
      <Field label="Remarks" hint={status === "rejected" ? "Required: tell the employee what to fix" : undefined} className="mt-5">
        <Textarea value={remarks} onValueChange={setRemarks} rows={3} />
      </Field>
    </Modal>
  );
}

export function DocumentsPanel({ employeeUuid, docs, canEdit, canVerify, canUpload, onChanged }: {
  employeeUuid: string; docs: DocumentRow[]; canEdit: boolean; canVerify: boolean; canUpload: boolean; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ doc: DocumentRow | null; key: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [verify, setVerify] = useState<{ doc: DocumentRow; key: number } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const live = docs.filter((d) => !d.archived_at);
  const archived = docs.filter((d) => d.archived_at);

  async function archive(d: DocumentRow) {
    if (!(await confirm({ title: "Archive this document?", message: "It moves to the archive and stays on record.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.post(`/employees/${employeeUuid}/documents/${d.uuid}/archive`); toast.success("Archived"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't archive"); }
  }

  const row = (d: DocumentRow) => (
    <li key={d.uuid} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-sunken/60 text-faint"><FileText size={18} strokeWidth={1.4} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] text-ink">{d.document_type_name ?? "Document"}</p>
          {d.category_name && <span className="text-[12px] text-faint">{d.category_name}</span>}
          <Badge tone={VERIFY_TONE[d.verification_status]} dot>{d.verification_label}</Badge>
          <ExpiryBadge d={d} />
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {[d.document_number && <span key="n" className="font-mono">{d.document_number}</span>, d.issue_date && `Issued ${day(d.issue_date)}`,
            d.file ? `${d.file.filename} · ${formatBytes(d.file.size)}` : "No file yet"].filter(Boolean).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, " · ", x] : [x]), [])}
        </p>
        {(d.verified_by_name || d.remarks) && (
          <p className="mt-0.5 text-[12.5px] text-faint">
            {d.verified_by_name && `${d.verification_status === "rejected" ? "Rejected" : "Verified"} by ${d.verified_by_name}${d.verified_at ? ` on ${formatDate(d.verified_at)}` : ""}`}
            {d.remarks && <span className={d.verification_status === "rejected" ? "text-rose-600" : ""}>{d.verified_by_name ? " · " : ""}{d.remarks}</span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {d.file && <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/employees/${employeeUuid}/documents/${d.uuid}/file`, d.file!.filename).catch((e) => toast.error(e.message))}>Download</Button>}
        {canVerify && !d.archived_at && d.verification_status !== "verified" && <Button size="sm" icon={BadgeCheck} onClick={() => { setVerify({ doc: d, key: Date.now() }); setVerifyOpen(true); }}>Verify</Button>}
        {(canEdit || canUpload) && !d.archived_at && (
          <Menu items={[
            { label: "Edit or replace file", icon: Upload, onSelect: () => { setForm({ doc: d, key: Date.now() }); setFormOpen(true); }, disabled: !canEdit && d.verification_status === "verified" },
            ...(canVerify ? [{ label: "Change verification", icon: BadgeCheck, onSelect: () => { setVerify({ doc: d, key: Date.now() }); setVerifyOpen(true); } }] : []),
            ...(canEdit ? ["separator" as const, { label: "Archive", icon: Archive, danger: true, onSelect: () => archive(d) }] : []),
          ]} />
        )}
      </div>
    </li>
  );

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] text-ink"><FileText size={16} strokeWidth={1.4} className="text-faint" /> Documents
          <span className="text-[12.5px] text-faint tabular">{live.length}</span></p>
        {(canEdit || canUpload) && <Button size="sm" icon={Plus} onClick={() => { setForm({ doc: null, key: Date.now() }); setFormOpen(true); }}>Add document</Button>}
      </header>
      {live.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-muted">No documents yet. Add ID proofs, certificates and letters here.</p>
        : <ul className="divide-y divide-line">{live.map(row)}</ul>}
      {archived.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-3 text-[13px] text-muted">Archived ({archived.length})</summary>
          <ul className="divide-y divide-line opacity-70">{archived.map(row)}</ul>
        </details>
      )}
      {form && <DocumentUploadModal key={form.key} open={formOpen} employeeUuid={employeeUuid} doc={form.doc} canHide={canEdit}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); onChanged(); }} />}
      {verify && <VerifyModal key={verify.key} open={verifyOpen} doc={verify.doc} employeeUuid={employeeUuid}
        onClose={() => setVerifyOpen(false)} onSaved={() => { setVerifyOpen(false); onChanged(); }} />}
    </section>
  );
}
