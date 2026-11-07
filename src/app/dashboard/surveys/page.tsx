"use client";

/*
 * Surveys. Everyone sees the surveys waiting for them and what they have answered;
 * people who manage surveys also get the list with response rates, the company eNPS
 * with its trend, the builder and results.
 * Address options: ?take=<uuid> opens a survey to answer, ?tab=manage the manage view,
 * ?results=<uuid> a survey's results.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, BellRing, CalendarClock, CheckCircle2, ClipboardList, Copy, Eye, Gauge, Lock, Pencil, Plus, Repeat, Send, SlidersHorizontal,
  Square, Timer, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DataTable, FilterBar, Modal, NumberInput, Skeleton, Tabs, useConfirm, type Column, type FilterValues, type MenuItem,
} from "@/components/ui-kit";
import { CoverArt } from "@/components/engagement/art";
import { useEngagementMeta } from "@/components/engagement/context";
import { SurveyBuilderModal } from "@/components/engagement/survey-builder";
import { EnpsGauge, EnpsSplit, TrendChart, enpsTone } from "@/components/engagement/survey-results";
import { SurveyResultsModal } from "@/components/engagement/survey-results";
import { TakeSurveyModal } from "@/components/engagement/survey-take";
import {
  RECURRENCE_LABEL, STATUS_LABEL, STATUS_TONE, type CompanyEnps, type Enps, type MySurvey, type SurveyResults, type SurveyRow,
} from "@/components/engagement/survey-types";
import type { Paged } from "@/components/engagement/types";

const KIND_STYLE: Record<string, { tint: string; icon: typeof Gauge; fallback: string }> = {
  enps: { tint: "bg-violet-50 text-violet-700", icon: Gauge, fallback: "lavender" },
  pulse: { tint: "bg-emerald-50 text-emerald-700", icon: SlidersHorizontal, fallback: "meadow" },
  survey: { tint: "bg-sky-50 text-sky-700", icon: ClipboardList, fallback: "ocean" },
};

function closesIn(iso: string | null) {
  if (!iso) return "";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `${days} days left`;
}

/* ── For you ─────────────────────────────────────────────────────── */

function PendingCard({ s, onTake }: { s: MySurvey; onTake: () => void }) {
  const k = KIND_STYLE[s.kind] ?? KIND_STYLE.survey;
  const minutes = Math.max(1, Math.round(s.questions_count * 0.4));
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(30,27,75,.25)]">
      <CoverArt cover={s.cover} fallback={k.fallback} className="h-28">
        <div className="flex h-28 items-start justify-between p-3">
          <span className={`inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] ${k.tint.split(" ")[1]}`}><k.icon size={13} strokeWidth={1.6} />{s.kind_label}</span>
          {s.mandatory && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11.5px] text-white">Required</span>}
        </div>
      </CoverArt>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[16px] leading-snug text-ink">{s.title}</h3>
        {s.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-faint">
          <span className="inline-flex items-center gap-1"><Timer size={13} /> {minutes} min</span>
          <span className="inline-flex items-center gap-1"><Lock size={13} /> {s.identity === "named" ? "Named" : s.identity === "optional" ? "Name optional" : "Anonymous"}</span>
          <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {closesIn(s.closes_at)}</span>
        </div>
        <Button variant="primary" className="mt-4 self-start" icon={Send} onClick={onTake}>Answer now</Button>
      </div>
    </article>
  );
}

