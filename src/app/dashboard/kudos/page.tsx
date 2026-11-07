"use client";

/*
 * Kudos: the wall of thanks, month and quarter leaderboards, and my kudos.
 * Address options: ?tab=wall|leaderboard|mine, ?person=<employee uuid> shows kudos one
 * person received, ?value=<value uuid> filters the wall by badge.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Award, ChevronLeft, ChevronRight, Crown, Gift, HeartHandshake, Sparkles, Trophy, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Avatar, Button, Tabs } from "@/components/ui-kit";
import { useEngagementMeta } from "@/components/engagement/context";
import { GiveKudosModal, useKudosValues } from "@/components/engagement/kudos-modal";
import { BadgeShelf, KudosTile, type KudosProfile } from "@/components/engagement/kudos-ui";
import { EngagementStyles } from "@/components/engagement/text";
import type { KudosCard, Leaderboard, Paged, Person } from "@/components/engagement/types";

type Tab = "wall" | "leaderboard" | "mine";

function HeroArt() {
  return (
    <svg viewBox="0 0 420 200" className="pointer-events-none absolute bottom-0 right-0 hidden h-[200px] w-auto md:block" aria-hidden>
      <defs>
        <linearGradient id="kd-trophy" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fcd34d" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
        <linearGradient id="kd-hill" x1="0" x2="1"><stop offset="0" stopColor="#fde68a" stopOpacity=".5" /><stop offset="1" stopColor="#fbcfe8" stopOpacity=".8" /></linearGradient>
      </defs>
      <path d="M0 200 C90 150 170 170 240 150 C310 130 360 150 420 120 L420 200Z" fill="url(#kd-hill)" />
      <g transform="translate(250 40)">
        <path d="M20 0 h70 v30 a35 35 0 0 1 -70 0z" fill="url(#kd-trophy)" />
        <path d="M20 8 h-14 a14 14 0 0 0 14 26 M90 8 h14 a14 14 0 0 1 -14 26" fill="none" stroke="#f59e0b" strokeWidth="5" />
        <rect x="47" y="64" width="16" height="22" fill="#f59e0b" /><rect x="30" y="86" width="50" height="12" rx="3" fill="#b45309" />
        <path d="M55 14 l4 9 l10 1 l-7 7 l2 10 l-9 -5 l-9 5 l2 -10 l-7 -7 l10 -1z" fill="#fff" fillOpacity=".85" />
      </g>
      {[[200, 50, "#f472b6"], [380, 40, "#818cf8"], [225, 110, "#34d399"], [390, 95, "#f59e0b"], [180, 20, "#f59e0b"], [360, 150, "#f472b6"]].map(([x, y, c], i) => (
        <path key={i} d={`M${x} ${y} l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1z`} fill={c as string} opacity=".75" className="kd-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
      <circle cx="150" cy="140" r="22" fill="#fff" opacity=".6" /><text x="150" y="148" fontSize="22" textAnchor="middle">👏</text>
      <circle cx="330" cy="175" r="16" fill="#fff" opacity=".6" /><text x="330" y="181" fontSize="16" textAnchor="middle">💛</text>
    </svg>
  );
}

function Podium({ data }: { data: Leaderboard }) {
  const top = data.leaders.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const heights = [96, 128, 76];
  const tones = [["#e2e8f0", "#94a3b8"], ["#fde68a", "#f59e0b"], ["#fed7aa", "#ea8a3a"]];
  const place = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-3 px-4 pt-6 sm:gap-6">
      {order.map((l, i) => l ? (
        <div key={l.person.uuid} className="kd-rise flex w-28 flex-col items-center sm:w-36" style={{ animationDelay: `${i * 0.12}s` }}>
          {place[i] === 1 && <Crown size={22} strokeWidth={1.6} className="mb-1 text-amber-500" />}
          <span className="rounded-full p-[3px]" style={{ background: `linear-gradient(135deg, ${tones[i][0]}, ${tones[i][1]})` }}>
            <span className="block rounded-full border-2 border-surface"><Avatar name={l.person.name} src={l.person.image} size={place[i] === 1 ? 72 : 56} /></span>
          </span>
          <p className="mt-2 w-full truncate text-center text-[14px] text-ink">{l.person.name}</p>
          <p className="truncate text-center text-[12px] text-faint">{l.person.title || l.person.department || ""}</p>
          <div className="mt-2 flex w-full flex-col items-center justify-start rounded-t-2xl pt-3"
            style={{ height: heights[i], background: `linear-gradient(180deg, ${tones[i][0]}, ${tones[i][0]}55)` }}>
            <span className="text-[26px] font-light tabular" style={{ color: tones[i][1] }}>{place[i]}</span>
            <span className="text-[12.5px] tabular text-ink/70">{l.points} pts · {l.kudos} kudos</span>
          </div>
        </div>
      ) : <div key={i} className="w-28 sm:w-36" />)}
    </div>
  );
}

function LeaderboardView() {
  const [period, setPeriod] = useState<"month" | "quarter">("month");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Leaderboard | null>(null);
  useEffect(() => {
    setData(null);
    api.get<Leaderboard>(`/engagement/kudos/leaderboard?period=${period}&offset=${offset}`).then(setData).catch(() => setData(null));
  }, [period, offset]);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-1 rounded-full bg-sunken p-1">
            {(["month", "quarter"] as const).map((p) => (
              <button key={p} type="button" onClick={() => { setPeriod(p); setOffset(0); }}
                className={`h-8 rounded-full px-4 text-[13px] transition-colors ${period === p ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {p === "month" ? "Month" : "Quarter"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Earlier" onClick={() => setOffset((o) => Math.min(24, o + 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"><ChevronLeft size={17} /></button>
            <span className="min-w-[150px] text-center text-[14px] text-ink">{data?.label ?? "…"}</span>
            <button type="button" aria-label="Later" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink disabled:opacity-30"><ChevronRight size={17} /></button>
          </div>
        </header>
        {!data ? <div className="h-80 animate-pulse" /> : data.leaders.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <Trophy size={30} strokeWidth={1.2} className="mx-auto text-amber-400" />
            <p className="mt-3 text-[15px] text-ink">No kudos in {data.label}</p>
            <p className="text-[13.5px] text-muted">The leaderboard fills up as people thank each other.</p>
          </div>
        ) : (
          <>
            <div style={{ background: "radial-gradient(ellipse at top, #fffbeb 0%, transparent 70%)" }}><Podium data={data} /></div>
            <ol className="divide-y divide-line/70 border-t border-line">
              {data.leaders.slice(3).map((l) => (
                <li key={l.person.uuid} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-6 text-center text-[13px] tabular text-faint">{l.rank}</span>
                  <Avatar name={l.person.name} src={l.person.image} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{l.person.name}</span>
                    <span className="block truncate text-[12px] text-faint">{l.person.title || l.person.department || ""}</span>
                  </span>
                  <span className="text-[12.5px] tabular text-muted">{l.kudos} kudos</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[12.5px] tabular text-amber-700"><Sparkles size={11} />{l.points}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{data?.label ?? ""}</p>
          <p className="mt-1 text-[34px] font-light tabular text-ink">{data?.total_kudos ?? "–"}</p>
          <p className="text-[13px] text-muted">kudos given</p>
        </section>
        <section className="rounded-2xl border border-line bg-surface">
          <h3 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[14.5px] text-ink"><HeartHandshake size={16} strokeWidth={1.5} className="text-pink-600" /> Most generous</h3>
          {(data?.top_givers ?? []).length === 0 ? <p className="px-4 pb-4 text-[13px] text-faint">Nobody yet.</p> : (
            <ul className="pb-2">{data!.top_givers.map((g) => (
              <li key={g.person.uuid} className="flex items-center gap-3 px-4 py-1.5">
                <Avatar name={g.person.name} src={g.person.image} size={28} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{g.person.name}</span>
                <span className="text-[12.5px] tabular text-muted">{g.given} given</span>
              </li>
            ))}</ul>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-surface">
          <h3 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[14.5px] text-ink"><Award size={16} strokeWidth={1.5} className="text-amber-600" /> Values in action</h3>
          {(data?.top_values ?? []).length === 0 ? <p className="px-4 pb-4 text-[13px] text-faint">Nothing yet.</p> : (
            <ul className="space-y-2 px-4 pb-4">{data!.top_values.map((v) => {
              const max = Math.max(...data!.top_values.map((x) => x.count ?? 0), 1);
              return (
                <li key={v.uuid}>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-ink">{v.emoji} {v.name}</span><span className="tabular text-muted">{v.count}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: `${((v.count ?? 0) / max) * 100}%`, background: v.accent }} /></div>
                </li>
              );
            })}</ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Wall({ path, empty }: { path: string; empty: React.ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<KudosCard[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (p: number) => {
    setBusy(true);
    try {
      const r = await api.get<Paged<KudosCard>>(`${path}${path.includes("?") ? "&" : "?"}page=${p}&size=18`);
      setItems((cur) => (p === 1 ? r.items : [...(cur ?? []), ...r.items])); setTotal(r.total); setPage(p);
    } catch (e) { toast.error((e as Error).message); setItems((c) => c ?? []); }
    finally { setBusy(false); }
  }, [path, toast]);
  useEffect(() => { setItems(null); load(1); }, [load]);
  if (items === null) return <div className="columns-1 gap-4 md:columns-2 xl:columns-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="mb-4 h-48 animate-pulse rounded-2xl bg-surface" />)}</div>;
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>*]:mb-4">{items.map((k) => <KudosTile key={k.uuid} k={k} />)}</div>
      {items.length < total && <div className="flex justify-center"><Button loading={busy} onClick={() => load(page + 1)}>Show more</Button></div>}
    </>
  );
}

function EmptyWall({ onGive, text }: { onGive?: () => void; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <div className="text-[40px]">🙌</div>
      <p className="mt-2 text-[15px] text-ink">{text}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">A few kind words about something specific go a long way.</p>
      {onGive && <Button className="mt-4" variant="primary" icon={Sparkles} onClick={onGive}>Give kudos</Button>}
    </div>
  );
}

function KudosPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useEngagementMeta();
  const values = useKudosValues();
  const tab = (params.get("tab") as Tab) || "wall";
  const person = params.get("person");
  const value = params.get("value");
  const [giving, setGiving] = useState<Person | null | undefined>(undefined);
  const [mineMode, setMineMode] = useState<"received" | "given">("received");
  const [me, setMe] = useState<KudosProfile | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const myUuid = meta?.me.employee_uuid ?? null;

  const setParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
    router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (!myUuid) return;
    api.get<KudosProfile>(`/engagement/kudos/profile/${myUuid}`).then(setMe).catch(() => {});
  }, [myUuid, nonce]);
  useEffect(() => {
    if (!person) { setPersonName(null); return; }
    api.get<Person[]>(`/engagement/people?limit=30`).then((rows) => setPersonName(rows.find((p) => p.uuid === person)?.name ?? null)).catch(() => {});
  }, [person]);

  const wallPath = useMemo(() => {
    const q = new URLSearchParams();
    if (person) q.set("employee", person);
    if (value) q.set("value", value);
    return `/engagement/kudos${q.toString() ? `?${q}` : ""}`;
  }, [person, value]);

  const canGive = meta?.kudos_enabled !== false;
  const tabs = [
    { value: "wall" as const, label: "Wall of thanks" },
    ...(meta?.show_leaderboard !== false ? [{ value: "leaderboard" as const, label: "Leaderboard" }] : []),
    ...(myUuid ? [{ value: "mine" as const, label: "My kudos" }] : []),
  ];

  return (
    <div>
      <EngagementStyles />
      <style>{`
        @keyframes kd-twinkle { 0%,100% { transform: scale(1); opacity:.75 } 50% { transform: scale(1.25); opacity:1 } }
        .kd-twinkle { transform-box: fill-box; transform-origin: center; animation: kd-twinkle 2.6s ease-in-out infinite; }
        @keyframes kd-rise { from { transform: translateY(16px); opacity: 0 } to { transform: none; opacity: 1 } }
        .kd-rise { animation: kd-rise .5s cubic-bezier(.2,.8,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .kd-twinkle, .kd-rise { animation: none } }
      `}</style>

      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line" style={{ background: "linear-gradient(120deg,#fffbeb 0%,#fdf2f8 60%,#eef2ff 100%)" }}>
        <HeroArt />
        <div className="relative max-w-2xl px-6 py-7 md:px-8">
          <p className="text-[12px] uppercase tracking-[0.12em] text-amber-700/80">Kudos</p>
          <h1 className="mt-1 text-[28px] font-light leading-tight text-ink">Say thank you, out loud</h1>
          <p className="mt-1.5 max-w-lg text-[14.5px] text-muted">Recognise colleagues for living the company&apos;s values. Every kudos shows on Buzz and on their profile.</p>
          {me && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[[Gift, `${me.received} received`], [Sparkles, `${me.points} points`], [HeartHandshake, `${me.given} given`]].map(([Icon, t], i) => {
                const I = Icon as typeof Gift;
                return <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-3 py-1 text-[13px] text-ink"><I size={14} strokeWidth={1.5} className="text-amber-600" />{t as string}</span>;
              })}
            </div>
          )}
          {canGive && <div className="mt-4"><Button variant="primary" icon={Sparkles} onClick={() => setGiving(null)}>Give kudos</Button></div>}
        </div>
      </section>

      <Tabs value={tabs.some((t) => t.value === tab) ? tab : "wall"} onChange={(t) => setParams({ tab: t === "wall" ? null : t })} items={tabs} className="mb-5" />

      {tab === "leaderboard" && meta?.show_leaderboard !== false ? <LeaderboardView /> : tab === "mine" && myUuid ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-faint">My badges</p>
            <BadgeShelf badges={me?.badges ?? []} empty="Badges appear here when colleagues thank you." />
          </section>
          <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-sm ring-1 ring-line w-fit">
            {(["received", "given"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMineMode(m)}
                className={`h-8 rounded-full px-4 text-[13px] ${mineMode === m ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{m === "received" ? "Received" : "Given"}</button>
            ))}
          </div>
          <Wall key={`${mineMode}-${nonce}`} path={`/engagement/kudos?mine=${mineMode}`}
            empty={<EmptyWall text={mineMode === "received" ? "No kudos received yet" : "You haven't given kudos yet"} onGive={canGive && mineMode === "given" ? () => setGiving(null) : undefined} />} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setParams({ value: null })}
              className={`h-8 rounded-full px-3.5 text-[13px] transition-colors ${!value ? "bg-ink text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>All values</button>
            {(values ?? []).map((v) => (
              <button key={v.uuid} type="button" onClick={() => setParams({ value: value === v.uuid ? null : v.uuid })}
                className="h-8 rounded-full border px-3 text-[13px] transition-colors"
                style={value === v.uuid ? { background: v.soft, borderColor: v.accent, color: v.accent } : undefined}>
                <span className={value === v.uuid ? "" : "text-muted"}>{v.emoji} {v.name}</span>
              </button>
            ))}
          </div>
          {person && (
            <div className="flex items-center gap-2 text-[13.5px] text-muted">
              Showing kudos for
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-primary">{personName ?? "this person"}
                <button type="button" aria-label="Clear" onClick={() => setParams({ person: null })}><X size={13} /></button></span>
            </div>
          )}
          <Wall key={`${wallPath}-${nonce}`} path={wallPath}
            empty={<EmptyWall text={person || value ? "No kudos match" : "No kudos yet"} onGive={canGive ? () => setGiving(null) : undefined} />} />
        </div>
      )}

      <GiveKudosModal open={giving !== undefined} to={giving ?? null} onClose={() => setGiving(undefined)} onGiven={() => setNonce((n) => n + 1)} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><KudosPage /></Suspense>;
}
