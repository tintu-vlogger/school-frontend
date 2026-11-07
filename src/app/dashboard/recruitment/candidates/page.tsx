"use client";

/*
 * Candidates: everyone who applied or was added, as a table or as one job's board.
 * Add (with CV reading), view the profile, merge duplicates, tag and talent pool in bulk.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Columns3, GitMerge, List, Tag, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Select, Tabs, TextInput, formatDisplayDate,
  type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { ScorePill, useHiringMeta } from "@/components/recruitment/common";
import { PipelineBoard } from "@/components/recruitment/board";
import { CandidateModal } from "@/components/recruitment/candidate-modal";
import { CandidateFormModal } from "@/components/recruitment/candidate-form";
import { APP_LABEL, APP_TONE, errText, type Candidate, type Job, type Page } from "@/components/recruitment/types";

function Candidates() {
  const toast = useToast();
  const meta = useHiringMeta();
  const params = useSearchParams();
  const [view, setView] = useState<"table" | "board">("table");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>(params.get("follow_up") ? { follow_up: ["1"] } : {});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Candidate> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [jobs, setJobs] = useState<SelectOption<string>[]>([]);
  const [boardJob, setBoardJob] = useState<string | null>(null);
  const [open, setOpen] = useState<{ cand?: string; app?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState<Candidate[] | null>(null);
  const [tagging, setTagging] = useState<{ apps: string[]; clear: () => void } | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    api.get<Page<Job>>("/recruitment/jobs?size=200").then((r) => {
      setJobs(r.items.map((j) => ({ value: j.uuid, label: j.title, description: j.status_label })));
      setBoardJob((b) => b ?? r.items.find((j) => j.status === "open")?.uuid ?? r.items[0]?.uuid ?? null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (view !== "table") return;
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.source?.length) p.set("source", filters.source.join(","));
    if (filters.job?.length) p.set("job_uuid", filters.job[0]);
    if (filters.pool?.length) p.set("talent_pool", "true");
    if (filters.follow_up?.length) p.set("follow_up_due", "true");
    if (filters.status?.length) p.set("status", filters.status.join(","));
    setLoading(true);
    api.get<Page<Candidate>>(`/recruitment/candidates?${p}`).then(setData).catch((e) => toast.error(errText(e))).finally(() => setLoading(false));
  }, [view, q, filters, page, nonce, toast]);

  const columns: Column<Candidate>[] = [
    { key: "name", header: "Candidate", cell: (c) => (
      <div className="flex items-center gap-2.5"><Avatar name={c.name} size={30} />
        <div><p className="text-ink">{c.name}</p><p className="text-[12.5px] text-faint">{[c.current_title, c.current_company].filter(Boolean).join(" · ") || c.email}</p></div></div>) },
    { key: "apps", header: "Applied for", cell: (c) => !c.applications?.length ? <span className="text-faint">Talent pool</span> : (
      <div className="space-y-0.5">{c.applications.slice(0, 2).map((a) => (
        <div key={a.uuid} className="flex items-center gap-2 text-[13px]"><span className="text-ink">{a.job_title}</span>
          <Badge tone={APP_TONE[a.status] ?? "neutral"}>{a.status === "active" ? a.stage_label : APP_LABEL[a.status] ?? a.status}</Badge><ScorePill score={a.score} /></div>))}
      </div>) },
    { key: "exp", header: "Experience", cell: (c) => <span className="text-muted">{c.total_experience !== null ? `${c.total_experience} yrs` : "—"}</span>, hideBelow: "md" },
    { key: "source", header: "Source", cell: (c) => <span className="text-muted">{c.source_label}</span>, hideBelow: "lg" },
    { key: "follow", header: "Follow up", cell: (c) => c.follow_up_on ? <span className="text-muted">{formatDisplayDate(c.follow_up_on)}</span> : <span className="text-faint">—</span>, hideBelow: "lg" },
    { key: "added", header: "Added", cell: (c) => <span className="text-muted">{formatDate(c.created_at)}</span>, hideBelow: "md" },
  ];

  const activeApps = (rows: Candidate[]) => rows.flatMap((c) => c.applications?.filter((a) => a.status === "active").map((a) => a.uuid) ?? []);
  async function bulk(action: string, apps: string[], extra: Record<string, unknown> = {}) {
    if (!apps.length) { toast.info("None of these candidates has an open application."); return; }
    try {
      const r = await api.post<{ done: number; failed: { reason: string }[] }>("/recruitment/applications/bulk", { uuids: apps, action, ...extra });
      toast.success(`${r.done} updated${r.failed.length ? `, ${r.failed.length} skipped` : ""}`);
      refresh();
    } catch (e) { toast.error(errText(e)); }
  }

  const sources = Object.entries(meta?.sources ?? {}).map(([value, label]) => ({ value, label }));
  return (
    <div>
      <PageHeader title="Candidates" description="Everyone in your hiring pipelines and talent pool."
        actions={<>
          <Tabs variant="pill" value={view} onChange={setView} items={[{ value: "table", label: "Table", icon: List }, { value: "board", label: "Board", icon: Columns3 }]} />
          <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add candidate</Button>
        </>} />
      {view === "table" ? (
        <>
          <FilterBar searchPlaceholder="Search by name, email, phone or company" onSearchChange={(x) => { setQ(x); setPage(1); }}
            filters={[
              { key: "job", label: "Job", options: jobs.map((j) => ({ value: j.value, label: j.label })) },
              { key: "source", label: "Source", options: sources, multiple: true },
              { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "hired", label: "Hired" }], multiple: true },
              { key: "pool", label: "Talent pool", options: [{ value: "1", label: "In talent pool" }] },
              { key: "follow_up", label: "Follow-up", options: [{ value: "1", label: "Due now" }] },
            ]}
            values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
          <DataTable rows={data?.items ?? []} columns={columns} rowKey={(c) => c.uuid} loading={loading && !data}
            onRowClick={(c) => setOpen({ cand: c.uuid })} selectable
            bulkActions={[
              { label: "Merge", icon: GitMerge, onSelect: (rows) => rows.length === 2 ? setMerging(rows) : toast.info("Pick exactly two candidates to merge.") },
              { label: "Tag", icon: Tag, onSelect: (rows, clear) => setTagging({ apps: activeApps(rows), clear }) },
              { label: "Add to talent pool", icon: Users, onSelect: (rows, clear) => { bulk("talent_pool", activeApps(rows)); clear(); } },
            ]}
            emptyIcon={Users} emptyTitle="No candidates found" emptyHint="Add one, or share a job on your careers page."
            pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined} />
        </>
      ) : (
        <div>
          <div className="mb-4 w-72"><Field label="Job"><Select value={boardJob} onChange={setBoardJob} options={jobs} /></Field></div>
          {boardJob && <PipelineBoard jobUuid={boardJob} reloadKey={nonce} onOpen={(c) => setOpen({ app: c.uuid, cand: c.candidate_uuid })} />}
        </div>
      )}
      <CandidateModal candidateUuid={open?.cand} applicationUuid={open?.app} onClose={() => setOpen(null)} onChanged={refresh} />
      <CandidateFormModal open={adding} jobUuid={view === "board" ? boardJob : null} onClose={() => setAdding(false)}
        onSaved={(c) => { setAdding(false); refresh(); setOpen({ cand: c.uuid }); }} />
      <MergeModal pair={merging} onClose={() => setMerging(null)} onDone={(uuid) => { setMerging(null); refresh(); setOpen({ cand: uuid }); }} />
      <TagModal open={!!tagging} onClose={() => setTagging(null)}
        onSubmit={(tag) => { bulk("tag", tagging!.apps, { tag }); tagging!.clear(); setTagging(null); }} />
    </div>
  );
}

function MergeModal({ pair, onClose, onDone }: { pair: Candidate[] | null; onClose: () => void; onDone: (uuid: string) => void }) {
  const toast = useToast();
  const [keep, setKeep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setKeep(pair?.[0]?.uuid ?? null); }, [pair]);
  async function merge() {
    if (!pair || !keep) return;
    const other = pair.find((c) => c.uuid !== keep)!;
    setBusy(true);
    try { await api.post(`/recruitment/candidates/${keep}/merge`, { other_uuid: other.uuid }); toast.success("Merged"); onDone(keep); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!pair} onClose={onClose} size="md" busy={busy} title="Merge duplicates"
      description="Applications, interviews, offers and referrals move to the one you keep. Empty fields are filled from the other."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={merge}>Merge</Button></>}>
      <div className="space-y-2">
        {pair?.map((c) => (
          <label key={c.uuid} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${keep === c.uuid ? "border-primary/50 bg-primary-soft/30" : "border-line"}`}>
            <input type="radio" name="keep" checked={keep === c.uuid} onChange={() => setKeep(c.uuid)} className="accent-[var(--color-primary)]" />
            <div><p className="text-[14px] text-ink">Keep {c.name}</p><p className="text-[12.5px] text-muted">{[c.email, c.phone, c.source_label].filter(Boolean).join(" · ")}</p></div>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function TagModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (t: string) => void }) {
  const [t, setT] = useState("");
  useEffect(() => { if (open) setT(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Tag candidates"
      footer={<><ModalCancel /><Button variant="primary" disabled={!t.trim()} onClick={() => onSubmit(t.trim())}>Add tag</Button></>}>
      <Field label="Tag"><TextInput value={t} onValueChange={setT} data-autofocus placeholder="e.g. strong, relocate" /></Field>
    </Modal>
  );
}

export default function CandidatesPage() {
  return <Suspense><Candidates /></Suspense>;
}
