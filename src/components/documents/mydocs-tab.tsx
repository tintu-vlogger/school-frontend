"use client";

/*
 * My documents: documents waiting for my signature (sign with a code sent by email),
 * my letters and files from HR, and self-service letter requests.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, FileSignature, FileText, MailCheck, PenLine, Send, Type, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Button, Field, FormGrid, MasterSelect, Modal, ModalCancel, Select, Skeleton, Tabs, TextInput, Textarea, type SelectOption,
} from "@/components/ui-kit";
import { Paper } from "@/components/shell/page";
import { fileHref, type FileRef } from "@/components/workplace/files";
import { FilePreview, LETTER_STATUS, REQUEST_STATUS, SignaturePad, StatusBadge, errText, type DocFile, type Letter } from "./shared";

type Sig = {
  uuid: string; status: string; label: string | null; signed_at: string | null; request_status: string; title: string; message: string | null;
  expires_at: string | null; created_at: string; letter_uuid: string; file: FileRef | null;
};
type Req = { uuid: string; reference_no: string | null; title: string; status: string; created_at: string; completed_at: string | null; result_note: string | null; letter_uuid: string | null; template_name: string | null };

function Row({ icon: Icon, title, sub, right, onClick }: { icon: typeof FileText; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${onClick ? "cursor-pointer transition-colors hover:bg-sunken/60" : ""}`} onClick={onClick}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunken text-muted"><Icon size={17} strokeWidth={1.4} /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{title}</p>{sub && <p className="truncate text-[12.5px] text-muted">{sub}</p>}</div>
      {right}
    </li>
  );
}

export function MyDocumentsTab() {
  const toast = useToast();
  const [sigs, setSigs] = useState<Sig[] | null>(null);
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [files, setFiles] = useState<DocFile[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [signing, setSigning] = useState<Sig | null>(null);
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState<{ title: string; file: FileRef | null } | null>(null);
  const load = useCallback(() => {
    const fail = (e: unknown) => toast.error("Couldn't load your documents", { description: errText(e) });
    api.get<{ items: Sig[] }>("/letters/me/signatures").then((r) => setSigs(r.items)).catch((e) => { setSigs([]); fail(e); });
    api.get<{ items: Letter[] }>("/letters/me").then((r) => setLetters(r.items)).catch(() => setLetters([]));
    api.get<{ items: DocFile[] }>("/documents/me/files").then((r) => setFiles(r.items)).catch(() => setFiles([]));
    api.get<{ items: Req[] }>("/letters/me/requests").then((r) => setReqs(r.items)).catch(() => setReqs([]));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const toSign = (sigs ?? []).filter((s) => s.status === "pending" && s.request_status === "out_for_signature");
  const letterFileTitles = new Set((letters ?? []).map((l) => l.title));
  const otherFiles = (files ?? []).filter((f) => f.source === "upload" || !letterFileTitles.has(f.title));

  return (
    <div className="space-y-6">
      {toSign.length > 0 && (
        <Paper className="border-amber-200">
          <div className="border-b border-amber-100 bg-amber-50/50 px-4 py-3 text-[14px] text-amber-800">Waiting for your signature</div>
          <ul className="divide-y divide-line">
            {toSign.map((s) => <Row key={s.uuid} icon={FileSignature} title={s.title} sub={`Sent ${formatDate(s.created_at)}${s.expires_at ? ` · sign by ${formatDate(s.expires_at)}` : ""}`}
              right={<Button size="sm" variant="primary" icon={PenLine} onClick={() => setSigning(s)}>Review and sign</Button>} />)}
          </ul>
        </Paper>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Paper>
          <div className="flex min-h-[56px] items-center justify-between border-b border-line px-4 py-2">
            <p className="text-[15px] text-ink">Letters</p>
            <Button size="sm" icon={Send} onClick={() => setAsking(true)}>Request a letter</Button>
          </div>
          {!letters ? <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : letters.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-muted">No letters yet. Ask for a salary certificate or address proof any time.</p>
          ) : (
            <ul className="divide-y divide-line">
              {letters.map((l) => <Row key={l.uuid} icon={FileText} title={l.title} sub={`${l.reference_no ?? ""} · ${formatDate(l.created_at)}`}
                onClick={() => setOpen({ title: l.title, file: l.esign?.signed_file ?? l.file })} right={<StatusBadge map={LETTER_STATUS} value={l.status} />} />)}
            </ul>
          )}
        </Paper>
        <Paper>
          <div className="flex min-h-[56px] items-center border-b border-line px-4 py-2"><p className="text-[15px] text-ink">Files from HR</p></div>
          {!files ? <div className="space-y-2 p-4"><Skeleton className="h-10" /></div> : otherFiles.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-muted">Nothing shared with you yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {otherFiles.map((f) => <Row key={f.uuid} icon={FileText} title={f.title} sub={`${f.folder_name} · ${formatDate(f.created_at)}`} onClick={() => setOpen({ title: f.title, file: f.file })} />)}
            </ul>
          )}
        </Paper>
      </div>
      {reqs && reqs.length > 0 && (
        <Paper>
          <div className="border-b border-line px-4 py-3"><p className="text-[15px] text-ink">My letter requests</p></div>
          <ul className="divide-y divide-line">
            {reqs.map((r) => <Row key={r.uuid} icon={MailCheck} title={r.template_name ?? r.title} sub={`${r.reference_no ?? ""} · asked ${formatDate(r.created_at)}${r.result_note && r.status === "rejected" ? ` · ${r.result_note}` : ""}`}
              right={<StatusBadge map={REQUEST_STATUS} value={r.status} />}
              onClick={r.letter_uuid ? () => { const l = letters?.find((x) => x.uuid === r.letter_uuid); if (l) setOpen({ title: l.title, file: l.file }); } : undefined} />)}
          </ul>
        </Paper>
      )}
      {(sigs ?? []).some((s) => s.status !== "pending") && (
        <p className="text-[12.5px] text-faint">Signed and closed signing requests are kept with your letters.</p>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} size="xl" title={open?.title}
        footer={open?.file?.download_url && <a href={fileHref(open.file.download_url)}><Button variant="primary" icon={Download} type="button">Download</Button></a>}>
        <FilePreview file={open?.file} height={600} />
      </Modal>
      {signing && <SignModal sig={signing} onClose={() => setSigning(null)} onDone={() => { setSigning(null); load(); }} />}
      {asking && <RequestLetterModal onClose={() => setAsking(false)} onDone={() => { setAsking(false); load(); }} />}
    </div>
  );
}

function SignModal({ sig, onClose, onDone }: { sig: Sig; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [image, setImage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ sent_to: string; dev_code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  async function sendCode() {
    setBusy(true);
    try { setSent(await api.post(`/letters/sign/${sig.uuid}/otp`)); toast.success("Code sent to your email"); }
    catch (e) { toast.error("Couldn't send the code", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  async function sign() {
    if (mode === "draw" ? !image : !typed.trim()) { toast.error(mode === "draw" ? "Draw your signature" : "Type your full name"); return; }
    if (code.trim().length < 6) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ status: string }>(`/letters/sign/${sig.uuid}`, { code: code.trim(), ...(mode === "draw" ? { signature_image: image } : { typed_name: typed.trim() }) });
      toast.success(r.status === "completed" ? "Signed. The signed copy is in your documents." : "Signed. Others still need to sign."); onDone();
    } catch (e) { toast.error("Couldn't sign", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  async function decline() {
    if (!reason.trim()) { toast.error("Say why you are declining"); return; }
    setBusy(true);
    try { await api.post(`/letters/sign/${sig.uuid}/decline`, { reason }); toast.success("Declined. HR has been told."); onDone(); }
    catch (e) { toast.error("Couldn't decline", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="xl" busy={busy} title={`Sign: ${sig.title}`} description={sig.message ?? "Read the document, then sign below."}
      footerStart={!declining && <Button variant="ghost" icon={X} onClick={() => setDeclining(true)}>Decline</Button>}
      footer={declining ? <><Button onClick={() => setDeclining(false)}>Back</Button><Button variant="danger" loading={busy} onClick={decline}>Decline to sign</Button></>
        : <><ModalCancel /><Button variant="primary" icon={PenLine} loading={busy} disabled={!sent} onClick={sign}>Sign document</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <FilePreview file={sig.file} height={560} />
        {declining ? (
          <Field label="Why are you declining?" required><Textarea autoFocus value={reason} onValueChange={setReason} rows={5} /></Field>
        ) : (
          <div className="space-y-5">
            <div>
              <Tabs variant="pill" value={mode} onChange={setMode} items={[{ value: "draw", label: "Draw", icon: PenLine }, { value: "type", label: "Type", icon: Type }]} />
              <div className="mt-3">
                {mode === "draw" ? <SignaturePad onChange={setImage} /> : (
                  <div>
                    <TextInput value={typed} onValueChange={setTyped} placeholder="Your full name" />
                    {typed && <p className="mt-3 rounded-xl border border-line px-4 py-3 text-[26px] text-ink" style={{ fontFamily: "cursive" }}>{typed}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-[13.5px] text-ink">Confirm it&apos;s you</p>
              <p className="mt-0.5 text-[12.5px] text-muted">We email you a one-time code. It works for 10 minutes.</p>
              {!sent ? <Button className="mt-3" size="sm" icon={MailCheck} loading={busy} onClick={sendCode}>Send code</Button> : (
                <div className="mt-3 space-y-2">
                  <p className="text-[12.5px] text-muted">Sent to {sent.sent_to}{sent.dev_code ? <span className="text-faint"> · test code {sent.dev_code}</span> : null}</p>
                  <TextInput value={code} onValueChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className="tabular tracking-[0.3em]" />
                  <button type="button" className="text-[12.5px] text-primary hover:underline" onClick={sendCode}>Send a new code</button>
                </div>
              )}
            </div>
            <p className="text-[11.5px] leading-relaxed text-faint">Your signature, the time, your IP address and the code check are recorded with the signed copy, as allowed under the Information Technology Act, 2000.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RequestLetterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [options, setOptions] = useState<SelectOption<string>[] | null>(null);
  const [tpl, setTpl] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [purpose, setPurpose] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<{ items: { uuid: string; name: string; description: string | null }[] }>("/letters/me/requestable")
      .then((r) => setOptions(r.items.map((t) => ({ value: t.uuid, label: t.name, description: t.description ?? undefined })))).catch(() => setOptions([]));
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tpl) { toast.error("Pick the letter you need"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ status: string }>("/letters/me/requests", { template_uuid: tpl, reason_id: reason, reason_text: reasonText || null, purpose: purpose || null, details: details || null });
      toast.success(r.status === "approved" ? "Your letter is ready" : "Request sent to HR", { description: r.status === "approved" ? undefined : "You'll be told when it's ready." });
      onDone();
    } catch (err) { toast.error("Couldn't send the request", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title="Request a letter" description="HR approves it and the letter appears in your documents."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="req-letter" loading={saving}>Send request</Button></>}>
      <form id="req-letter" onSubmit={save} className="space-y-4" noValidate>
        <Field label="Letter" required>
          <Select value={tpl} onChange={setTpl} options={options ?? []} placeholder={options && !options.length ? "No letters can be requested" : "Pick a letter"} />
        </Field>
        <FormGrid>
          <Field label="Reason"><MasterSelect type="letter_request_reason" value={reason} onChange={setReason} clearable /></Field>
          <Field label="Addressed to" aside="Optional"><TextInput value={purpose} onValueChange={setPurpose} placeholder="e.g. The Manager, SBI" /></Field>
        </FormGrid>
        <Field label="Tell us more" aside="Optional"><Textarea value={reasonText} onValueChange={setReasonText} rows={2} placeholder="e.g. Home loan application" /></Field>
        <Field label="Anything to include" aside="Optional"><Textarea value={details} onValueChange={setDetails} rows={2} /></Field>
      </form>
    </Modal>
  );
}
