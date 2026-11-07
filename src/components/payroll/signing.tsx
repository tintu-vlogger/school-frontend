"use client";

/*
 * Form 16 digital signing: upload the employer's DSC (.pfx / .p12; its password is asked to
 * check it and again each time you sign, and is never kept), then sign every Form 16 of the
 * year. Without a certificate, signing runs in test mode with a stamp that says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileSignature, KeyRound, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Field, FormGrid, Modal, ModalCancel, TextInput, useConfirm } from "@/components/ui-kit";
import { errMsg, postForm } from "@/components/payroll/common";

type Info = { has_certificate: boolean; mode: string; subject: string | null; issuer: string | null; valid_to: string | null;
  signer_name: string; signer_designation: string; place: string; signed: Record<string, { at: string; by: string; count: number; mode: string }> };

export function Form16Signing({ fy }: { fy: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<Info | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signing, setSigning] = useState(false);
  const load = useCallback(() => { api.get<Info>("/payroll/tax/signing").then(setInfo).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  async function remove() {
    if (!(await confirm({ title: "Remove the certificate?", message: "Form 16 will be signed in test mode until you upload another.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { setInfo(await api.delete<Info>("/payroll/tax/signing/certificate")); toast.success("Certificate removed"); } catch (e) { toast.error(errMsg(e)); }
  }
  const last = info?.signed?.[fy];
  return (
    <Paper>
      <PaperHeader title="Digital signature" action={info && <Badge tone={info.has_certificate ? "good" : "warn"} dot>{info.has_certificate ? "Certificate ready" : "Test mode"}</Badge>} />
      <div className="space-y-4 p-5">
        {info?.has_certificate ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
            <div className="flex gap-3"><KeyRound size={18} strokeWidth={1.4} className="mt-0.5 text-muted" />
              <div><p className="text-[14px] text-ink">{info.subject}</p><p className="text-[12.5px] text-faint">Issued by {info.issuer} · valid till {info.valid_to ? formatDate(info.valid_to) : "—"}</p></div></div>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>Remove</Button>
          </div>
        ) : <p className="text-[13.5px] text-muted">Upload the signatory's DSC (.pfx or .p12) to sign Form 16. Until then, signing adds a test signature that is not valid for filing.</p>}
        {last && <p className="text-[12.5px] text-faint">FY {fy}: {last.count} signed {last.mode === "stub" ? "in test mode " : ""}on {formatDateTime(last.at)} by {last.by}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={FileSignature} onClick={() => setSigning(true)}>Sign Form 16 for FY {fy}</Button>
          <Button variant="secondary" icon={Upload} onClick={() => setUploading(true)}>{info?.has_certificate ? "Replace certificate" : "Upload certificate"}</Button>
        </div>
      </div>
      {info && <UploadModal open={uploading} info={info} onClose={() => setUploading(false)} onSaved={(x) => { setInfo(x); setUploading(false); }} />}
      {info && <SignModal open={signing} fy={fy} info={info} onClose={() => setSigning(false)} onDone={() => { setSigning(false); load(); }} />}
    </Paper>
  );
}

function UploadModal({ open, info, onClose, onSaved }: { open: boolean; info: Info; onClose: () => void; onSaved: (i: Info) => void }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<File | null>(null);
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState(info.signer_name);
  const [desg, setDesg] = useState(info.signer_designation);
  const [place, setPlace] = useState(info.place);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(null); setPwd(""); } }, [open]);
  async function save() {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f!); fd.append("password", pwd); fd.append("signer_name", name); fd.append("signer_designation", desg); fd.append("place", place);
    try { onSaved(await postForm<Info>("/payroll/tax/signing/certificate", fd)); toast.success("Certificate checked and saved"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); setPwd(""); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Digital signature certificate" busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!f || !pwd} onClick={save}>Check and save</Button></>}>
      <div className="space-y-5">
        <Field label="Certificate file (.pfx or .p12)" required>
          <div className="flex items-center gap-3"><input ref={file} type="file" accept=".pfx,.p12,application/x-pkcs12" hidden onChange={(e) => setF(e.target.files?.[0] ?? null)} />
            <Button variant="secondary" icon={Upload} onClick={() => file.current?.click()}>Choose file</Button><span className="truncate text-[13px] text-muted">{f?.name ?? "No file chosen"}</span></div>
        </Field>
        <Field label="Password" required hint="Used to check the file now. It is not saved."><TextInput type="password" value={pwd} onValueChange={setPwd} autoComplete="off" /></Field>
        <FormGrid>
          <Field label="Signatory"><TextInput value={name} onValueChange={setName} /></Field>
          <Field label="Designation"><TextInput value={desg} onValueChange={setDesg} /></Field>
        </FormGrid>
        <Field label="Place"><TextInput value={place} onValueChange={setPlace} /></Field>
      </div>
    </Modal>
  );
}

function SignModal({ open, fy, info, onClose, onDone }: { open: boolean; fy: string; info: Info; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPwd(""); }, [open]);
  async function sign() {
    setBusy(true);
    try {
      const r = await api.post<{ signed: number; skipped: { employee: string; reason: string }[]; mode: string }>("/payroll/tax/form16/sign", { fy, password: pwd || null });
      toast.success(`${r.signed} Form 16 signed${r.mode === "stub" ? " in test mode" : ""}`, r.skipped.length ? { description: `${r.skipped.length} skipped` } : undefined);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); setPwd(""); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Sign Form 16 · FY ${fy}`} busy={busy}
      footer={<><ModalCancel /><Button variant="primary" icon={FileSignature} loading={busy} disabled={info.has_certificate && !pwd} onClick={sign}>Sign all</Button></>}>
      {info.has_certificate ? (
        <Field label="Certificate password" hint="Asked every time; never stored."><TextInput type="password" value={pwd} onValueChange={setPwd} autoComplete="off" /></Field>
      ) : <p className="text-[13.5px] text-muted">No certificate is uploaded, so each Form 16 gets a test signature marked as not valid for filing.</p>}
      <p className="mt-4 text-[12.5px] text-faint">Everyone with locked pay in the year is signed. Employees and HR then download the signed copy.</p>
    </Modal>
  );
}
