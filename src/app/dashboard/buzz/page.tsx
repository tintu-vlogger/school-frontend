"use client";

/*
 * Buzz: the company feed. Posts, photos, polls, kudos, celebrations, announcements and
 * surveys in one stream, with the day's celebrations and kudos leaders alongside.
 * Address options: ?post=<uuid> opens one post, ?tag=<hashtag> and ?person=<uuid> filter,
 * ?tab=moderation shows the moderation queue to moderators.
 * New posts are checked every 30 seconds; reaction and comment counts refresh too.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp, Award, CheckCircle2, ClipboardList, Hash, Megaphone, PenLine, Rss, ShieldAlert, Sparkles, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentHour, formatLongDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Avatar, Button, Modal } from "@/components/ui-kit";
import { BuzzHeroArt } from "@/components/engagement/art";
import { AnnouncementView } from "@/components/engagement/announcement-view";
import { ComposerCard, ComposerModal, type ComposerMode } from "@/components/engagement/composer";
import { BuzzProvider, useEngagementMeta } from "@/components/engagement/context";
import { GiveKudosModal } from "@/components/engagement/kudos-modal";
import { PostCard, PostSkeleton } from "@/components/engagement/post-card";
import { TakeSurveyModal } from "@/components/engagement/survey-take";
import { EngagementStyles } from "@/components/engagement/text";
import { CelebrationsWidget, LeaderboardWidget, NewJoinersWidget, TrendingWidget, WidgetPanel } from "@/components/engagement/widgets";
import type { AnnouncementCard, Celebrations, FeedPage, Person, Post, PostStats } from "@/components/engagement/types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "celebrations", label: "Celebrations" },
  { key: "kudos", label: "Kudos" },
  { key: "announcements", label: "Announcements" },
  { key: "polls", label: "Polls" },
  { key: "mine", label: "Mine" },
];

type MySurvey = { uuid: string; title: string; kind: string; mandatory: boolean; closes_at: string };

function greeting() {
  const h = currentHour();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function BuzzPage() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const meta = useEngagementMeta();
  const tag = params.get("tag");
  const person = params.get("person");
  const postParam = params.get("post");
  const moderation = params.get("tab") === "moderation";

  const [filter, setFilter] = useState(() => params.get("filter") || "all");
  const [pinned, setPinned] = useState<Post[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ count: number; authors: Person[] }>({ count: 0, authors: [] });
  const [cel, setCel] = useState<Celebrations | null>(null);
  const [acks, setAcks] = useState<AnnouncementCard[]>([]);
  const [surveys, setSurveys] = useState<MySurvey[]>([]);
  const [modQueue, setModQueue] = useState<Post[] | null>(null);

  const [composer, setComposer] = useState<{ open: boolean; mode: ComposerMode; post: Post | null }>({ open: false, mode: "post", post: null });
  const [kudosTo, setKudosTo] = useState<Person | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [survey, setSurvey] = useState<string | null>(null);
  const [single, setSingle] = useState<Post | null>(null);
  const [nudge, setNudge] = useState<MySurvey | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [authorName, setAuthorName] = useState<string | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({ filter, limit: "10" });
    if (tag) q.set("tag", tag);
    if (person) q.set("author", person);
    return q.toString();
  }, [filter, tag, person]);

  const loadFeed = useCallback(async () => {
    setPosts(null);
    try {
      const d = await api.get<FeedPage>(`/engagement/feed?${query}`);
      setPinned(d.pinned); setPosts(d.items); setNext(d.next);
      setLatest(d.latest ?? d.items[0]?.created_at ?? new Date().toISOString());
      setFresh({ count: 0, authors: [] });
      if (person) setAuthorName(d.items[0]?.author?.uuid === person ? d.items[0].author.name : null);
    } catch (e) { toast.error((e as Error).message); setPosts([]); }
  }, [query, person, toast]);

  const loadSide = useCallback(() => {
    api.get<Celebrations>("/engagement/celebrations").then(setCel).catch(() => {});
    api.get<{ items: AnnouncementCard[] }>("/engagement/announcements?scope=pending&size=5").then((r) => setAcks(r.items)).catch(() => {});
    api.get<{ pending: MySurvey[] }>("/engagement/surveys/mine").then((r) => {
      setSurveys(r.pending);
      const m = r.pending.find((s) => s.mandatory);
      if (m && typeof window !== "undefined" && !sessionStorage.getItem(`survey-nudge-${m.uuid}`)) {
        sessionStorage.setItem(`survey-nudge-${m.uuid}`, "1");
        setTimeout(() => setNudge(m), 1500);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { if (!moderation) loadFeed(); }, [loadFeed, moderation]);
  useEffect(() => { loadSide(); }, [loadSide]);
  useEffect(() => {
    if (!moderation) return;
    setModQueue(null);
    api.get<{ items: Post[] }>("/engagement/moderation").then((r) => setModQueue(r.items)).catch(() => setModQueue([]));
  }, [moderation]);

  // a single post from the address (?post=)
  useEffect(() => {
    if (!postParam) { setSingle(null); return; }
    api.get<Post>(`/engagement/posts/${postParam}`).then(setSingle).catch(() => { toast.error("That post is no longer available."); });
  }, [postParam, toast]);

  // infinite scroll
  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api.get<FeedPage>(`/engagement/feed?${query}&before=${encodeURIComponent(next)}`);
      setPosts((p) => [...(p ?? []), ...d.items.filter((x) => !(p ?? []).some((y) => y.uuid === x.uuid))]);
      setNext(d.next);
    } catch { /* try again on next scroll */ }
    finally { setLoadingMore(false); }
  }, [next, loadingMore, query]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, posts]);

  // live-ish updates every 30 s: new posts and fresh numbers on what is on screen
  useEffect(() => {
    if (moderation) return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        if (latest) setFresh(await api.get<{ count: number; authors: Person[] }>(`/engagement/feed/updates?since=${encodeURIComponent(latest)}`));
        const ids = [...pinned, ...(posts ?? [])].slice(0, 30).map((p) => p.uuid);
        if (ids.length) {
          const stats = await api.get<Record<string, PostStats>>(`/engagement/feed/stats?ids=${ids.join(",")}`);
          const upd = (p: Post) => (stats[p.uuid] ? { ...p, ...stats[p.uuid] } : p);
          setPosts((ps) => ps?.map(upd) ?? ps);
          setPinned((ps) => ps.map(upd));
        }
      } catch { /* offline for a moment */ }
    };
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [latest, posts, pinned, moderation]);

  const update = (p: Post) => {
    setPosts((ps) => ps?.map((x) => (x.uuid === p.uuid ? p : x)) ?? ps);
    setPinned((ps) => {
      const without = ps.filter((x) => x.uuid !== p.uuid);
      return p.pinned ? [p, ...without] : without;
    });
    if (!p.pinned) setPosts((ps) => (ps && !ps.some((x) => x.uuid === p.uuid) && pinned.some((x) => x.uuid === p.uuid) ? [p, ...ps] : ps));
    if (single?.uuid === p.uuid) setSingle(p);
  };
  const remove = (uuid: string) => {
    setPosts((ps) => ps?.filter((x) => x.uuid !== uuid) ?? ps);
    setPinned((ps) => ps.filter((x) => x.uuid !== uuid));
    setModQueue((q) => q?.filter((x) => x.uuid !== uuid) ?? q);
    if (single?.uuid === uuid) closeSingle();
  };
  const setParam = (k: string, v: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (v) q.set(k, v); else q.delete(k);
    router.push(`/dashboard/buzz${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };
  const closeSingle = () => setParam("post", null);

  const actions = useMemo(() => ({
    meta,
    openAnnouncement: (u: string) => setAnnouncement(u),
    takeSurvey: (u: string) => setSurvey(u),
    editPost: (p: Post) => setComposer({ open: true, mode: "post", post: p }),
    giveKudos: (to?: Person) => setKudosTo(to ?? null),
    openPost: (u: string) => setParam("post", u),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [meta, params]);

  const firstName = (meta?.me.name || user?.full_name || "").split(" ")[0];
  const todayNames = cel?.today.filter((i) => !i.is_me).map((i) => i.person.name.split(" ")[0]) ?? [];
  const meToday = cel?.today.find((i) => i.is_me);

  return (
    <BuzzProvider value={actions}>
      <EngagementStyles />
      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line" style={{ background: "linear-gradient(120deg,#eef2ff 0%,#fdf2f8 55%,#fff7ed 100%)" }}>
        <BuzzHeroArt className="pointer-events-none absolute bottom-0 right-0 hidden h-[190px] w-auto md:block" />
        <div className="relative max-w-2xl px-6 py-7 md:px-8">
          <p className="text-[12px] uppercase tracking-[0.12em] text-primary/80">{formatLongDate(new Date())}</p>
          <h1 className="mt-1 text-[28px] font-light leading-tight text-ink">{greeting()}{firstName ? `, ${firstName}` : ""} 👋</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">
            {meToday ? (meToday.kind === "birthday" ? "Happy birthday from all of us! 🎂 Check out your wishes below." : "Happy work anniversary! 🎉 Thank you for everything.")
              : todayNames.length ? `Today we celebrate ${todayNames.slice(0, 3).join(", ")}${todayNames.length > 3 ? ` and ${todayNames.length - 3} more` : ""}. Send a wish! 🎉`
                : "What's happening across the company, all in one place."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {meta?.can_post !== false && <Button variant="primary" icon={PenLine} onClick={() => setComposer({ open: true, mode: "post", post: null })}>New post</Button>}
            {meta?.kudos_enabled && <Button icon={Award} onClick={() => setKudosTo(null)}>Give kudos</Button>}
            {meta?.is_moderator && (
              <Button variant="ghost" icon={moderation ? Rss : ShieldAlert} onClick={() => setParam("tab", moderation ? null : "moderation")}>
                {moderation ? "Back to feed" : "Moderation"}
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[230px_minmax(0,1fr)_310px]">
        {/* Left */}
        <aside className="hidden space-y-4 xl:block">
          <div className="sticky top-4 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="h-14" style={{ background: "linear-gradient(120deg,#6366f1,#a855f7,#ec4899)" }} />
              <div className="-mt-7 px-4 pb-4">
                <span className="inline-block rounded-full border-[3px] border-surface"><Avatar name={meta?.me.name ?? "Me"} src={meta?.me.image} size={52} /></span>
                <p className="mt-1 text-[15px] text-ink">{meta?.me.name}</p>
                <p className="text-[12.5px] text-faint">{user?.company_name}</p>
                <nav className="mt-3 space-y-0.5 text-[13.5px]">
                  {meta?.me.employee_uuid && <button type="button" onClick={() => setParam("person", meta.me.employee_uuid)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-sunken hover:text-ink"><PenLine size={15} strokeWidth={1.4} /> My posts</button>}
                  <Link href="/dashboard/kudos" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-sunken hover:text-ink"><Sparkles size={15} strokeWidth={1.4} /> Kudos</Link>
                  <Link href="/dashboard/announcements" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-sunken hover:text-ink"><Megaphone size={15} strokeWidth={1.4} /> Announcements</Link>
                  <Link href="/dashboard/surveys" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-sunken hover:text-ink"><ClipboardList size={15} strokeWidth={1.4} /> Surveys</Link>
                </nav>
              </div>
            </section>
            <TrendingWidget active={tag} onTag={(t) => setParam("tag", t)} />
          </div>
        </aside>

        {/* Feed */}
        <main className="min-w-0 space-y-4">
          {moderation ? (
            <>
              <div className="flex items-center gap-2 text-[15px] text-ink"><ShieldAlert size={18} strokeWidth={1.4} className="text-rose-600" /> Moderation</div>
              <p className="-mt-2 text-[13.5px] text-muted">Reported, hidden and waiting posts. Restore a post or keep it hidden.</p>
              {modQueue === null ? <PostSkeleton /> : modQueue.length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
                  <CheckCircle2 size={28} strokeWidth={1.2} className="mx-auto text-emerald-500" />
                  <p className="mt-3 text-[15px] text-ink">All clear</p><p className="text-[13.5px] text-muted">Nothing is reported or hidden.</p>
                </div>
              ) : modQueue.map((p) => (
                <div key={p.uuid} className="space-y-2">
                  {(p.reports ?? []).length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">
                      {p.reports!.length} report{p.reports!.length === 1 ? "" : "s"}: {[...new Set(p.reports!.map((r) => r.reason))].join(", ")}
                      {p.reports!.filter((r) => r.note).slice(0, 2).map((r) => <span key={r.uuid} className="block text-rose-700/80">“{r.note}” · {r.by}</span>)}
                    </div>
                  )}
                  <PostCard post={p} onChange={(x) => setModQueue((q) => q?.map((y) => (y.uuid === x.uuid ? x : y)) ?? q)} onRemove={remove} />
                  <div className="flex gap-2">
                    {p.status !== "published" ? (
                      <Button size="sm" onClick={async () => { await api.post(`/engagement/posts/${p.uuid}/hide`, { hidden: false }); toast.success("Restored"); remove(p.uuid); }}>Restore post</Button>
                    ) : (
                      <Button size="sm" onClick={async () => { await api.post(`/engagement/posts/${p.uuid}/dismiss-reports`); toast.success("Reports dismissed"); remove(p.uuid); }}>Dismiss reports</Button>
                    )}
                    {p.status === "published" && <Button size="sm" variant="danger" onClick={async () => { await api.post(`/engagement/posts/${p.uuid}/hide`, { hidden: true, reason: "Against the Buzz guidelines" }); toast.success("Hidden"); remove(p.uuid); }}>Hide</Button>}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {(cel?.today.length ?? 0) > 0 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:hidden">
                  {cel!.today.map((i) => (
                    <button key={`${i.kind}-${i.person.uuid}`} type="button" onClick={() => i.post_uuid && setParam("post", i.post_uuid)}
                      className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-pink-100 py-2 pl-2 pr-4 text-left" style={{ background: "linear-gradient(135deg,#fdf2f8,#fef3c7)" }}>
                      <Avatar name={i.person.name} src={i.person.image} size={34} />
                      <span>
                        <span className="block text-[13.5px] text-ink">{i.is_me ? "You" : i.person.name.split(" ")[0]} {i.kind === "birthday" ? "🎂" : i.kind === "welcome" ? "👋" : "🎉"}</span>
                        <span className="block text-[11.5px] text-pink-700">{i.kind === "birthday" ? "Birthday today" : i.kind === "welcome" ? "Joined today" : i.kind === "work_anniversary" ? `${i.years} yr${i.years === 1 ? "" : "s"} today` : "Anniversary today"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <ComposerCard onOpen={(mode) => setComposer({ open: true, mode, post: null })} />
              <div className="[scrollbar-width:none] sticky top-0 z-20 -mx-1 flex items-center gap-1 overflow-x-auto bg-canvas/90 px-1 py-1.5 backdrop-blur [mask-image:linear-gradient(90deg,#000_92%,transparent)]">
                {FILTERS.filter((f) => f.key !== "mine" || meta?.can_post).map((f) => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                    className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors ${filter === f.key ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink"}`}>{f.label}</button>
                ))}
              </div>
              {(tag || person) && (
                <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
                  Showing
                  {tag && <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-primary"><Hash size={13} />{tag}
                    <button type="button" aria-label="Clear" onClick={() => setParam("tag", null)}><X size={13} /></button></span>}
                  {person && <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-primary">Posts by {authorName ?? "this person"}
                    <button type="button" aria-label="Clear" onClick={() => setParam("person", null)}><X size={13} /></button></span>}
                </div>
              )}
              {fresh.count > 0 && (
                <div className="sticky top-12 z-20 flex justify-center">
                  <button type="button" onClick={() => { loadFeed(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="buzz-rise inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pl-2 pr-4 text-[13px] text-white shadow-lg">
                    <span className="flex -space-x-2">{fresh.authors.map((a) => <span key={a.uuid} className="rounded-full ring-2 ring-primary"><Avatar name={a.name} src={a.image} size={22} /></span>)}</span>
                    <ArrowUp size={14} /> {fresh.count} new post{fresh.count === 1 ? "" : "s"}
                  </button>
                </div>
              )}
              {posts === null ? <><PostSkeleton /><PostSkeleton /></> : (
                <>
                  {pinned.map((p) => <PostCard key={`pin-${p.uuid}`} post={p} onChange={update} onRemove={remove} />)}
                  {posts.map((p) => <PostCard key={p.uuid} post={p} onChange={update} onRemove={remove} />)}
                  {posts.length === 0 && pinned.length === 0 && (
                    <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
                      <Rss size={28} strokeWidth={1.2} className="mx-auto text-faint" />
                      <p className="mt-3 text-[15px] text-ink">{tag || person || filter !== "all" ? "Nothing here yet" : "Nothing on Buzz yet"}</p>
                      <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">Be the first: share a win, give kudos or wish someone well.</p>
                    </div>
                  )}
                  <div ref={sentinel} />
                  {loadingMore && <PostSkeleton />}
                  {!next && posts.length > 4 && <p className="py-6 text-center text-[13px] text-faint">You&apos;re all caught up ✨</p>}
                </>
              )}
            </>
          )}
        </main>

        {/* Right */}
        <aside className="space-y-4">
          {(acks.length > 0 || surveys.length > 0) && (
            <WidgetPanel title="Waiting for you" icon={CheckCircle2} tint="bg-indigo-50 text-primary">
              <ul className="pb-2">
                {acks.map((a) => (
                  <li key={a.uuid}><button type="button" onClick={() => setAnnouncement(a.uuid)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunken">
                    <Megaphone size={16} strokeWidth={1.4} className="shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-ink">{a.title}</span><span className="block text-[12px] text-faint">Acknowledge</span></span>
                  </button></li>
                ))}
                {surveys.map((s) => (
                  <li key={s.uuid}><button type="button" onClick={() => setSurvey(s.uuid)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunken">
                    <ClipboardList size={16} strokeWidth={1.4} className="shrink-0 text-sky-600" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-ink">{s.title}</span><span className="block text-[12px] text-faint">{s.mandatory ? "Required survey" : "Survey"}</span></span>
                  </button></li>
                ))}
              </ul>
            </WidgetPanel>
          )}
          <CelebrationsWidget data={cel} onWish={(i) => {
            if (i.post_uuid) setParam("post", i.post_uuid);
            else toast.info("The celebration post appears on Buzz in the morning.");
          }} />
          {meta?.show_leaderboard !== false && <LeaderboardWidget />}
          <NewJoinersWidget people={cel?.new_joiners ?? []} onHello={(p) => setKudosTo(p)} />
        </aside>
      </div>

      {/* Modals */}
      <ComposerModal open={composer.open} mode={composer.mode} post={composer.post} onClose={() => setComposer((c) => ({ ...c, open: false }))}
        onSaved={(p) => { if (composer.post) update(p); else setPosts((ps) => [p, ...(ps ?? [])]); }} />
      <GiveKudosModal open={kudosTo !== undefined} to={kudosTo ?? null} onClose={() => setKudosTo(undefined)}
        onGiven={() => { if (filter === "all" || filter === "kudos") loadFeed(); }} />
      <AnnouncementView uuid={announcement} onClose={() => setAnnouncement(null)} onChanged={loadSide} />
      <TakeSurveyModal uuid={survey} onClose={() => setSurvey(null)} onDone={() => { loadSide(); }} />
      <Modal open={!!single} onClose={closeSingle} size="lg" title="Post" bodyClassName="bg-canvas">
        {single && <PostCard post={single} onChange={update} onRemove={remove} highlight />}
      </Modal>
      <Modal open={!!nudge} onClose={() => setNudge(null)} size="sm" title="A quick survey for you"
        footer={<><Button variant="ghost" onClick={() => setNudge(null)}>Later</Button><Button variant="primary" onClick={() => { setSurvey(nudge!.uuid); setNudge(null); }}>Answer now</Button></>}>
        <p className="text-[14.5px] text-ink">{nudge?.title}</p>
        <p className="mt-1 text-[13.5px] text-muted">Your company has asked everyone to answer this one. It takes a couple of minutes.</p>
      </Modal>
    </BuzzProvider>
  );
}
