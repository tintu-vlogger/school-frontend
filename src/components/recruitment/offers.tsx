"use client";

/*
 * Offers: the offer form (CTC with a live break-up from the salary structure, outside-band
 * warning) and the offer details modal with approval, sending, withdrawal and recording an
 * acceptance received on paper.
 *   <OfferFormModal open applicationUuid offer={offer?} onClose onSaved />
 *   <OfferModal uuid onClose onChanged />
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, MasterSelect, Modal, ModalCancel, NumberInput, Select, Skeleton,
  Textarea, TextInput, Timeline, formatDisplayDate,
} from "@/components/ui-kit";
import { useOrgOptions } from "@/components/people/hooks";
import { loadEmployees } from "@/components/workplace/pickers";
import { FileLink } from "./common";
import { useEmployeeOptions } from "./interviews";
import { OFFER_TONE, errText, money, range, type BreakupLine, type Offer } from "./types";

type Breakup = { source: string; structure: string; lines: BreakupLine[]; monthly_gross: string; monthly_ctc: string; warnings: string[] };

export function BreakupTable({ lines, gross }: { lines: BreakupLine[]; gross?: string | null }) {
  if (!lines.length) return null;
  return (
    <table className="w-full text-[13.5px]">
      <thead><tr className="text-left text-[12px] text-faint"><th className="py-1.5 font-normal">Component</th><th className="py-1.5 text-right font-normal">Monthly</th><th className="py-1.5 text-right font-normal">Yearly</th></tr></thead>
      <tbody className="divide-y divide-line">
        {lines.map((l) => (
          <tr key={l.code}><td className="py-1.5 text-ink">{l.label}{l.kind === "employer" && <span className="ml-1 text-[12px] text-faint">(employer)</span>}</td>
            <td className="py-1.5 text-right tabular">{money(l.monthly)}</td><td className="py-1.5 text-right tabular text-muted">{money(l.annual)}</td></tr>
        ))}
        {gross && <tr><td className="py-1.5 text-muted">Gross a month</td><td className="py-1.5 text-right tabular text-ink">{money(gross)}</td><td /></tr>}
      </tbody>
    </table>
  );
}

export function OfferFormModal({ open, applicationUuid, offer, defaults, onClose, onSaved }: {
  open: boolean; applicationUuid: string; offer?: Offer | null; onClose: () => void; onSaved: (o: Offer) => void;
  defaults?: { band_min?: string | null; band_max?: string | null };
}) {
  const toast = useToast();
  const org = useOrgOptions();
  const [joining, setJoining] = useState("");
  const [ctc, setCtc] = useState<number | null>(null);
  const [bonus, setBonus] = useState<number | null>(null);
  const [structure, setStructure] = useState<number | null>(null);
  const [structures, setStructures] = useState<{ value: number; label: string; description?: string }[]>([]);
  const [desig, setDesig] = useState<number | null>(null);
  const [dept, setDept] = useState<number | null>(null);
  const [loc, setLoc] = useState<number | null>(null);
  const [etype, setEtype] = useState<number | null>(null);
  const [mgr, setMgr] = useState<number | null>(null);
  const [prob, setProb] = useState<number | null>(6);
  const [notice, setNotice] = useState<number | null>(30);
  const [notes, setNotes] = useState("");
  const [breakup, setBreakup] = useState<Breakup | null>(null);
  const [saving, setSaving] = useState(false);
  const mgrOpts = useEmployeeOptions([mgr]);

  useEffect(() => {
    if (!open) return;
    setJoining(offer?.joining_date ?? ""); setCtc(offer ? Number(offer.annual_ctc) : null); setBonus(offer?.joining_bonus ? Number(offer.joining_bonus) : null);
    setStructure(offer?.structure_id ?? null); setDesig(offer?.designation_id ?? null); setDept(offer?.department_id ?? null);
    setLoc(offer?.location_id ?? null); setEtype(offer?.employment_type_id ?? null); setMgr(offer?.reporting_manager_id ?? null);
    setProb(offer?.probation_months ?? 6); setNotice(offer?.notice_days ?? 30); setNotes(offer?.notes ?? "");
    api.get<{ items: { id: number; name: string; min_ctc: string | null; max_ctc: string | null }[] }>("/recruitment/offers/structures")
      .then((r) => setStructures(r.items.map((s) => ({ value: s.id, label: s.name, description: s.min_ctc || s.max_ctc ? range(s.min_ctc, s.max_ctc) : undefined })))).catch(() => {});
  }, [open, offer]);

  useEffect(() => {
    if (!open || !ctc) { setBreakup(null); return; }
    const t = setTimeout(() => {
      api.post<Breakup>("/recruitment/offers/breakup", { annual_ctc: ctc, structure_id: structure, joining_date: joining || null })
        .then(setBreakup).catch(() => setBreakup(null));
    }, 350);
    return () => clearTimeout(t);
  }, [open, ctc, structure, joining]);

  const bandMin = offer?.band_min ?? defaults?.band_min ?? null;
  const bandMax = offer?.band_max ?? defaults?.band_max ?? null;
  const outside = !!ctc && ((bandMin !== null && ctc < Number(bandMin)) || (bandMax !== null && ctc > Number(bandMax)));

  async function save(submit: boolean) {
    setSaving(true);
    try {
      const body = { joining_date: joining || null, annual_ctc: ctc, joining_bonus: bonus, structure_id: structure, designation_id: desig,
        department_id: dept, location_id: loc, employment_type_id: etype, reporting_manager_id: mgr, probation_months: prob,
        notice_days: notice, notes, submit };
      const o = offer ? await api.put<Offer>(`/recruitment/offers/${offer.uuid}`, body)
        : await api.post<Offer>(`/recruitment/applications/${applicationUuid}/offers`, body);
      toast.success(submit ? (o.status === "pending_approval" ? "Sent for approval (outside the band)" : "Offer approved") : "Offer saved");
      onSaved(o);
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} title={offer ? "Edit offer" : "Prepare offer"}
      description="Offers outside the job's salary band go for approval before they can be sent."
      footer={<><ModalCancel /><Button variant="secondary" loading={saving} onClick={() => save(false)}>Save draft</Button>
        <Button variant="primary" loading={saving} onClick={() => save(true)}>{outside ? "Send for approval" : "Approve"}</Button></>}>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <FormGrid>
            <Field label="Joining date" required><DateInput value={joining} onChange={setJoining} /></Field>
            <Field label="Annual CTC" required hint={bandMin || bandMax ? `Band ${range(bandMin, bandMax)}` : undefined}>
              <NumberInput value={ctc} onChange={setCtc} min={0} step={10000} suffix="₹" invalid={outside} />
            </Field>
            <Field label="Salary structure" hint={structures.length ? undefined : "Payroll has no structures yet: a standard split is used"}>
              <Select value={structure} onChange={setStructure} options={structures} clearable placeholder="Standard split" />
            </Field>
            <Field label="Joining bonus"><NumberInput value={bonus} onChange={setBonus} min={0} suffix="₹" /></Field>
            <Field label="Designation"><Select value={desig} onChange={setDesig} options={org.designations} clearable /></Field>
            <Field label="Department"><Select value={dept} onChange={setDept} options={org.departments} clearable /></Field>
            <Field label="Location"><Select value={loc} onChange={setLoc} options={org.locations} clearable /></Field>
            <Field label="Employment type"><MasterSelect type="employment_type" value={etype} onChange={setEtype} clearable /></Field>
            <Field label="Reporting manager"><Select value={mgr} onChange={setMgr} loadOptions={loadEmployees} selectedOption={mgrOpts.find((o) => o.value === mgr) ?? null} clearable /></Field>
            <Field label="Probation"><NumberInput value={prob} onChange={setProb} min={0} max={24} suffix="months" /></Field>
            <Field label="Notice period"><NumberInput value={notice} onChange={setNotice} min={0} max={180} suffix="days" /></Field>
          </FormGrid>
          <Field label="Internal notes"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
        </div>
        <div className="rounded-2xl border border-line bg-sunken/40 p-4">
          <p className="text-[13px] text-muted">Break-up</p>
          {outside && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[13px] text-amber-800">
              <AlertTriangle size={15} strokeWidth={1.4} className="mt-0.5 shrink-0" />Outside the salary band. This offer needs approval.
            </div>
          )}
          {!breakup ? <p className="mt-3 text-[13px] text-faint">Enter the CTC to see the monthly split.</p> : (
            <div className="mt-2">
              <p className="mb-2 text-[12.5px] text-faint">{breakup.structure}</p>
              <BreakupTable lines={breakup.lines} gross={breakup.monthly_gross} />
              {breakup.warnings.map((w) => <p key={w} className="mt-2 text-[12.5px] text-amber-700">{w}</p>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function OfferModal({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [o, setO] = useState<Offer | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<null | "withdraw" | "accept" | "send">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uuid) { setO(null); return; }
    api.get<Offer>(`/recruitment/offers/${uuid}`).then(setO).catch((e) => toast.error(errText(e)));
  }, [uuid, nonce, toast]);
  const changed = () => { setNonce((n) => n + 1); onChanged?.(); };

  async function act(path: string, body: unknown, ok: string) {
    setBusy(true);
    try { await api.post(`/recruitment/offers/${o!.uuid}/${path}`, body); toast.success(ok); setAsk(null); setText(""); changed(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  const s = o?.status;
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={o ? `Offer for ${o.candidate_name}` : "Offer"}
        description={o ? `${o.job_title}${o.number ? ` · ${o.number}` : ""}` : undefined}
        headerActions={o && <Badge tone={OFFER_TONE[o.status] ?? "neutral"}>{o.status_label}</Badge>}
        footerStart={o && ["draft", "pending_approval", "approved", "sent"].includes(o.status) ? <Button variant="ghost" onClick={() => setAsk("withdraw")}>Withdraw</Button> : undefined}
        footer={o && <>
          {(s === "draft" || s === "approved" || s === "rejected") && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          {s === "draft" && <Button variant="secondary" loading={busy} onClick={() => act("submit", {}, "Done")}>Approve or send for approval</Button>}
          {s === "approved" && <Button variant="primary" icon={Send} onClick={() => setAsk("send")}>Send to candidate</Button>}
          {s === "sent" && <Button variant="secondary" onClick={() => setAsk("accept")}>Record acceptance</Button>}
        </>}>
        {!o ? <Skeleton className="h-60" /> : (
          <div className="space-y-6">
            {o.outside_band && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle size={15} strokeWidth={1.4} />Outside the band {range(o.band_min, o.band_max)}{o.workflow_status ? ` · approval ${o.workflow_status}` : ""}</div>}
            <KeyValue items={[
              { label: "Annual CTC", value: money(o.annual_ctc) }, { label: "Joining date", value: formatDisplayDate(o.joining_date) },
              { label: "Designation", value: o.designation }, { label: "Department", value: o.department },
              { label: "Location", value: o.location }, { label: "Reporting manager", value: o.reporting_manager },
              { label: "Probation", value: o.probation_months !== null ? `${o.probation_months} months` : null },
              { label: "Notice period", value: o.notice_days !== null ? `${o.notice_days} days` : null },
              { label: "Open until", value: o.expires_on ? `${formatDisplayDate(o.expires_on)}${o.days_left !== null ? ` (${o.days_left} days left)` : ""}` : null },
              { label: "E-signature", value: o.esign?.required ? (o.esign.signed ? "Signed" : (o.esign.status ?? "").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase())) : "Not used" },
              { label: "Offer letter", value: <FileLink file={o.letter?.file} label="Open PDF" /> },
              { label: "Candidate link", value: o.portal_link ? <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => { navigator.clipboard?.writeText(o.portal_link!); toast.success("Link copied"); }}><Copy size={13} strokeWidth={1.4} />Copy link</button> : null },
              ...(o.decline_reason ? [{ label: "Decline reason", value: o.decline_reason, span: 2 as const }] : []),
              ...(o.accepted_name ? [{ label: "Accepted by", value: `${o.accepted_name}${o.responded_at ? ` on ${formatDate(o.responded_at)}` : ""}` }] : []),
            ]} />
            <div><p className="mb-2 text-[13px] text-muted">Break-up</p><BreakupTable lines={o.breakup} gross={o.monthly_gross} /></div>
            {!!o.history?.length && (
              <div><p className="mb-2 text-[13px] text-muted">History</p>
                <Timeline items={[...o.history].reverse().map((h, i) => ({ id: i, title: h.text, time: `${formatDateTime(h.at)} · ${h.by}` }))} /></div>
            )}
          </div>
        )}
      </Modal>
      {o && <OfferFormModal open={editing} applicationUuid={o.application_uuid} offer={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); changed(); }} />}
      <Modal open={!!ask} onClose={() => setAsk(null)} size="sm" busy={busy}
        title={ask === "withdraw" ? "Withdraw the offer" : ask === "send" ? "Send the offer" : "Record acceptance"}
        description={ask === "send" ? "The letter is generated, sent for e-signature and the candidate gets a link to accept or decline." :
          ask === "accept" ? "For a letter signed on paper. Pre-boarding starts at once." : undefined}
        footer={<><ModalCancel /><Button variant={ask === "withdraw" ? "danger" : "primary"} loading={busy}
          onClick={() => ask === "withdraw" ? act("withdraw", { reason: text }, "Offer withdrawn")
            : ask === "send" ? act("send", { message: text || null }, "Offer sent")
              : act("accept-on-behalf", { typed_name: text }, "Acceptance recorded")}>
          {ask === "withdraw" ? "Withdraw" : ask === "send" ? "Send" : "Record"}</Button></>}>
        <Field label={ask === "withdraw" ? "Reason" : ask === "send" ? "Message to the candidate (optional)" : "Name as signed"} required={ask !== "send"}>
          {ask === "accept" ? <TextInput value={text} onValueChange={setText} data-autofocus /> : <Textarea value={text} onValueChange={setText} rows={3} />}
        </Field>
      </Modal>
    </>
  );
}