function ForYou({ onTake, reloadKey }: { onTake: (uuid: string) => void; reloadKey: number }) {
  const [mine, setMine] = useState<{ pending: MySurvey[]; done: MySurvey[] } | null>(null);
  useEffect(() => { api.get<{ pending: MySurvey[]; done: MySurvey[] }>("/engagement/surveys/mine").then(setMine).catch(() => setMine({ pending: [], done: [] })); }, [reloadKey]);
  if (!mine) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-[15px] text-ink">Waiting for you {mine.pending.length > 0 && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[12px] text-white tabular">{mine.pending.length}</span>}</h2>
        {mine.pending.length === 0 ? (
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={24} strokeWidth={1.4} /></span>
            <div><p className="text-[15px] text-ink">You&apos;re all caught up</p><p className="text-[13.5px] text-muted">New surveys show up here and on Buzz.</p></div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.pending.map((s) => <PendingCard key={`${s.uuid}-${s.run}`} s={s} onTake={() => onTake(s.uuid)} />)}</div>
        )}
      </section>
      {mine.done.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] text-ink">Earlier</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {mine.done.map((s) => {
              const k = KIND_STYLE[s.kind] ?? KIND_STYLE.survey;
              return (
                <li key={`${s.uuid}-${s.run}`} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.tint}`}><k.icon size={17} strokeWidth={1.5} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{s.title}{s.run > 1 && <span className="text-faint"> · round {s.run}</span>}</span>
                    <span className="block text-[12.5px] text-faint">{s.status === "submitted" ? `Answered ${s.submitted_on ? formatDate(s.submitted_on, { day: "numeric", month: "short", year: "numeric" }, "UTC") : ""}` : `Closed ${s.closes_at ? formatRelative(s.closes_at) : ""}`}</span>
                  </span>
                  {s.status === "submitted" ? <Badge tone="good">Answered</Badge> : <Badge>Missed</Badge>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ── Manage ──────────────────────────────────────────────────────── */

function EnpsOverview({ onOpen }: { onOpen: (uuid: string) => void }) {
  const [data, setData] = useState<CompanyEnps | null>(null);
  const [split, setSplit] = useState<Enps | null>(null);
  useEffect(() => {
    api.get<CompanyEnps>("/engagement/surveys/enps").then((d) => {
      setData(d);
      if (d.latest) api.get<SurveyResults>(`/engagement/surveys/${d.latest.survey_uuid}/results`).then((r) => setSplit(r.questions.find((q) => q.enps)?.enps ?? null)).catch(() => {});
    }).catch(() => setData({ latest: null, change: null, points: [] }));
  }, []);
  if (!data) return <Skeleton className="h-64 rounded-2xl" />;
  const score = data.latest?.score ?? null;
  const tone = enpsTone(score);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle,#ddd6fe,transparent 70%)" }} />
      <div className="relative grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col items-center justify-center text-center">
          <p className="mb-1 text-[12px] uppercase tracking-[0.1em] text-faint">Employee NPS</p>
          <EnpsGauge score={score} size={200} />
          <p className={`text-[13.5px] ${tone.text}`}>{tone.label}</p>
          {data.change != null && (
            <p className={`mt-1 inline-flex items-center gap-1 text-[12.5px] ${data.change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {data.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{data.change >= 0 ? "+" : ""}{data.change} since last round
            </p>
          )}
        </div>
        <div className="flex flex-col justify-center">
          {data.latest ? (
            <>
              <p className="text-[14.5px] text-ink">{data.latest.survey}</p>
              <p className="mb-4 text-[12.5px] text-faint">{data.latest.responses} responses · {formatDate(data.latest.opens_at, { month: "long", year: "numeric" })}</p>
              {split ? <EnpsSplit enps={split} /> : <Skeleton className="h-16" />}
              <button type="button" onClick={() => onOpen(data.latest!.survey_uuid)} className="mt-4 self-start text-[13px] text-primary hover:underline">See full results →</button>
            </>
          ) : (
            <>
              <p className="text-[15px] text-ink">No eNPS score yet</p>
              <p className="mt-1 text-[13.5px] text-muted">Run a quarterly eNPS survey to see how likely people are to recommend working here, and how it changes.</p>
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-[13px] text-muted">Trend</p>
          <TrendChart metric="enps" height={170} points={data.points.map((p) => ({ label: formatDate(p.opens_at, { month: "short", year: "2-digit" }), value: p.score, responses: p.responses }))} />
        </div>
      </div>
    </section>
  );
}

