"use client";

/*
 * Side panels for Buzz and the home page.
 *   <CelebrationsWidget data onWish />   today, this week and upcoming birthdays / anniversaries
 *   <LeaderboardWidget />                 this month's most appreciated people
 *   <TrendingWidget onTag />              popular #hashtags
 *   <NewJoinersWidget people />           say hello to new colleagues
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Cake, ChevronRight, Gift, Hash, PartyPopper, Sparkles, Trophy, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { Avatar } from "@/components/ui-kit";
import type { CelebrationItem, Celebrations, Leaderboard, Person } from "./types";

function Panel({ title, icon: Icon, tint, action, children, className = "" }: {
  title: string; icon: typeof Cake; tint: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h3 className="flex items-center gap-2 text-[14.5px] text-ink">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon size={15} strokeWidth={1.5} /></span>{title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

const KIND_ICON = { birthday: Cake, work_anniversary: Award, wedding_anniversary: Gift, welcome: UserPlus };

function when(item: CelebrationItem) {
  if (item.days_away === 0) return "Today";
  if (item.days_away === 1) return "Tomorrow";
  return formatDate(item.date, { weekday: "short", day: "numeric", month: "short", year: undefined }, "UTC");
}

function CelebrationRow({ item, onWish }: { item: CelebrationItem; onWish: (item: CelebrationItem) => void }) {
  const Icon = KIND_ICON[item.kind] ?? Cake;
  const label = item.kind === "birthday" ? "Birthday" : item.kind === "work_anniversary" ? `${item.years} yr${item.years === 1 ? "" : "s"} at work` : item.label;
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className="relative">
        <Avatar name={item.person.name} src={item.person.image} size={36} />
        <span className={`absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-surface ${item.kind === "birthday" ? "bg-pink-500" : "bg-amber-500"} text-white`} style={{ width: 18, height: 18 }}>
          <Icon size={10} strokeWidth={2} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-ink">{item.is_me ? "You" : item.person.name}</span>
        <span className="block truncate text-[12px] text-faint">{label} · {when(item)}</span>
      </span>
      {!item.is_me && item.days_away === 0 && (
        item.wished ? <span className="text-[12px] text-emerald-700">Wished ✓</span>
          : <button type="button" onClick={() => onWish(item)} className="rounded-full bg-pink-50 px-2.5 py-1 text-[12px] text-pink-700 hover:bg-pink-100">Wish</button>
      )}
    </li>
  );
}

export function CelebrationsWidget({ data, onWish, compact }: { data: Celebrations | null; onWish: (item: CelebrationItem) => void; compact?: boolean }) {
  const [more, setMore] = useState(false);
  if (!data) return <Panel title="Celebrations" icon={PartyPopper} tint="bg-pink-50 text-pink-600"><div className="h-28 animate-pulse" /></Panel>;
  const soon = [...data.this_week, ...data.upcoming];
  const shownSoon = more ? soon : soon.slice(0, compact ? 3 : 4);
  return (
    <Panel title="Celebrations" icon={PartyPopper} tint="bg-pink-50 text-pink-600">
      {data.today.length > 0 && (
        <div className="relative mx-3 mb-2 overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg,#fdf2f8,#fef3c7)" }}>
          <svg viewBox="0 0 300 60" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => <rect key={i} x={(i * 47) % 300} y={(i * 23) % 60} width="4" height="7" rx="1" fill={["#f472b6", "#f59e0b", "#818cf8", "#34d399"][i % 4]} opacity=".5" transform={`rotate(${i * 33} ${(i * 47) % 300} ${(i * 23) % 60})`} />)}
          </svg>
          <p className="relative px-3 pt-2.5 text-[11px] uppercase tracking-[0.12em] text-pink-700">Today</p>
          <ul className="relative pb-1">{data.today.map((i) => <CelebrationRow key={`${i.kind}-${i.person.uuid}`} item={i} onWish={onWish} />)}</ul>
        </div>
      )}
      {soon.length > 0 ? (
        <>
          <p className="px-4 pt-1 text-[11px] uppercase tracking-[0.12em] text-faint">Coming up</p>
          <ul>{shownSoon.map((i) => <CelebrationRow key={`${i.kind}-${i.person.uuid}-${i.date}`} item={i} onWish={onWish} />)}</ul>
          {soon.length > shownSoon.length && <button type="button" onClick={() => setMore(true)} className="px-4 pb-3 text-[12.5px] text-muted hover:text-ink">Show {soon.length - shownSoon.length} more</button>}
        </>
      ) : data.today.length === 0 && <p className="px-4 pb-4 text-[13px] text-faint">No birthdays or anniversaries in the next two weeks.</p>}
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-faint">A small message can make someone&apos;s day.</p>
    </Panel>
  );
}

export function NewJoinersWidget({ people, onHello }: { people: Person[]; onHello?: (p: Person) => void }) {
  if (!people.length) return null;
  return (
    <Panel title="New joiners" icon={UserPlus} tint="bg-sky-50 text-sky-600">
      <ul className="pb-2">
        {people.slice(0, 5).map((p) => (
          <li key={p.uuid} className="flex items-center gap-3 px-4 py-2">
            <Avatar name={p.name} src={p.image} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
              <span className="block truncate text-[12px] text-faint">{p.title || p.department || "New colleague"}</span>
            </span>
            {onHello && <button type="button" onClick={() => onHello(p)} className="rounded-full bg-sky-50 px-2.5 py-1 text-[12px] text-sky-700 hover:bg-sky-100">Say hi 👋</button>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function LeaderboardWidget({ period = "month" }: { period?: "month" | "quarter" }) {
  const [data, setData] = useState<Leaderboard | null>(null);
  useEffect(() => { api.get<Leaderboard>(`/engagement/kudos/leaderboard?period=${period}`).then(setData).catch(() => {}); }, [period]);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <Panel title="Most appreciated" icon={Trophy} tint="bg-amber-50 text-amber-600"
      action={<Link href="/dashboard/kudos?tab=leaderboard" className="flex items-center text-[12.5px] text-primary">All <ChevronRight size={14} /></Link>}>
      {!data ? <div className="h-24 animate-pulse" /> : data.leaders.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-faint">No kudos yet this {period}. Be the first to thank someone.</p>
      ) : (
        <ol className="pb-2">
          <li className="px-4 pb-1 text-[11px] uppercase tracking-[0.12em] text-faint">{data.label}</li>
          {data.leaders.slice(0, 5).map((l) => (
            <li key={l.person.uuid} className="flex items-center gap-3 px-4 py-1.5">
              <span className="w-5 text-center text-[14px] tabular text-faint">{medal[l.rank - 1] ?? l.rank}</span>
              <Avatar name={l.person.name} src={l.person.image} size={30} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{l.person.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] tabular text-amber-700"><Sparkles size={11} strokeWidth={1.6} />{l.points}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function TrendingWidget({ active, onTag }: { active?: string | null; onTag: (tag: string | null) => void }) {
  const [tags, setTags] = useState<{ tag: string; count: number }[] | null>(null);
  useEffect(() => { api.get<{ tag: string; count: number }[]>("/engagement/feed/trending").then(setTags).catch(() => setTags([])); }, []);
  if (tags && !tags.length) return null;
  return (
    <Panel title="Trending" icon={Hash} tint="bg-violet-50 text-violet-600">
      <div className="flex flex-wrap gap-1.5 px-4 pb-4 pt-1">
        {(tags ?? []).map((t) => (
          <button key={t.tag} type="button" onClick={() => onTag(active === t.tag ? null : t.tag)}
            className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${active === t.tag ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>
            #{t.tag}
          </button>
        ))}
      </div>
    </Panel>
  );
}

export { Panel as WidgetPanel };
