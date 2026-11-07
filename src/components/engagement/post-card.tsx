"use client";

/*
 * One Buzz post: header, text, pictures, files, link preview, poll, celebration / kudos /
 * announcement / survey bodies, reactions and threaded comments.
 *   <PostCard post={p} onChange={(p) => ...} onRemove={(uuid) => ...} />
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3, CalendarClock, CheckCircle2, ClipboardList, Download, EyeOff, FileText, Flag, Globe2, Lock, Megaphone,
  MessageCircle, Pencil, Pin, PinOff, Reply, Send, ShieldCheck, Sparkles, Trash2, Users,
} from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { formatDate, formatDateTime, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Avatar, Badge, initialsOf, Button, Field, Menu, Modal, ModalCancel, RadioCards, Textarea, useConfirm, type MenuItem } from "@/components/ui-kit";
import { CELEBRATION_THEMES, CelebrationDecor, CoverArt } from "./art";
import { FALLBACK_REACTIONS, useBuzz } from "./context";
import { ReactButton, ReactionSummary, WhoReactedModal } from "./reactions";
import { MentionInput, PostText, toWire } from "./text";
import type { Comment, FileCard, Post, PostStats } from "./types";

const KIND_BADGE: Record<string, { label: string; tone: "accent" | "good" | "warn" | "info" | "bad" | "neutral" }> = {
  poll: { label: "Poll", tone: "info" }, kudos: { label: "Kudos", tone: "warn" }, birthday: { label: "Birthday", tone: "bad" },
  work_anniversary: { label: "Work anniversary", tone: "good" }, wedding_anniversary: { label: "Wedding anniversary", tone: "bad" },
  welcome: { label: "New joiner", tone: "accent" }, announcement: { label: "Announcement", tone: "accent" }, survey: { label: "Survey", tone: "info" },
};

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ── Pictures and files ─────────────────────────────────────────── */

