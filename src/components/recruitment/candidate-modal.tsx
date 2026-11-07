"use client";

/*
 * Candidate profile modal (xl, tabs): profile, the application in one job (screening score
 * with explanation, stage actions, notes, evaluation from scorecards), interviews,
 * references and background check, offers and history.
 *   <CandidateModal candidateUuid={uuid?} applicationUuid={uuid?} onClose onChanged />
 */
import { useCallback, useEffect, useState } from "react";
import {
  CalendarPlus, FileText, Linkedin, Mail, MessageSquarePlus, Pencil, Phone, Plus, RotateCcw, Send, Trash2, UserX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";
import {
  Avatar, Badge, Button, Field, FormGrid, KeyValue, MasterSelect, Modal, ModalCancel, Select, Skeleton, Tabs,
  Textarea, TextInput, Timeline, Toggle, formatDisplayDate, useConfirm,
} from "@/components/ui-kit";
import { Bar, FileLink, ScorePill, Stars, useHiringMeta } from "./common";
import { CandidateFormModal } from "./candidate-form";
import { CustomFields } from "@/components/custom-fields";
import { InterviewModal, ScheduleInterviewModal, ScorecardList } from "./interviews";
import { OfferFormModal, OfferModal } from "./offers";
import {
  APP_LABEL, APP_TONE, BGV_TONE, OFFER_TONE, REC_LABEL, REC_TONE, errText, lakhs, type Application, type Candidate,
} from "./types";

type Tab = "profile" | "application" | "interviews" | "checks" | "offers" | "history";

export function CandidateModal({ candidateUuid, applicationUuid, onClose, onChanged }: {
  candidateUuid?: string | null; applicationUuid?: string | null; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useHiringMeta();
  const open = !!(candidateUuid || applicationUuid);
  const [cand, setCand] = useState<Candidate | null>(null);
  const [appUuid, setAppUuid] = useState<string | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [tab, setTab] = useState<Tab>("application");
  const [nonce, setNonce] = useState(0);
  const [dialog, setDialog] = useState<null | "reject" | "note" | "schedule" | "offer" | "reference" | "bgv" | "override" | "edit" | "apply">(null);
  const [viewIv, setViewIv] = useState<string | null>(null);
  const [viewOffer, setViewOffer] = useState<string | null>(null);
  const changed = useCallback(() => { setNonce((n) => n + 1); onChanged?.(); }, [onChanged]);

  useEffect(() => {
    if (!open) { setCand(null); setApp(null); setAppUuid(null); return; }
    setAppUuid(applicationUuid ?? null);
    setTab(applicationUuid ? "application" : "profile");
  }, [open, applicationUuid, candidateUuid]);

  useEffect(() => {
    if (!open) return;
    const cu = candidateUuid ?? app?.candidate.uuid;
    if (!cu || meta?.is_admin === false) return;
    api.get<Candidate>(`/recruitment/candidates/${cu}`).then((c) => {
      setCand(c);
      setAppUuid((u) => u ?? c.applications?.find((a) => a.status === "active")?.uuid ?? c.applications?.[0]?.uuid ?? null);
    }).catch(() => {});
  }, [open, candidateUuid, app?.candidate.uuid, nonce, meta?.is_admin]);

  useEffect(() => {
    if (!appUuid) { setApp(null); return; }
    api.get<Application>(`/recruitment/applications/${appUuid}`).then(setApp).catch((e) => toast.error(errText(e)));
  }, [appUuid, nonce, toast]);

  const person = cand ?? app?.candidate ?? null;
  const apps = cand?.applications ?? (app ? [app] : []);

  async function post(path: string, body: unknown, ok: string) {
    try { await api.post(path, body); toast.success(ok); setDialog(null); changed(); }
    catch (e) { toast.error(errText(e)); }
  }
  async function purge() {
    if (!person) return;
    if (!(await confirm({ title: `Delete ${person.name}'s data?`, message: "Name, contact details, CV, answers and notes are removed for good. Counts in reports stay.", confirmLabel: "Delete data", tone: "danger" }))) return;
    try { await api.post(`/recruitment/candidates/${person.uuid}/purge`); toast.success("Candidate data deleted"); onChanged?.(); onClose(); }
    catch (e) { toast.error(errText(e)); }
  }

  const tabs = [
    { value: "profile" as Tab, label: "Profile" },
    ...(app ? [
      { value: "application" as Tab, label: "Application" },
      { value: "interviews" as Tab, label: "Interviews", count: app.interviews.length || undefined },
      { value: "checks" as Tab, label: "References" , count: app.references.length || undefined },
      ...(app.can_offer ? [{ value: "offers" as Tab, label: "Offers", count: app.offers.length || undefined }] : []),
      { value: "history" as Tab, label: "History" },
    ] : []),
  ];
  const stageOpts = (app?.stages ?? []).filter((s) => s.kind !== "hired").map((s) => ({ value: s.key, label: s.label }));

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" flush title={person?.name ?? "Candidate"}
        leading={person ? <Avatar name={person.name} size={36} /> : undefined}
        description={person ? [person.current_title, person.current_company].filter(Boolean).join(" at ") || person.email || undefined : undefined}
        headerActions={app && <Badge tone={APP_TONE[app.status] ?? "neutral"}>{app.status === "active" ? app.stage_label : APP_LABEL[app.status] ?? app.status}</Badge>}
        footerStart={meta?.is_admin && person && person.status !== "hired" ? <Button variant="ghost" icon={Trash2} onClick={purge}>Delete data</Button> : undefined}
        footer={app && app.status === "active" ? <>
          <Button variant="secondary" icon={UserX} onClick={() => setDialog("reject")}>Not moving ahead</Button>
          <Button variant="secondary" icon={CalendarPlus} onClick={() => setDialog("schedule")}>Schedule interview</Button>
          {app.can_offer && !app.offers.some((o) => ["draft", "pending_approval", "approved", "sent", "accepted"].includes(o.status)) &&
            <Button variant="primary" onClick={() => setDialog("offer")}>Prepare offer</Button>}
        </> : app && app.status !== "hired" ? <Button variant="secondary" icon={RotateCcw} onClick={() => post(`/recruitment/applications/${app.uuid}/reopen`, {}, "Back in the running")}>Bring back</Button> : undefined}>
        {!person ? <div className="p-6"><Skeleton className="h-72" /></div> : (
          <div>
            <div className="sticky top-0 z-[1] border-b border-line bg-surface px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                {apps.length > 1 ? (
                  <div className="w-72"><Select value={appUuid} onChange={(v) => setAppUuid(v)} aria-label="Application"
                    options={apps.map((a) => ({ value: a.uuid, label: a.job_title, description: a.status === "active" ? a.stage_label ?? undefined : a.status }))} /></div>
                ) : <span className="text-[13px] text-muted">{app ? app.job_title : "No application yet"}</span>}
                {app?.status === "active" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-faint">Stage</span>
                    <div className="w-44"><Select value={app.stage} options={stageOpts} aria-label="Stage"
                      onChange={(v) => v && v !== app.stage && post(`/recruitment/applications/${app.uuid}/move`, { stage: v }, "Moved")} /></div>
                  </div>
                )}
              </div>
              <Tabs items={tabs} value={tab} onChange={setTab} className="mt-2" />
            </div>
            <div className="p-6">
              {tab === "profile" && <Profile c={person} canEdit={!!meta?.is_admin && !!cand} onEdit={() => setDialog("edit")} onApply={() => setDialog("apply")} />}
              {tab === "application" && app && (
                <div className="space-y-8">
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[15px] text-ink">Screening</p>
                      <div className="flex items-center gap-2"><ScorePill score={app.score} />
                        <Button size="sm" variant="ghost" onClick={() => post(`/recruitment/applications/${app.uuid}/rescore`, {}, "Score updated")}>Score again</Button></div>
                    </div>
                    <div className="space-y-3">
                      {(app.score_detail.parts ?? []).map((p) => (
                        <div key={p.key}>
                          <div className="mb-1 flex justify-between text-[13px]"><span className="text-ink">{p.label}</span><span className="tabular text-muted">{p.points} / {p.max}</span></div>
                          <Bar value={p.points} max={p.max} />
                          <p className="mt-1 text-[12.5px] text-faint">{p.detail}</p>
                        </div>
                      ))}
                    </div>
                    {app.score_detail.scorer && <p className="mt-2 text-[12px] text-faint">Scored by {app.score_detail.scorer === "rules" ? "the built-in rules" : app.score_detail.scorer}.</p>}
                  </section>
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[15px] text-ink">Evaluation</p>
                      {app.can_manage && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDialog("override")}>Override</Button>}
                    </div>
                    <div className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {app.evaluation.recommendation && <Badge tone={REC_TONE[app.evaluation.recommendation] ?? "neutral"}>{REC_LABEL[app.evaluation.recommendation]}</Badge>}
                        <Stars value={app.evaluation.average} />
                        <span className="text-[13px] text-muted">{app.evaluation.summary ?? "No scorecards yet."}</span>
                      </div>
                      {!!Object.keys(app.evaluation.competencies ?? {}).length && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {Object.entries(app.evaluation.competencies ?? {}).map(([k, v]) => (
                            <div key={k}><div className="flex justify-between text-[12.5px]"><span className="text-muted">{k.replace(/_/g, " ")}</span><span className="tabular">{v}</span></div><Bar value={v} max={5} tone="bg-amber-400" /></div>
                          ))}
                        </div>
                      )}
                      {app.evaluation_override.recommendation && (
                        <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink">
                          Set to <strong className="font-normal text-primary">{REC_LABEL[app.evaluation_override.recommendation]}</strong> by {app.evaluation_override.by}: {app.evaluation_override.note}
                        </p>
                      )}
                    </div>
                  </section>
                  {!!app.questions.length && (
                    <section>
                      <p className="mb-3 text-[15px] text-ink">Answers</p>
                      <KeyValue columns={1} items={app.questions.map((q) => ({ label: q.label, value: app.answers[q.key] }))} />
                    </section>
                  )}
                  {app.rejection_reason && <p className="text-[13.5px] text-rose-700">Not moving ahead: {app.rejection_reason}</p>}
                </div>
              )}
              {tab === "interviews" && app && (
                <div className="space-y-6">
                  {app.interviews.length === 0 ? <p className="text-[13.5px] text-faint">No interviews yet.</p> : (
                    <div className="divide-y divide-line rounded-xl border border-line">
                      {app.interviews.map((iv) => (
                        <button key={iv.uuid} type="button" onClick={() => setViewIv(iv.uuid)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sunken/50">
                          <div><p className="text-[14px] text-ink">{iv.round_name}</p>
                            <p className="text-[12.5px] text-muted">{formatDateTime(iv.starts_at)} – {formatTime(iv.ends_at)} · {iv.panel.map((p) => p.name).join(", ")}</p></div>
                          <div className="flex items-center gap-2"><span className="text-[12.5px] text-faint">{iv.scorecards_done}/{iv.scorecards_total} scorecards</span>
                            <Badge tone={iv.status === "scheduled" ? "info" : iv.status === "completed" ? "good" : "neutral"}>{iv.status.replace("_", " ")}</Badge></div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div><p className="mb-3 text-[15px] text-ink">Scorecards</p>
                    <ScorecardList cards={app.interviews.flatMap((iv) => iv.scorecards ?? [])} competencies={app.interviews[0]?.kit?.competencies} /></div>
                </div>
              )}
              {tab === "checks" && app && (
                <div className="space-y-8">
                  <section>
                    <div className="mb-3 flex items-center justify-between"><p className="text-[15px] text-ink">References</p>
                      {app.can_manage && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setDialog("reference")}>Add referee</Button>}</div>
                    {!app.references.length ? <p className="text-[13.5px] text-faint">No referees yet.</p> : app.references.map((r) => (
                      <div key={r.uuid} className="mb-3 rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div><p className="text-[14px] text-ink">{r.referee_name}</p>
                            <p className="text-[12.5px] text-muted">{[r.relationship, r.referee_company, r.referee_email].filter(Boolean).join(" · ")}</p></div>
                          <div className="flex items-center gap-2">
                            <Badge tone={r.status === "received" ? "good" : r.status === "sent" ? "info" : "neutral"}>{r.status}</Badge>
                            {r.status !== "received" && r.referee_email && <Button size="sm" variant="ghost" icon={Send} onClick={() => post(`/recruitment/references/${r.uuid}/send`, {}, "Form sent")}>{r.status === "sent" ? "Send again" : "Send form"}</Button>}
                          </div>
                        </div>
                        {r.status === "received" && (
                          <dl className="mt-3 space-y-2 border-t border-line pt-3">
                            {r.questions.filter((q) => r.responses[q.key] !== undefined).map((q) => (
                              <div key={q.key}><dt className="text-[12.5px] text-muted">{q.label}</dt><dd className="text-[13.5px] text-ink">{String(r.responses[q.key])}</dd></div>
                            ))}
                          </dl>
                        )}
                      </div>
                    ))}
                  </section>
                  <section>
                    <div className="mb-3 flex items-center justify-between"><p className="text-[15px] text-ink">Background verification</p>
                      {app.can_manage && <Button size="sm" variant="secondary" onClick={() => setDialog("bgv")}>Update</Button>}</div>
                    <KeyValue items={[
                      { label: "Status", value: <Badge tone={BGV_TONE[app.bgv_status] ?? "neutral"}>{app.bgv_status_label}</Badge> },
                      { label: "Partner", value: app.bgv_vendor }, { label: "Consent", value: app.bgv_consent_at ? formatDate(app.bgv_consent_at) : null },
                      { label: "Notes", value: app.bgv_notes, span: 2 },
                    ]} />
                  </section>
                </div>
              )}
              {tab === "offers" && app && (
                !app.offers.length ? <p className="text-[13.5px] text-faint">No offer yet.</p> : (
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {app.offers.map((o) => (
                      <button key={o.uuid} type="button" onClick={() => setViewOffer(o.uuid)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sunken/50">
                        <div><p className="text-[14px] text-ink">{lakhs(o.annual_ctc)} a year · joining {formatDisplayDate(o.joining_date)}</p>
                          <p className="text-[12.5px] text-muted">{o.number}{o.outside_band ? " · outside band" : ""}</p></div>
                        <Badge tone={OFFER_TONE[o.status] ?? "neutral"}>{o.status_label}</Badge>
                      </button>
                    ))}
                  </div>
                )
              )}
              {tab === "history" && app && (
                <div>
                  <div className="mb-4 flex justify-end"><Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setDialog("note")}>Add note</Button></div>
                  <Timeline items={app.history.map((h, i) => ({ id: i, title: h.text, time: `${formatDateTime(h.at)} · ${h.by}`,
                    tone: h.kind === "rejected" ? "bad" as const : h.kind === "hired" ? "good" as const : h.kind === "note" ? "accent" as const : "neutral" as const }))} />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {app && <>
        <TextDialog open={dialog === "reject"} title="Not moving ahead" label="Reason" required master="rejection_reason" confirmLabel="Confirm" withNotify
          onClose={() => setDialog(null)} onSubmit={(text, notify) => post(`/recruitment/applications/${app.uuid}/reject`, { reason: text, notify_candidate: notify }, "Marked as not moving ahead")} />
        <TextDialog open={dialog === "note"} title="Add a note" label="Note" required confirmLabel="Add note"
          onClose={() => setDialog(null)} onSubmit={(text) => post(`/recruitment/applications/${app.uuid}/notes`, { text }, "Note added")} />
        <OverrideDialog open={dialog === "override"} onClose={() => setDialog(null)}
          onSubmit={(rec, note) => post(`/recruitment/applications/${app.uuid}/evaluation`, { recommendation: rec, note }, "Evaluation updated")} />
        <ReferenceDialog open={dialog === "reference"} onClose={() => setDialog(null)}
          onSubmit={(body) => post(`/recruitment/applications/${app.uuid}/references`, body, body.send ? "Referee added; form sent" : "Referee added")} />
        <BgvDialog open={dialog === "bgv"} app={app} statuses={meta?.bgv_statuses ?? {}} onClose={() => setDialog(null)}
          onSubmit={(body) => post(`/recruitment/applications/${app.uuid}/bgv`, body, "Verification updated")} />
        <ScheduleInterviewModal open={dialog === "schedule"} applicationUuid={app.uuid} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); changed(); }} />
        <OfferFormModal open={dialog === "offer"} applicationUuid={app.uuid} onClose={() => setDialog(null)}
          onSaved={(o) => { setDialog(null); changed(); setViewOffer(o.uuid); }} />
      </>}
      {cand && <CandidateFormModal open={dialog === "edit"} candidate={cand} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); changed(); }} />}
      {cand && <ApplyDialog open={dialog === "apply"} onClose={() => setDialog(null)}
        onSubmit={(job) => post(`/recruitment/candidates/${cand.uuid}/apply`, { job_uuid: job }, "Added to the job")} />}
      <InterviewModal uuid={viewIv} onClose={() => setViewIv(null)} onChanged={changed} />
      <OfferModal uuid={viewOffer} onClose={() => setViewOffer(null)} onChanged={changed} />
    </>
  );
}

