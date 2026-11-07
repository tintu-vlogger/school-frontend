"use client";

/*
 * One review cycle for administrators, in a near full-screen modal:
 *   <CycleDashboardModal cycleId={uuid | null} onClose onEdit={(c) => ...} onChanged />
 * Progress per stage, everyone taking part with the state of each form, and the actions
 * that move the cycle along: launch, reminders, escalation, calibration, publish, close.
 * A row opens that reviewer's form (read-only for admins) or the calibration board.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing, CheckCheck, Flag, Lock, Pencil, Rocket, Scale, Send, Siren, UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import {
  Badge, Button, DataTable, Field, FilterBar, Menu, Modal, ModalCancel, MultiSelect, Skeleton, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { PersonInline, ProgressBar, RatingPill, searchEmployees } from "../shared";
import type { Board, Cycle, ParticipantRow } from "../types";
import { CycleStatus, FormStatus, KIND_LABEL, TYPE_LABEL } from "./misc";
import { ReviewFormModal } from "./review-form";

const ORDER = ["self", "peer", "manager", "skip"];

export function StageProgress({ cycle }: { cycle: Cycle }) {
  const by = cycle.stats?.by_type ?? {};
  const stages = cycle.stages.filter((s) => s.enabled && s.key !== "calibration");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((s) => {
        const b = by[s.key] ?? { total: 0, submitted: 0, overdue: 0 };
        const pct = b.total ? (b.submitted / b.total) * 100 : 0;
        return (
          <div key={s.key} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink/85">{s.label}</span>
              {s.deadline && <span className="text-faint">{formatDate(s.deadline)}</span>}
            </div>
            <p className="mt-2 text-[22px] font-extralight text-ink tabular">{b.submitted}<span className="text-[14px] text-faint"> / {b.total}</span></p>
            <ProgressBar value={pct} className="mt-2" tone={b.overdue ? "amber" : "indigo"} />
            <p className="mt-2 text-[12px] text-muted">{b.overdue ? <span className="text-rose-600">{b.overdue} overdue</span> : `${Math.round(pct)}% submitted`}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CycleDashboardModal({ cycleId, onClose, onEdit, onChanged }: {
  cycleId: string | null; onClose: () => void; onEdit: (c: Cycle) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [formId, setFormId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    if (!cycleId) return;
    api.get<Cycle>(`/performance/cycles/${cycleId}`).then(setCycle).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the cycle"));
    api.get<Board>(`/performance/cycles/${cycleId}/calibration`).then(setBoard).catch(() => setBoard(null));
  }, [cycleId, toast]);
  useEffect(() => { setCycle(null); setBoard(null); load(); }, [load]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string | ((r: unknown) => string)) {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(typeof ok === "function" ? ok(r) : ok);
      load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  }

  const c = cycle;
  const launch = async () => {
    if (!c || !(await confirm({ title: `Launch ${c.name}?`, message: "Everyone who matches the rule gets their review forms and a notification.", confirmLabel: "Launch" }))) return;
    act("launch", () => api.post<{ participants: number }>(`/performance/cycles/${c.uuid}/launch`), (r) => `Launched for ${(r as { participants: number }).participants} people`);
  };
  const remind = () => c && act("remind", () => api.post(`/performance/cycles/${c.uuid}/remind`, {}), (r) => {
    const x = r as { sent: number; people: number; skipped: number };
    return x.sent ? `Reminded ${x.people} ${x.people === 1 ? "person" : "people"}${x.skipped ? ` · ${x.skipped} reminded recently` : ""}` : "Everyone was reminded recently";
  });
  const escalate = () => c && act("escalate", () => api.post(`/performance/cycles/${c.uuid}/escalate`), (r) => {
    const n = (r as { escalated: number }).escalated;
    return n ? `${n} late ${n === 1 ? "review" : "reviews"} sent to the reviewer's manager` : "Nothing is late enough to escalate";
  });
  const toStatus = async (status: string, title: string, message: string) => {
    if (!c || !(await confirm({ title, message, confirmLabel: "Continue" }))) return;
    act(status, () => api.post(`/performance/cycles/${c.uuid}/status`, { status }), "Cycle updated");
  };
  const publish = async () => {
    if (!c || !(await confirm({ title: "Publish results?", message: "Everyone with a final rating sees it, with their letter. This can't be undone.", confirmLabel: "Publish" }))) return;
    act("publish", () => api.post(`/performance/cycles/${c.uuid}/publish`, {}), (r) => {
      const x = r as { published: number; skipped: number };
      return `Published ${x.published}${x.skipped ? ` · ${x.skipped} still without a rating` : ""}`;
    });
  };

  const rows = useMemo(() => {
    let list = board?.participants ?? [];
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.employee?.name.toLowerCase().includes(q) || p.manager?.name.toLowerCase().includes(q)); }
    const st = filters.state?.[0];
    if (st === "overdue") list = list.filter((p) => p.forms.some((f) => f.overdue));
    if (st === "waiting") list = list.filter((p) => p.forms.some((f) => f.status !== "submitted"));
    if (st === "done") list = list.filter((p) => p.forms.every((f) => f.status === "submitted"));
    return list;
  }, [board, search, filters]);

  const scale = c?.rating_scale?.points ?? [];
  const columns: Column<ParticipantRow>[] = [
    { key: "name", header: "Employee", cell: (p) => <PersonInline person={p.employee} sub={p.employee?.designation} />, sortable: true, sortValue: (p) => p.employee?.name },
    { key: "manager", header: "Manager", hideBelow: "lg", cell: (p) => <span className="text-muted">{p.manager?.name ?? "Company owner"}</span> },
    {
      key: "forms", header: "Reviews", cell: (p) => (
        <div className="flex flex-wrap gap-1.5">
          {[...p.forms].sort((a, b) => ORDER.indexOf(a.reviewer_type) - ORDER.indexOf(b.reviewer_type)).map((f) => (
            <button key={f.uuid} type="button" onClick={(e) => { e.stopPropagation(); setFormId(f.uuid); }}
              title={`${TYPE_LABEL[f.reviewer_type]} · ${f.reviewer}${f.reminders ? ` · reminded ${f.reminders}×` : ""}`}
              className={`rounded-full border px-2 py-0.5 text-[11.5px] ${f.status === "submitted" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : f.overdue ? "border-rose-200 bg-rose-50 text-rose-700" : f.status === "draft" ? "border-sky-200 bg-sky-50 text-sky-700"
                : f.status === "nominated" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-line-strong text-muted"}`}>
              {TYPE_LABEL[f.reviewer_type]}{f.escalated ? " ⚑" : ""}
            </button>
          ))}
        </div>
      ),
    },
    { key: "score", header: "Score", align: "right", hideBelow: "md", sortable: true, sortValue: (p) => p.computed_score ?? -1, cell: (p) => p.computed_score != null ? <span className="tabular">{p.computed_score.toFixed(2)}</span> : <span className="text-faint">—</span> },
    { key: "rating", header: "Rating", cell: (p) => <RatingPill value={p.final_rating ?? p.current_rating} label={p.final_label ?? p.current_label} scale={scale} /> },
  ];

  return (
    <>
      <Modal open={!!cycleId} onClose={onClose} size="full" title={c?.name ?? "Review cycle"}
        description={c ? <span className="flex flex-wrap items-center gap-2"><CycleStatus status={c.status} />{KIND_LABEL[c.kind]} · {formatDate(c.period_start)} to {formatDate(c.period_end)}{c.template && ` · ${c.template.name}`}</span> : undefined}
        headerActions={c && (
          <Menu items={[
            { label: "Edit settings", icon: Pencil, onSelect: () => onEdit(c), disabled: !["draft", "active"].includes(c.status) },
            { label: "Add people", icon: UserPlus, onSelect: () => setAddOpen(true), disabled: !["active", "calibration"].includes(c.status) },
            { label: "Escalate overdue reviews", icon: Siren, onSelect: escalate, disabled: c.status !== "active" },
            "separator",
            { label: "Close the cycle", icon: Lock, onSelect: () => toStatus("closed", "Close this cycle?", "Nothing can change after it is closed."), disabled: c.status !== "published" },
          ]} />
        )}
        footer={c && <>
          <ModalCancel>Close</ModalCancel>
          {c.status === "draft" && <Button variant="primary" icon={Rocket} loading={busy === "launch"} onClick={launch}>Launch cycle</Button>}
          {c.status === "active" && <>
            <Button variant="secondary" icon={BellRing} loading={busy === "remind"} onClick={remind}>Send reminders</Button>
            <Button variant="primary" icon={Scale} loading={busy === "calibration"} onClick={() => toStatus("calibration", "Start calibration?", "Reviews stay open, and ratings can now be adjusted on the calibration board.")}>Start calibration</Button>
          </>}
          {c.status === "calibration" && <>
            <Link href={`/dashboard/performance/calibration?cycle=${c.uuid}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] text-ink hover:border-line-strong"><Scale size={16} strokeWidth={1.4} /> Calibration board</Link>
            <Button variant="primary" icon={Send} loading={busy === "publish"} onClick={publish}>Publish results</Button>
          </>}
          {c.status === "published" && <Button variant="secondary" icon={Send} loading={busy === "publish"} onClick={publish}>Publish the rest</Button>}
        </>}>
        {!c ? <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Taking part", value: c.stats?.participants ?? 0, icon: CheckCheck },
                { label: "Forms submitted", value: `${c.stats?.forms_submitted ?? 0} / ${c.stats?.forms_total ?? 0}`, icon: Flag },
                { label: "Overdue", value: c.stats?.overdue ?? 0, icon: Siren },
                { label: "Published", value: c.stats?.published ?? 0, icon: Send },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between text-[12.5px] text-muted"><span>{s.label}</span><s.icon size={15} strokeWidth={1.4} className="text-faint" /></div>
                  <p className="mt-2 text-[24px] font-extralight text-ink tabular">{s.value}</p>
                </div>
              ))}
            </div>
            {c.status === "draft" ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
                <Rocket size={24} strokeWidth={1.2} className="mx-auto text-faint" />
                <p className="mt-3 text-[14.5px] text-ink">Not launched yet</p>
                <p className="mt-1 text-[13.5px] text-muted">Check the settings, then launch to create everyone's review forms.</p>
              </div>
            ) : (
              <>
                <StageProgress cycle={c} />
                <div>
                  <FilterBar searchPlaceholder="Search people or managers" onSearchChange={setSearch}
                    filters={[{ key: "state", label: "Status", options: [{ value: "waiting", label: "Waiting on someone" }, { value: "overdue", label: "Overdue" }, { value: "done", label: "All submitted" }] }]}
                    values={filters} onChange={setFilters}
                    actions={<span className="text-[13px] text-faint tabular">{rows.length} people</span>} />
                  <DataTable rows={rows} rowKey={(p) => p.uuid} columns={columns} loading={!board}
                    onRowClick={(p) => { const f = p.forms.find((x) => x.reviewer_type === "manager") ?? p.forms[0]; if (f) setFormId(f.uuid); }}
                    rowActions={(p) => p.forms.map((f) => ({ label: `Open ${TYPE_LABEL[f.reviewer_type].toLowerCase()} review`, onSelect: () => setFormId(f.uuid) }))}
                    emptyTitle="Nobody here" emptyHint="Try another search." />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
                  <FormStatus status="submitted" /><FormStatus status="draft" /><FormStatus status="pending" /><FormStatus status="pending" overdue /><FormStatus status="nominated" />
                  <Badge tone="neutral">⚑ escalated</Badge>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
      <ReviewFormModal formId={formId} onClose={() => setFormId(null)} onChanged={load} />
      {c && <AddPeopleModal open={addOpen} cycle={c} onClose={() => setAddOpen(false)} onDone={() => { load(); onChanged(); }} />}
    </>
  );
}

function AddPeopleModal({ open, cycle, onClose, onDone }: { open: boolean; cycle: Cycle; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [ids, setIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.post<{ added: number }>(`/performance/cycles/${cycle.uuid}/participants`, { employee_ids: ids });
      toast.success(r.added ? `${r.added} added` : "They are already in this cycle");
      setIds([]); onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title="Add people" description="They get review forms right away."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!ids.length} onClick={save}>Add</Button></>}>
      <Field label="People"><MultiSelect<number> value={ids} onChange={(v) => setIds(v)} loadOptions={searchEmployees} placeholder="Search by name" /></Field>
    </Modal>
  );
}
