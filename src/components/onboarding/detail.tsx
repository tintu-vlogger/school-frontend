"use client";

/*
 * One onboarding in a centered modal: overview, joining-details review, checklist,
 * documents, assets and accounts, induction and check-ins, and the timeline.
 *   <OnboardingDetail uuid={uuid} onClose={...} onChanged={refresh} />
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Check, ClipboardList, Copy, ExternalLink, FileText, History, Laptop, Link2, Mail, RotateCcw, Send, ShieldCheck, Sparkles, Undo2, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, Modal, ModalCancel, Section, Select, Skeleton, Tabs, Textarea, Timeline,
  formatDisplayDate, useConfirm, type SelectOption, type TabItem,
} from "@/components/ui-kit";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import { fileHref } from "@/components/workplace/files";
import { REVIEW_LABEL, REVIEW_TONE, STATUS_TONE, fieldLabel, type Checkin, type Meta, type OnboardingDetail as Detail, type ReviewEntry } from "./types";

type Tab = "overview" | "review" | "checklist" | "documents" | "assets" | "induction" | "timeline";
const S = 1.4;

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== "").map(([k, x]) => `${fieldLabel(k)}: ${String(x)}`).join(", ") || "—";
  return String(v);
}

export function OnboardingDetail({ uuid, meta, onClose, onChanged }: { uuid: string | null; meta: Meta | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkin, setCheckin] = useState<Checkin | null>(null);

  const load = useCallback(() => {
    if (!uuid) return;
    api.get<Detail>(`/onboarding/onboardings/${uuid}`).then(setD).catch((e) => toast.error(e.message));
  }, [uuid, toast]);
  useEffect(() => { setD(null); setTab("overview"); load(); }, [load]);

  async function act(key: string, path: string, body?: unknown, msg?: string) {
    setBusy(key);
    try {
      const out = await api.post<Detail>(`/onboarding/onboardings/${uuid}${path}`, body ?? {});
      setD(out);
      onChanged();
      if (msg) toast.success(msg);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy("complete");
    try {
      setD(await api.post<Detail>(`/onboarding/onboardings/${uuid}/complete`, { force: false }));
      onChanged();
      toast.success("Onboarding completed");
    } catch (e) {
      const m = (e as Error).message;
      if (/still open/.test(m) && await confirm({ title: "Close with open tasks?", message: m, confirmLabel: "Close anyway" })) {
        await act("complete", "/complete", { force: true }, "Onboarding completed");
      } else if (!/still open/.test(m)) toast.error(m);
    } finally {
      setBusy(null);
    }
  }

  const closed = d ? ["completed", "cancelled"].includes(d.status) : true;
  const tabs: TabItem<Tab>[] = [
    { value: "overview", label: "Overview" },
    { value: "review", label: "Joining details", count: d ? d.review_keys.filter((k) => !d.review[k] || d.review[k].status !== "accepted").length || undefined : undefined },
    { value: "checklist", label: "Checklist", count: d?.tasks ? d.tasks.total - d.tasks.done || undefined : undefined },
    { value: "documents", label: "Documents" },
    { value: "assets", label: "Assets & accounts" },
    { value: "induction", label: "Induction & check-ins" },
    { value: "timeline", label: "Timeline" },
  ];

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" flush
      title={d ? d.name : "Onboarding"}
      description={d ? [d.designation, d.department, `joining ${formatDisplayDate(d.joining_date)}`].filter(Boolean).join(" · ") : undefined}
      headerActions={d && <Badge tone={STATUS_TONE[d.status] ?? "neutral"} dot>{d.status_label}</Badge>}
      footerStart={d && !closed && <Button variant="ghost" icon={X} onClick={() => setCancelOpen(true)}>Did not join</Button>}
      footer={d && <>
        <ModalCancel>Close</ModalCancel>
        {d.status === "pre_joining" && d.days_to_join <= 0 && <Button icon={Sparkles} loading={busy === "day1"} onClick={() => act("day1", "/day-one", {}, "Marked as joined")}>Mark joined</Button>}
        {!closed && d.day_one_started_at && <Button variant="primary" icon={Check} loading={busy === "complete"} onClick={complete}>Complete onboarding</Button>}
      </>}>
      {!d ? <div className="space-y-3 p-6"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40" /></div> : (
        <div>
          <div className="sticky top-0 z-[1] border-b border-line bg-surface px-6 pt-2"><Tabs items={tabs} value={tab} onChange={setTab} /></div>
          <div className="p-6">
            {tab === "overview" && <Overview d={d} busy={busy} act={act} onSaved={(x) => { setD(x); onChanged(); }} />}
            {tab === "review" && <Review d={d} busy={busy} act={act} />}
            {tab === "checklist" && <Checklist d={d} />}
            {tab === "documents" && <Documents d={d} meta={meta} busy={busy} act={act} />}
            {tab === "assets" && <Assets d={d} meta={meta} busy={busy} act={act} />}
            {tab === "induction" && <Induction d={d} onCheckin={setCheckin} />}
            {tab === "timeline" && <TimelineTab d={d} />}
          </div>
        </div>
      )}
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={async (reason) => {
        if (await act("cancel", "/cancel", { reason }, "Onboarding cancelled")) setCancelOpen(false);
      }} />
      <CheckinModal checkin={checkin} onClose={() => setCheckin(null)} onSaved={() => { setCheckin(null); load(); onChanged(); }} />
    </Modal>
  );
}

type Act = (key: string, path: string, body?: unknown, msg?: string) => Promise<boolean>;

function Progress({ value }: { value: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

function Overview({ d, busy, act, onSaved }: { d: Detail; busy: string | null; act: Act; onSaved: (x: Detail) => void }) {
  const toast = useToast();
  const [buddy, setBuddy] = useState<number | null>(d.buddy_employee_id);
  const [hr, setHr] = useState<number | null>(d.hr_owner_employee_id);
  const [joining, setJoining] = useState(d.joining_date);
  const [known, setKnown] = useState<SelectOption<number>[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { employeeOptionsFor([d.buddy_employee_id, d.hr_owner_employee_id]).then(setKnown).catch(() => {}); }, [d.buddy_employee_id, d.hr_owner_employee_id]);
  const dirty = buddy !== d.buddy_employee_id || hr !== d.hr_owner_employee_id || joining !== d.joining_date;
  async function save() {
    setSaving(true);
    try {
      onSaved(await api.put<Detail>(`/onboarding/onboardings/${d.uuid}`, {
        buddy_employee_id: buddy, hr_owner_employee_id: hr, ...(joining !== d.joining_date ? { joining_date: joining } : {}),
      }));
      toast.success("Saved");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  const t = d.tasks;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Joining details" value={`${d.completeness.percent}%`} hint={REVIEW_LABEL[d.review_status] ?? d.review_status}><Progress value={d.completeness.percent} /></Card>
        <Card label="Checklist" value={`${t.done}/${t.total}`} hint={t.overdue ? `${t.overdue} overdue` : "On track"}><Progress value={t.total ? (100 * t.done) / t.total : 0} /></Card>
        <Card label="Appointment letter" value={d.appointment ? "Issued" : "Not yet"} hint={d.appointment ? d.appointment.reference_no ?? "" : "Required by law"}><Progress value={d.appointment ? 100 : 0} /></Card>
      </div>
      <KeyValue columns={3} items={[
        { label: "Email", value: d.email },
        { label: "Flow", value: d.flow_name ?? "None" },
        { label: "Manager", value: d.manager_name ?? "—" },
        { label: "Joining", value: d.days_to_join > 0 ? `${formatDisplayDate(d.joining_date)} (in ${d.days_to_join} days)` : formatDisplayDate(d.joining_date) },
        { label: "Employee stage", value: d.employee_status.replace("_", " ") },
        { label: "Welcome", value: d.welcome_sent_at ? `Email sent ${formatDateTime(d.welcome_sent_at)}` : "Sent on day one" },
      ]} />
      {d.completeness.missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[13.5px] text-amber-800">
          Still missing: {d.completeness.missing.slice(0, 6).join("; ")}{d.completeness.missing.length > 6 ? "…" : ""}
        </div>
      )}
      <Section title="People and dates">
        <FormGrid columns={3}>
          <Field label="Buddy"><Select loadOptions={loadEmployees} selectedOption={known.find((o) => o.value === buddy) ?? null} value={buddy} onChange={setBuddy} clearable placeholder="Pick a buddy" /></Field>
          <Field label="HR partner"><Select loadOptions={loadEmployees} selectedOption={known.find((o) => o.value === hr) ?? null} value={hr} onChange={setHr} clearable placeholder="Default HR" /></Field>
          <Field label="Joining date"><DateInput value={joining} onChange={setJoining} disabled={!!d.day_one_started_at} /></Field>
        </FormGrid>
        {dirty && <div className="mt-3 flex justify-end"><Button variant="primary" size="sm" loading={saving} onClick={save}>Save changes</Button></div>}
      </Section>
      {d.status !== "completed" && d.status !== "cancelled" && (
        <Section title="Joining link" description="A personal link where the joiner fills in their details and uploads documents.">
          <div className="flex flex-wrap items-center gap-2">
            {d.portal_link ? (
              <>
                <code className="max-w-full truncate rounded-lg bg-sunken px-3 py-1.5 text-[12.5px] text-muted">{d.portal_link}</code>
                <Button size="sm" icon={Copy} onClick={() => { navigator.clipboard?.writeText(d.portal_link!); toast.success("Link copied"); }}>Copy</Button>
                <a href={d.portal_link} target="_blank" rel="noreferrer"><Button size="sm" icon={ExternalLink}>Open</Button></a>
              </>
            ) : <span className="text-[13.5px] text-muted">The link is switched off.</span>}
            <Button size="sm" icon={Mail} loading={busy === "invite"} onClick={() => act("invite", "/invite", {}, "Link sent again")}>Send again</Button>
            {d.portal_enabled
              ? <Button size="sm" variant="ghost" loading={busy === "portal"} onClick={() => act("portal", "/portal", { enabled: false }, "Link switched off")}>Switch off</Button>
              : <Button size="sm" variant="ghost" loading={busy === "portal"} onClick={() => act("portal", "/portal", { enabled: true, extend_days: 14 }, "Link switched on")}>Switch on</Button>}
          </div>
          <p className="mt-2 text-[12.5px] text-faint">
            {d.portal_expires_at ? `Works until ${formatDateTime(d.portal_expires_at)}. ` : ""}
            {d.portal_opened_at ? `Opened ${formatDateTime(d.portal_opened_at)}. ` : "Not opened yet. "}
            {d.portal_submitted_at ? `Submitted ${formatDateTime(d.portal_submitted_at)}.` : ""}
          </p>
        </Section>
      )}
      {d.cancel_reason && <p className="text-[13.5px] text-rose-700">Cancelled: {d.cancel_reason}</p>}
    </div>
  );
}

function Card({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-light text-ink">{value}</p>
      {hint && <p className="mb-2 text-[12px] text-faint">{hint}</p>}
      {children}
    </div>
  );
}

function ReviewControls({ k, entry, onDecide }: { k: string; entry?: ReviewEntry; onDecide: (key: string, status: "accepted" | "sent_back", remark?: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [remark, setRemark] = useState("");
  if (asking) {
    return (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <input autoFocus value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What needs fixing?"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-primary sm:w-56" />
        <Button size="sm" disabled={!remark.trim()} onClick={() => { onDecide(k, "sent_back", remark.trim()); setAsking(false); setRemark(""); }}>Send</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {entry && <Badge tone={entry.status === "accepted" ? "good" : entry.status === "sent_back" ? "bad" : "warn"}>{entry.status === "accepted" ? "Accepted" : entry.status === "sent_back" ? "Sent back" : "Updated"}</Badge>}
      {entry?.status !== "accepted" && <Button size="sm" icon={Check} onClick={() => onDecide(k, "accepted")}>Accept</Button>}
      <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setAsking(true)}>Send back</Button>
    </div>
  );
}

function Review({ d, busy, act }: { d: Detail; busy: string | null; act: Act }) {
  const decide = (key: string, status: "accepted" | "sent_back", remark?: string) =>
    act(`r:${key}`, "/review", { items: [{ key, status, remark }] }, status === "accepted" ? "Accepted" : "Sent back to the joiner");
  const pending = d.review_keys.filter((k) => d.review[k]?.status !== "accepted").length;
  const accepted = d.review_keys.filter((k) => d.review[k]?.status === "accepted" && !d.applied[k]).length;
  if (!d.review_keys.length && !d.uploads.length) {
    return <p className="py-10 text-center text-[14px] text-muted">The joiner has not filled in anything yet.</p>;
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13.5px] text-muted">
          <Badge tone={REVIEW_TONE[d.review_status] ?? "neutral"}>{REVIEW_LABEL[d.review_status] ?? d.review_status}</Badge>
          {pending ? `${pending} item(s) to review` : "Everything reviewed"}
        </div>
        <div className="flex gap-2">
          {pending > 0 && <Button size="sm" icon={ShieldCheck} loading={busy === "acceptall"} onClick={() => act("acceptall", "/accept-all", {}, "Accepted and written to the record")}>Accept all</Button>}
          <Button size="sm" variant="primary" icon={Send} loading={busy === "apply"} disabled={!accepted}
            onClick={() => act("apply", "/apply", {}, "Written to the employee record")}>Write to employee record</Button>
        </div>
      </div>
      {d.sections.filter((s) => s.key !== "documents").map((s) => {
        const val = d.portal_data[s.key];
        if (val === undefined || val === null || (Array.isArray(val) && !val.length)) return null;
        if (Array.isArray(val)) {
          return (
            <Section key={s.key} title={s.label} action={<ReviewControls k={s.key} entry={d.review[s.key]} onDecide={decide} />}>
              <div className="divide-y divide-line rounded-xl border border-line">
                {val.map((row, i) => <p key={i} className="px-4 py-2.5 text-[13.5px] text-ink">{show(row)}</p>)}
              </div>
              <Remark entry={d.review[s.key]} applied={d.applied[s.key]} />
            </Section>
          );
        }
        return (
          <Section key={s.key} title={s.label}>
            <div className="divide-y divide-line rounded-xl border border-line">
              {Object.entries(val as Record<string, unknown>).map(([f, v]) => {
                const k = `${s.key}.${f}`;
                return (
                  <div key={f} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[12px] text-faint">{fieldLabel(f)}</p>
                      <p className="truncate text-[14px] text-ink">{show(v)}</p>
                      <Remark entry={d.review[k]} applied={d.applied[k]} />
                    </div>
                    <ReviewControls k={k} entry={d.review[k]} onDecide={decide} />
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })}
      {d.uploads.length > 0 && (
        <Section title="Documents">
          <div className="divide-y divide-line rounded-xl border border-line">
            {d.uploads.map((u) => {
              const k = `doc:${u.label}`;
              return (
                <div key={u.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink">{u.label}</p>
                    {u.file?.url ? <a className="text-[12.5px] text-primary hover:underline" href={fileHref(u.file.url)} target="_blank" rel="noreferrer">{u.name}</a> : <p className="text-[12.5px] text-faint">{u.name}</p>}
                    <Remark entry={d.review[k]} applied={d.applied[k]} />
                  </div>
                  <ReviewControls k={k} entry={d.review[k]} onDecide={decide} />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Remark({ entry, applied }: { entry?: ReviewEntry; applied?: boolean }) {
  if (applied) return <p className="text-[12px] text-emerald-700">On the employee record</p>;
  if (entry?.status === "sent_back" && entry.remark) return <p className="text-[12px] text-rose-700">Sent back: {entry.remark}</p>;
  if (entry?.status === "updated") return <p className="text-[12px] text-amber-700">Updated by the joiner{entry.remark ? ` (was: ${entry.remark})` : ""}</p>;
  return null;
}

function Checklist({ d }: { d: Detail }) {
  const t = d.tasks;
  if (!t.items.length) return <p className="py-10 text-center text-[14px] text-muted">No checklist tasks for this flow.</p>;
  return (
    <div>
      <p className="mb-3 text-[13.5px] text-muted">{t.done} of {t.total} done. Tasks are worked on in <a className="text-primary hover:underline" href="/dashboard/tasks">Tasks</a>.</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {t.items.map((x) => (
          <div key={x.uuid} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className={`text-[14px] ${x.status === "done" ? "text-muted line-through" : "text-ink"}`}>{x.title}</p>
              <p className="text-[12px] text-faint">{x.assignee_name ?? "Unassigned"} · {x.labels.filter((l) => l !== "onboarding").join(", ")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {x.due_date && <span className={`text-[12.5px] ${x.overdue ? "text-rose-600" : "text-muted"}`}>{formatDisplayDate(x.due_date)}</span>}
              <Badge tone={x.status === "done" ? "good" : x.status === "cancelled" ? "neutral" : x.overdue ? "bad" : "info"}>{x.status.replace("_", " ")}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Documents({ d, meta, busy, act }: { d: Detail; meta: Meta | null; busy: string | null; act: Act }) {
  const forms = meta?.forms ?? {};
  return (
    <div className="space-y-6">
      <Section title="Appointment letter" description="Every employee must get one (OSH Code). Onboarding can't be completed without it.">
        {d.appointment ? (
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div className="flex items-center gap-3"><FileText size={18} strokeWidth={S} className="text-faint" />
              <div><p className="text-[14px] text-ink">Appointment letter {d.appointment.reference_no ?? ""}</p><p className="text-[12px] text-muted">{d.appointment.status.replace(/_/g, " ")}</p></div>
            </div>
            {d.appointment.file?.url && <a href={fileHref(d.appointment.file.url)} target="_blank" rel="noreferrer"><Button size="sm" icon={ExternalLink}>View</Button></a>}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-3">
            <p className="text-[13.5px] text-amber-800">Not issued yet.</p>
            <Button variant="primary" size="sm" loading={busy === "letter"} onClick={() => act("letter", "/appointment-letter", {}, "Appointment letter issued")}>Issue letter</Button>
          </div>
        )}
      </Section>
      <Section title="Statutory joining forms" description="Filled from the employee record and nominees. Write the joiner's details to the record first."
        action={<Button size="sm" icon={RotateCcw} loading={busy === "forms"} onClick={() => act("forms", "/forms", {}, "Forms generated")}>{d.forms.length ? "Generate again" : "Generate forms"}</Button>}>
        {d.forms.length ? (
          <div className="divide-y divide-line rounded-xl border border-line">
            {d.forms.map((f) => (
              <div key={f.kind} className="flex items-center justify-between px-4 py-2.5">
                <div><p className="text-[14px] text-ink">{f.label}</p><p className="text-[12px] text-faint">{formatDateTime(f.at)}</p></div>
                {f.file?.url && <a href={fileHref(f.file.url)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={ExternalLink}>Open</Button></a>}
              </div>
            ))}
          </div>
        ) : <p className="text-[13.5px] text-muted">{Object.values(forms).join(", ") || "PF Form 2, Form 11, ESI declaration and gratuity Form F"}.</p>}
      </Section>
    </div>
  );
}

type AssetRow = { uuid: string; asset_tag: string; name: string; category_name: string | null };

function Assets({ d, meta, busy, act }: { d: Detail; meta: Meta | null; busy: string | null; act: Act }) {
  const [asset, setAsset] = useState<string | null>(null);
  const loadAssets = async (q: string): Promise<SelectOption<string>[]> => {
    const r = await api.get<{ items: AssetRow[] }>(`/assets?status=available&size=50${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    return r.items.map((a) => ({ value: a.uuid, label: `${a.name} (${a.asset_tag})`, description: a.category_name ?? undefined }));
  };
  const kinds = meta?.account_kinds ?? {};
  const requested = new Set(d.account_requests.map((r) => r.kind));
  return (
    <div className="space-y-6">
      <Section title="Requests to IT and admin" description="Each request becomes a task for the right team.">
        <div className="flex flex-wrap gap-2">
          {Object.entries(kinds).map(([k, label]) => (
            <Button key={k} size="sm" icon={requested.has(k) ? Check : Laptop} disabled={requested.has(k)} loading={busy === `acc:${k}`}
              onClick={() => act(`acc:${k}`, "/accounts", { kind: k }, "Request created")}>{label}</Button>
          ))}
        </div>
      </Section>
      <Section title="Assign an asset">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1"><Select loadOptions={loadAssets} value={asset} onChange={setAsset} placeholder="Pick an available asset" /></div>
          <Button variant="primary" disabled={!asset} loading={busy === "asset"} onClick={async () => { if (await act("asset", "/assets", { asset_uuid: asset }, "Asset assigned")) setAsset(null); }}>Assign</Button>
        </div>
      </Section>
      {d.account_requests.length > 0 && (
        <Section title="Done so far">
          <div className="divide-y divide-line rounded-xl border border-line">
            {d.account_requests.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[14px] text-ink">{r.label}</p>
                <span className="text-[12.5px] text-muted">{r.status} · {formatDateTime(r.at)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Induction({ d, onCheckin }: { d: Detail; onCheckin: (c: Checkin) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Induction sessions">
        {d.induction.length ? (
          <div className="divide-y divide-line rounded-xl border border-line">
            {d.induction.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div><p className="text-[14px] text-ink">{s.title}</p><p className="text-[12px] text-faint">{s.where || "—"}{s.host_name ? ` · ${s.host_name}` : ""}</p></div>
                <span className="text-[12.5px] text-muted">Day {s.day} · {formatDisplayDate(s.date)} {s.time} · {s.duration_minutes} min</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[13.5px] text-muted">No sessions in this flow.</p>}
      </Section>
      <Section title="30/60/90-day check-ins" description="Planned on day one with the reporting manager.">
        {d.checkins.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {d.checkins.map((c) => (
              <button key={c.uuid} type="button" onClick={() => onCheckin(c)} className="rounded-xl border border-line p-4 text-left transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between"><p className="text-[15px] text-ink">{c.day}-day</p>
                  <Badge tone={c.status === "done" ? "good" : c.status === "skipped" ? "neutral" : "info"}>{c.status}</Badge></div>
                <p className="mt-1 text-[12.5px] text-muted">Due {formatDisplayDate(c.due_on)}{c.manager_name ? ` · ${c.manager_name}` : ""}</p>
                {c.rating && <p className="mt-2 text-[13px] text-ink">Settling in: {c.rating}/5</p>}
                {c.concerns && <p className="mt-1 line-clamp-2 text-[12.5px] text-rose-700">{c.concerns}</p>}
              </button>
            ))}
          </div>
        ) : <p className="text-[13.5px] text-muted">Check-ins are planned when the person joins.</p>}
      </Section>
    </div>
  );
}

function TimelineTab({ d }: { d: Detail }) {
  return (
    <div className="space-y-6">
      {d.stage_times.length > 0 && (
        <Section title="Time per stage">
          <div className="grid gap-3 sm:grid-cols-2">
            {d.stage_times.map((s) => (
              <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.longest ? "border-amber-300 bg-amber-50/40" : "border-line"}`}>
                <p className="text-[12.5px] text-muted">{s.label}{s.longest ? " · longest" : ""}</p>
                <p className="text-[20px] font-light text-ink">{s.days} days</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="What happened">
        <Timeline items={d.history.map((h, i) => ({
          id: i, title: h.text, time: formatDateTime(h.at), description: h.by,
          icon: h.kind === "review" ? ShieldCheck : h.kind === "portal" ? Link2 : h.kind === "documents" ? FileText : h.kind === "checkin" ? ClipboardList : History,
          tone: h.kind === "complete" ? "good" : h.kind === "cancel" ? "bad" : "neutral",
        }))} />
      </Section>
    </div>
  );
}

function CancelModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Did not join" zIndex={70}
      description="The onboarding is cancelled and the pre-joining record archived. Nothing is deleted."
      footer={<><ModalCancel /><Button variant="danger" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>Cancel onboarding</Button></>}>
      <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} placeholder="For example: accepted another offer" /></Field>
    </Modal>
  );
}

export function CheckinModal({ checkin, onClose, onSaved }: { checkin: Checkin | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [well, setWell] = useState("");
  const [concerns, setConcerns] = useState("");
  const [support, setSupport] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!checkin) return;
    setRating(checkin.rating); setWell(checkin.went_well ?? ""); setConcerns(checkin.concerns ?? ""); setSupport(checkin.support_needed ?? "");
  }, [checkin]);
  async function save(status: "done" | "skipped") {
    if (!checkin) return;
    setSaving(true);
    try {
      await api.post(`/onboarding/checkins/${checkin.uuid}`, { status, rating, went_well: well, concerns, support_needed: support });
      toast.success(status === "done" ? "Check-in recorded" : "Check-in skipped");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!checkin} onClose={onClose} size="md" zIndex={70} busy={saving}
      title={checkin ? `${checkin.day}-day check-in` : "Check-in"} description={checkin ? `Due ${formatDisplayDate(checkin.due_on)}` : undefined}
      footerStart={<Button variant="ghost" onClick={() => save("skipped")}>Skip</Button>}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={() => save("done")}>Save check-in</Button></>}>
      <div className="space-y-5">
        <Field label="How well are they settling in?">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}
                className={`h-9 w-9 rounded-lg border text-[14px] transition-colors ${rating === n ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>{n}</button>
            ))}
          </div>
        </Field>
        <Field label="What went well"><Textarea value={well} onValueChange={setWell} /></Field>
        <Field label="Concerns" hint="HR is told when you note a concern."><Textarea value={concerns} onValueChange={setConcerns} /></Field>
        <Field label="Support needed"><Textarea value={support} onValueChange={setSupport} /></Field>
      </div>
    </Modal>
  );
}
