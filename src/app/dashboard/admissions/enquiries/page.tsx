"use client";

/*
 * Admission enquiries: a pipeline board (drag a card to move it) and a list. Row or card
 * click opens the detail modal; ?view=<uuid> and ?new=1 open modals directly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Columns3, Eye, List, Pencil, Phone, Plus, UserRoundPlus, UserSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, DataTable, FilterBar, Modal, ModalCancel, Select, Field, Skeleton, Tabs, type Column, type FilterValues } from "@/components/ui-kit";
import { EnquiryDetailModal, EnquiryFormModal, StageModal } from "@/components/admissions/enquiry-modals";
import { ApplicationDetailModal, ApplicationFormModal } from "@/components/admissions/application-modals";
import { STAGE_LABEL, STAGES, StageBadge, searchStaff, useAdmissionsMeta, useOfferings, type Application, type Enquiry, type Page } from "@/components/admissions/shared";

type Column_ = { key: string; label: string; total: number; items: Enquiry[] };
const DOT: Record<string, string> = { new: "bg-sky-500", contacted: "bg-primary", visit_scheduled: "bg-amber-500", applied: "bg-violet-500", converted: "bg-emerald-500", lost: "bg-faint" };

export default function EnquiriesPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const canManage = useAccess().can("admissions.manage");
  const meta = useAdmissionsMeta();
  const offerings = useOfferings(meta?.default_session_id);
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [board, setBoard] = useState<{ key: string; cols: Column_[] } | null>(null);
  const [list, setList] = useState<{ key: string; data: Page<Enquiry> } | null>(null);
  const [formFor, setFormFor] = useState<Enquiry | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [appView, setAppView] = useState<string | null>(null);
  const [appEdit, setAppEdit] = useState<Application | null>(null);
  const [move, setMove] = useState<{ e: Enquiry; to: string } | null>(null);
  const [dragging, setDragging] = useState<Enquiry | null>(null);
  const [assignOpen, setAssignOpen] = useState<Enquiry[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (p.get("view")) setViewing(p.get("view"));
      if (p.get("new")) { setFormFor("new"); setFormOpen(true); }
    });
    return () => clearTimeout(t);
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (filters.program?.[0]) p.set("program_id", filters.program[0]);
    if (filters.source?.[0]) p.set("source_id", filters.source[0]);
    if (filters.follow?.[0]) p.set("follow_up", filters.follow[0]);
    if (filters.mine?.[0]) p.set("mine", "true");
    if (filters.archived?.[0]) p.set("archived", "true");
    return p;
  }, [search, filters]);
  const key = `${qs.toString()}|${nonce}|${page}|${size}|${filters.stage?.join(",") ?? ""}`;

  useEffect(() => {
    let live = true;
    if (view === "board" && !filters.archived?.[0]) {
      api.get<{ stages: Column_[] }>(`/admissions/enquiries/board?${qs}`).then((r) => { if (live) setBoard({ key, cols: r.stages }); })
        .catch((e) => { if (live) { setBoard({ key, cols: [] }); toast.error("Couldn't load enquiries", { description: e.message }); } });
    } else {
      const p = new URLSearchParams(qs); p.set("page", String(page)); p.set("size", String(size));
      if (filters.stage?.length) p.set("stage", filters.stage.join(","));
      api.get<Page<Enquiry>>(`/admissions/enquiries?${p}`).then((r) => { if (live) setList({ key, data: r }); })
        .catch((e) => { if (live) { setList({ key, data: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load enquiries", { description: e.message }); } });
    }
    return () => { live = false; };
  }, [key, view, qs, page, size, filters.stage, filters.archived, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = (e: Enquiry | "new") => { setFormKey((k) => k + 1); setFormFor(e); setFormOpen(true); };

  async function drop(to: string) {
    const e = dragging;
    setDragging(null);
    if (!e || e.stage === to) return;
    if (to === "lost" || to === "visit_scheduled") { setMove({ e, to }); return; }
    try {
      await api.post(`/admissions/enquiries/${e.uuid}/stage`, { stage: to });
      toast.success(`Moved to ${STAGE_LABEL[to]}`);
      refresh();
    } catch (err) { toast.error("Can't move it there", { description: err instanceof Error ? err.message : undefined }); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const filterDefs = [
    { key: "program", label: term("program"), options: (offerings ?? []).map((o) => ({ value: String(o.program_id), label: o.program_name ?? "" })) },
    ...(view === "list" ? [{ key: "stage", label: "Stage", multiple: true, options: STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) }] : []),
    { key: "follow", label: "Follow-up", options: [{ value: "due", label: "Due or overdue" }, { value: "today", label: "Today" }, { value: "overdue", label: "Overdue" }, { value: "none", label: "Not set" }] },
    { key: "mine", label: "Assigned", options: [{ value: "1", label: "Assigned to me" }] },
    ...(view === "list" ? [{ key: "archived", label: "Archived", options: [{ value: "1", label: "Show archived" }] }] : []),
  ];

  const columns: Column<Enquiry>[] = [
    { key: "child", header: term("student"), sortable: true, sortValue: (e) => e.child_name, cell: (e) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={e.child_name} size={32} />
        <div className="min-w-0"><p className="truncate text-ink">{e.child_name}</p><p className="truncate text-[12.5px] text-muted">{e.number} · {e.parent_name || e.phone}</p></div></div>) },
    { key: "program", header: term("program"), hideBelow: "md", cell: (e) => e.program_name ?? <span className="text-faint">—</span> },
    { key: "stage", header: "Stage", cell: (e) => <StageBadge stage={e.stage} /> },
    { key: "source", header: "Source", hideBelow: "lg", cell: (e) => e.source_label ?? <span className="text-faint">—</span> },
    { key: "follow", header: "Follow-up", sortable: true, sortValue: (e) => e.next_follow_up, hideBelow: "sm", cell: (e) => e.next_follow_up
      ? <span className={e.next_follow_up < today && ["new", "contacted", "visit_scheduled", "applied"].includes(e.stage) ? "text-rose-700" : "text-ink/80"}>{formatDate(e.next_follow_up)}</span> : <span className="text-faint">—</span> },
    { key: "counsellor", header: "Counsellor", hideBelow: "lg", cell: (e) => e.counsellor_name ?? <span className="text-faint">Unassigned</span> },
    { key: "added", header: "Added", hideBelow: "lg", sortable: true, sortValue: (e) => e.created_at, cell: (e) => <span className="text-muted">{formatRelative(e.created_at)}</span> },
  ];

  const cols = board?.key === key ? board.cols : null;
  const rows = list?.key === key ? list.data : null;

  return (
    <div>
      <PageHeader eyebrow="Admissions" title="Enquiries" description="Every family that asked about admission, where they are in the pipeline and who follows up."
        actions={<>
          <Tabs variant="pill" value={view} onChange={(x) => { setView(x); setPage(1); }} items={[{ value: "board", label: "Board", icon: Columns3 }, { value: "list", label: "List", icon: List }]} />
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New enquiry</Button>}
        </>} />
      <FilterBar searchPlaceholder="Search name, phone, email or number" onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={filterDefs} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />

      {view === "board" && !filters.archived?.[0] ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
          {(cols ?? STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], total: 0, items: [] as Enquiry[] }))).map((c) => (
            <div key={c.key} onDragOver={(ev) => { if (dragging) ev.preventDefault(); }} onDrop={() => drop(c.key)}
              className={`flex w-[272px] shrink-0 flex-col rounded-2xl border bg-sunken/40 transition-colors ${dragging && dragging.stage !== c.key ? "border-dashed border-primary/40" : "border-line"}`}>
              <div className="flex items-center justify-between px-3.5 py-3">
                <span className="flex items-center gap-2 text-[13.5px] text-ink"><span className={`h-2 w-2 rounded-full ${DOT[c.key]}`} />{c.label}</span>
                <span className="tabular text-[12.5px] text-muted">{c.total}</span>
              </div>
              <div className="flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2.5 pb-3">
                {!cols ? [0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
                  : c.items.length === 0 ? <p className="px-2 py-6 text-center text-[12.5px] text-faint">{c.key === "new" && canManage ? "New enquiries land here." : "Nothing here"}</p>
                  : c.items.map((e) => {
                    const overdue = !!e.next_follow_up && e.next_follow_up < today && !["converted", "lost"].includes(e.stage);
                    return (
                      <button key={e.uuid} type="button" draggable={canManage && !["converted"].includes(e.stage)}
                        onDragStart={() => setDragging(e)} onDragEnd={() => setDragging(null)} onClick={() => setViewing(e.uuid)}
                        className="rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong">
                        <p className="truncate text-[14px] text-ink">{e.child_name}</p>
                        <p className="truncate text-[12.5px] text-muted">{e.program_name ?? "No program yet"}{e.source_label ? ` · ${e.source_label}` : ""}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                          {e.next_follow_up ? <span className={`inline-flex items-center gap-1 ${overdue ? "text-rose-700" : "text-muted"}`}><CalendarClock size={12.5} strokeWidth={1.4} />{formatDate(e.next_follow_up)}</span>
                            : e.phone ? <span className="inline-flex items-center gap-1 text-muted"><Phone size={12} strokeWidth={1.4} />{e.phone}</span> : <span />}
                          {e.counsellor_name ? <Avatar name={e.counsellor_name} size={20} /> : <Badge>Unassigned</Badge>}
                        </div>
                        {e.stage === "lost" && e.lost_reason && <p className="mt-1.5 truncate text-[12px] text-faint">{e.lost_reason}</p>}
                      </button>
                    );
                  })}
                {cols && c.total > c.items.length && <p className="px-2 text-center text-[12px] text-faint">+{c.total - c.items.length} more in the list view</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DataTable rows={rows?.items ?? []} rowKey={(e) => e.uuid} columns={columns} loading={!rows} onRowClick={(e) => setViewing(e.uuid)}
          rowActions={(e) => [
            { label: "View details", icon: Eye, onSelect: () => setViewing(e.uuid) },
            ...(canManage && !e.archived ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(e) }] : []),
          ]}
          selectable={canManage}
          bulkActions={canManage ? [{ label: "Assign counsellor", icon: UserRoundPlus, onSelect: (list) => setAssignOpen(list) }] : undefined}
          pagination={{ page, size, total: rows?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
          emptyIcon={UserSearch} emptyTitle={search || Object.keys(filters).length ? "No enquiries match" : "No enquiries yet"}
          emptyHint={search || Object.keys(filters).length ? "Try another search or clear the filters." : "Add walk-ins and calls here; enquiries from your website arrive by themselves."}
          emptyAction={canManage && !search && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New enquiry</Button>} />
      )}

      <EnquiryFormModal key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)}
        onSaved={(e) => { setFormOpen(false); refresh(); if (formFor === "new") setViewing(e.uuid); }} />
      <EnquiryDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(e) => { setViewing(null); openForm(e); }} onOpenApplication={(u) => { setViewing(null); setAppView(u); }} />
      <StageModal key={move ? `${move.e.uuid}-${move.to}` : "none"} enquiry={move?.e ?? null} to={move?.to ?? null} open={!!move}
        onClose={() => setMove(null)} onSaved={() => { setMove(null); refresh(); }} />
      <ApplicationDetailModal uuid={appView} open={!!appView} onClose={() => setAppView(null)} onChanged={refresh}
        onEdit={(a) => { setAppView(null); setAppEdit(a); }} />
      {appEdit && <ApplicationFormModal target={appEdit} open={!!appEdit} onClose={() => setAppEdit(null)} onSaved={(a) => { setAppEdit(null); setAppView(a.uuid); }} />}
      <BulkAssign rows={assignOpen} onClose={() => setAssignOpen(null)} onDone={() => { setAssignOpen(null); refresh(); }} />
    </div>
  );
}

function BulkAssign({ rows, onClose, onDone }: { rows: Enquiry[] | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [who, setWho] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Modal open={!!rows} onClose={onClose} size="sm" busy={saving} title={`Assign ${rows?.length ?? 0} enquiries`}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!who} onClick={async () => {
        setSaving(true);
        try { await api.post("/admissions/enquiries/bulk-assign", { uuids: rows!.map((r) => r.uuid), counsellor_id: who }); toast.success("Assigned"); onDone(); }
        catch (e) { toast.error("Couldn't assign", { description: e instanceof Error ? e.message : undefined }); }
        finally { setSaving(false); }
      }}>Assign</Button></>}>
      <Field label="Counsellor"><Select value={who} onChange={setWho} loadOptions={searchStaff} placeholder="Search staff" /></Field>
    </Modal>
  );
}
