"use client";

/*
 * Timetable builder. Tabs: a section's weekly grid (click a period to assign it, clashes
 * highlighted, allocation counts at the side), teacher view, room view, clashes and loads,
 * bell schedules. Managers can generate, copy, publish and print.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, Copy, Printer, Send, Wand2 } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { useUrlTab } from "@/lib/use-url-tab";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Menu, Select, Skeleton, Tabs, paginate, useConfirm, type Column, type SelectOption,
} from "@/components/ui-kit";
import { BellSchedules } from "@/components/timetable/bell-schedules";
import { CellModal, CopyModal, GenerateModal, type Allocation, type SectionRow } from "@/components/timetable/builder-modals";
import { PrintStyle, WeekGrid, WEEKDAY_NAMES, type TtClash, type TtDay, type TtEntry } from "@/components/timetable/week-grid";

type Grid = {
  section: { id: number; uuid: string; label: string; program_id: number; room_id: number | null; class_teacher_id: number | null };
  days: TtDay[]; entries: TtEntry[]; clashes: TtClash[]; allocation: Allocation[];
  publication: { published: boolean; published_at: string | null; published_by: string | null; version: number; changed: boolean };
};
type Load = { teacher_id: number; name: string; weekly: number; by_day: Record<string, number>; over: boolean };

const TABS = ["sections", "teachers", "rooms", "clashes", "bells"] as const;
type Tab = (typeof TABS)[number];

export default function TimetablePage() {
  const { can } = useAccess();
  const canManage = can("timetable.manage");
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("sections");
  useUrlTab(TABS, setTab);
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [teachers, setTeachers] = useState<SelectOption<number>[]>([]);
  const [rooms, setRooms] = useState<SelectOption<number>[]>([]);
  const [cell, setCell] = useState<{ weekday: number; period: number; list: TtEntry[] } | null>(null);
  const [cellOpen, setCellOpen] = useState(false);
  const [cellKey, setCellKey] = useState(0);
  const [genOpen, setGenOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const loadSections = useCallback(() => {
    api.get<SectionRow[]>("/timetable/sections").then((rows) => {
      setSections(rows);
      setSectionId((cur) => {
        if (cur && rows.some((r) => r.id === cur)) return cur;
        const fromUrl = Number(new URLSearchParams(window.location.search).get("section")) || null;
        return rows.find((r) => r.id === fromUrl)?.id ?? rows.find((r) => r.entries > 0)?.id ?? rows[0]?.id ?? null;
      });
    }).catch(() => { setSections([]); toast.error(`Couldn't load ${term("sections").toLowerCase()}`); });
  }, [toast, term]);

  const loadGrid = useCallback(() => {
    if (!sectionId) { setGrid(null); return; }
    setGridLoading(true);
    api.get<Grid>(`/timetable/grid?section_id=${sectionId}`).then(setGrid)
      .catch((e) => toast.error("Couldn't load the timetable", { description: (e as Error).message }))
      .finally(() => setGridLoading(false));
  }, [sectionId, toast]);

  useEffect(() => { loadSections(); }, [loadSections]);
  useEffect(() => { loadGrid(); }, [loadGrid]);
  useEffect(() => {
    api.get<{ id: number; name: string }[]>("/timetable/teachers").then((r) => setTeachers(r.map((t) => ({ value: t.id, label: t.name })))).catch(() => {});
    api.get<{ items: { id: number; name: string; kind: string; building: string | null }[] }>("/academics/rooms?all=true")
      .then((r) => setRooms((r.items ?? []).map((x) => ({ value: x.id, label: x.name, description: x.building ?? undefined })))).catch(() => {});
  }, []);

  const refresh = () => { loadGrid(); loadSections(); };
  const current = sections?.find((s) => s.id === sectionId) ?? null;
  const clashIds = useMemo(() => new Set((grid?.clashes ?? []).filter((c) => c.severity === "error").flatMap((c) => c.entry_uuids)), [grid]);

  const openCell = (weekday: number, period: number, list: TtEntry[]) => {
    if (!canManage) return;
    setCell({ weekday, period, list }); setCellKey((k) => k + 1); setCellOpen(true);
  };

  async function publish(ids: number[], label: string) {
    if (!(await confirm({ title: `Publish ${label}?`, message: `${term("teachers")}, ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()} will see it and be told.`, confirmLabel: "Publish" }))) return;
    try {
      const r = await api.post<{ published: number }>("/timetable/publish", { section_ids: ids });
      toast.success(r.published ? `Published ${r.published} timetable${r.published === 1 ? "" : "s"}` : "Nothing to publish");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const actions = (
    <>
      <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={tab !== "sections" && tab !== "teachers" && tab !== "rooms"}>Print</Button>
      {canManage && (
        <>
          <Button variant="secondary" icon={Wand2} onClick={() => setGenOpen(true)}>Generate</Button>
          <Button variant="secondary" icon={Copy} onClick={() => setCopyOpen(true)} disabled={!current?.entries}>Copy</Button>
          <Menu align="end" trigger={<Button variant="primary" icon={Send} iconRight={ChevronDown}>Publish</Button>} items={[
            { label: current ? `Publish ${current.label}` : "Publish this one", onSelect: () => current && publish([current.id], current.label) },
            { label: "Publish every changed timetable", onSelect: () => {
              const ids = (sections ?? []).filter((s) => s.entries > 0 && (!s.published || s.changed)).map((s) => s.id);
              if (!ids.length) { toast.info("Every timetable is already published"); return; }
              publish(ids, `${ids.length} timetables`);
            } },
          ]} />
        </>
      )}
    </>
  );

  return (
    <div>
      <PrintStyle />
      <PageHeader eyebrow="Academics" title="Timetable"
        description={`Weekly timetables for every ${term("section").toLowerCase()}, with ${term("teacher").toLowerCase()} and room clash checks.`}
        actions={<div className="tt-no-print flex flex-wrap gap-2">{actions}</div>} />
      <div className="tt-no-print mb-5">
        <Tabs value={tab} onChange={setTab} items={[
          { value: "sections", label: term("sections") }, { value: "teachers", label: term("teachers") },
          { value: "rooms", label: "Rooms" }, { value: "clashes", label: "Clashes & load" }, { value: "bells", label: "Bell schedules" },
        ]} />
      </div>

      {tab === "sections" && (
        !sections ? <Skeleton className="h-96 w-full" /> : sections.length === 0 ? (
          <Paper><EmptyState icon={CalendarClock} title={`No ${term("sections").toLowerCase()} yet`} hint={`Add ${term("programs").toLowerCase()} and ${term("sections").toLowerCase()} in Academics first.`} /></Paper>
        ) : (
          <div className="space-y-4">
            <div className="tt-no-print flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <Select value={sectionId} onChange={(v) => v && setSectionId(v)} aria-label={term("section")}
                  options={sections.map((s) => ({ value: s.id, label: s.label,
                    description: !s.entries ? "Empty" : s.published ? (s.changed ? "Changed since published" : "Published") : "Not published" }))} />
              </div>
              {grid && <PublicationBadge p={grid.publication} entries={grid.entries.length} />}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
              <Paper className="tt-print min-w-0">
                <PaperHeader title={grid?.section.label ?? current?.label ?? ""} action={gridLoading ? <span className="text-[12px] text-faint">Loading…</span> : undefined} />
                {!grid ? <Skeleton className="m-5 h-80" /> : (
                  <WeekGrid days={grid.days} entries={grid.entries} mode="section" clashIds={clashIds}
                    onCellClick={canManage ? openCell : undefined} />
                )}
              </Paper>
              {grid && (
                <div className="tt-no-print space-y-4">
                  <Paper>
                    <PaperHeader title={`${term("subjects")} this week`} />
                    {grid.allocation.length === 0 ? (
                      <p className="px-5 py-6 text-[13px] text-muted">No {term("subjects").toLowerCase()} allocated. Use Teacher allocation in Academics.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {grid.allocation.map((a) => {
                          const want = a.weekly_periods ?? 0;
                          const done = want > 0 && a.placed >= want;
                          return (
                            <li key={a.subject_id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-[13.5px] text-ink">{a.subject_name}</p>
                                <p className="truncate text-[12px] text-muted">{a.teacher_name ?? `No ${term("teacher").toLowerCase()}`}</p>
                              </div>
                              <Badge tone={done ? "good" : a.placed > want && want ? "warn" : "neutral"}>{a.placed}{want ? `/${want}` : ""}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Paper>
                  {grid.clashes.length > 0 && (
                    <Paper>
                      <PaperHeader title={<span className="flex items-center gap-2"><AlertTriangle size={15} strokeWidth={1.4} className="text-rose-600" />Clashes</span>} />
                      <ul className="space-y-2 p-4 text-[12.5px]">
                        {grid.clashes.map((c, i) => (
                          <li key={i} className={c.severity === "error" ? "text-rose-700" : "text-amber-700"}>{c.message}</li>
                        ))}
                      </ul>
                    </Paper>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {tab === "teachers" && <PersonView kind="teacher" options={teachers} />}
      {tab === "rooms" && <PersonView kind="room" options={rooms} />}
      {tab === "clashes" && <ClashesView />}
      {tab === "bells" && <BellSchedules canManage={canManage} onChanged={loadGrid} />}

      {cell && grid && (
        <CellModal key={cellKey} open={cellOpen} onClose={() => setCellOpen(false)} sectionId={grid.section.id}
          sectionLabel={grid.section.label} weekday={cell.weekday} periodNo={cell.period} entries={cell.list}
          allocation={grid.allocation} teachers={teachers} rooms={rooms} sections={sections ?? []} homeRoom={grid.section.room_id}
          onSaved={() => { setCellOpen(false); refresh(); }} />
      )}
      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} sections={sections ?? []} current={sectionId} onDone={refresh} />
      <CopyModal open={copyOpen} onClose={() => setCopyOpen(false)} sections={sections ?? []} from={current} onDone={refresh} />
    </div>
  );
}

function PublicationBadge({ p, entries }: { p: Grid["publication"]; entries: number }) {
  if (!entries) return <Badge>Empty</Badge>;
  if (!p.published) return <Badge tone="warn" dot>Not published</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
      <Badge tone={p.changed ? "warn" : "good"} dot>{p.changed ? "Changed since published" : "Published"}</Badge>
      {p.published_at && <span>v{p.version} · {formatDateTime(p.published_at)}{p.published_by ? ` by ${p.published_by}` : ""}</span>}
    </span>
  );
}

function PersonView({ kind, options }: { kind: "teacher" | "room"; options: SelectOption<number>[] }) {
  const { term } = useInstitution();
  const toast = useToast();
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<{ days: TtDay[]; entries: TtEntry[]; weekly?: number } | null>(null);
  useEffect(() => {
    if (!id) { setData(null); return; }
    const path = kind === "teacher" ? `/timetable/teacher?employee_id=${id}` : `/timetable/room?room_id=${id}`;
    api.get<{ days: TtDay[]; entries: TtEntry[]; weekly?: number }>(path).then(setData).catch((e) => toast.error((e as Error).message));
  }, [id, kind, toast]);
  const label = options.find((o) => o.value === id)?.label;
  const weekly = data ? new Set(data.entries.map((e) => `${e.weekday}:${e.period_no}`)).size : 0;
  return (
    <div className="space-y-4">
      <div className="tt-no-print w-full sm:w-72">
        <Select value={id} onChange={setId} options={options} placeholder={kind === "teacher" ? `Pick a ${term("teacher").toLowerCase()}` : "Pick a room"} />
      </div>
      {!id ? (
        <Paper><EmptyState icon={CalendarClock} title={kind === "teacher" ? `Pick a ${term("teacher").toLowerCase()}` : "Pick a room"}
          hint={kind === "teacher" ? "See their week across every class." : "See when the room is in use and when it is free."} /></Paper>
      ) : (
        <Paper className="tt-print min-w-0">
          <PaperHeader title={label ?? ""} action={data && <span className="text-[12.5px] text-muted">{weekly} periods a week</span>} />
          {!data ? <Skeleton className="m-5 h-80" /> : <WeekGrid days={data.days} entries={data.entries} mode={kind} emptyLabel={kind === "room" ? "Free" : ""} />}
        </Paper>
      )}
    </div>
  );
}

function ClashesView() {
  const { term } = useInstitution();
  const [data, setData] = useState<{ clashes: TtClash[]; loads: Load[] } | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { api.get<{ clashes: TtClash[]; loads: Load[] }>("/timetable/clashes").then(setData).catch(() => setData({ clashes: [], loads: [] })); }, []);
  const days = useMemo(() => Array.from(new Set((data?.loads ?? []).flatMap((l) => Object.keys(l.by_day)))).sort(), [data]);
  const columns: Column<Load>[] = [
    { key: "name", header: term("teacher"), sortable: true, sortValue: (r) => r.name, cell: (r) => <span className="text-ink">{r.name}</span> },
    ...days.map((d) => ({ key: `d${d}`, header: WEEKDAY_NAMES[Number(d)].slice(0, 3), align: "right" as const, hideBelow: "md" as const,
      cell: (r: Load) => <span className="tabular text-muted">{r.by_day[d] ?? "–"}</span> })),
    { key: "weekly", header: "Week", align: "right", sortable: true, sortValue: (r) => r.weekly,
      cell: (r) => <Badge tone={r.over ? "warn" : "neutral"}>{r.weekly}</Badge> },
  ];
  const errors = (data?.clashes ?? []).filter((c) => c.severity === "error");
  const warnings = (data?.clashes ?? []).filter((c) => c.severity === "warning");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Paper>
        <PaperHeader title="Clashes" action={data && <Badge tone={errors.length ? "bad" : "good"}>{errors.length ? `${errors.length} to fix` : "None"}</Badge>} />
        {!data ? <Skeleton className="m-5 h-40" /> : data.clashes.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No clashes" hint={`Nobody is double-booked and every ${term("teacher").toLowerCase()} is within the limits.`} />
        ) : (
          <ul className="divide-y divide-line">
            {[...errors, ...warnings].map((c, i) => (
              <li key={i} className="flex gap-3 px-5 py-3 text-[13px]">
                <AlertTriangle size={15} strokeWidth={1.4} className={`mt-0.5 shrink-0 ${c.severity === "error" ? "text-rose-600" : "text-amber-600"}`} />
                <span className="text-ink/90">{c.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Paper>
      <div>
        <p className="mb-2 text-[13px] text-muted">{term("teachers")}&apos; classes per week</p>
        <DataTable rows={paginate(data?.loads ?? [], page, 25)} rowKey={(r) => String(r.teacher_id)} columns={columns} loading={!data}
          pagination={{ page, size: 25, total: data?.loads.length ?? 0, onPageChange: setPage }}
          emptyTitle="No periods yet" emptyHint="Build or generate a timetable first." />
      </div>
    </div>
  );
}