function Profile({ c, canEdit, onEdit, onApply }: { c: Candidate; canEdit: boolean; onEdit: () => void; onApply: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-muted">
        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-ink"><Mail size={14} strokeWidth={1.4} />{c.email}</a>}
        {c.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} strokeWidth={1.4} />{c.phone}</span>}
        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink"><Linkedin size={14} strokeWidth={1.4} />LinkedIn</a>}
        {c.resume && <span className="inline-flex items-center gap-1.5"><FileText size={14} strokeWidth={1.4} /><FileLink file={c.resume} label="Resume" /></span>}
        {canEdit && <span className="ml-auto flex gap-2"><Button size="sm" variant="secondary" onClick={onApply}>Add to a job</Button><Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit}>Edit</Button></span>}
      </div>
      <KeyValue columns={3} items={[
        { label: "Location", value: c.location }, { label: "Experience", value: c.total_experience !== null ? `${c.total_experience} years` : null },
        { label: "Notice period", value: c.notice_days !== null ? `${c.notice_days} days` : null },
        { label: "Current CTC", value: c.current_ctc ? lakhs(c.current_ctc) : null }, { label: "Expected CTC", value: c.expected_ctc ? lakhs(c.expected_ctc) : null },
        { label: "Education", value: c.education },
        { label: "Source", value: [c.source_label, c.source_detail].filter(Boolean).join(" · ") }, { label: "Referred by", value: c.referred_by_name },
        { label: "Owner", value: c.owner_name },
        { label: "Follow up", value: c.follow_up_on ? `${formatDisplayDate(c.follow_up_on)}${c.follow_up_note ? ` · ${c.follow_up_note}` : ""}` : null, span: 2 },
        { label: "Talent pool", value: c.talent_pool ? "Yes" : "No" },
        { label: "Skills", value: c.skills.length ? <div className="flex flex-wrap gap-1">{c.skills.map((s) => <span key={s} className="rounded bg-sunken px-1.5 py-0.5 text-[12px]">{s}</span>)}</div> : null, span: 3 },
        { label: "Tags", value: c.tags.length ? c.tags.join(", ") : null, span: 3 },
        ...(c.notes ? [{ label: "Notes", value: c.notes, span: 3 as const }] : []),
        { label: "Privacy consent", value: c.consent_at ? `Given ${formatDateTime(c.consent_at)}` : "Not recorded (added by HR)" },
        { label: "Data deleted after", value: c.purge_after ? formatDisplayDate(c.purge_after) : c.status === "hired" ? "Kept (joined)" : null },
      ]} />
      <div className="empty:hidden [&_section]:px-0"><CustomFields entity="candidate" mode="view" values={c.custom} /></div>
      {!!c.duplicates?.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">
          Possible duplicates: {c.duplicates.map((d) => d.name).join(", ")}. Merge them from the candidates list.
        </p>
      )}
      {c.resume_text && (
        <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-[13px] text-muted">Text read from the CV</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[12.5px] text-muted">{c.resume_text}</pre></details>
      )}
    </div>
  );
}

