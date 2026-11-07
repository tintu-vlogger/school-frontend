"use client";

/*
 * Kudos pieces shared by the Kudos page and the employee profile.
 *   <KudosTile k={card} />                one kudos as a coloured card
 *   <BadgeShelf badges={values} />       badges someone has received, with counts
 *   <ProfileKudos employeeUuid name />   profile summary: totals, badges and recent kudos
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { Avatar, Button } from "@/components/ui-kit";
import { PostText } from "./text";
import type { KudosCard, KudosValue } from "./types";

export type KudosProfile = { received: number; points: number; given: number; badges: KudosValue[]; recent: KudosCard[] };

export function KudosTile({ k, compact = false }: { k: KudosCard; compact?: boolean }) {
  const v = k.value;
  const accent = v?.accent ?? "#d98a06", soft = v?.soft ?? "#fdf3dc";
  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-2xl border bg-surface transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(15,23,42,.18)]"
      style={{ borderColor: `${accent}2e` }}>
      <div className="relative overflow-hidden px-4 pb-3 pt-4" style={{ background: `linear-gradient(135deg, ${soft} 0%, #ffffff 100%)` }}>
        <svg viewBox="0 0 200 80" className="pointer-events-none absolute -right-6 -top-2 h-24 w-56 opacity-70" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={40 + i * 28} cy={14 + ((i * 29) % 52)} r={2.5 + (i % 3) * 2} fill={accent} fillOpacity={0.14 + (i % 3) * 0.08} />)}
          <path d="M168 18 l5 11 l12 2 l-9 8 l2 12 l-10 -6 l-10 6 l2 -12 l-9 -8 l12 -2z" fill={accent} fillOpacity=".28" />
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[22px] transition-transform group-hover:-rotate-6 group-hover:scale-110"
            style={{ boxShadow: `inset 0 0 0 1px ${accent}30` }}>{v?.emoji ?? "👏"}</span>
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-[0.14em]" style={{ color: accent }}>{v?.name ?? "Kudos"}</p>
            {k.points > 0 && <p className="text-[12px] tabular text-muted">+{k.points} points</p>}
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {k.recipients.map((r) => (
            <span key={r.uuid} className="inline-flex items-center gap-1.5 rounded-full bg-white/85 py-0.5 pl-0.5 pr-2.5 text-[13px] text-ink">
              <Avatar name={r.name} src={r.image} size={22} />{r.name}
            </span>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-3">
        <PostText body={k.message} clamp={compact ? 160 : 320} className="text-[14px] leading-relaxed text-ink" />
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-faint">
          <Avatar name={k.giver?.name ?? "?"} src={k.giver?.image} size={18} />
          <span className="truncate">from {k.giver?.name ?? "someone"} · {formatRelative(k.created_at)}</span>
        </p>
      </div>
    </article>
  );
}

export function BadgeShelf({ badges, empty = "No badges yet." }: { badges: KudosValue[]; empty?: string }) {
  if (!badges.length) return <p className="text-[13px] text-faint">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span key={b.uuid} title={b.description ?? b.name}
          className="inline-flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3" style={{ background: b.soft, borderColor: `${b.accent}33` }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-[16px]">{b.emoji}</span>
          <span className="text-[13px] text-ink">{b.name}</span>
          {b.count ? <span className="rounded-full bg-white/80 px-1.5 text-[11.5px] tabular" style={{ color: b.accent }}>×{b.count}</span> : null}
        </span>
      ))}
    </div>
  );
}

export function ProfileKudos({ employeeUuid, name, onGive }: { employeeUuid: string; name?: string; onGive?: () => void }) {
  const [data, setData] = useState<KudosProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    api.get<KudosProfile>(`/engagement/kudos/profile/${employeeUuid}`).then(setData).catch(() => setFailed(true));
  }, [employeeUuid]);
  if (failed) return null;
  const first = name?.split(" ")[0];
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5" style={{ background: "linear-gradient(120deg,#fffbeb,#fdf2f8)" }}>
        <h3 className="flex items-center gap-2 text-[15px] text-ink"><Award size={17} strokeWidth={1.5} className="text-amber-600" /> Kudos</h3>
        <div className="flex items-center gap-2">
          {onGive && <Button size="sm" icon={Sparkles} onClick={onGive}>Give kudos</Button>}
          <Link href={`/dashboard/kudos?person=${employeeUuid}`} className="flex items-center text-[12.5px] text-primary">All <ChevronRight size={14} /></Link>
        </div>
      </header>
      {!data ? <div className="h-32 animate-pulse" /> : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-3">
            {[["Received", data.received], ["Points", data.points], ["Given", data.given]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-sunken px-3 py-2.5">
                <p className="text-[22px] font-light tabular text-ink">{n}</p>
                <p className="text-[12px] text-faint">{l}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-faint">Badges</p>
            <BadgeShelf badges={data.badges} empty={`${first ?? "They"} ${first ? "hasn't" : "haven't"} received kudos yet.`} />
          </div>
          {data.recent.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-faint">Recent</p>
              <div className="grid gap-3 md:grid-cols-2">{data.recent.slice(0, 4).map((k) => <KudosTile key={k.uuid} k={k} compact />)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