const STARTS = [
  { kind: "survey" as const, title: "Survey", text: "Any questions, up to 60", icon: ClipboardList, bg: "linear-gradient(135deg,#e0f2fe,#ecfeff)", fg: "text-sky-700" },
  { kind: "pulse" as const, title: "Pulse check", text: "Four quick questions, ready to go", icon: SlidersHorizontal, bg: "linear-gradient(135deg,#dcfce7,#f7fee7)", fg: "text-emerald-700" },
  { kind: "enps" as const, title: "eNPS", text: "Repeats every quarter", icon: Gauge, bg: "linear-gradient(135deg,#ede9fe,#fdf2f8)", fg: "text-violet-700" },
];

function Manage({ onTake, onResults, reloadKey, reload }: { onTake: (uuid: string) => void; onResults: (uuid: string) => void; reloadKey: number; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<SurveyRow> | null>(null);
  const [builder, setBuilder] = useState<{ open: boolean; uuid: string | null; start: "survey" | "pulse" | "enps" }>({ open: false, uuid: null, start: "survey" });
  const [extend, setExtend] = useState<{ row: SurveyRow; days: number | null } | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), size: "20" });
    if (search) q.set("q", search);
    if (filters.status?.[0]) q.set("status", filters.status[0]);
    if (filters.kind?.[0]) q.set("kind", filters.kind[0]);
    api.get<Paged<SurveyRow>>(`/engagement/surveys?${q}`).then(setData).catch((e) => toast.error((e as Error).message));
  }, [page, search, filters, toast]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); load(); reload(); } catch (e) { toast.error((e as Error).message); }
  };

  const columns: Column<SurveyRow>[] = [
    {
      key: "title", header: "Survey", cell: (r) => {
        const k = KIND_STYLE[r.kind] ?? KIND_STYLE.survey;
        return (
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.tint}`}><k.icon size={17} strokeWidth={1.5} /></span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-ink">{r.title}</span>
              <span className="block truncate text-[12.5px] text-faint">{r.kind_label} · {r.questions_count} question{r.questions_count === 1 ? "" : "s"} · {r.identity === "named" ? "Named" : r.identity === "optional" ? "Name optional" : "Anonymous"}{r.mandatory ? " · Required" : ""}</span>
            </span>
          </div>
        );
      },
    },
    { key: "status", header: "Status", width: "110px", cell: (r) => <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"} dot>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: "responses", header: "Responses", width: "190px", hideBelow: "sm", cell: (r) => {
        if (r.status === "draft") return <span className="text-[13px] text-faint">–</span>;
        const pct = r.invited ? Math.round((r.responses * 100) / r.invited) : 0;
        return (
          <div className="w-40">
            <div className="flex justify-between text-[12.5px]"><span className="tabular text-ink">{r.responses}<span className="text-faint"> / {r.invited}</span></span><span className="tabular text-muted">{pct}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#a8a29e" }} /></div>
          </div>
        );
      },
    },
    {
      key: "audience", header: "For", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted">{r.audience_label}</span>,
    },
    {
      key: "when", header: "Schedule", width: "200px", hideBelow: "md", cell: (r) => (
        <span className="block text-[12.5px] text-muted">
          {r.recurrence !== "none" && <span className="flex items-center gap-1 text-ink"><Repeat size={12} /> {RECURRENCE_LABEL[r.recurrence]}{r.runs > 0 ? ` · round ${r.runs}` : ""}</span>}
          {r.status === "active" ? closesIn(r.closes_at) : r.status === "scheduled" && r.opens_at ? `Opens ${formatDate(r.opens_at, { day: "numeric", month: "short" })}` : r.status === "closed" && r.closes_at ? `Closed ${formatDate(r.closes_at, { day: "numeric", month: "short" })}` : r.status === "draft" ? "Not published" : ""}
        </span>
      ),
    },
  ];

  const rowActions = (r: SurveyRow): MenuItem[] => {
    const items: MenuItem[] = [];
    if (r.status !== "draft") items.push({ label: "Results", icon: BarChart3, onSelect: () => onResults(r.uuid) });
    items.push({ label: r.status === "draft" ? "Edit" : "Settings", icon: Pencil, onSelect: () => setBuilder({ open: true, uuid: r.uuid, start: r.kind }) });
    if (r.status === "draft") items.push({ label: "Publish", icon: Send, onSelect: () => act(() => api.post(`/engagement/surveys/${r.uuid}/publish`), "Survey published") });
    if (r.status === "active") {
      items.push({ label: "Preview", icon: Eye, onSelect: () => onTake(r.uuid) });
      items.push({ label: "Remind pending", icon: BellRing, onSelect: () => act(async () => { const x = await api.post<{ reminded: number }>(`/engagement/surveys/${r.uuid}/remind`); return x; }, "Reminders sent") });
    }
    if (r.status === "active" || r.status === "closed") items.push({ label: "Extend", icon: CalendarClock, onSelect: () => setExtend({ row: r, days: 3 }) });
    items.push({ label: "Copy", icon: Copy, onSelect: () => act(() => api.post(`/engagement/surveys/${r.uuid}/copy`), "Copied as a draft") });
    if (r.status === "active" || r.status === "scheduled") {
      items.push("separator");
      items.push({ label: "Close now", icon: Square, danger: true, onSelect: async () => {
        if (await confirm({ title: `Close ${r.title}?`, message: r.recurrence !== "none" ? "This stops the open round and every future round." : "People can no longer answer it.", confirmLabel: "Close survey", tone: "danger" }))
          act(() => api.post(`/engagement/surveys/${r.uuid}/close`), "Survey closed");
      } });
    }
    if (r.status === "draft") {
      items.push("separator");
      items.push({ label: "Delete", icon: Trash2, danger: true, onSelect: async () => {
        if (await confirm({ title: `Delete ${r.title}?`, message: "The draft is removed for good.", confirmLabel: "Delete", tone: "danger" }))
          act(() => api.delete(`/engagement/surveys/${r.uuid}`), "Draft deleted");
      } });
    }
    return items;
  };

  return (
    <div className="space-y-6">
      <EnpsOverview onOpen={onResults} />

      <section>
        <h2 className="mb-3 text-[15px] text-ink">Start something new</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STARTS.map((s) => (
            <button key={s.kind} type="button" onClick={() => setBuilder({ open: true, uuid: null, start: s.kind })}
              className="group flex items-center gap-4 rounded-2xl border border-line p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgba(30,27,75,.3)]" style={{ background: s.bg }}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 ${s.fg}`}><s.icon size={21} strokeWidth={1.5} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] text-ink">{s.title}</span><span className="block text-[12.5px] text-muted">{s.text}</span></span>
              <Plus size={18} className="text-faint transition group-hover:text-ink" />
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <FilterBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search surveys"
          values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
          filters={[
            { key: "status", label: "Status", options: [{ value: "active", label: "Open" }, { value: "scheduled", label: "Scheduled" }, { value: "draft", label: "Draft" }, { value: "closed", label: "Closed" }] },
            { key: "kind", label: "Type", options: [{ value: "survey", label: "Survey" }, { value: "pulse", label: "Pulse check" }, { value: "enps", label: "eNPS" }] },
          ]}
          actions={<Button variant="primary" icon={Plus} onClick={() => setBuilder({ open: true, uuid: null, start: "survey" })}>New survey</Button>} />
        <DataTable rows={data?.items ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!data}
          onRowClick={(r) => (r.status === "draft" ? setBuilder({ open: true, uuid: r.uuid, start: r.kind }) : onResults(r.uuid))}
          rowActions={rowActions}
          pagination={data && data.total > data.size ? { page, size: data.size, total: data.total, onPageChange: setPage } : undefined}
          emptyIcon={ClipboardList} emptyTitle="No surveys yet" emptyHint="Start with a pulse check or a quarterly eNPS." />
      </section>

      <SurveyBuilderModal open={builder.open} uuid={builder.uuid} start={builder.start} onClose={() => setBuilder((b) => ({ ...b, open: false }))} onSaved={() => { load(); reload(); }} />
      <Modal open={!!extend} onClose={() => setExtend(null)} size="sm" title="Keep the survey open longer"
        footer={<><Button variant="ghost" onClick={() => setExtend(null)}>Cancel</Button>
          <Button variant="primary" disabled={!extend?.days} onClick={() => { const e = extend!; setExtend(null); act(() => api.post(`/engagement/surveys/${e.row.uuid}/extend`, { days: e.days }), `Extended by ${e.days} day${e.days === 1 ? "" : "s"}`); }}>Extend</Button></>}>
        <p className="mb-3 text-[13.5px] text-muted">{extend?.row.title}{extend?.row.closes_at ? ` closes ${formatRelative(extend.row.closes_at)}.` : "."} A closed round opens again.</p>
        <NumberInput value={extend?.days ?? null} onChange={(v) => setExtend((e) => (e ? { ...e, days: v } : e))} min={1} max={30} suffix="days" />
      </Modal>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

function SurveysInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useEngagementMeta();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const canManage = !!meta?.can_manage_surveys;
  const tab = params.get("tab") === "manage" && canManage ? "manage" : "mine";
  const take = params.get("take");
  const results = params.get("results");

  const setParam = useCallback((k: string, v: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v); else sp.delete(k);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  const closeTake = useCallback(() => setParam("take", null), [setParam]);
  const closeResults = useCallback(() => setParam("results", null), [setParam]);

  // the company owner has nothing to answer: open on the manage view
  useEffect(() => {
    if (meta && meta.can_manage_surveys && !meta.me.employee_uuid && !params.get("tab")) setParam("tab", "manage");
  }, [meta, params, setParam]);

  const tabs = useMemo(() => [{ value: "mine", label: "For you" }, ...(canManage ? [{ value: "manage", label: "Manage" }] : [])], [canManage]);

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line" style={{ background: "linear-gradient(120deg,#ecfeff 0%,#eef2ff 50%,#fdf4ff 100%)" }}>
        <svg viewBox="0 0 420 180" className="pointer-events-none absolute bottom-0 right-0 hidden h-[170px] w-auto md:block" aria-hidden>
          <circle cx="330" cy="70" r="46" fill="#c4b5fd" opacity=".5" />
          <rect x="230" y="40" width="120" height="120" rx="18" fill="#fff" opacity=".85" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx="254" cy={72 + i * 30} r="7" fill="none" stroke={["#8b5cf6", "#10b981", "#f59e0b"][i]} strokeWidth="2.5" />
              {i === 0 && <circle cx="254" cy="72" r="3.2" fill="#8b5cf6" />}
              <rect x="270" y={68 + i * 30} width={[60, 44, 52][i]} height="8" rx="4" fill="#e7e5e4" />
            </g>
          ))}
          <g transform="translate(360 120)">
            <rect x="0" y="20" width="12" height="30" rx="3" fill="#fb7185" />
            <rect x="16" y="6" width="12" height="44" rx="3" fill="#fbbf24" />
            <rect x="32" y="-10" width="12" height="60" rx="3" fill="#34d399" />
          </g>
          <path d="M40 160 Q 140 110 220 150 T 420 140 L420 180 L40 180Z" fill="#a5f3fc" opacity=".45" />
        </svg>
        <div className="relative max-w-xl px-6 py-7 md:px-8">
          <p className="text-[12px] uppercase tracking-[0.12em] text-primary/80">Engage</p>
          <h1 className="mt-1 text-[28px] font-light leading-tight text-ink">Surveys</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">Quick, honest feedback. Anonymous answers stay anonymous: results only show once enough people answer.</p>
        </div>
      </section>

      {tabs.length > 1 && <Tabs value={tab} onChange={(v) => setParam("tab", v === "mine" ? null : v)} items={tabs} className="mb-6" />}
      {tab === "manage" ? <Manage onTake={(u) => setParam("take", u)} onResults={(u) => setParam("results", u)} reloadKey={reloadKey} reload={reload} />
        : <ForYou onTake={(u) => setParam("take", u)} reloadKey={reloadKey} />}

      <TakeSurveyModal uuid={take} onClose={closeTake} onDone={reload} />
      <SurveyResultsModal uuid={results} onClose={closeResults} />
    </div>
  );
}

export default function SurveysPage() {
  return <Suspense fallback={null}><SurveysInner /></Suspense>;
}