function TextDialog({ open, title, label, required, confirmLabel, onClose, onSubmit, master, withNotify }: {
  open: boolean; title: string; label: string; required?: boolean; confirmLabel: string; onClose: () => void;
  onSubmit: (text: string, notify: boolean) => Promise<void> | void; master?: string; withNotify?: boolean;
}) {
  const [text, setText] = useState("");
  const [mid, setMid] = useState<number | null>(null);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(""); setMid(null); setNotify(false); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title} busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={required && !text.trim()}
        onClick={async () => { setBusy(true); try { await onSubmit(text, notify); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      <div className="space-y-4">
        {master && <Field label="Reason"><MasterSelect type={master} value={mid} onChange={(v, o) => { setMid(v); if (o) setText(o.label); }} clearable /></Field>}
        <Field label={master ? "Details" : label} required={required}><Textarea value={text} onValueChange={setText} rows={3} data-autofocus /></Field>
        {withNotify && <Toggle checked={notify} onChange={setNotify} label="Send the candidate a polite email" />}
      </div>
    </Modal>
  );
}

function OverrideDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (rec: string | null, note: string) => void }) {
  const [rec, setRec] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setRec(null); setNote(""); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Override the evaluation" description="Leave empty to go back to the computed summary."
      footer={<><ModalCancel /><Button variant="primary" onClick={() => onSubmit(rec, note)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Recommendation"><Select value={rec} onChange={setRec} clearable options={Object.entries(REC_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Why"><Textarea value={note} onValueChange={setNote} rows={3} /></Field>
      </div>
    </Modal>
  );
}

function ReferenceDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ referee_name: "", referee_email: "", referee_phone: "", relationship: "", referee_company: "" });
  const [send, setSend] = useState(true);
  useEffect(() => { if (open) setF({ referee_name: "", referee_email: "", referee_phone: "", relationship: "", referee_company: "" }); }, [open]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} size="md" title="Add a referee" description="They get a short form by email; answers show here."
      footer={<><ModalCancel /><Button variant="primary" onClick={() => onSubmit({ ...f, send })}>{send ? "Add and send" : "Add"}</Button></>}>
      <FormGrid>
        <Field label="Name" required><TextInput value={f.referee_name} onValueChange={set("referee_name")} data-autofocus /></Field>
        <Field label="Email"><TextInput type="email" value={f.referee_email} onValueChange={set("referee_email")} /></Field>
        <Field label="Phone"><TextInput value={f.referee_phone} onValueChange={set("referee_phone")} /></Field>
        <Field label="Relationship"><TextInput value={f.relationship} onValueChange={set("relationship")} placeholder="Former manager" /></Field>
        <Field label="Company"><TextInput value={f.referee_company} onValueChange={set("referee_company")} /></Field>
      </FormGrid>
      <div className="mt-4"><Toggle checked={send} onChange={setSend} label="Send the form now" /></div>
    </Modal>
  );
}

