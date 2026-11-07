"use client";

/*
 * Admission applications: the list (online and office) and the merit list per program with
 * seats, ranking and "offer the top N". ?view=<uuid> opens an application, ?new=1 the form.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileStack, ListOrdered, Pencil, Plus, Send, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FilterBar, Modal, ModalCancel, NumberInput, Select, StatCard, Tabs, Toggle,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { ApplicationDetailModal, ApplicationFormModal } from "@/components/admissions/application-modals";
import { STATUSES, STATUS_LABEL, StatusBadge, useAdmissionsMeta, useOfferings, type Application, type Page } from "@/components/admissions/shared";

export default function ApplicationsPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const canManage = useAccess().can("admissions.manage");
  const meta = useAdmissionsMeta();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const session = sessionId ?? meta?.default_session_id ?? null;
  const [nonce, setNonce] = useState(0);
  const offerings = useOfferings(session, nonce);
  const [tab, setTab] = useState<"all" | "merit">("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<{ key: string; page: Page<Application> } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<Application | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (p.get("view")) setViewing(p.get("view"));
      if (p.get("new")) setFormOpen(true);
      if (p.get("status")) setFilters({ status: [p.get("status")!] });
    });
    return () => clearTimeout(t);
  }, []);

  const key = `${session}|${search}|${JSON.stringify(filters)}|${page}|${size}|${nonce}`;
  useEffect(() => {
    if (tab !== "all" || !meta) return;
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (session) p.set("session_id", String(session));
    if (search) p.set("q", search);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    if (filters.program?.[0]) p.set("program_id", filters.program[0]);
    if (filters.channel?.[0]) p.set("channel", filters.channel[0]);
    if (filters.fee?.[0]) p.set("fee_paid", filters.fee[0]);
    api.get<Page<Application>>(`/admissions/applications?${p}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load applications", { description: e.message }); } });
    return () => { live = false; };
  }, [key, tab, meta, session, search, filters, page, size, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = (a: Application | "new") => { setFormKey((k) => k + 1); setFormFor(a); setFormOpen(true); };

  const columns: Column<Application>[] = [
    { key: "name", header: "Applicant", sortable: true, sortValue: (a) => a.name, cell: (a) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={a.name} size={32} />
        <div className="min-w-0"><p className="truncate text-ink">{a.name}</p><p className="truncate text-[12.5px] text-muted">{a.application_no}{a.primary_guardian ? ` · ${a.primary_guardian}` : ""}</p></div></div>) },
    { key: "program", header: term("program"), hideBelow: "md", cell: (a) => a.program_name },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} pending={a.offer_state === "pending"} /> },
    { key: "merit", header: "Merit", align: "right", hideBelow: "sm", sortable: true, sortValue: (a) => a.merit_rank ?? 9999,
      cell: (a) => a.merit_rank ? <span className="tabular">#{a.merit_rank} <span className="text-faint">· {a.merit_score}</span></span> : <span className="text-faint">—</span> },
    { key: "fee", header: "Fee", hideBelow: "lg", cell: (a) => Number(a.fee_amount) > 0 ? (a.fee_paid ? <Badge tone="good">Paid</Badge> : <Badge tone="warn">Due</Badge>) : <span className="text-faint">—</span> },
    { key: "channel", header: "Via", hideBelow: "lg", cell: (a) => <span className="text-muted">{a.channel === "online" ? "Website" : "Office"}</span> },
    { key: "received", header: "Received", hideBelow: "md", sortable: true, sortValue: (a) => a.submitted_at ?? a.created_at,
      cell: (a) => <span className="text-muted">{formatRelative(a.submitted_at ?? a.created_at)}</span> },
  ];

  const rows = data?.key === key ? data.page : null;
  const filtered = !!search || Object.values(filters).some((x) => x?.length);
  return (
    <div>
      <PageHeader eyebrow="Admissions" title="Applications" description="Applications from your website and the office: review, tests and interviews, merit and offers."
        actions={<>
          <Select value={session} onChange={(x) => { setSessionId(x); setPage(1); }} options={(meta?.sessions ?? []).map((s) => ({ value: s.id, label: s.name }))} className="w-40" aria-label={term("session")} />
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New application</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "all", label: "All applications", icon: FileStack }, { value: "merit", label: "Merit list", icon: Trophy }]} />
      {tab === "all" ? (
        <>
          <FilterBar searchPlaceholder="Search name, number, phone or email" onSearchChange={(q) => { setSearch(q); setPage(1); }}
            filters={[
              { key: "status", label: "Status", multiple: true, options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
              { key: "program", label: term("program"), options: (offerings ?? []).map((o) => ({ value: String(o.program_id), label: o.program_name ?? "" })) },
              { key: "channel", label: "Via", options: [{ value: "online", label: "Website" }, { value: "office", label: "Office" }] },
              { key: "fee", label: "Fee", options: [{ value: "true", label: "Paid" }, { value: "false", label: "Not paid" }] },
            ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
          <DataTable rows={rows?.items ?? []} rowKey={(a) => a.uuid} columns={columns} loading={!rows} onRowClick={(a) => setViewing(a.uuid)}
            rowActions={(a) => [{ label: "View details", icon: Eye, onSelect: () => setViewing(a.uuid) },
              ...(canManage && a.status !== "enrolled" ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(a) }] : [])]}
            pagination={{ page, size, total: rows?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
            emptyIcon={FileStack} emptyTitle={filtered ? "No applications match" : "No applications yet"}
            emptyHint={filtered ? "Try another search or clear the filters." : "Open programs in Admission settings; families can then apply on your website, or add an application here."}
            emptyAction={canManage && !filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New application</Button>} />
        </>
      ) : (
        <MeritList sessionId={session} offerings={offerings ?? []} canManage={canManage} onOpen={setViewing} nonce={nonce} onChanged={refresh} />
      )}
      <ApplicationFormModal key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} defaults={{ session_id: session }}
        onSaved={(a) => { setFormOpen(false); refresh(); setViewing(a.uuid); }} />
      <ApplicationDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(a) => { setViewing(null); openForm(a); }} />
    </div>
  );
}

type Merit = { seats: { seats: number; taken: number; available: number; has_offering: boolean }; items: Application[] };

function MeritList({ sessionId, offerings, canManage, onOpen, nonce, onChanged }: {
  sessionId: number | null; offerings: { program_id: number; program_name: string | null; seats: number; available: number }[];
  canManage: boolean; onOpen: (u: string) => void; nonce: number; onChanged: () => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const [programId, setProgramId] = useState<number | null>(null);
  const program = programId ?? offerings[0]?.program_id ?? null;
  const [data, setData] = useState<{ key: string; m: Merit } | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const key = `${sessionId}|${program}|${nonce}`;
  useEffect(() => {
    if (!sessionId || !program) return;
    let live = true;
    api.get<Merit>(`/admissions/merit?session_id=${sessionId}&program_id=${program}`).then((m) => { if (live) setData({ key, m }); })
      .catch((e) => toast.error("Couldn't load the merit list", { description: e.message }));
    return () => { live = false; };
  }, [key, sessionId, program, toast]);
  const m = data?.key === key ? data.m : null;
  const inRunning = useMemo(() => (m?.items ?? []).filter((a) => ["submitted", "under_review", "test_scheduled", "interview", "shortlisted", "waitlisted"].includes(a.status) && a.offer_state !== "pending"), [m]);

  async function rank() {
    setBusy(true);
    try { await api.post("/admissions/merit/rank", { session_id: sessionId, program_id: program }); toast.success("Merit list updated"); onChanged(); }
    catch (e) { toast.error("Couldn't rank", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  if (!offerings.length) return <p className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-[14px] text-muted">Open a {term("program").toLowerCase()} for admission in Admission settings to see its merit list.</p>;

  const columns: Column<Application>[] = [
    { key: "rank", header: "Rank", width: "72px", cell: (a) => a.merit_rank ? <span className="tabular text-ink">#{a.merit_rank}</span> : <span className="text-faint">—</span> },
    { key: "name", header: "Applicant", cell: (a) => <div className="min-w-0"><p className="truncate text-ink">{a.name}</p><p className="truncate text-[12.5px] text-muted">{a.application_no}</p></div> },
    { key: "test", header: "Test", align: "right", hideBelow: "sm", cell: (a) => a.test_score != null ? <span className="tabular">{a.test_score}/{a.test_max}</span> : <span className="text-faint">—</span> },
    { key: "int", header: "Interview", align: "right", hideBelow: "sm", cell: (a) => a.interview_score != null ? <span className="tabular">{a.interview_score}/{a.interview_max}</span> : <span className="text-faint">—</span> },
    { key: "score", header: "Merit score", align: "right", cell: (a) => a.merit_score ? <span className="tabular text-ink">{a.merit_score}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} pending={a.offer_state === "pending"} /> },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Field label={term("program")} className="w-64">
          <Select value={program} onChange={setProgramId} options={offerings.map((o) => ({ value: o.program_id, label: o.program_name ?? "", description: `${o.available} of ${o.seats} seats open` }))} />
        </Field>
        {canManage && <div className="flex gap-2">
          <Button icon={ListOrdered} onClick={rank} loading={busy}>Rank by score</Button>
          <Button variant="primary" icon={Send} disabled={!m?.seats.available || !inRunning.length} onClick={() => setOfferOpen(true)}>Offer seats</Button>
        </div>}
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <StatCard label="Seats" value={m?.seats.seats ?? "—"} />
        <StatCard label="Taken" value={m?.seats.taken ?? "—"} hint="offered, accepted or enrolled" />
        <StatCard label="Open" value={m?.seats.available ?? "—"} />
        <StatCard label="In the running" value={m ? inRunning.length : "—"} />
      </div>
      <DataTable rows={m?.items ?? []} rowKey={(a) => a.uuid} columns={columns} loading={!m} onRowClick={(a) => onOpen(a.uuid)}
        rowClassName={(a) => (["rejected", "withdrawn"].includes(a.status) ? "opacity-60" : undefined)}
        emptyIcon={Trophy} emptyTitle="No applications for this program yet" emptyHint="Applications appear here once they are received." />
      <OfferTopModal key={`${key}-${offerOpen}`} open={offerOpen} onClose={() => setOfferOpen(false)} available={m?.seats.available ?? 0}
        onConfirm={async (count, waitlist, expires) => {
          try {
            const r = await api.post<{ offered: number; waitlisted: number; skipped: { application_no: string; reason: string }[] }>("/admissions/merit/offer",
              { session_id: sessionId, program_id: program, count, waitlist_rest: waitlist, expires_on: expires || null });
            toast.success(`${r.offered} offers made${r.waitlisted ? `, ${r.waitlisted} waitlisted` : ""}`,
              r.skipped.length ? { description: `${r.skipped.length} skipped: ${r.skipped[0].reason}` } : undefined);
            setOfferOpen(false); onChanged();
          } catch (e) { toast.error("Couldn't make offers", { description: e instanceof Error ? e.message : undefined }); }
        }} />
    </div>
  );
}

function OfferTopModal({ open, onClose, available, onConfirm }: { open: boolean; onClose: () => void; available: number; onConfirm: (count: number | null, waitlist: boolean, expires: string) => Promise<void> }) {
  const [count, setCount] = useState<number | null>(available);
  const [waitlist, setWaitlist] = useState(false);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={busy} title="Offer seats by merit"
      description={`Ranks the list again and offers seats from the top. ${available} seats are open.`}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={busy} onClick={async () => { setBusy(true); await onConfirm(count, waitlist, expires); setBusy(false); }}>Make offers</Button></>}>
      <div className="space-y-4">
        <Field label="How many"><NumberInput value={count} onChange={setCount} min={1} max={available} /></Field>
        <Field label="Offer valid until" hint="Empty: the default in Admission settings"><DateInput value={expires} onChange={setExpires} clearable /></Field>
        <Toggle checked={waitlist} onChange={setWaitlist} label="Waitlist everyone else" description="The rest of the ranked list moves to the waiting list." />
        <p className="text-[12.5px] text-faint">Offers follow the approval flow for admission offers when one is set up. Families get an email; print the offer letter from each application.</p>
      </div>
    </Modal>
  );
}
