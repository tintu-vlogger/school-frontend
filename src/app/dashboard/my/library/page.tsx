"use client";

/*
 * Portal library: books on loan with due dates, reservations, fines and history, a catalogue
 * search with Reserve, and e-resource links. A parent picks the child first.
 */
import { useEffect, useState } from "react";
import { BookMarked, BookOpen, ExternalLink, Hourglass, Library, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, FilterBar, Skeleton, Tabs, useConfirm } from "@/components/ui-kit";
import { Cover, DueBadge, FINE_KIND, FineStatus, errMsg, inr, useGet, type Fine, type Hold, type Loan, type Page } from "@/components/library/common";

type Kid = { id: number; uuid: string; name: string; first_name: string; photo_url: string | null; section_label: string | null };
type Mine = { card_no: string; limit: number; loan_days: number; fine_per_day: string; loans: Loan[]; history: Loan[]; fines: Fine[]; holds: Hold[]; fines_due: string };
type CatBook = { uuid: string; title: string; authors: string | null; category_name: string | null; cover_url: string | null; reference_only: boolean; copies: number; available: number; shelf: string | null };
type ERes = { uuid: string; title: string; url: string; kind: string; subject: string | null; access_note: string | null };

export default function MyLibraryPage() {
  const { term } = useInstitution();
  const { portalRole } = useAccess();
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    api.get<Kid[]>("/students/mine").then((r) => { setKids(r); setPick((p) => p ?? r[0]?.id ?? null); }).catch(() => setKids([]));
  }, []);
  const isParent = portalRole === "parent";
  const kid = kids?.find((k) => k.id === pick) ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Library" description={isParent ? "Books your child has borrowed, due dates and fines. Search the catalogue and reserve a book." : "Your books, due dates and fines. Search the catalogue and reserve a book."} />
      {isParent && kids && kids.length > 1 && (
        <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {kids.map((k) => (
            <button key={k.id} type="button" onClick={() => setPick(k.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${k.id === pick ? "border-primary/40 bg-primary-soft/50" : "border-line bg-surface hover:bg-sunken/50"}`}>
              <Avatar name={k.name} src={k.photo_url ?? undefined} size={30} />
              <span><span className="block text-[14px] text-ink">{k.first_name}</span><span className="block text-[12px] text-muted">{k.section_label ?? ""}</span></span>
            </button>
          ))}
        </div>
      )}
      {kids === null ? <Skeleton className="h-48 w-full rounded-2xl" /> : !kid ? (
        <Paper><EmptyState icon={Library} title={`No ${term("student").toLowerCase()} linked to this sign-in`} hint="Ask the school office to link your account." /></Paper>
      ) : <KidLibrary key={kid.id} studentId={kid.id} />}
    </div>
  );
}

function KidLibrary({ studentId }: { studentId: number }) {
  const [tab, setTab] = useState("loans");
  const mine = useGet<Mine>(`/library/portal/loans?student_id=${studentId}`);
  const m = mine.data;
  return (
    <div className="space-y-5">
      {!m ? <Skeleton className="h-24 w-full rounded-2xl" /> : (
        <div className="grid grid-cols-3 gap-3">
          <Tile label="On loan" value={`${m.loans.length} / ${m.limit}`} />
          <Tile label="Overdue" value={m.loans.filter((l) => l.overdue_days > 0).length} bad={m.loans.some((l) => l.overdue_days > 0)} />
          <Tile label="Fines due" value={inr(m.fines_due)} bad={Number(m.fines_due) > 0} />
        </div>
      )}
      <Tabs value={tab} onChange={setTab} items={[
        { value: "loans", label: "On loan", count: m?.loans.length }, { value: "search", label: "Find a book" },
        { value: "holds", label: "Reserved", count: m?.holds.length || undefined }, { value: "history", label: "History" },
        { value: "fines", label: "Fines" }, { value: "online", label: "Online" },
      ]} />
      {tab === "loans" && m && (m.loans.length === 0 ? <Paper><EmptyState icon={BookOpen} title="No books on loan" hint="Find a book and reserve it, or borrow one at the library desk." /></Paper> : (
        <Paper>
          <ul className="divide-y divide-line">
            {m.loans.map((l) => (
              <li key={l.uuid} className="flex items-center gap-3 px-4 py-3">
                <Cover url={l.cover_url} title={l.title} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] text-ink">{l.title}</p>
                  <p className="text-[12.5px] text-muted">Due {formatDate(l.due_on)}{l.fine_so_far && Number(l.fine_so_far) > 0 ? ` · fine so far ${inr(l.fine_so_far)}` : ""}</p>
                </div>
                <DueBadge loan={l} />
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">Books are lent for {m.loan_days} days. A late book costs {inr(m.fine_per_day)} a day. Renew at the library desk.</p>
        </Paper>
      ))}
      {tab === "search" && <Catalogue studentId={studentId} onReserved={() => { mine.reload(); }} />}
      {tab === "holds" && m && <Holds studentId={studentId} holds={m.holds} onChanged={mine.reload} />}
      {tab === "history" && m && (m.history.length === 0 ? <Paper><EmptyState icon={BookMarked} title="Nothing borrowed yet" /></Paper> : (
        <Paper>
          <ul className="divide-y divide-line">
            {m.history.map((l) => (
              <li key={l.uuid} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{l.title}</p>
                  <p className="text-[12.5px] text-muted">{formatDate(l.issued_on)} – {l.returned_on ? formatDate(l.returned_on) : ""}</p></div>
                <DueBadge loan={l} />
              </li>
            ))}
          </ul>
        </Paper>
      ))}
      {tab === "fines" && m && (m.fines.length === 0 ? <Paper><EmptyState icon={BookMarked} title="No fines" hint="Return books by the due date to keep it that way." /></Paper> : (
        <Paper>
          <ul className="divide-y divide-line">
            {m.fines.map((f) => (
              <li key={f.uuid} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                <div className="min-w-0 flex-1"><p className="truncate text-ink">{FINE_KIND[f.kind] ?? f.kind}{f.days ? ` · ${f.days} days` : ""}</p><p className="truncate text-[12.5px] text-muted">{f.title} · {formatDate(f.created_at)}</p></div>
                <span className="tabular">{inr(f.amount)}</span><FineStatus status={f.status} />
              </li>
            ))}
          </ul>
          {Number(m.fines_due) > 0 && <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">Pay fines at the library desk.</p>}
        </Paper>
      ))}
      {tab === "online" && <Online />}
    </div>
  );
}

function Tile({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3 text-center sm:text-left">
      <p className={`tabular text-[22px] font-extralight leading-tight ${bad ? "text-rose-700" : "text-ink"}`}>{value}</p>
      <p className="text-[12px] text-faint">{label}</p>
    </div>
  );
}

function Catalogue({ studentId, onReserved }: { studentId: number; onReserved: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useGet<Page<CatBook>>(`/library/portal/catalogue?student_id=${studentId}&size=20&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  async function reserve(b: CatBook) {
    setBusy(b.uuid);
    try {
      const r = await api.post<Hold>("/library/portal/reservations", { student_id: studentId, book_uuid: b.uuid });
      toast.success(r.status === "ready" ? "Reserved: a copy is kept at the desk" : "Reserved: you're on the waiting list");
      onReserved();
    } catch (e) { toast.error("Couldn't reserve", { description: errMsg(e) }); } finally { setBusy(null); }
  }
  const total = list.data?.total ?? 0;
  return (
    <div>
      <FilterBar searchPlaceholder="Search title or author" onSearchChange={(v) => { setQ(v); setPage(1); }} />
      <Paper>
        {!list.data ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : list.data.items.length === 0 ? (
          <EmptyState icon={Search} title="No books found" hint="Try another word." />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.items.map((b) => (
              <li key={b.uuid} className="flex items-center gap-3 px-4 py-3">
                <Cover url={b.cover_url} title={b.title} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] text-ink">{b.title}</p>
                  <p className="truncate text-[12.5px] text-muted">{[b.authors, b.category_name].filter(Boolean).join(" · ")}</p>
                </div>
                {b.reference_only ? <Badge tone="neutral">Read in library</Badge> : (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`hidden text-[12.5px] sm:inline ${b.available ? "text-emerald-700" : "text-muted"}`}>{b.available ? `${b.available} on shelf` : "All out"}</span>
                    <Button size="sm" icon={Hourglass} loading={busy === b.uuid} onClick={() => reserve(b)}>Reserve</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {total > 20 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-muted">
            <span>Page {page} of {Math.ceil(total / 20)}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Paper>
    </div>
  );
}

function Holds({ studentId, holds, onChanged }: { studentId: number; holds: Hold[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  async function cancel(h: Hold) {
    if (!(await confirm({ title: "Cancel this reservation?", message: h.title, confirmLabel: "Cancel reservation", tone: "danger" }))) return;
    try { await api.post(`/library/portal/reservations/${h.uuid}/cancel?student_id=${studentId}`); toast.success("Reservation cancelled"); onChanged(); }
    catch (e) { toast.error("Couldn't cancel", { description: errMsg(e) }); }
  }
  if (holds.length === 0) return <Paper><EmptyState icon={Hourglass} title="Nothing reserved" hint="Reserve a book from Find a book; we'll tell you when it's ready." /></Paper>;
  return (
    <Paper>
      <ul className="divide-y divide-line">
        {holds.map((h) => (
          <li key={h.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1"><p className="truncate text-[14.5px] text-ink">{h.title}</p>
              <p className="text-[12.5px] text-muted">{h.status === "ready" ? `Collect from the desk by ${h.expires_on ? formatDate(h.expires_on) : "soon"}` : `Reserved ${formatDate(h.reserved_at)}`}</p></div>
            {h.status === "ready" ? <Badge tone="accent" dot>Ready</Badge> : <Badge tone="neutral">Waiting</Badge>}
            <Button size="sm" variant="ghost" onClick={() => cancel(h)}>Cancel</Button>
          </li>
        ))}
      </ul>
    </Paper>
  );
}

function Online() {
  const list = useGet<ERes[]>("/library/portal/eresources");
  if (!list.data) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (list.data.length === 0) return <Paper><EmptyState icon={ExternalLink} title="No online resources yet" /></Paper>;
  return (
    <Paper>
      <PaperHeader title="E-books and learning sites" />
      <ul className="divide-y divide-line">
        {list.data.map((e) => (
          <li key={e.uuid}>
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/60">
              <div className="min-w-0 flex-1"><p className="truncate text-[14.5px] text-ink">{e.title}</p>
                <p className="truncate text-[12.5px] text-muted">{[e.subject, e.access_note].filter(Boolean).join(" · ")}</p></div>
              <ExternalLink size={15} strokeWidth={1.4} className="shrink-0 text-faint" />
            </a>
          </li>
        ))}
      </ul>
    </Paper>
  );
}