function Gallery({ images, onOpen }: { images: FileCard[]; onOpen: (i: number) => void }) {
  const n = images.length;
  const img = (f: FileCard, i: number, cls: string, big = false) => (
    <button key={f.uuid} type="button" onClick={() => onOpen(i)} className={`group relative overflow-hidden bg-sunken ${cls}`} aria-label={`Open picture ${i + 1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={resolveImageUrl(big ? f.url : f.thumb_url)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
      {i === 3 && n > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[26px] font-extralight text-white">+{n - 4}</span>}
    </button>
  );
  if (n === 1) {
    return <div className="overflow-hidden rounded-xl border border-line">{img(images[0], 0, "block max-h-[520px] w-full", true)}</div>;
  }
  if (n === 2) return <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">{images.map((f, i) => img(f, i, "aspect-square"))}</div>;
  if (n === 3) return (
    <div className="grid grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-xl" style={{ aspectRatio: "3 / 2" }}>
      {img(images[0], 0, "col-span-2 row-span-2", true)}{img(images[1], 1, "")}{img(images[2], 2, "")}
    </div>
  );
  return <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">{images.slice(0, 4).map((f, i) => img(f, i, "aspect-[4/3]"))}</div>;
}

function Lightbox({ images, index, onClose }: { images: FileCard[]; index: number | null; onClose: () => void }) {
  const [i, setI] = useState(index ?? 0);
  useEffect(() => { if (index !== null) setI(index); }, [index]);
  useEffect(() => {
    if (index === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % images.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, images.length]);
  const f = images[i];
  return (
    <Modal open={index !== null} onClose={onClose} size="xl" title={images.length > 1 ? `Picture ${i + 1} of ${images.length}` : "Picture"} flush
      headerActions={f && <a href={resolveImageUrl(f.url)} download={f.name} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted hover:bg-sunken"><Download size={15} strokeWidth={1.4} /> Download</a>}>
      {f && (
        <div className="relative flex items-center justify-center bg-[#0f0f14]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveImageUrl(f.url)} alt="" className="max-h-[75vh] w-auto object-contain" />
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => setI((i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Previous">‹</button>
              <button type="button" onClick={() => setI((i + 1) % images.length)} className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Next">›</button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Files({ files }: { files: FileCard[] }) {
  return (
    <div className="flex flex-col gap-2">
      {files.map((f) => (
        <a key={f.uuid} href={resolveImageUrl(f.url)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-line-strong hover:bg-sunken">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><FileText size={17} strokeWidth={1.4} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-ink">{f.name}</span>
            <span className="block text-[12px] text-faint">{(f.name.split(".").pop() || "").toUpperCase()} · {formatBytes(f.size)}</span>
          </span>
          <Download size={16} strokeWidth={1.4} className="text-faint" />
        </a>
      ))}
    </div>
  );
}

export function LinkPreviewCard({ preview, onRemove }: { preview: NonNullable<Post["link_preview"]>; onRemove?: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="flex hover:bg-sunken">
        {preview.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveImageUrl(preview.image.thumb_url)} alt="" className="h-auto w-32 shrink-0 object-cover sm:w-40" />
        )}
        <span className="min-w-0 flex-1 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.06em] text-faint"><Globe2 size={12} strokeWidth={1.4} />{preview.site}</span>
          <span className="mt-1 line-clamp-2 block text-[14px] text-ink">{preview.title || preview.url}</span>
          {preview.description && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{preview.description}</span>}
        </span>
      </a>
      {onRemove && <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-full bg-surface/90 px-2 text-[12px] text-muted hover:text-ink">Remove</button>}
    </div>
  );
}

/* ── Poll ───────────────────────────────────────────────────────── */

function PollBox({ post, onStats }: { post: Post; onStats: (s: PostStats) => void }) {
  const poll = post.poll!;
  const toast = useToast();
  const [voters, setVoters] = useState<{ label: string; people: { name: string; image: string | null }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const showResults = poll.voted || poll.closed;

  async function vote(uuid: string) {
    if (poll.closed || busy) return;
    const mine = poll.options.filter((o) => o.mine).map((o) => o.uuid);
    const next = poll.multiple ? (mine.includes(uuid) ? mine.filter((x) => x !== uuid) : [...mine, uuid]) : (mine[0] === uuid ? [] : [uuid]);
    setBusy(true);
    try { onStats(await api.post<PostStats>(`/engagement/posts/${post.uuid}/vote`, { options: next })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function showVoters(o: { uuid: string; label: string }) {
    try {
      const people = await api.get<{ name: string; image: string | null }[]>(`/engagement/posts/${post.uuid}/poll/${o.uuid}/voters`);
      setVoters({ label: o.label, people });
    } catch (e) { toast.error((e as Error).message); }
  }
  const lead = Math.max(...poll.options.map((o) => o.votes));
  return (
    <div className="rounded-xl border border-line p-3">
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const pct = total ? Math.round((o.votes * 100) / total) : 0;
          return (
            <li key={o.uuid}>
              <button type="button" onClick={() => vote(o.uuid)} disabled={poll.closed}
                className={`relative flex h-11 w-full items-center overflow-hidden rounded-lg border text-left text-[14px] transition-colors ${o.mine ? "border-primary/50" : "border-line hover:border-line-strong"} disabled:cursor-default`}>
                {showResults && <span className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${o.mine ? "bg-primary/15" : o.votes === lead && lead > 0 ? "bg-primary/[.08]" : "bg-sunken"}`} style={{ width: `${pct}%` }} />}
                <span className="relative flex flex-1 items-center gap-2 px-3">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${poll.multiple ? "rounded" : "rounded-full"} ${o.mine ? "border-primary bg-primary" : "border-line-strong"}`}>
                    {o.mine && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="truncate text-ink">{o.label}</span>
                </span>
                {showResults && <span className="relative px-3 text-[13px] tabular text-muted">{pct}%</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
        <span>{poll.voters} vote{poll.voters === 1 ? "" : "s"}</span>
        {poll.multiple && <span>· Pick any</span>}
        {poll.closes_at && <span>· {poll.closed ? "Closed" : `Closes ${formatRelative(poll.closes_at)}`}</span>}
        {showResults && poll.show_voters && total > 0 && (
          <span className="flex flex-wrap gap-2">· {poll.options.filter((o) => o.votes).map((o) => (
            <button key={o.uuid} type="button" onClick={() => showVoters(o)} className="hover:text-ink hover:underline">Who chose {o.label}</button>
          ))}</span>
        )}
      </div>
      <Modal open={!!voters} onClose={() => setVoters(null)} size="sm" title={voters ? `Voted “${voters.label}”` : ""}>
        <ul className="space-y-2.5">{voters?.people.map((p, i) => (
          <li key={i} className="flex items-center gap-2.5"><Avatar name={p.name} src={p.image} size={30} /><span className="text-[14px] text-ink">{p.name}</span></li>
        ))}</ul>
      </Modal>
    </div>
  );
}

/* ── Special bodies ─────────────────────────────────────────────── */

const WISHES: Record<string, string[]> = {
  birthday: ["Happy birthday! 🎂", "Many happy returns of the day! 🎉", "Have a fantastic year ahead! 🌟"],
  work_anniversary: ["Congratulations! 🎉", "Happy work anniversary! 🙌", "Thank you for all you do 🙏"],
  wedding_anniversary: ["Happy anniversary! 💐", "Wishing you both many more happy years ❤️"],
  welcome: ["Welcome aboard! 👋", "Great to have you with us! 🎉", "Welcome to the team! 🙌"],
};

function CelebrationBody({ post, onWished }: { post: Post; onWished: () => void }) {
  const toast = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const theme = CELEBRATION_THEMES[post.theme || "cosmic"] ?? CELEBRATION_THEMES.cosmic;
  const subject = post.subject;
  const first = subject?.name.split(" ")[0] ?? "";
  const label = post.kind === "birthday" ? "Happy birthday" : post.kind === "work_anniversary"
    ? `${post.years} ${post.years === 1 ? "year" : "years"} with us` : post.kind === "welcome" ? "Welcome aboard" : "Happy anniversary";
  async function wish(msg: string) {
    setSending(msg);
    try {
      await api.post(`/engagement/posts/${post.uuid}/wish`, { message: msg, emoji: post.kind === "birthday" ? "🎉" : "👏" });
      toast.success(`Sent to ${first}`);
      onWished();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(null); }
  }
  const buzz = useBuzz();
  const isMe = !!subject?.uuid && subject.uuid === buzz.meta?.me.employee_uuid;
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl px-6 py-8 text-center text-white" style={{ background: theme.bg }}>
        <CelebrationDecor theme={post.theme || "cosmic"} seed={post.uuid} />
        <div className="relative flex flex-col items-center">
          <span className="buzz-pop rounded-full p-1.5 ring-1 ring-white/30" style={{ background: "rgb(255 255 255 / .18)" }}>
            {subject?.image ? <Avatar name={subject.name} src={subject.image} size={84} /> : (
              <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-white/95 text-[30px] font-light tracking-wide shadow-lg" style={{ color: "#4338ca" }}>
                {initialsOf(subject?.name ?? "?")}
              </span>
            )}
          </span>
          <p className="buzz-rise mt-4 text-[11px] uppercase tracking-[0.3em] text-white/85" style={{ animationDelay: ".2s" }}>{label}</p>
          <p className="buzz-rise mt-1.5 font-serif text-[28px] italic leading-tight" style={{ animationDelay: ".35s" }}>{subject?.name}</p>
          <p className="buzz-rise mt-1 text-[13px] text-white/75" style={{ animationDelay: ".5s" }}>{[subject?.title, subject?.department].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {!isMe && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(WISHES[post.kind] ?? WISHES.birthday).map((w) => (
            <button key={w} type="button" disabled={!!sending} onClick={() => wish(w)}
              className="rounded-full border border-line px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:opacity-50">
              {sending === w ? "Sending…" : w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KudosBody({ post }: { post: Post }) {
  const k = post.kudos!;
  const v = k.value;
  const accent = v?.accent ?? "#d98a06", soft = v?.soft ?? "#fdf3dc";
  return (
    <div className="relative overflow-hidden rounded-2xl border p-5" style={{ background: soft, borderColor: `${accent}33` }}>
      <svg viewBox="0 0 200 120" className="pointer-events-none absolute -right-4 -top-3 h-32 w-52 opacity-60" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <circle key={i} cx={30 + i * 26} cy={20 + ((i * 37) % 70)} r={3 + (i % 3) * 2} fill={accent} fillOpacity={0.18 + (i % 3) * 0.1} />)}
        <path d="M150 30 l6 14 l15 2 l-11 10 l3 15 l-13 -7 l-13 7 l3 -15 l-11 -10 l15 -2z" fill={accent} fillOpacity=".35" />
      </svg>
      <div className="relative flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[28px]" style={{ background: "#ffffffb3", boxShadow: `inset 0 0 0 1px ${accent}33` }}>{v?.emoji ?? "👏"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] uppercase tracking-[0.14em]" style={{ color: accent }}>{v?.name ?? "Kudos"}{k.points ? ` · +${k.points} pts` : ""}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {k.recipients.map((r) => (
              <span key={r.uuid} className="inline-flex items-center gap-2 rounded-full bg-white/70 py-1 pl-1 pr-3">
                <Avatar name={r.name} src={r.image} size={28} />
                <span className="text-[14.5px] text-ink">{r.name}</span>
              </span>
            ))}
          </div>
          <PostText body={k.message} className="mt-3 text-[14.5px] leading-relaxed text-ink" />
        </div>
      </div>
    </div>
  );
}

function AnnouncementBody({ post, onAcked }: { post: Post; onAcked: () => void }) {
  const a = post.announcement!;
  const buzz = useBuzz();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function ack() {
    setBusy(true);
    try { await api.post(`/engagement/announcements/${a.uuid}/acknowledge`); toast.success("Thanks for confirming"); onAcked(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <button type="button" onClick={() => buzz.openAnnouncement?.(a.uuid)} className="block w-full text-left">
        <CoverArt cover={a.cover} className="h-36">
          <div className="flex h-36 items-end p-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11.5px] uppercase tracking-[0.08em] text-white backdrop-blur-sm">
              <Megaphone size={12} strokeWidth={1.6} /> {a.kind_label}
            </span>
          </div>
        </CoverArt>
        <div className="px-4 pb-1 pt-3.5">
          <p className="text-[18px] font-light leading-snug text-ink">{a.title}</p>
          <p className="mt-1 line-clamp-3 text-[14px] text-muted">{a.summary}</p>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-2.5">
        <Button size="sm" onClick={() => buzz.openAnnouncement?.(a.uuid)}>Read</Button>
        {a.requires_ack && (a.acknowledged
          ? <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700"><CheckCircle2 size={15} strokeWidth={1.5} /> Acknowledged</span>
          : !buzz.meta?.me.is_owner && <>
            <Button size="sm" variant="primary" icon={ShieldCheck} loading={busy} onClick={ack}>I have read this</Button>
            {a.ack_due_on && <span className="text-[12.5px] text-amber-700">Please confirm by {formatDate(a.ack_due_on, {}, "UTC")}</span>}
          </>)}
      </div>
    </div>
  );
}

function SurveyBody({ post }: { post: Post }) {
  const s = post.survey!;
  const buzz = useBuzz();
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-gradient-to-br from-primary-soft to-surface p-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
        {s.kind === "enps" ? <BarChart3 size={22} strokeWidth={1.4} /> : <ClipboardList size={22} strokeWidth={1.4} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15.5px] text-ink">{s.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {s.questions} question{s.questions === 1 ? "" : "s"} · {s.identity === "named" ? "Named" : "Anonymous"}
          {s.closes_at && s.open ? ` · Closes ${formatRelative(s.closes_at)}` : ""}{s.mandatory ? " · Required" : ""}
        </p>
      </div>
      {s.answered ? <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700"><CheckCircle2 size={15} strokeWidth={1.5} /> Answered</span>
        : s.open && s.invited ? <Button size="sm" variant="primary" onClick={() => buzz.takeSurvey?.(s.uuid)}>Take survey</Button>
          : <span className="text-[12.5px] text-faint">{s.open ? "Not for you" : "Closed"}</span>}
    </div>
  );
}

/* ── Comments ───────────────────────────────────────────────────── */

function CommentItem({ c, post, depth, onTree, onReply }: {
  c: Comment; post: Post; depth: number; onTree: (t: Comment[]) => void; onReply: (c: Comment) => void;
}) {
  const buzz = useBuzz();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [whoOpen, setWhoOpen] = useState(false);
  const quick = buzz.meta?.reactions ?? FALLBACK_REACTIONS;
  const base = `/engagement/posts/${post.uuid}/comments/${c.uuid}`;
  const run = async (p: Promise<Comment[]>) => { try { onTree(await p); } catch (e) { toast.error((e as Error).message); } };
  const total = c.reactions.reduce((s, r) => s + r.count, 0);
  return (
    <li className="flex gap-2.5">
      <Avatar name={c.author?.name ?? "?"} src={c.author?.image} size={depth ? 26 : 32} />
      <div className="min-w-0 flex-1">
        <div className="group relative inline-block max-w-full rounded-2xl bg-sunken px-3.5 py-2">
          <p className="text-[13px] text-ink">{c.author?.name}{c.author?.title && <span className="text-faint"> · {c.author.title}</span>}</p>
          {editing ? (
            <div className="mt-1 min-w-[16rem]">
              <Textarea value={text} onValueChange={setText} rows={2} autoGrow />
              <div className="mt-1.5 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => { setEditing(false); run(api.put<Comment[]>(base, { body: text })); }}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(c.body); }}>Cancel</Button>
              </div>
            </div>
          ) : <PostText body={c.body} className="text-[14px] leading-relaxed text-ink" />}
          {total > 0 && (
            <button type="button" onClick={() => setWhoOpen(true)}
              className="absolute -bottom-2.5 right-2 inline-flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 text-[11.5px] text-muted">
              {c.reactions.slice(0, 3).map((r) => r.emoji).join("")} {total > 1 && <span className="tabular">{total}</span>}
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1 pl-1 text-[12px] text-faint">
          <span>{formatRelative(c.created_at)}{c.edited ? " · edited" : ""}</span>
          <ReactButton size="sm" mine={c.my_reaction} quick={quick} all={buzz.meta?.all_reactions ?? quick}
            onReact={(e) => run(api.post<Comment[]>(`${base}/react`, { emoji: e }))} />
          {post.allow_comments && <button type="button" onClick={() => onReply(c)} className="rounded px-1.5 py-1 hover:text-ink">Reply</button>}
          {c.can_edit && <button type="button" onClick={() => setEditing(true)} className="rounded px-1.5 py-1 hover:text-ink">Edit</button>}
          {c.can_delete && <button type="button" onClick={async () => {
            if (await confirm({ title: "Delete comment?", message: "It will be removed for everyone.", confirmLabel: "Delete", tone: "danger" })) run(api.delete<Comment[]>(base));
          }} className="rounded px-1.5 py-1 hover:text-rose-600">Delete</button>}
        </div>
        {c.replies.length > 0 && (
          <ul className="mt-2 space-y-3">
            {c.replies.map((r) => <CommentItem key={r.uuid} c={r} post={post} depth={depth + 1} onTree={onTree} onReply={() => onReply(c)} />)}
          </ul>
        )}
        <WhoReactedModal open={whoOpen} onClose={() => setWhoOpen(false)} path={whoOpen ? `${base}/reactions` : null} />
      </div>
    </li>
  );
}

function countAll(t: Comment[]): number {
  return t.reduce((s, c) => s + 1 + countAll(c.replies), 0);
}

function Comments({ post, focus, onCount }: { post: Post; focus: number; onCount: (n: number) => void }) {
  const buzz = useBuzz();
  const toast = useToast();
  const [tree, setTree] = useState<Comment[]>(post.comments);
  const [all, setAll] = useState(post.comment_count <= countAll(post.comments));
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useMemo(() => ({ current: null as null | { focus: () => void } }), []);

  useEffect(() => { setTree(post.comments); }, [post.comments]);
  useEffect(() => { if (focus) inputRef.current?.focus(); }, [focus, inputRef]);

  const apply = (t: Comment[]) => { setTree(t); setAll(true); onCount(countAll(t)); };
  async function loadAll() {
    try { apply(await api.get<Comment[]>(`/engagement/posts/${post.uuid}/comments`)); } catch { /* ignore */ }
  }
  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      apply(await api.post<Comment[]>(`/engagement/posts/${post.uuid}/comments`, { body: toWire(text.trim(), mentions), parent: replyTo?.uuid }));
      setText(""); setMentions({}); setReplyTo(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  }
  const hidden = post.comment_count - countAll(tree);
  const canComment = post.allow_comments && (buzz.meta?.allow_comments ?? true) && post.status === "published";
  return (
    <div className="border-t border-line px-5 pb-4 pt-3">
      {!all && hidden > 0 && (
        <button type="button" onClick={loadAll} className="mb-3 text-[13px] text-muted hover:text-ink">
          View {hidden === 1 ? "1 more comment" : `all ${post.comment_count} comments`}
        </button>
      )}
      {tree.length > 0 && <ul className="mb-3 space-y-3.5">{tree.map((c) => <CommentItem key={c.uuid} c={c} post={post} depth={0} onTree={apply} onReply={(rc) => { setReplyTo(rc); inputRef.current?.focus(); }} />)}</ul>}
      {canComment && (
        <div className="flex items-start gap-2.5">
          <Avatar name={buzz.meta?.me.name ?? "Me"} src={buzz.meta?.me.image} size={32} />
          <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-1.5 focus-within:border-primary/40">
            {replyTo && (
              <p className="flex items-center gap-1.5 pt-1 text-[12px] text-faint"><Reply size={12} strokeWidth={1.4} /> Replying to {replyTo.author?.name}
                <button type="button" onClick={() => setReplyTo(null)} className="text-muted hover:text-ink">· Cancel</button></p>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 py-1">
                <MentionInput ref={(h) => { inputRef.current = h; }} value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions}
                  rows={1} placeholder={post.kind === "birthday" ? "Write a birthday wish…" : "Write a comment…"} onSubmit={send} maxLength={2000} className="text-[14px]" />
              </div>
              <button type="button" onClick={send} disabled={!text.trim() || sending} aria-label="Send comment"
                className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary-soft disabled:opacity-30">
                <Send size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Report ─────────────────────────────────────────────────────── */

function ReportModal({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const buzz = useBuzz();
  const toast = useToast();
  const [reason, setReason] = useState("offensive");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reasons = buzz.meta?.report_reasons ?? { offensive: "Offensive or abusive", spam: "Spam", other: "Something else" };
  async function submit() {
    setBusy(true);
    try { await api.post(`/engagement/posts/${post.uuid}/report`, { reason, note }); toast.success("Thanks. A moderator will take a look."); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Report this post" description="Moderators see who reported it; the author does not." size="md" busy={busy}
      footer={<><ModalCancel /><Button variant="danger" loading={busy} onClick={submit}>Report</Button></>}>
      <RadioCards columns={2} value={reason} onChange={setReason} options={Object.entries(reasons).map(([value, label]) => ({ value, label }))} />
      <Field label="Anything else? (optional)" className="mt-4"><Textarea value={note} onValueChange={setNote} rows={3} maxLength={1000} /></Field>
    </Modal>
  );
}

function HideModal({ post, open, onClose, onDone }: { post: Post; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await api.post(`/engagement/posts/${post.uuid}/hide`, { hidden: true, reason }); toast.success("Post hidden"); onDone(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Hide this post" description="It disappears from Buzz. The author is told why." size="md" busy={busy}
      footer={<><ModalCancel /><Button variant="danger" loading={busy} onClick={submit}>Hide post</Button></>}>
      <Field label="Reason shown to the author"><Textarea value={reason} onValueChange={setReason} rows={3} maxLength={500} placeholder="For example: please keep salary details off Buzz." /></Field>
    </Modal>
  );
}

/* ── The card ───────────────────────────────────────────────────── */

export function PostCard({ post, onChange, onRemove, highlight }: {
  post: Post; onChange: (p: Post) => void; onRemove: (uuid: string) => void; highlight?: boolean;
}) {
  const buzz = useBuzz();
  const toast = useToast();
  const confirm = useConfirm();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [who, setWho] = useState(false);
  const [focus, setFocus] = useState(0);
  const [report, setReport] = useState(false);
  const [hide, setHide] = useState(false);
  const quick = buzz.meta?.reactions ?? FALLBACK_REACTIONS;
  const images = post.attachments.filter((a) => a.kind === "image");
  const files = post.attachments.filter((a) => a.kind === "file");
  const special = ["birthday", "work_anniversary", "wedding_anniversary", "welcome"].includes(post.kind);
  const badge = KIND_BADGE[post.kind];

  const merge = (s: Partial<Post>) => onChange({ ...post, ...s });
  async function react(e: string | null) {
    const before = post;
    // optimistic
    const counts = new Map(post.reactions.map((r) => [r.emoji, r.count]));
    if (post.my_reaction) counts.set(post.my_reaction, (counts.get(post.my_reaction) ?? 1) - 1);
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
    const reactions = [...counts.entries()].filter(([, n]) => n > 0).map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count);
    merge({ my_reaction: e, reactions, reaction_total: reactions.reduce((s, r) => s + r.count, 0) });
    try { merge(await api.post<PostStats>(`/engagement/posts/${post.uuid}/react`, { emoji: e })); }
    catch (err) { onChange(before); toast.error((err as Error).message); }
  }
  async function refresh() {
    try { onChange(await api.get<Post>(`/engagement/posts/${post.uuid}`)); } catch { /* gone */ }
  }

  const items: MenuItem[] = [];
  if (post.can_edit) items.push({ label: "Edit", icon: Pencil, onSelect: () => buzz.editPost?.(post) });
  if (post.can_pin) items.push(post.pinned
    ? { label: "Unpin", icon: PinOff, onSelect: async () => { await api.post(`/engagement/posts/${post.uuid}/pin`, { pinned: false }); merge({ pinned: false }); toast.success("Unpinned"); } }
    : { label: "Pin to top", icon: Pin, onSelect: async () => { await api.post(`/engagement/posts/${post.uuid}/pin`, { pinned: true }); merge({ pinned: true }); toast.success("Pinned to the top of Buzz"); } });
  if (post.can_moderate && post.status === "published" && !post.is_mine) items.push({ label: "Hide post", icon: EyeOff, onSelect: () => setHide(true) });
  if (!post.is_mine) items.push({ label: "Report", icon: Flag, onSelect: () => setReport(true) });
  if (post.can_delete) {
    if (items.length) items.push("separator");
    items.push({
      label: "Delete", icon: Trash2, danger: true, onSelect: async () => {
        if (!(await confirm({ title: "Delete this post?", message: "It is removed from Buzz for everyone. Moderators keep a record.", confirmLabel: "Delete", tone: "danger" }))) return;
        try { await api.delete(`/engagement/posts/${post.uuid}`); onRemove(post.uuid); toast.success("Post deleted"); }
        catch (e) { toast.error((e as Error).message); }
      },
    });
  }

  const author = post.author;
  return (
    <article id={`post-${post.uuid}`} className={`buzz-rise rounded-2xl border bg-surface ${highlight ? "buzz-ring border-primary/40" : "border-line"}`}>
      {post.pinned && (
        <p className="flex items-center gap-1.5 border-b border-line px-5 py-2 text-[12px] text-muted"><Pin size={13} strokeWidth={1.5} className="text-primary" /> Pinned{post.pinned_by ? ` by ${post.pinned_by}` : ""}</p>
      )}
      {post.status !== "published" && (
        <p className={`flex items-center gap-1.5 border-b px-5 py-2 text-[12.5px] ${post.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {post.status === "pending" ? <><CalendarClock size={14} strokeWidth={1.5} /> Waiting for a moderator. Only you can see it.</>
            : <><EyeOff size={14} strokeWidth={1.5} /> {post.status === "rejected" ? "Not approved" : "Hidden"}{post.hidden_reason ? `: ${post.hidden_reason}` : ""}</>}
        </p>
      )}
      <header className="flex items-start gap-3 px-5 pt-4">
        {author.system ? (
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-white">
            <Sparkles size={18} strokeWidth={1.5} />
          </span>
        ) : <Avatar name={author.name} src={author.image} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14.5px] text-ink">
            {author.uuid ? <Link href={`/dashboard/buzz?person=${author.uuid}`} className="hover:underline">{author.name}</Link> : <span>{author.name}</span>}
            {post.kind === "kudos" && post.kudos && <span className="text-[13px] text-muted">gave kudos</span>}
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-faint">
            {author.title && <span className="truncate">{author.title}</span>}
            {author.title && <span>·</span>}
            <time dateTime={post.created_at} title={formatDateTime(post.created_at)}>{formatRelative(post.created_at)}</time>
            {post.edited && <span>· edited</span>}
            <span>·</span>
            {post.audience_label ? <span className="inline-flex items-center gap-1" title={`Visible to ${post.audience_label}`}><Users size={12} strokeWidth={1.5} />{post.audience_label}</span>
              : <span className="inline-flex items-center gap-1" title="Everyone in the company"><Globe2 size={12} strokeWidth={1.5} />Everyone</span>}
          </p>
        </div>
        {items.length > 0 && <Menu items={items} />}
      </header>

      <div className="space-y-3 px-5 pb-1 pt-3">
        {special ? <CelebrationBody post={post} onWished={refresh} />
          : post.kind === "kudos" && post.kudos ? <KudosBody post={post} />
          : (
            <>
              {post.body && post.kind !== "announcement" && post.kind !== "survey" && <PostText body={post.body} clamp={420} className="text-[15px] leading-relaxed text-ink" />}
              {post.kind === "announcement" && post.announcement && <AnnouncementBody post={post} onAcked={() => merge({ announcement: { ...post.announcement!, acknowledged: true } })} />}
              {post.kind === "survey" && post.survey && <SurveyBody post={post} />}
              {images.length > 0 && <Gallery images={images} onOpen={setLightbox} />}
              {files.length > 0 && <Files files={files} />}
              {post.link_preview && <LinkPreviewCard preview={post.link_preview} />}
              {post.poll && <PollBox post={post} onStats={merge} />}
            </>
          )}
      </div>

      {(post.reaction_total > 0 || post.comment_count > 0) && (
        <div className="flex items-center justify-between px-5 pt-2.5 text-[13px] text-muted">
          <ReactionSummary reactions={post.reactions} total={post.reaction_total} recent={post.recent_reactors} onOpen={() => setWho(true)} />
          {post.comment_count > 0 && <button type="button" onClick={() => setFocus((f) => f + 1)} className="hover:text-ink hover:underline">{post.comment_count} comment{post.comment_count === 1 ? "" : "s"}</button>}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 border-t border-line px-3 py-1.5">
        <ReactButton mine={post.my_reaction} quick={quick} all={buzz.meta?.all_reactions ?? quick} onReact={react} />
        {post.allow_comments && post.status === "published" && (
          <button type="button" onClick={() => setFocus((f) => f + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] text-muted hover:bg-sunken hover:text-ink">
            <MessageCircle size={17} strokeWidth={1.4} /> {special ? "Wish" : "Comment"}
          </button>
        )}
        {post.kind === "kudos" && buzz.meta?.kudos_enabled && (
          <button type="button" onClick={() => buzz.giveKudos?.()} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] text-muted hover:bg-sunken hover:text-ink">
            <Sparkles size={16} strokeWidth={1.4} /> Give kudos
          </button>
        )}
        {!post.allow_comments && <span className="ml-auto inline-flex items-center gap-1 px-2 text-[12px] text-faint"><Lock size={12} strokeWidth={1.5} /> Comments off</span>}
      </div>
      {(post.allow_comments || post.comment_count > 0) && <Comments post={post} focus={focus} onCount={(n) => merge({ comment_count: n })} />}

      <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} />
      <WhoReactedModal open={who} onClose={() => setWho(false)} path={who ? `/engagement/posts/${post.uuid}/reactions` : null} />
      {report && <ReportModal post={post} open={report} onClose={() => setReport(false)} />}
      {hide && <HideModal post={post} open={hide} onClose={() => setHide(false)} onDone={() => onRemove(post.uuid)} />}
    </article>
  );
}

export function PostSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3"><div className="h-10 w-10 animate-pulse rounded-full bg-sunken" />
        <div className="flex-1 space-y-2"><div className="h-3 w-40 animate-pulse rounded bg-sunken" /><div className="h-2.5 w-24 animate-pulse rounded bg-sunken" /></div></div>
      <div className="mt-4 space-y-2"><div className="h-3 w-full animate-pulse rounded bg-sunken" /><div className="h-3 w-4/5 animate-pulse rounded bg-sunken" /></div>
      <div className="mt-4 h-48 animate-pulse rounded-xl bg-sunken" />
    </div>
  );
}
