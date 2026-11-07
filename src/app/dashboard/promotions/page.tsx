"use client";

/*
 * Promotions & pay.
 *   Pay review admins (talent.increments.manage): create a pay review, set the guideline
 *   matrix, pay ranges and budgets, open it (a proposal per person, pre-filled from the
 *   guidelines), then release letters once proposals are approved.
 *   Managers: their team's proposals in a grid; change the %, propose a promotion with a
 *   new designation and a reason, and send a batch for approval (workflow
 *   `performance.increment`).
 *   Everyone: their own released revision letters.
 */
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, FileText, Pencil, PiggyBank, Plus, Rocket, Send, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, NumberInput, Select, Skeleton, StatCard, StatGrid, Textarea, Toggle,
  useConfirm, type BadgeTone, type Column, type FilterValues,
} from "@/components/ui-kit";
import { PersonInline, ProgressBar, RatingPill, money, pct, useData, useDesignations, useList, usePerfMe } from "@/components/performance/shared";
import type { IncrementCycle, IncrementGrid, Proposal } from "@/components/performance/types";
import { LetterModal, useCycles } from "@/components/performance/reviews/misc";
import { BudgetsModal, IncrementCycleModal } from "@/components/performance/increments/cycle-form";

const CYCLE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, open: { label: "Open for proposals", tone: "info" },
  released: { label: "Letters released", tone: "good" }, closed: { label: "Closed", tone: "neutral" },
};
const PROPOSAL_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, submitted: { label: "Waiting for approval", tone: "warn" },
  approved: { label: "Approved", tone: "good" }, rejected: { label: "Sent back", tone: "bad" }, released: { label: "Released", tone: "accent" },
};

type MyLetter = { uuid: string; cycle: string; effective_date: string; letter_no: string | null; new_ctc: number; pct: number; promote: boolean; released_at: string | null };

export default function PromotionsPage() {
  return <Suspense fallback={null}><Promotions /></Suspense>;
}

function Promotions() {
  const router = useRouter();
  const params = useSearchParams();
  const { me } = usePerfMe();
  const admin = !!me?.can_increments;
  const { rows: cycles, loading: cyclesLoading, refresh: reloadCycles } = useList<IncrementCycle>("/performance/increment-cycles", "Couldn't load pay reviews");
  const { rows: mine } = useList<MyLetter>(me?.employee_id ? "/performance/increments/mine" : null);
  const { cycles: reviewCycles } = useCycles(admin);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncrementCycle | null>(null);
  const [session, setSession] = useState(0);
  const [letter, setLetter] = useState<string | null>(null);

  const cycleId = params.get("cycle") ?? (cycles.find((c) => c.status === "open") ?? cycles[0])?.uuid ?? null;
  const pick = (u: string) => router.replace(`/dashboard/promotions?cycle=${u}`);
  const openForm = (c: IncrementCycle | null) => { setEditing(c); setSession((s) => s + 1); setFormOpen(true); };

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Promotions & pay" description="Pay reviews driven by ratings, with budgets, approvals and revision letters."
        actions={admin ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New pay review</Button> : undefined} />

      {mine.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-[16px] font-light text-ink">Your revision letters</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((l) => (
              <button key={l.uuid} type="button" onClick={() => setLetter(l.uuid)}
                className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left hover:border-primary/30">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary"><FileText size={18} strokeWidth={1.4} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] text-ink">{l.cycle}</p>
                  <p className="text-[12.5px] text-muted">From {formatDate(l.effective_date)} · {money(l.new_ctc)} a year{l.promote ? " · promotion" : ""}</p>
                </div>
                <Badge tone="good">+{l.pct}%</Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {cyclesLoading ? <Skeleton className="h-64" /> : !cycles.length ? (
        (admin || me?.is_manager) && (
          <div className="rounded-2xl border border-line bg-surface">
            <EmptyState icon={TrendingUp} title={admin ? "No pay reviews yet" : "No pay review is open"}
              hint={admin ? "Create one to propose increments and promotions from this year's ratings." : "When HR opens a pay review, your team's proposals appear here."}
              action={admin ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New pay review</Button> : undefined} />
          </div>
        )
      ) : cycleId && (
        <CycleView key={cycleId} cycleId={cycleId} cycles={cycles} onPick={pick} admin={admin}
          onEdit={openForm} onChanged={reloadCycles} onLetter={setLetter} />
      )}

      {admin && <IncrementCycleModal key={session} open={formOpen} cycle={editing} reviewCycles={reviewCycles ?? []}
        onClose={() => setFormOpen(false)} onSaved={(c) => { reloadCycles(); pick(c.uuid); }} />}
      <LetterModal path={letter ? `/performance/increment-proposals/${letter}/letter` : null} title="Revision letter" onClose={() => setLetter(null)} />
    </div>
  );
}