function BgvDialog({ open, app, statuses, onClose, onSubmit }: {
  open: boolean; app: Application; statuses: Record<string, string>; onClose: () => void; onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [st, setSt] = useState(app.bgv_status);
  const [vendor, setVendor] = useState(app.bgv_vendor ?? "");
  const [notes, setNotes] = useState(app.bgv_notes ?? "");
  const [consent, setConsent] = useState(false);
  useEffect(() => { if (open) { setSt(app.bgv_status); setVendor(app.bgv_vendor ?? ""); setNotes(app.bgv_notes ?? ""); setConsent(false); } }, [open, app]);
  return (
    <Modal open={open} onClose={onClose} size="md" title="Background verification"
      footer={<><ModalCancel /><Button variant="primary" onClick={() => onSubmit({ bgv_status: st, bgv_vendor: vendor, bgv_notes: notes, consent_received: consent })}>Save</Button></>}>
      <div className="space-y-4">
        <FormGrid>
          <Field label="Status"><Select value={st} onChange={(v) => setSt(v ?? "not_started")} options={Object.entries(statuses).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Verification partner"><TextInput value={vendor} onValueChange={setVendor} /></Field>
        </FormGrid>
        <Field label="Notes"><Textarea value={notes} onValueChange={setNotes} rows={3} /></Field>
        {!app.bgv_consent_at && <Toggle checked={consent} onChange={setConsent} label="The candidate has given consent for the checks" />}
      </div>
    </Modal>
  );
}

function ApplyDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (job: string) => void }) {
  const [job, setJob] = useState<string | null>(null);
  const [jobs, setJobs] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    setJob(null);
    api.get<{ items: { uuid: string; title: string }[] }>("/recruitment/jobs?status=open,draft,on_hold&size=200")
      .then((r) => setJobs(r.items.map((j) => ({ value: j.uuid, label: j.title })))).catch(() => {});
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Add to a job"
      footer={<><ModalCancel /><Button variant="primary" disabled={!job} onClick={() => job && onSubmit(job)}>Add</Button></>}>
      <Field label="Job"><Select value={job} onChange={setJob} options={jobs} /></Field>
    </Modal>
  );
}

