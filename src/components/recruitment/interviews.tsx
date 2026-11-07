"use client";

/*
 * Interviews: schedule/reschedule modal, the interview details modal with the kit and the
 * interviewer's scorecard form, and the scorecard summary list.
 *   <ScheduleInterviewModal open applicationUuid interview={iv?} onClose onSaved />
 *   <InterviewModal uuid={uuid | null} onClose onChanged />
 */
import { useEffect, useState } from "react";
import { CalendarPlus, Download, Link2, MapPin, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatTime, todayISO } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, NumberInput, Select, Skeleton,
  Textarea, TextInput, TimeInput, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import { downloadFrom } from "@/components/workplace/files";
import { RatingInput, Stars } from "./common";
import { REC_TONE, errText, type Interview, type Scorecard } from "./types";

const MODES = [{ value: "video", label: "Video call" }, { value: "phone", label: "Phone" }, { value: "in_person", label: "In person" }];
const RECS = [
  { value: "strong_yes", label: "Strong yes" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "strong_no", label: "Strong no" },
];

function localParts(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: iso ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "11:00" };
}

export function ScheduleInterviewModal({ open, applicationUuid, interview, onClose, onSaved }: {
  open: boolean; applicationUuid: string; interview?: Interview | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [round, setRound] = useState("Technical round");
  const [mode, setMode] = useState("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [duration, setDuration] = useState<number | null>(45);
  const [panel, setPanel] = useState<number[]>([]);
  const [panelOpts, setPanelOpts] = useState<SelectOption<number>[]>([]);
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [kit, setKit] = useState<string | null>(null);
  const [kits, setKits] = useState<SelectOption<string>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = localParts(interview?.starts_at ?? null);
    setRound(interview?.round_name ?? "Technical round");
    setMode(interview?.mode ?? "video");
    setDate(p.date); setTime(p.time);
    setDuration(interview ? Math.round((+new Date(interview.ends_at) - +new Date(interview.starts_at)) / 60000) : 45);
    setPanel(interview?.panel.map((x) => x.employee_id) ?? []);
    setPanelOpts(interview?.panel.map((x) => ({ value: x.employee_id, label: x.name ?? "" })) ?? []);
    setLink(interview?.meeting_link ?? ""); setLocation(interview?.location ?? ""); setNotes(interview?.notes ?? "");
    setKit(interview?.kit_uuid ?? null);
    api.get<{ items: { uuid: string; name: string; active: boolean }[] }>("/recruitment/kits")
      .then((r) => setKits(r.items.filter((k) => k.active).map((k) => ({ value: k.uuid, label: k.name })))).catch(() => {});
  }, [open, interview]);

  async function save() {
    if (!date || !time) { toast.error("Pick the date and time."); return; }
    setSaving(true);
    try {
      const body = { round_name: round, mode, starts_at: new Date(`${date}T${time}:00`).toISOString(), duration_minutes: duration ?? 45,
        panel, meeting_link: link || null, location: location || null, notes: notes || null, kit_uuid: kit };
      if (interview) await api.put(`/recruitment/interviews/${interview.uuid}`, body);
      else await api.post(`/recruitment/applications/${applicationUuid}/interviews`, body);
      toast.success(interview ? "Interview moved; invites updated" : "Interview scheduled; invites sent");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title={interview ? "Reschedule interview" : "Schedule interview"}
      description="The candidate and the panel get an email with a calendar invite."
      footer={<><ModalCancel /><Button variant="primary" icon={CalendarPlus} loading={saving} onClick={save}>{interview ? "Save" : "Schedule"}</Button></>}>
      <FormGrid>
        <Field label="Round" required><TextInput value={round} onValueChange={setRound} /></Field>
        <Field label="How"><Select value={mode} onChange={(v) => setMode(v ?? "video")} options={MODES} /></Field>
        <Field label="Date" required><DateInput value={date} onChange={setDate} min={todayISO()} /></Field>
        <Field label="Start time" required hint="Your time zone"><TimeInput value={time} onChange={setTime} /></Field>
        <Field label="Duration"><NumberInput value={duration} onChange={setDuration} min={10} max={480} step={15} suffix="min" /></Field>
        <Field label="Interview kit"><Select value={kit} onChange={setKit} options={kits} clearable placeholder="Standard kit" /></Field>
      </FormGrid>
      <div className="mt-4 space-y-4">
        <Field label="Panel" required>
          <MultiSelect value={panel} onChange={(v, opts) => { setPanel(v); setPanelOpts(opts); }} loadOptions={loadEmployees} selectedOptions={panelOpts} />
        </Field>
        {mode === "in_person"
          ? <Field label="Where"><TextInput value={location} onValueChange={setLocation} leading={MapPin} placeholder="Office, room" /></Field>
          : <Field label="Meeting link"><TextInput value={link} onValueChange={setLink} leading={Link2} placeholder="https://meet.google.com/..." /></Field>}
        <Field label="Notes for the panel"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
      </div>
    </Modal>
  );
}

export function ScorecardList({ cards, competencies }: { cards: Scorecard[]; competencies?: { key: string; label: string }[] }) {
  const done = cards.filter((s) => s.submitted_at);
  if (!done.length) return <p className="text-[13.5px] text-faint">No scorecards yet.</p>;
  const label = (k: string) => competencies?.find((x) => x.key === k)?.label ?? k.replace(/_/g, " ");
  return (
    <div className="space-y-3">
      {done.map((s) => (
        <div key={s.uuid} className="rounded-xl border border-line p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-ink">{s.interviewer_name}</p>
            <div className="flex items-center gap-2"><Stars value={s.overall} />{s.recommendation && <Badge tone={REC_TONE[s.recommendation] ?? "neutral"}>{s.recommendation_label}</Badge>}</div>
          </div>
          {!!Object.keys(s.ratings).length && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
              {Object.entries(s.ratings).map(([k, v]) => <span key={k}>{label(k)}: <span className="text-ink">{v}</span>/5</span>)}
            </div>
          )}
          {s.strengths && <p className="mt-2 text-[13.5px] text-ink"><span className="text-muted">Strengths: </span>{s.strengths}</p>}
          {s.concerns && <p className="mt-1 text-[13.5px] text-ink"><span className="text-muted">Concerns: </span>{s.concerns}</p>}
          {s.notes && <p className="mt-1 text-[13.5px] text-muted">{s.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function ScorecardForm({ iv, onSaved }: { iv: Interview; onSaved: () => void }) {
  const toast = useToast();
  const mine = iv.my_scorecard;
  const [ratings, setRatings] = useState<Record<string, number>>(mine?.ratings ?? {});
  const [overall, setOverall] = useState<number | null>(mine?.overall ?? null);
  const [rec, setRec] = useState<string | null>(mine?.recommendation ?? null);
  const [strengths, setStrengths] = useState(mine?.strengths ?? "");
  const [concerns, setConcerns] = useState(mine?.concerns ?? "");
  const [notes, setNotes] = useState(mine?.notes ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post(`/recruitment/interviews/${iv.uuid}/scorecard`, { ratings, overall, recommendation: rec, strengths, concerns, notes });
      toast.success("Scorecard submitted");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      <div className="divide-y divide-line rounded-xl border border-line">
        {(iv.kit?.competencies ?? []).map((cp) => (
          <div key={cp.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div><p className="text-[14px] text-ink">{cp.label}</p>{cp.description && <p className="text-[12.5px] text-faint">{cp.description}</p>}</div>
            <RatingInput value={ratings[cp.key] ?? null} label={cp.label} onChange={(v) => setRatings((r) => ({ ...r, [cp.key]: v }))} />
          </div>
        ))}
      </div>
      <FormGrid>
        <Field label="Overall" required><RatingInput value={overall} onChange={setOverall} label="Overall" /></Field>
        <Field label="Hire?" required><Select value={rec} onChange={setRec} options={RECS} placeholder="Your recommendation" /></Field>
      </FormGrid>
      <Field label="Strengths"><Textarea value={strengths} onValueChange={setStrengths} rows={2} /></Field>
      <Field label="Concerns"><Textarea value={concerns} onValueChange={setConcerns} rows={2} /></Field>
      <Field label="Other notes"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
      <div className="flex justify-end"><Button variant="primary" loading={saving} onClick={save}>{mine?.submitted_at ? "Update scorecard" : "Submit scorecard"}</Button></div>
    </div>
  );
}

export function InterviewModal({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [iv, setIv] = useState<Interview | null>(null);
  const [nonce, setNonce] = useState(0);
  const [resched, setResched] = useState(false);
  useEffect(() => {
    if (!uuid) { setIv(null); return; }
    api.get<Interview>(`/recruitment/interviews/${uuid}`).then(setIv).catch((e) => toast.error(errText(e)));
  }, [uuid, nonce, toast]);
  const changed = () => { setNonce((n) => n + 1); onChanged?.(); };

  async function cancel() {
    if (!iv) return;
    if (!(await confirm({ title: "Cancel this interview?", message: "The candidate and the panel get a cancellation.", confirmLabel: "Cancel interview", tone: "danger" }))) return;
    try { await api.post(`/recruitment/interviews/${iv.uuid}/cancel`, { reason: "Cancelled" }); toast.success("Interview cancelled"); changed(); }
    catch (e) { toast.error(errText(e)); }
  }
  async function status(s: string) {
    try { await api.post(`/recruitment/interviews/${iv!.uuid}/status`, { status: s }); changed(); } catch (e) { toast.error(errText(e)); }
  }
  const onPanel = !!iv?.my_scorecard;
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={iv ? `${iv.round_name}: ${iv.candidate_name}` : "Interview"}
        description={iv ? `${iv.job_title} · ${formatDateTime(iv.starts_at)} – ${formatTime(iv.ends_at)}` : undefined}
        headerActions={iv && <Badge tone={iv.status === "scheduled" ? "info" : iv.status === "completed" ? "good" : "neutral"}>{iv.status.replace("_", " ")}</Badge>}
        footerStart={iv?.can_manage && iv.status === "scheduled" ? <Button variant="ghost" onClick={cancel}>Cancel interview</Button> : undefined}
        footer={iv && <>
          <Button variant="secondary" icon={Download} onClick={() => downloadFrom(`/recruitment/interviews/${iv.uuid}/invite.ics`, "interview.ics").catch((e) => toast.error(errText(e)))}>Calendar file</Button>
          {iv.can_manage && iv.status === "scheduled" && <Button variant="secondary" onClick={() => setResched(true)}>Reschedule</Button>}
          {iv.can_manage && iv.status === "scheduled" && new Date(iv.starts_at) < new Date() && <Button variant="secondary" onClick={() => status("no_show")}>No-show</Button>}
        </>}>
        {!iv ? <Skeleton className="h-60" /> : (
          <div className="space-y-6">
            <KeyValue items={[
              { label: "How", value: iv.mode_label },
              { label: "Join", value: iv.meeting_link ? <a href={iv.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Video size={14} strokeWidth={1.4} />Open link</a> : iv.location },
              { label: "Panel", value: iv.panel.map((p) => p.name).join(", ") },
              { label: "Scorecards", value: `${iv.scorecards_done} of ${iv.scorecards_total}` },
              ...(iv.notes ? [{ label: "Notes", value: iv.notes, span: 2 as const }] : []),
            ]} />
            {!!iv.kit?.questions.length && (
              <div>
                <p className="mb-2 text-[13px] text-muted">Questions from the {iv.kit.name}</p>
                <ol className="list-decimal space-y-1 pl-5 text-[14px] text-ink">{iv.kit.questions.map((q) => <li key={q}>{q}</li>)}</ol>
              </div>
            )}
            {onPanel && iv.status !== "cancelled" && (
              <div><p className="mb-3 text-[15px] text-ink">Your scorecard</p><ScorecardForm iv={iv} onSaved={changed} /></div>
            )}
            {iv.can_manage && (
              <div><p className="mb-3 text-[15px] text-ink">All scorecards</p><ScorecardList cards={iv.scorecards ?? []} competencies={iv.kit?.competencies} /></div>
            )}
          </div>
        )}
      </Modal>
      {iv && <ScheduleInterviewModal open={resched} applicationUuid={iv.application_uuid} interview={iv} onClose={() => setResched(false)}
        onSaved={() => { setResched(false); changed(); }} />}
    </>
  );
}

export function useEmployeeOptions(ids: (number | null | undefined)[]) {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  const key = ids.join(",");
  useEffect(() => { employeeOptionsFor(ids).then(setOpts).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  return opts;
}