/* ── One pay review ──────────────────────────────────────────────────── */

function CycleView({ cycleId, cycles, onPick, admin, onEdit, onChanged, onLetter }: {
  cycleId: string; cycles: IncrementCycle[]; onPick: (u: string) => void; admin: boolean;
  onEdit: (c: IncrementCycle) => void; onChanged: () => void; onLetter: (uuid: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: grid, loading, refresh } = useData<IncrementGrid>(`/performance/increment-cycles/${cycleId}`, "Couldn't load the pay review");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const c = grid?.cycle;
  const open = c?.status === "open";
  const rows = useMemo(() => {
    let list = grid?.proposals ?? [];
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.employee?.name.toLowerCase().includes(q)); }
    const st = filters.status ?? [];
    if (st.length) list = list.filter((p) => st.includes(p.status));
    const dep = filters.department?.[0];
    if (dep) list = list.filter((p) => String(p.department_id) === dep);
    if (filters.flag?.includes("promote")) list = list.filter((p) => p.promote);
    if (filters.flag?.includes("deviation")) list = list.filter((p) => p.deviation !== null && Math.abs(p.deviation) >= 0.5);
    return list;
  }, [grid, search, filters]);

  const departments = useMemo(() => (grid?.budgets ?? []).map((b) => ({ value: String(b.department_id), label: b.department })), [grid]);

  async function act(key: string, fn: () => Promise<unknown>, ok: (r: unknown) => string) {
    setBusy(key);
    try { const r = await fn(); toast.success(ok(r)); refresh(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  }
  const openCycle = async () => {
    if (!c || !(await confirm({ title: `Open ${c.name}?`, message: "A proposal is made for everyone, pre-filled from the guidelines, and managers are told.", confirmLabel: "Open" }))) return;
    act("open", () => api.post<{ proposals: number }>(`/performance/increment-cycles/${c.uuid}/open`), (r) => `${(r as { proposals: number }).proposals} proposals created`);
  };
  const release = async () => {
    if (!c || !(await confirm({ title: "Release letters?", message: `Everyone with an approved proposal gets a revision letter, and changes take effect on ${formatDate(c.effective_date)}. This can't be undone.`, confirmLabel: "Release" }))) return;
    act("release", () => api.post<{ released: number }>(`/performance/increment-cycles/${c.uuid}/release`), (r) => `${(r as { released: number }).released} letters released`);
  };
  const submit = (list: Proposal[], clear?: () => void) => {
    const ids = list.filter((p) => p.status === "draft" || p.status === "rejected").map((p) => p.uuid);
    if (!ids.length) { toast.error("Pick proposals that are still drafts"); return; }
    act("submit", () => api.post<{ request: string; status: string; count: number }>(`/performance/increment-cycles/${cycleId}/submit`, { uuids: ids }), (r) => {
      const x = r as { request: string; status: string; count: number };
      return x.status === "approved" ? `${x.count} approved` : `${x.count} sent for approval · ${x.request}`;
    });
    clear?.(); setSelected([]);
  };

  const t = grid?.totals;
  const avg = t && t.current ? (t.increase / t.current) * 100 : 0;
  const editable = (p: Proposal) => open && (p.status === "draft" || p.status === "rejected" || (admin && p.status === "submitted"));

  const columns: Column<Proposal>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (p) => p.employee?.name, cell: (p) => <PersonInline person={p.employee} sub={[p.current_designation, p.employee?.department].filter(Boolean).join(" · ")} /> },
    { key: "rating", header: "Rating", sortable: true, sortValue: (p) => p.rating ?? -1, cell: (p) => <RatingPill value={p.rating} label={p.rating_label} /> },
    { key: "ctc", header: "Current CTC", align: "right", hideBelow: "md", sortable: true, sortValue: (p) => p.current_ctc, cell: (p) => <span className="tabular">{money(p.current_ctc)}</span> },
    { key: "compa", header: "Compa", align: "right", hideBelow: "lg", cell: (p) => p.compa_ratio !== null ? <span className="tabular text-muted">{p.compa_ratio.toFixed(2)}</span> : <span className="text-faint">—</span> },
    { key: "guide", header: "Guideline", align: "right", hideBelow: "lg", cell: (p) => <span className="tabular text-muted">{pct(p.guideline_pct, 1)}</span> },
    {
      key: "pct", header: "Proposed", align: "right", sortable: true, sortValue: (p) => p.proposed_pct, cell: (p) => (
        <span className="tabular">
          {pct(p.proposed_pct, 1)}
          {p.deviation !== null && Math.abs(p.deviation) >= 0.5 && (
            <span className={`ml-1.5 text-[12px] ${p.deviation > 0 ? "text-amber-700" : "text-sky-700"}`}>{p.deviation > 0 ? "+" : ""}{p.deviation.toFixed(1)}</span>
          )}
        </span>
      ),
    },
    { key: "new", header: "New CTC", align: "right", hideBelow: "md", sortable: true, sortValue: (p) => p.new_ctc, cell: (p) => <span className="tabular">{money(p.new_ctc)}</span> },
    { key: "promo", header: "Promotion", hideBelow: "lg", cell: (p) => p.promote ? <span className="inline-flex items-center gap-1 text-[13px] text-primary"><ArrowUpRight size={14} strokeWidth={1.4} />{p.new_designation ?? "Pick a designation"}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (p) => <Badge tone={PROPOSAL_STATUS[p.status]?.tone ?? "neutral"} dot>{PROPOSAL_STATUS[p.status]?.label ?? p.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select<string> className="w-[300px]" value={cycleId} onChange={(v) => v && onPick(v)}
          options={cycles.map((x) => ({ value: x.uuid, label: x.name, description: CYCLE_STATUS[x.status]?.label }))} />
        {c && <Badge tone={CYCLE_STATUS[c.status]?.tone ?? "neutral"} dot>{CYCLE_STATUS[c.status]?.label ?? c.status}</Badge>}
        {c && <span className="text-[13px] text-muted">Effective {formatDate(c.effective_date)}{c.review_cycle ? ` · ratings from ${c.review_cycle.name}` : ""}</span>}
        {admin && c && (
          <div className="ml-auto flex flex-wrap gap-2">
            {["draft", "open"].includes(c.status) && <Button icon={Pencil} onClick={() => onEdit(c)}>Settings</Button>}
            {c.status === "open" && <Button icon={PiggyBank} onClick={() => setBudgetsOpen(true)}>Budgets</Button>}
            {c.status === "draft" && <Button variant="primary" icon={Rocket} loading={busy === "open"} onClick={openCycle}>Open for proposals</Button>}
            {c.status === "open" && <Button variant="primary" icon={Send} loading={busy === "release"} disabled={!grid?.proposals.some((p) => p.status === "approved")} onClick={release}>Release letters</Button>}
          </div>
        )}
      </div>

      {!grid ? <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-72" /></div> : c?.status === "draft" ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={Wallet} title="Not open yet" hint={admin ? "Check the guidelines and pay ranges in Settings, then open it for proposals." : "HR is still setting this pay review up."} />
        </div>
      ) : (
        <>
          <StatGrid>
            <StatCard label="People" value={grid.proposals.length} hint={`${grid.proposals.filter((p) => p.status === "approved" || p.status === "released").length} approved`} />
            <StatCard label="Current pay" value={money(t?.current, { compact: true })} />
            <StatCard label="Proposed increase" value={money(t?.increase, { compact: true })} hint={`${avg.toFixed(1)}% on average`} />
            <StatCard label="Promotions" value={t?.promotions ?? 0} />
          </StatGrid>

          {grid.budgets.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="mb-4 text-[16px] font-light text-ink">Budget by department</h2>
              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                {grid.budgets.map((b) => {
                  const over = b.budget > 0 && b.proposed > b.budget;
                  return (
                    <div key={String(b.department_id)}>
                      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="truncate text-ink">{b.department}</span>
                        <span className={`tabular ${over ? "text-rose-700" : "text-muted"}`}>
                          {money(b.proposed, { compact: true })} of {b.budget ? money(b.budget, { compact: true }) : "no budget"}
                          {b.budget_pct !== null && <span className="text-faint"> · {b.budget_pct}%</span>}
                        </span>
                      </div>
                      <ProgressBar value={b.used_pct ?? 0} tone={over ? "rose" : (b.used_pct ?? 0) > 90 ? "amber" : "indigo"} className="mt-1.5" />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="space-y-3">
            <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search people" values={filters} onChange={setFilters}
              filters={[
                { key: "status", label: "Status", multiple: true, options: Object.entries(PROPOSAL_STATUS).map(([value, s]) => ({ value, label: s.label })) },
                ...(departments.length > 1 ? [{ key: "department", label: "Department", options: departments }] : []),
                { key: "flag", label: "Show", multiple: true, options: [{ value: "promote", label: "Promotions" }, { value: "deviation", label: "Off guideline" }] },
              ]}
              actions={open && grid.proposals.some((p) => p.status === "draft" || p.status === "rejected")
                ? <Button variant="primary" icon={Send} loading={busy === "submit"} onClick={() => submit(rows)}>Send all drafts for approval</Button> : undefined} />
            <DataTable rows={rows} loading={loading && !rows.length} rowKey={(p) => p.uuid} columns={columns}
              selectable={open} selected={selected} onSelectedChange={setSelected}
              bulkActions={open ? [{ label: "Send for approval", icon: Send, onSelect: (list, clear) => submit(list, clear) }] : undefined}
              onRowClick={(p) => (editable(p) ? setEditing(p) : p.has_letter ? onLetter(p.uuid) : undefined)}
              rowActions={(p) => [
                ...(editable(p) ? [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(p) }] : []),
                ...(p.has_letter ? [{ label: "Revision letter", icon: FileText, onSelect: () => onLetter(p.uuid) }] : []),
              ]}
              emptyTitle="No proposals here" emptyHint="Try another filter." />
          </div>
        </>
      )}

      <ProposalModal proposal={editing} admin={admin} onClose={() => setEditing(null)} onSaved={() => { refresh(); onChanged(); }} />
      {c && budgetsOpen && <BudgetsModal open cycle={c} rows={grid?.budgets ?? []} onClose={() => setBudgetsOpen(false)} onSaved={() => { refresh(); onChanged(); }} />}
    </div>
  );
}

/* ── One proposal ────────────────────────────────────────────────────── */

function ProposalModal({ proposal, admin, onClose, onSaved }: { proposal: Proposal | null; admin: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const designations = useDesignations();
  const [last, setLast] = useState<string | null>(null);
  const [ctc, setCtc] = useState<number | null>(null);
  const [pctValue, setPct] = useState<number | null>(null);
  const [promote, setPromote] = useState(false);
  const [designation, setDesignation] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  if (proposal && last !== proposal.uuid) {
    setLast(proposal.uuid); setCtc(proposal.current_ctc); setPct(proposal.proposed_pct); setPromote(proposal.promote);
    setDesignation(proposal.new_designation_id); setWhy(proposal.justification ?? "");
  }
  const base = ctc ?? 0;
  const amount = Math.round((base * (pctValue ?? 0)) / 100);
  const off = proposal?.guideline_pct !== null && proposal?.guideline_pct !== undefined && pctValue !== null && Math.abs(pctValue - proposal.guideline_pct) >= 0.5;

  async function save() {
    if (!proposal) return;
    setBusy(true);
    try {
      await api.put(`/performance/increment-proposals/${proposal.uuid}`, {
        ...(admin && ctc !== proposal.current_ctc ? { current_ctc: ctc } : {}),
        proposed_pct: pctValue ?? 0, promote, new_designation_id: promote ? designation : null, justification: why || null,
      });
      toast.success("Proposal saved");
      onSaved(); setLast(null); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={!!proposal} onClose={() => { setLast(null); onClose(); }} size="md" busy={busy} title="Increment proposal"
      description={proposal ? `${proposal.employee?.name}${proposal.current_designation ? ` · ${proposal.current_designation}` : ""}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={promote && !designation} onClick={save}>Save</Button></>}>
      {proposal && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line p-3">
              <p className="text-[12px] text-muted">Rating</p>
              <div className="mt-1.5"><RatingPill value={proposal.rating} label={proposal.rating_label} /></div>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="text-[12px] text-muted">Compa-ratio</p>
              <p className="mt-1 text-[18px] font-extralight text-ink tabular">{proposal.compa_ratio?.toFixed(2) ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="text-[12px] text-muted">Guideline</p>
              <p className="mt-1 text-[18px] font-extralight text-ink tabular">{pct(proposal.guideline_pct, 1)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current CTC" hint={admin ? undefined : "Only pay review admins can change this."}>
              <NumberInput value={ctc} onChange={setCtc} min={0} step={10000} disabled={!admin} />
            </Field>
            <Field label="Increment">
              <NumberInput value={pctValue} onChange={setPct} min={0} max={200} step={0.5} suffix="%" />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px]">
            <span className="text-muted">+{money(amount)} a year</span>
            <span className="text-ink">New CTC <span className="tabular">{money(base + amount)}</span></span>
          </div>
          <Toggle checked={promote} onChange={(x) => { setPromote(x); if (!x) setDesignation(null); }} label="Promote" description="Change the designation from the effective date." />
          {promote && (
            <Field label="New designation" required>
              <Select<number> value={designation} onChange={setDesignation} placeholder="Pick a designation"
                options={designations.filter((d) => d.value !== proposal.current_designation_id)} />
            </Field>
          )}
          <Field label="Justification" required={off || promote} hint={off ? "This is off the guideline, so say why." : undefined}>
            <Textarea value={why} onValueChange={setWhy} rows={3} autoGrow />
          </Field>
        </div>
      )}
    </Modal>
  );
}
