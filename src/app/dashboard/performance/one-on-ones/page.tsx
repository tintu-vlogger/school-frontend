"use client";

/*
 * One-to-ones: upcoming meetings as cards, past ones in a table. Schedule and the meeting
 * itself (shared agenda and notes, private note, mark done) open in modals. ?view=<uuid>
 * opens a meeting directly.
 */
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Handshake, ListChecks, Repeat } from "lucide-react";
import { formatDate, formatDayMonth, formatRelative, formatTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Avatar, Badge, Button, DataTable, FilterBar, Skeleton, paginate, type Column, type FilterValues } from "@/components/ui-kit";
import { PerformanceTabs, PersonInline, STROKE, useList, usePerfMe } from "@/components/performance/shared";
import { MeetingModal, ScheduleMeetingModal, recurrenceLabel } from "@/components/performance/talent/meetings";
import type { Meeting } from "@/components/performance/types";

function otherOf(m: Meeting) {
  return m.role === "employee" ? m.manager : m.employee;
}

function UpcomingCard({ m, onOpen }: { m: Meeting; onOpen: () => void }) {
  const other = otherOf(m);
  const open = m.agenda.filter((a) => !a.done).length;
  return (
    <button type="button" onClick={onOpen}
      className="group flex w-full flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary-soft/70 text-primary">
            <span className="text-[11px] uppercase leading-none tracking-wide">{formatDayMonth(m.scheduled_at).split(" ")[1]}</span>
            <span className="tabular text-[19px] font-light leading-tight">{formatDayMonth(m.scheduled_at).split(" ")[0]}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] text-ink">{m.title}</p>
            <p className="text-[13px] text-muted">{formatTime(m.scheduled_at)} · {m.duration_minutes} min · {formatRelative(m.scheduled_at)}</p>
          </div>
        </div>
        {m.recurrence !== "none" && <Repeat size={15} strokeWidth={STROKE} className="mt-1 shrink-0 text-faint" aria-label={recurrenceLabel(m.recurrence)} />}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex min-w-0 items-center gap-2">
          {other && <Avatar name={other.name} src={other.photo} size={26} />}
          <span className="truncate text-[13.5px] text-ink/80">{other?.name ?? "—"}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
          <ListChecks size={14} strokeWidth={STROKE} />{open ? `${open} topic${open === 1 ? "" : "s"}` : "No topics yet"}
        </span>
      </div>
    </button>
  );
}

function OneOnOnes() {
  const { me } = usePerfMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view");
  const [scheduling, setScheduling] = useState(false);
  const [session, setSession] = useState(0);
  const upcoming = useList<Meeting>("/performance/one-on-ones?when=upcoming", "Couldn't load meetings");
  const past = useList<Meeting>("/performance/one-on-ones?when=past", "Couldn't load meetings");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);

  const setView = (uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("view", uuid); else sp.delete("view");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const refresh = () => { upcoming.refresh(); past.refresh(); };

  const pastRows = useMemo(() => past.rows.filter((m) => {
    if (filters.status?.[0] && m.status !== filters.status[0]) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.title.toLowerCase().includes(q) || (otherOf(m)?.name ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [past.rows, filters, search]);

  const columns: Column<Meeting>[] = [
    { key: "when", header: "Date", sortable: true, sortValue: (m) => m.scheduled_at, cell: (m) => (
      <div><p className="tabular text-ink">{formatDate(m.scheduled_at)}</p><p className="text-[12.5px] text-muted">{formatTime(m.scheduled_at)}</p></div>
    ) },
    { key: "title", header: "Meeting", cell: (m) => <span className="text-ink/85">{m.title}</span> },
    { key: "with", header: "With", hideBelow: "sm", cell: (m) => <PersonInline person={otherOf(m)} /> },
    { key: "agenda", header: "Topics", hideBelow: "md", align: "right", cell: (m) => <span className="tabular text-muted">{m.agenda.filter((a) => a.done).length}/{m.agenda.length}</span> },
    { key: "actions", header: "Actions", hideBelow: "lg", align: "right", cell: (m) => {
      const open = m.action_items.filter((a) => !a.done).length;
      return open ? <span className="text-amber-700">{open} open</span> : <span className="text-faint">—</span>;
    } },
    { key: "status", header: "Status", cell: (m) => m.status === "done" ? <Badge tone="good" dot>Done</Badge>
      : m.status === "cancelled" ? <Badge tone="neutral" dot>Cancelled</Badge> : <Badge tone="warn" dot>Not closed</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Performance" title="One-to-ones"
        description="Regular conversations with a shared agenda, shared notes and your own private notes."
        actions={<Button variant="primary" icon={CalendarPlus} onClick={() => { setSession((s) => s + 1); setScheduling(true); }}>Schedule 1:1</Button>} />
      <PerformanceTabs me={me} />

      <section className="mb-10">
        <h2 className="mb-3 text-[15px] text-ink">Coming up</h2>
        {upcoming.loading && !upcoming.rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        ) : upcoming.rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.rows.map((m) => <UpcomingCard key={m.uuid} m={m} onOpen={() => setView(m.uuid)} />)}
          </div>
        ) : (
          <Paper>
            <EmptyState icon={Handshake} title="Nothing booked"
              hint={me?.is_manager ? "Book a regular one-to-one with each person in your team." : "Book time with your manager to talk about goals, growth and anything on your mind."}
              action={<Button variant="secondary" icon={CalendarPlus} onClick={() => { setSession((s) => s + 1); setScheduling(true); }}>Schedule 1:1</Button>} />
          </Paper>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[15px] text-ink">Earlier meetings</h2>
        <FilterBar searchPlaceholder="Search by title or person" onSearchChange={(q) => { setSearch(q); setPage(1); }}
          filters={[{ key: "status", label: "Status", options: [{ value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" }, { value: "scheduled", label: "Not closed" }] }]}
          values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <DataTable rows={paginate(pastRows, page, 10)} rowKey={(m) => m.uuid} columns={columns} loading={past.loading}
          onRowClick={(m) => setView(m.uuid)}
          pagination={{ page, size: 10, total: pastRows.length, onPageChange: setPage }}
          emptyIcon={Handshake} emptyTitle="No earlier meetings" emptyHint="Meetings move here once their time has passed." />
      </section>

      <ScheduleMeetingModal key={`s${session}`} open={scheduling} onClose={() => setScheduling(false)}
        onSaved={(m) => { setScheduling(false); refresh(); setView(m.uuid); }} />
      <MeetingModal uuid={view} onClose={() => setView(null)} onChanged={refresh} onOpen={(u) => setView(u)} />
    </div>
  );
}

export default function OneOnOnesPage() {
  return <Suspense fallback={null}><OneOnOnes /></Suspense>;
}
