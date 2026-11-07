"use client";

/*
 * My resignation: resign with a reason and a proposed last day, withdraw before it is
 * accepted, then follow the notice, clearances and handover and fill in the exit
 * interview. Managers also see their team's exits.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, DoorClosed, Plus, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FormGrid, MasterSelect, Modal, ModalCancel, Skeleton, Textarea,
  TextInput, formatDisplayDate, useConfirm, type Column,
} from "@/components/ui-kit";
import { ExitDetailModal } from "@/components/exits/exit-detail-modal";
import { InterviewForm, type InterviewBody } from "@/components/exits/parts";
import { STATUS_TONE, errMsg, reasonParentFor, type ExitDetail, type ExitMeta, type ExitRow, type Page } from "@/components/exits/types";

type Me = { exit: ExitDetail | null; can_resign: boolean; notice: { notice_days: number; earliest_last_day: string; today: string } };

export default function MyResignationPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<ExitMeta | null>(null);
  const [team, setTeam] = useState<ExitRow[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Me>("/exits/me").then(setMe).catch((e) => setErr(errMsg(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ExitMeta>("/exits/meta").then((m) => {
      setMeta(m);
      if (m.has_team) api.get<Page<ExitRow>>("/exits?scope=team&size=50").then((r) => setTeam(r.items)).catch(() => {});
    }).catch(() => {});
  }, []);

  async function withdraw() {
    const ok = await confirm({ title: "Withdraw your resignation?", message: "Your manager and HR are told. You stay in your current role.", confirmLabel: "Withdraw" });
    if (!ok) return;
    setBusy(true);
    try { setMe(await api.post<Me>("/exits/me/withdraw", { reason: "Changed my mind" })); toast.success("Resignation withdrawn"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  async function submitInterview(b: InterviewBody) {
    setBusy(true);
    try { setMe(await api.post<Me>("/exits/me/interview", b)); toast.success("Thank you for your feedback"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  const x = me?.exit && (me.exit.status === "requested" || me.exit.status === "in_progress" || me.exit.status === "completed") ? me.exit : null;
  const teamCols: Column<ExitRow>[] = [
    { key: "name", header: "Name", cell: (r) => r.name },
    { key: "kind", header: "Kind", cell: (r) => r.exit_type_label },
    { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
    { key: "lwd", header: "Last day", cell: (r) => formatDisplayDate(r.last_working_day) },
    { key: "clear", header: "Clearances", hideBelow: "md", cell: (r) => r.clearances_total ? `${r.clearances_done}/${r.clearances_total}` : "—" },
  ];

  return (
    <div>
      <PageHeader title="My resignation" description="Resign, follow your notice period and hand over before you leave." />
      {err ? <Paper><EmptyState icon={DoorClosed} title="Not available" hint={err} /></Paper> : !me ? <Skeleton className="h-48 rounded-2xl" /> : !x ? (
        <Paper>
          <div className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[16px] text-ink">You have no resignation in progress.</p>
              <p className="mt-1 text-[14px] text-muted">
                Your notice period is {me.notice.notice_days} days. If you resign today, your last working day would be {formatDisplayDate(me.notice.earliest_last_day)}.
                {me.exit?.status === "withdrawn" && " Your last resignation was withdrawn."}
              </p>
            </div>
            {me.can_resign && <Button variant="secondary" icon={DoorClosed} onClick={() => setResigning(true)}>Resign</Button>}
          </div>
        </Paper>
      ) : (
        <div className="space-y-4">
          <Paper>
            <div className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[17px] text-ink">{x.exit_type_label}</p>
                  <Badge tone={STATUS_TONE[x.status] ?? "neutral"} dot>{x.status === "requested" ? "Waiting for your manager and HR" : x.status_label}</Badge>
                </div>
                <p className="mt-1 text-[14px] text-muted">
                  Resigned on {formatDisplayDate(x.resignation_date)}{x.reason ? ` · ${x.reason}` : ""}
                </p>
              </div>
              {x.status === "requested" && <Button variant="secondary" icon={Undo2} loading={busy} onClick={withdraw}>Withdraw</Button>}
            </div>
            <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
              {[
                ["Last working day", formatDisplayDate(x.last_working_day), x.status === "in_progress" && x.days_to_last_day >= 0 ? `${x.days_to_last_day} days to go` : ""],
                ["Notice", `${x.notice_served_days} of ${x.notice_required_days} days`, x.notice_shortfall_days ? `${x.notice_shortfall_days} days short · ${x.notice_action_label}` : "Fully served"],
                ["Clearances", x.clearances_total ? `${x.clearances_done} of ${x.clearances_total} done` : "Start after acceptance", ""],
              ].map(([l, v, h]) => (
                <div key={l} className="bg-surface p-5">
                  <p className="text-[12.5px] text-muted">{l}</p>
                  <p className="mt-1 text-[18px] font-light text-ink">{v}</p>
                  {h && <p className="mt-0.5 text-[12.5px] text-faint">{h}</p>}
                </div>
              ))}
            </div>
          </Paper>

          {x.status !== "requested" && x.clearances.length > 0 && (
            <Paper>
              <PaperHeader title="Clearances" />
              <div className="divide-y divide-line">
                {x.clearances.map((c) => (
                  <div key={c.uuid} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[14px] text-ink">{c.label}</p>
                      <p className="text-[12.5px] text-muted">{c.owner_name ?? "HR"} · due {formatDisplayDate(c.due_date)}</p>
                    </div>
                    {c.status === "cleared" ? <span className="inline-flex items-center gap-1 text-[13px] text-emerald-700"><CheckCircle2 size={15} strokeWidth={1.4} />Cleared</span>
                      : c.status === "not_applicable" ? <span className="text-[13px] text-muted">Not needed</span>
                        : <span className={`inline-flex items-center gap-1 text-[13px] ${c.delayed ? "text-rose-600" : "text-amber-700"}`}><ClipboardCheck size={15} strokeWidth={1.4} />Pending</span>}
                  </div>
                ))}
              </div>
            </Paper>
          )}

          {x.status === "in_progress" && <MyHandover x={x} onChanged={load} />}

          {x.interview && x.status !== "requested" && (
            <Paper>
              <PaperHeader title="Exit interview" action={x.interview.status === "submitted" ? <Badge tone="good">Submitted</Badge> : undefined} />
              <div className="p-5">
                {x.interview.status === "submitted" ? <p className="text-[14px] text-muted">Thank you. Your feedback helps us improve.</p> : (
                  <>
                    <p className="mb-5 text-[13.5px] text-muted">Your honest feedback helps us improve. HR reads it; your manager does not see your answers.</p>
                    <InterviewForm interview={x.interview} onSubmit={submitInterview} busy={busy} />
                  </>
                )}
              </div>
            </Paper>
          )}
        </div>
      )}

      {meta?.has_team && (
        <div className="mt-8">
          <h2 className="mb-3 text-[17px] font-light text-ink">Team exits</h2>
          <DataTable rows={team} rowKey={(r) => r.uuid} columns={teamCols} onRowClick={(r) => setViewing(r.uuid)}
            emptyIcon={CalendarDays} emptyTitle="Nobody in your team is leaving" />
        </div>
      )}

      {me && <ResignModal open={resigning} onClose={() => setResigning(false)} notice={me.notice}
        onDone={(m) => { setMe(m); setResigning(false); toast.success("Resignation sent to your manager"); }} />}
      <ExitDetailModal uuid={viewing} meta={meta} onClose={() => setViewing(null)} onChanged={() => {}} />
    </div>
  );
}

function ResignModal({ open, onClose, notice, onDone }: { open: boolean; onClose: () => void; notice: Me["notice"]; onDone: (m: Me) => void }) {
  const toast = useToast();
  const [parent, setParent] = useState<number | null>(null);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [lastDay, setLastDay] = useState(notice.earliest_last_day);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { reasonParentFor("resignation").then(setParent); setReasonId(null); setText(""); setLastDay(notice.earliest_last_day); setAck(false); } }, [open, notice.earliest_last_day]);
  const early = lastDay && lastDay < notice.earliest_last_day;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonId && !text.trim()) { toast.error("Pick a reason for leaving."); return; }
    setBusy(true);
    try { onDone(await api.post<Me>("/exits/me/resign", { reason_id: reasonId, reason_text: text || null, proposed_last_day: lastDay || null })); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Resign" size="md" busy={busy} dirty={!!(reasonId || text)}
      description="Your manager and HR accept it. You can withdraw until then."
      footer={<><ModalCancel /><Button type="submit" form="resign-form" variant="danger" loading={busy} disabled={!ack}>Submit resignation</Button></>}>
      <form id="resign-form" onSubmit={submit} className="space-y-5">
        <Field label="Reason for leaving" required>
          <MasterSelect type="exit_reason" parentId={parent} value={reasonId} onChange={(v) => setReasonId(v)} allowCreate={false} clearable />
        </Field>
        <Field label="Anything you want to add" hint="Optional">
          <Textarea value={text} onValueChange={setText} rows={3} autoGrow />
        </Field>
        <FormGrid columns={1}>
          <Field label="Proposed last working day" hint={`Your notice period is ${notice.notice_days} days, so the usual last day is ${formatDisplayDate(notice.earliest_last_day)}.`}>
            <DateInput value={lastDay} onChange={setLastDay} min={notice.today} />
          </Field>
        </FormGrid>
        {early && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">This is before your notice ends. The shortfall may be recovered from your final settlement unless it is waived.</p>}
        <Checkbox checked={ack} onChange={setAck} label="I want to resign from my job" />
      </form>
    </Modal>
  );
}

function MyHandover({ x, onChanged }: { x: ExitDetail; onChanged: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try { await api.post(`/exits/${x.uuid}/handovers`, { title, kind: "task" }); setTitle(""); onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function toggle(uuid: string, done: boolean) {
    try { await api.put(`/exits/handovers/${uuid}`, { status: done ? "done" : "pending" }); onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Paper>
      <PaperHeader title="Handover" />
      <div className="space-y-2 p-5">
        {x.handovers.length === 0 && <p className="text-[13.5px] text-muted">List the work, documents and knowledge you will hand over.</p>}
        {x.handovers.map((h) => (
          <Checkbox key={h.uuid} checked={h.status === "done"} onChange={(v) => toggle(h.uuid, v)}
            label={<span className={h.status === "done" ? "text-muted line-through" : ""}>{h.title}</span>}
            description={h.to_name ? `to ${h.to_name}` : undefined} />
        ))}
        <div className="flex gap-2 pt-2">
          <TextInput value={title} onValueChange={setTitle} placeholder="e.g. Monthly vendor reconciliation" className="flex-1" />
          <Button variant="secondary" icon={Plus} loading={busy} disabled={!title.trim()} onClick={add}>Add</Button>
        </div>
      </div>
    </Paper>
  );
}
