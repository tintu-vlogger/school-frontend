"use client";

/*
 * Engagement strip for the Overview page: today's celebrations, the latest announcement,
 * a Buzz preview and anything waiting for the signed-in person (GET /engagement/home).
 *   <EngagementOverview />
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Cake, ChevronRight, ClipboardList, Gift, Heart, Megaphone, MessageCircle, PartyPopper, Rss, UserPlus } from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/datetime";
import { Avatar } from "@/components/ui-kit";
import { CoverArt } from "./art";
import type { AnnouncementCard, CelebrationItem, Person, Post } from "./types";

type Home = {
  celebrations: { today: CelebrationItem[]; this_week: CelebrationItem[]; new_joiners: Person[] };
  announcement: AnnouncementCard | null;
  posts: Post[];
  pending_surveys: { uuid: string; title: string; mandatory: boolean }[];
  pending_acks: number;
};

const KIND_ICON = { birthday: Cake, work_anniversary: Award, wedding_anniversary: Gift, welcome: UserPlus };
const KIND_WORD: Record<string, string> = {
  birthday: "Birthday", work_anniversary: "Work anniversary", wedding_anniversary: "Wedding anniversary", welcome: "Joined today",
};

function Card({ title, icon: Icon, tint, href, link, children, className = "" }: {
  title: string; icon: typeof Cake; tint: string; href: string; link: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] text-ink">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon size={15} strokeWidth={1.5} /></span>{title}
        </h2>
        <Link href={href} className="flex items-center text-[12.5px] text-primary">{link} <ChevronRight size={14} /></Link>
      </header>
      {children}
    </section>
  );
}

function postLine(p: Post): { icon: string; text: string } {
  if (p.kind === "kudos" && p.kudos) return { icon: p.kudos.value?.emoji ?? "👏", text: `${p.author.name} gave kudos to ${p.kudos.recipients.map((r) => r.name.split(" ")[0]).join(", ")}` };
  if (p.kind === "birthday" && p.subject) return { icon: "🎂", text: `It's ${p.subject.name}'s birthday` };
  if (p.kind === "work_anniversary" && p.subject) return { icon: "🎉", text: `${p.subject.name} completes ${p.years} year${p.years === 1 ? "" : "s"}` };
  if (p.kind === "welcome" && p.subject) return { icon: "👋", text: `Welcome ${p.subject.name}` };
  if (p.kind === "announcement" && p.announcement) return { icon: "📣", text: p.announcement.title };
  if (p.kind === "survey" && p.survey) return { icon: "📋", text: p.survey.title };
  if (p.poll) return { icon: "📊", text: p.body?.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1") || "A new poll" };
  return { icon: "", text: p.body?.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1") || (p.attachments.length ? "Shared a photo" : "") };
}

export function EngagementOverview() {
  const [d, setD] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<Home>("/engagement/home").then(setD).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  if (!d) return <div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />)}</div>;

  const today = d.celebrations.today;
  const soon = d.celebrations.this_week.filter((c) => c.days_away > 0).slice(0, 4);
  const waiting = d.pending_acks + d.pending_surveys.length;
  const a = d.announcement;

  return (
    <div className="space-y-4">
      {waiting > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-2.5 text-[13.5px]">
          <span className="text-ink">Waiting for you:</span>
          {d.pending_acks > 0 && <Link href="/dashboard/announcements?tab=pending" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-amber-800 shadow-sm hover:shadow"><Megaphone size={13} /> {d.pending_acks} announcement{d.pending_acks === 1 ? "" : "s"} to acknowledge</Link>}
          {d.pending_surveys.map((s) => (
            <Link key={s.uuid} href={`/dashboard/surveys?take=${s.uuid}`} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sky-800 shadow-sm hover:shadow">
              <ClipboardList size={13} /> {s.title}{s.mandatory ? " · required" : ""}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Celebrations */}
        <Card title="Celebrations" icon={PartyPopper} tint="bg-pink-50 text-pink-600" href="/dashboard/buzz?filter=celebrations" link="Buzz">
          {today.length > 0 ? (
            <div className="relative mx-4 mb-3 overflow-hidden rounded-xl px-3 py-2" style={{ background: "linear-gradient(135deg,#fdf2f8,#fef3c7)" }}>
              <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => <rect key={i} x={(i * 53) % 300} y={(i * 29) % 80} width="4" height="8" rx="1" fill={["#f472b6", "#f59e0b", "#818cf8", "#34d399"][i % 4]} opacity=".28" transform={`rotate(${i * 37} ${(i * 53) % 300} ${(i * 29) % 80})`} />)}
              </svg>
              <p className="relative text-[11px] uppercase tracking-[0.12em] text-pink-700">Today</p>
              <ul className="relative">
                {today.slice(0, 4).map((c) => {
                  const Icon = KIND_ICON[c.kind] ?? Cake;
                  return (
                    <li key={`${c.kind}-${c.person.uuid}`}>
                      <Link href={c.post_uuid ? `/dashboard/buzz?post=${c.post_uuid}` : "/dashboard/buzz"} className="flex items-center gap-3 rounded-lg py-1.5">
                        <Avatar name={c.person.name} src={c.person.image} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-ink">{c.is_me ? "You" : c.person.name}</span>
                          <span className="flex items-center gap-1 text-[12px] text-muted"><Icon size={11} />{c.kind === "work_anniversary" ? `${c.years} year${c.years === 1 ? "" : "s"} at work` : KIND_WORD[c.kind]}</span>
                        </span>
                        {!c.is_me && <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[12px] text-pink-700">{c.wished ? "Wished ✓" : "Wish"}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : <p className="px-5 pb-2 text-[13.5px] text-muted">No celebrations today.</p>}
          {soon.length > 0 && (
            <ul className="px-5 pb-4">
              <li className="pb-1 text-[11px] uppercase tracking-[0.12em] text-faint">Coming up</li>
              {soon.map((c) => (
                <li key={`${c.kind}-${c.person.uuid}`} className="flex items-center gap-3 py-1.5">
                  <Avatar name={c.person.name} src={c.person.image} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{c.person.name}</span>
                  <span className="text-[12px] text-faint">{c.kind === "birthday" ? "🎂" : "🎉"} {c.days_away === 1 ? "Tomorrow" : formatDate(c.date, { weekday: "short", day: "numeric", month: "short", year: undefined }, "UTC")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Latest announcement */}
        <Card title="Latest announcement" icon={Megaphone} tint="bg-amber-50 text-amber-600" href="/dashboard/announcements" link="All">
          {a ? (
            <Link href={`/dashboard/announcements?open=${a.uuid}`} className="group mx-4 mb-4 block overflow-hidden rounded-xl border border-line">
              <CoverArt cover={a.cover} className="h-28">
                <div className="flex h-28 items-end p-3">
                  <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] text-white backdrop-blur">{a.kind_label}</span>
                </div>
              </CoverArt>
              <div className="p-3.5">
                <p className="line-clamp-2 text-[15px] text-ink group-hover:text-primary">{a.title}</p>
                {a.summary && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{a.summary}</p>}
                <p className="mt-2 flex items-center gap-2 text-[12px] text-faint">
                  {a.published_at ? formatRelative(a.published_at) : ""}
                  {a.requires_ack && (a.acknowledged ? <span className="text-emerald-700">Acknowledged ✓</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Please acknowledge</span>)}
                </p>
              </div>
            </Link>
          ) : <p className="px-5 pb-5 text-[13.5px] text-muted">No announcements right now.</p>}
        </Card>

        {/* Buzz preview */}
        <Card title="On Buzz" icon={Rss} tint="bg-indigo-50 text-primary" href="/dashboard/buzz" link="Open Buzz">
          {d.posts.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-muted">Nothing on Buzz yet. Share something!</p> : (
            <ul className="divide-y divide-line/70 px-2 pb-2">
              {d.posts.map((p) => {
                const line = postLine(p);
                const pic = p.attachments.find((x) => x.kind === "image");
                return (
                  <li key={p.uuid}>
                    <Link href={`/dashboard/buzz?post=${p.uuid}`} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken">
                      <Avatar name={p.author.name} src={p.author.image} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-faint">{p.author.name} · {formatRelative(p.created_at)}</span>
                        <span className="line-clamp-2 text-[13.5px] text-ink">{line.icon && <span className="mr-1">{line.icon}</span>}{line.text}</span>
                        <span className="mt-1 flex items-center gap-3 text-[12px] text-faint">
                          {p.reaction_total > 0 && <span className="flex items-center gap-1"><Heart size={11} /> {p.reaction_total}</span>}
                          {p.comment_count > 0 && <span className="flex items-center gap-1"><MessageCircle size={11} /> {p.comment_count}</span>}
                        </span>
                      </span>
                      {pic && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveImageUrl(pic.thumb_url)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
