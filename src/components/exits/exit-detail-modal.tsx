"use client";

/*
 * Exit details: one modal with tabs for the overview, notice, compensation, handover,
 * clearances, exit interview, settlement (2-working-day countdown), letters and timeline.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, FileText, LogOut, Plus, Send, Undo2, Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, todayISO } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, DateInput, Field, FormGrid, KeyValue, Modal, NumberInput, Select, Skeleton, Tabs, TextInput,
  Timeline, Toggle, formatDisplayDate, useConfirm, type TabItem,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { ClearanceCard, InterviewForm, SettlementPanel, type InterviewBody } from "./parts";
import { LETTER_LABEL, STATUS_TONE, errMsg, money, openLetter, type ExitDetail, type ExitMeta } from "./types";

type Tab = "overview" | "notice" | "compensation" | "handover" | "clearances" | "interview" | "settlement" | "letters" | "timeline";

export function ExitDetailModal({ uuid, meta, onClose, onChanged }: {
  uuid: string | null; meta: ExitMeta | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [x, setX] = useState<ExitDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!uuid) return;
    try { setX(await api.get<ExitDetail>(`/exits/${uuid}`)); } catch (e) { toast.error(errMsg(e)); onClose(); }
  }, [uuid, toast, onClose]);
  useEffect(() => { setX(null); setTab("overview"); load(); }, [load]);

  async function run(fn: () => Promise<ExitDetail>, msg: string) {
    setBusy(true);
    try { setX(await fn()); toast.success(msg); onChanged(); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  }

  async function complete() {
    if (!x) return;
    const early = x.last_working_day > todayISO();
    const open = x.clearances_total - x.clearances_done;
    const ok = await confirm({
      title: `Complete ${x.name}'s exit?`, tone: "danger", confirmLabel: early || open ? "Complete anyway" : "Complete exit",
      message: <>Sign-in is disabled, the licence is freed and the record is archived (never deleted). Letters are issued and alumni access opens.
        {early && <><br /><br />The last working day ({formatDisplayDate(x.last_working_day)}) has not come yet.</>}
        {open > 0 && <><br /><br />{open} clearance{open === 1 ? " is" : "s are"} still open.</>}</>,
    });
    if (ok) await run(() => api.post(`/exits/${x.uuid}/complete`, { force: early || open > 0 }), "Exit completed");
  }

  async function withdraw() {
    if (!x) return;
    const ok = await confirm({ title: "Withdraw this exit?", message: "They go back to their earlier stage and open clearances close.", confirmLabel: "Withdraw" });
    if (ok) await run(() => api.post(`/exits/${x.uuid}/withdraw`, { reason: "Withdrawn by HR" }), "Exit withdrawn");
  }

  const comp = x && (x.exit_type === "retrenchment" || x.exit_type === "layoff");
  const tabs: TabItem<Tab>[] = x ? [
    { value: "overview", label: "Overview" },
    { value: "notice", label: "Notice" },
    ...(comp ? [{ value: "compensation" as Tab, label: "Compensation" }] : []),
    { value: "handover", label: "Handover", count: x.handovers.filter((h) => h.status !== "done").length || undefined },
    { value: "clearances", label: "Clearances", count: x.clearances_total - x.clearances_done || undefined },
    ...(x.interview ? [{ value: "interview" as Tab, label: "Interview" }] : []),
    { value: "settlement", label: "Settlement" },
    { value: "letters", label: "Letters" },
    { value: "timeline", label: "Timeline" },
  ] : [];
  const live = x && (x.status === "requested" || x.status === "in_progress");
  const manage = !!x?.can_manage;

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy}
      title={x ? x.name : "Exit"}
      description={x ? <span className="inline-flex flex-wrap items-center gap-2">
        {x.number} · {x.exit_type_label} · {[x.designation, x.department].filter(Boolean).join(", ") || "—"}
        <Badge tone={STATUS_TONE[x.status] ?? "neutral"} dot>{x.status_label}</Badge>
      </span> : undefined}
      footerStart={x && manage && live ? <Button variant="ghost" icon={Undo2} onClick={withdraw} disabled={busy}>Withdraw</Button> : undefined}
      footer={x && manage && x.status === "in_progress" ? <Button variant="primary" icon={LogOut} onClick={complete} loading={busy}>Complete exit</Button> : undefined}>
      {!x ? <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div> : (
        <div className="space-y-5">
          <Tabs value={tab} onChange={setTab} items={tabs} />
          {tab === "overview" && <Overview x={x} manage={manage} run={run} />}
          {tab === "notice" && <Notice x={x} meta={meta} manage={manage && !!live} run={run} />}
          {tab === "compensation" && <Compensation x={x} manage={manage && !!live} run={run} />}
          {tab === "handover" && <Handover key={x.handovers.map((h) => h.uuid + h.status).join()} x={x} live={!!live} run={run} />}
          {tab === "clearances" && (
            <div className="space-y-3">
              {x.outstanding_assets.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[13.5px] text-amber-800">
                  <p className="mb-1">Assets still with {x.name}:</p>
                  <ul className="list-disc pl-5">{x.outstanding_assets.map((a) => <li key={a.assignment_uuid}>{a.name} ({a.asset_tag})</li>)}</ul>
                  <p className="mt-1 text-[12.5px]">Take them back in Assets, or enter an amount to recover on the asset clearance.</p>
                </div>
              )}
              {x.clearances.length === 0 && <p className="text-[13.5px] text-muted">Clearances start once the exit is accepted.</p>}
              {x.clearances.map((c) => <ClearanceCard key={c.uuid} c={c} canEdit={manage} onSaved={() => { load(); onChanged(); }} />)}
            </div>
          )}
          {tab === "interview" && x.interview && (
            x.interview.status === "submitted" && !manage ? <p className="text-[14px] text-muted">Submitted.</p> :
              <>
                {x.interview.status === "submitted" && <p className="text-[13px] text-muted">Submitted {formatDateTime(x.interview.submitted_at)}. You can correct it.</p>}
                <InterviewForm interview={x.interview} interviewer busy={busy}
                  onSubmit={(b: InterviewBody) => run(() => api.post(`/exits/${x.uuid}/interview`, b), "Exit interview saved")} />
              </>
          )}
          {tab === "settlement" && (
            <div className="space-y-4">
              <SettlementPanel s={x.settlement} lastDay={x.last_working_day} />
              {!!x.leave_encashment?.length && (
                <div className="rounded-xl border border-line p-4">
                  <p className="text-[14.5px] text-ink">Leave to be encashed</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">Preview from the current leave balance; payroll pays it in the settlement.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {x.leave_encashment.map((l) => <Badge key={l.code} tone="info">{l.name}: {Number(l.days)} days</Badge>)}
                  </div>
                </div>
              )}
              {manage && <SettlementActions x={x} run={run} />}
            </div>
          )}
          {tab === "letters" && <Letters x={x} manage={manage} run={run} />}
          {tab === "timeline" && (
            <Timeline items={x.history.map((h, i) => ({
              id: i, title: h.text, time: `${formatDateTime(h.at)} · ${h.by}`,
              tone: h.kind === "complete" ? "good" : h.kind === "withdraw" ? "warn" : h.kind === "settlement" ? "accent" : "neutral",
            }))} />
          )}
        </div>
      )}
    </Modal>
  );
}

type Run = (fn: () => Promise<ExitDetail>, msg: string) => Promise<boolean>;

function Overview({ x, manage, run }: { x: ExitDetail; manage: boolean; run: Run }) {
  const [lwd, setLwd] = useState(x.last_working_day);
  const [rehire, setRehire] = useState(!!x.rehire_eligible);
  const [note, setNote] = useState(x.rehire_note ?? "");
  const live = x.status === "requested" || x.status === "in_progress";
  return (
    <div className="space-y-6">
      {x.status === "requested" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[13.5px] text-amber-800">
          Waiting for acceptance in the approvals inbox{x.workflow ? ` (${x.workflow.status})` : ""}.
        </div>
      )}
      <KeyValue columns={3} items={[
        { label: "Kind of exit", value: x.exit_type_label },
        { label: "Reason", value: x.reason },
        { label: "Raised by", value: x.raised_by === "system" ? "Automatic" : x.raised_by === "employee" ? "The employee" : x.raised_by === "manager" ? "Manager" : "HR" },
        { label: x.exit_type === "resignation" ? "Resigned on" : "Notice date", value: formatDisplayDate(x.resignation_date) },
        { label: "Last working day", value: <>{formatDisplayDate(x.last_working_day)}{live && x.days_to_last_day >= 0 && <span className="text-muted"> · in {x.days_to_last_day} days</span>}</> },
        { label: "Joined", value: formatDisplayDate(x.date_of_joining) },
        { label: "Manager", value: x.manager_name },
        { label: "Flow", value: x.flow_name },
        { label: "Replacement needed", value: x.replacement_needed ? "Yes" : "No" },
        ...(x.login_disabled_at ? [{ label: "Sign-in disabled", value: formatDateTime(x.login_disabled_at) }] : []),
        ...(x.archived_at ? [{ label: "Record archived", value: formatDateTime(x.archived_at) }] : []),
        ...(x.alumni_until ? [{ label: "Alumni access until", value: formatDisplayDate(x.alumni_until) }] : []),
      ]} />
      {x.exit_type === "death" && (
        <div className="rounded-xl border border-line p-4">
          <p className="text-[14.5px] text-ink">Nominees</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Dues (salary, leave pay, gratuity, PF and insurance) go to the nominees.</p>
          {x.nominees?.length ? (
            <div className="mt-3 divide-y divide-line">
              {x.nominees.map((n, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span className="text-ink">{n.name}{n.relation ? <span className="text-muted"> · {n.relation}</span> : null}</span>
                  <span className="text-muted">{n.kind.toUpperCase()} · {Number(n.share_percent)}%</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-[13px] text-amber-700">No nominees on record. Collect legal heir details.</p>}
        </div>
      )}
      {x.alumni_link && <p className="text-[13px] text-muted">Alumni link: <a className="text-primary hover:underline" href={x.alumni_link} target="_blank" rel="noreferrer">open portal</a></p>}
      {manage && (
        <div className="rounded-xl border border-line p-4">
          <FormGrid columns={2}>
            {live && (
              <Field label="Last working day" hint="Clearance and interview dates move with it">
                <DateInput value={lwd} onChange={setLwd} min={x.resignation_date} />
              </Field>
            )}
            <div className="flex items-end pb-1"><Toggle checked={rehire} onChange={setRehire} label="Eligible for rehire" /></div>
            <Field label="Rehire note" className={live ? "sm:col-span-2" : ""}><TextInput value={note} onValueChange={setNote} placeholder="Optional" /></Field>
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={() => run(() => api.put(`/exits/${x.uuid}`, {
              ...(live && lwd !== x.last_working_day ? { last_working_day: lwd } : {}), rehire_eligible: rehire, rehire_note: note || null,
            }), "Saved")}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ x, meta, manage, run }: { x: ExitDetail; meta: ExitMeta | null; manage: boolean; run: Run }) {
  const [action, setAction] = useState(x.notice_action);
  const [req, setReq] = useState<number | null>(x.notice_required_days);
  const opts = Object.entries(meta?.notice_actions ?? {}).map(([value, label]) => ({ value, label }));
  const amount = x.notice_amount || x.notice_pay_in_lieu;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Required", x.notice_required_days], ["Served", x.notice_served_days], ["Short by", x.notice_shortfall_days]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-line p-4">
            <p className="text-[12.5px] text-muted">{l}</p>
            <p className={`tabular mt-1 text-[26px] font-extralight ${l === "Short by" && Number(v) > 0 ? "text-rose-600" : "text-ink"}`}>{v} <span className="text-[13px] text-muted">days</span></p>
          </div>
        ))}
      </div>
      <p className="text-[14px] text-ink">
        {x.notice_action_label}
        {amount && <> · {x.notice_pay_in_lieu ? "paid to the employee" : x.notice_action === "buyout" ? "paid by the employee" : "recovered in the settlement"}: <strong className="font-normal">{money(amount)}</strong></>}
      </p>
      <p className="text-[12.5px] text-muted">The daily rate is the monthly pay divided by 30. Without a salary on record the amount is worked out in payroll.</p>
      {manage && (
        <div className="rounded-xl border border-line p-4">
          <FormGrid columns={2}>
            <Field label="If the notice falls short"><Select value={action} onChange={(v) => v && setAction(v)} options={opts} /></Field>
            <Field label="Required notice (days)"><NumberInput value={req} onChange={setReq} min={0} max={365} /></Field>
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={() => run(() => api.put(`/exits/${x.uuid}`, { notice_action: action, notice_required_days: req }), "Notice updated")}>Recalculate</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Compensation({ x, manage, run }: { x: ExitDetail; manage: boolean; run: Run }) {
  const c = x.compensation as Record<string, string | number | boolean | null>;
  const [avg, setAvg] = useState<number | null>(c.average_monthly_pay ? Number(c.average_monthly_pay) : null);
  const [days, setDays] = useState<number | null>(c.layoff_days ? Number(c.layoff_days) : null);
  const [ref, setRef] = useState(String(c.permission_reference ?? ""));
  const retr = x.exit_type === "retrenchment";
  return (
    <div className="space-y-5">
      {retr && c.government_permission_needed && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-[13.5px] text-rose-800">
          <AlertTriangle size={16} strokeWidth={1.4} className="mt-0.5 shrink-0" />
          <span>With {String(c.headcount)} workers (threshold {String(c.permission_threshold)}), retrenchment needs prior government permission under the Industrial Relations Code.
            {c.permission_reference ? ` Reference: ${c.permission_reference}.` : " Record the permission reference below."}</span>
        </div>
      )}
      <KeyValue columns={3} items={retr ? [
        { label: "Average monthly pay", value: money(c.average_monthly_pay as string) },
        { label: "Years counted", value: String(c.years_counted ?? "—") },
        { label: "Compensation (15 days a year)", value: money(c.compensation as string) },
        { label: "Re-skilling fund (15 days)", value: money(c.reskilling_fund as string) },
        { label: "Notice pay", value: money(c.notice_pay as string) },
        { label: "Headcount", value: String(c.headcount ?? "—") },
      ] : [
        { label: "Average monthly pay", value: money(c.average_monthly_pay as string) },
        { label: "Days laid off", value: String(c.layoff_days ?? 0) },
        { label: "Share of pay", value: `${c.percent ?? 50}%` },
        { label: "Compensation", value: money(c.compensation as string) },
      ]} />
      {retr && c.seniority_note && <p className="text-[12.5px] text-muted">{String(c.seniority_note)}</p>}
      {manage && (
        <div className="rounded-xl border border-line p-4">
          <FormGrid columns={2}>
            <Field label="Average monthly pay"><NumberInput value={avg} onChange={setAvg} min={0} suffix="₹" /></Field>
            {retr ? <Field label="Permission reference"><TextInput value={ref} onValueChange={setRef} /></Field>
              : <Field label="Days laid off"><NumberInput value={days} onChange={setDays} min={0} /></Field>}
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={() => run(() => api.put(`/exits/${x.uuid}`, {
              compensation: { average_monthly_pay: avg ?? undefined, layoff_days: days ?? undefined, permission_reference: ref || undefined },
            }), "Recalculated")}>Recalculate</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Handover({ x, live, run }: { x: ExitDetail; live: boolean; run: Run }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("task");
  const [to, setTo] = useState<number | null>(null);
  const [delegate, setDelegate] = useState<number | null>(null);
  const [items, setItems] = useState(x.handovers);
  async function toggle(uuid: string, done: boolean) {
    try {
      await api.put(`/exits/handovers/${uuid}`, { status: done ? "done" : "pending" });
      setItems(items.map((h) => (h.uuid === uuid ? { ...h, status: done ? "done" : "pending" } : h)));
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {items.length === 0 && <p className="text-[13.5px] text-muted">Nothing listed yet. Add work, documents and knowledge to hand over.</p>}
        {items.map((h) => (
          <div key={h.uuid} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
            <Checkbox checked={h.status === "done"} onChange={(v) => toggle(h.uuid, v)}
              label={<span className={h.status === "done" ? "text-muted line-through" : ""}>{h.title}</span>}
              description={[h.kind, h.to_name && `to ${h.to_name}`].filter(Boolean).join(" · ")} />
          </div>
        ))}
      </div>
      {live && (
        <div className="rounded-xl border border-line p-4">
          <FormGrid columns={3}>
            <Field label="What" className="sm:col-span-2 lg:col-span-1"><TextInput value={title} onValueChange={setTitle} placeholder="e.g. Vendor contracts folder" /></Field>
            <Field label="Kind"><Select value={kind} onChange={(v) => v && setKind(v)} options={[
              { value: "task", label: "Work" }, { value: "document", label: "Document" }, { value: "knowledge", label: "Knowledge" }, { value: "other", label: "Other" },
            ]} /></Field>
            <Field label="Hand to"><Select<number> value={to} onChange={(v) => setTo(v)} loadOptions={loadEmployees} clearable /></Field>
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" icon={Plus} disabled={!title.trim()} onClick={async () => {
              if (await run(() => api.post(`/exits/${x.uuid}/handovers`, { title, kind, to_employee_id: to }), "Added")) { setTitle(""); setTo(null); }
            }}>Add</Button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-line p-4">
        <p className="text-[14.5px] text-ink">Pending approvals and open tasks</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {x.approvals_delegated_to_name
            ? <>Handed to {x.approvals_delegated_to_name} on {formatDateTime(x.approvals_delegated_at)}. New approvals go to them until after the last day.</>
            : "Move the leaver's pending approvals and open tasks to a colleague."}
        </p>
        {live && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1"><Select<number> value={delegate} onChange={(v) => setDelegate(v)} loadOptions={loadEmployees} placeholder="Pick a colleague" /></div>
            <Button variant="secondary" icon={ArrowRightLeft} disabled={!delegate}
              onClick={() => run(() => api.post(`/exits/${x.uuid}/delegate`, { to_employee_id: delegate, reassign_tasks: true }), "Handed over")}>Hand over</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettlementActions({ x, run }: { x: ExitDetail; run: Run }) {
  const [paidOn, setPaidOn] = useState(todayISO());
  const [ref, setRef] = useState("");
  const s = x.settlement;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-line p-4">
        <p className="text-[14.5px] text-ink">Payroll</p>
        <p className="mt-0.5 text-[13px] text-muted">Payroll works out salary to the last day, leave encashment, gratuity, notice pay or recovery, loans, asset recovery and tax.</p>
        <Button className="mt-3" variant="secondary" icon={Send} disabled={x.status === "requested"}
          onClick={() => run(() => api.post(`/exits/${x.uuid}/settlement`), "Handed to payroll")}>
          {s.handed_at ? "Send changes to payroll" : "Hand over to payroll"}
        </Button>
      </div>
      <div className="rounded-xl border border-line p-4">
        <p className="text-[14.5px] text-ink">Paid outside payroll?</p>
        {s.status === "paid" ? <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] text-emerald-700"><CheckCircle2 size={15} strokeWidth={1.4} />Paid on {formatDisplayDate(s.paid_on)}</p> : (
          <>
            <FormGrid columns={2} className="mt-2">
              <Field label="Paid on"><DateInput value={paidOn} onChange={setPaidOn} /></Field>
              <Field label="Reference"><TextInput value={ref} onValueChange={setRef} placeholder="UTR or cheque no." /></Field>
            </FormGrid>
            <Button className="mt-3" variant="secondary" icon={Wallet} disabled={!paidOn}
              onClick={() => run(() => api.post(`/exits/${x.uuid}/settlement/paid`, { paid_on: paidOn, reference: ref || null }), "Payment recorded")}>Record payment</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Letters({ x, manage, run }: { x: ExitDetail; manage: boolean; run: Run }) {
  const [types, setTypes] = useState<string[]>(["relieving", "experience"]);
  const issued = new Set(x.letters.map((l) => l.type));
  return (
    <div className="space-y-5">
      {x.letters.length === 0 ? <p className="text-[13.5px] text-muted">No letters yet. They are issued automatically when the exit completes, or now below.</p> : (
        <div className="divide-y divide-line rounded-xl border border-line">
          {x.letters.map((l) => (
            <button key={l.letter_uuid} type="button" onClick={() => openLetter(l.letter_uuid)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sunken/50">
              <span className="inline-flex items-center gap-2 text-[14px] text-ink"><FileText size={16} strokeWidth={1.4} className="text-muted" />{l.title}</span>
              <span className="text-[12.5px] text-muted">{formatDateTime(l.at)}</span>
            </button>
          ))}
        </div>
      )}
      {manage && x.exit_type !== "death" && (
        <div className="rounded-xl border border-line p-4">
          <p className="mb-2 text-[13px] text-muted">Issue now</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(LETTER_LABEL).map(([k, label]) => (
              <Checkbox key={k} label={label} disabled={issued.has(k)} checked={types.includes(k) && !issued.has(k)}
                onChange={(v) => setTypes(v ? [...types, k] : types.filter((t) => t !== k))} />
            ))}
          </div>
          <Button className="mt-3" variant="secondary" icon={FileText} disabled={!types.filter((t) => !issued.has(t)).length}
            onClick={() => run(() => api.post(`/exits/${x.uuid}/letters`, { types: types.filter((t) => !issued.has(t)) }), "Letters issued")}>Issue letters</Button>
        </div>
      )}
      <p className="text-[12.5px] text-faint">Letters are filed in the employee’s documents and stay available in the alumni portal.</p>
    </div>
  );
}
