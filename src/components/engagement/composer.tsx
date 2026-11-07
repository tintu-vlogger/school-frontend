"use client";

/*
 * Writing on Buzz.
 *   <ComposerCard onOpen={(mode) => ...} />   the "What's on your mind" card at the top of the feed
 *   <ComposerModal open mode post onClose onSaved />   new post, photo post, poll, or editing a post
 * Text supports @mentions and #hashtags; a web address gets a preview card automatically.
 */
import { useEffect, useRef, useState } from "react";
import {
  BarChart3, Globe2, ImagePlus, Loader2, MessageSquareOff, Paperclip, Plus, Smile, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Avatar, Button, DateInput, Modal, ModalCancel, TextInput, Toggle } from "@/components/ui-kit";
import { AudiencePicker, audienceIsEveryone } from "./audience-picker";
import { useBuzz } from "./context";
import { LinkPreviewCard } from "./post-card";
import { MentionInput, fromWire, toWire, useFirstUrl, type MentionInputHandle } from "./text";
import type { Audience, FileCard, LinkPreview, Post } from "./types";
import { uploadEngagementFile } from "./upload";

export type ComposerMode = "post" | "photo" | "poll";

const EMOJI = ["😀", "😂", "🥳", "🎉", "🙌", "👏", "🔥", "💯", "❤️", "🙏", "🚀", "✨", "☕", "🪔", "🏏", "🎂", "💡", "✅"];

export function ComposerCard({ onOpen }: { onOpen: (mode: ComposerMode) => void }) {
  const buzz = useBuzz();
  const me = buzz.meta?.me;
  const first = me?.name?.split(" ")[0];
  if (buzz.meta && !buzz.meta.can_post) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-center gap-3">
        <span className="rounded-full p-[2px]" style={{ background: "linear-gradient(135deg,#6366f1,#ec4899,#f59e0b)" }}>
          <span className="block rounded-full border-2 border-surface"><Avatar name={me?.name ?? "Me"} src={me?.image} size={38} /></span>
        </span>
        <button type="button" onClick={() => onOpen("post")}
          className="h-11 min-w-0 flex-1 truncate rounded-full border border-line bg-sunken px-4 text-left text-[14.5px] text-faint transition-colors hover:border-primary/30 hover:bg-surface hover:shadow-[0_0_0_4px_rgba(99,102,241,.08)]">
          What&apos;s on your mind{first ? `, ${first}` : ""}?
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 pl-[54px]">
        <Chip icon={ImagePlus} label="Photo" tint="text-emerald-600" onClick={() => onOpen("photo")} />
        {buzz.meta?.allow_polls !== false && <Chip icon={BarChart3} label="Poll" tint="text-sky-600" onClick={() => onOpen("poll")} />}
        {buzz.meta?.kudos_enabled && <Chip icon={Sparkles} label="Give kudos" tint="text-amber-600" onClick={() => buzz.giveKudos?.()} />}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, tint, onClick }: { icon: typeof ImagePlus; label: string; tint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-sunken hover:text-ink">
      <Icon size={16} strokeWidth={1.5} className={tint} /> {label}
    </button>
  );
}

type Upload = { key: string; name: string; preview?: string; progress: number; card?: FileCard; error?: string };

export function ComposerModal({ open, mode, post, onClose, onSaved }: {
  open: boolean; mode: ComposerMode; post?: Post | null; onClose: () => void; onSaved: (p: Post) => void;
}) {
  const buzz = useBuzz();
  const toast = useToast();
  const meta = buzz.meta;
  const editing = !!post;
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewOff, setPreviewOff] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [poll, setPoll] = useState<{ options: string[]; multiple: boolean; closes: string } | null>(null);
  const [audience, setAudience] = useState<Audience>({ all: true });
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [emoji, setEmoji] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<MentionInputHandle>(null);
  const url = useFirstUrl(text);

  useEffect(() => {
    if (!open) return;
    if (post) {
      const w = fromWire(post.body);
      setText(w.text); setMentions(w.mentions);
      setUploads(post.attachments.map((a) => ({ key: a.uuid, name: a.name, progress: 100, card: a, preview: a.kind === "image" ? resolveImageUrl(a.thumb_url) : undefined })));
      setPreview(post.link_preview); setPoll(null); setAudience(post.audience ?? { all: true }); setAllowComments(post.allow_comments);
    } else {
      setText(""); setMentions({}); setUploads([]); setPreview(null); setAudience({ all: true }); setAllowComments(true);
      setPoll(mode === "poll" ? { options: ["", ""], multiple: false, closes: "" } : null);
      if (mode === "photo") setTimeout(() => photoInput.current?.click(), 250);
    }
    setPreviewOff(null); setAudienceOpen(false); setEmoji(false);
  }, [open, post, mode]);

  useEffect(() => {
    if (!url || url === previewOff || preview?.url === url || uploads.some((u) => u.card?.kind === "image")) return;
    const t = setTimeout(() => {
      setLoadingPreview(true);
      api.get<LinkPreview>(`/engagement/link-preview?url=${encodeURIComponent(url)}`)
        .then((p) => setPreview(p.title ? p : null)).catch(() => {}).finally(() => setLoadingPreview(false));
    }, 700);
    return () => clearTimeout(t);
  }, [url, previewOff, preview?.url, uploads]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).slice(0, 10 - uploads.length);
    for (const f of files) {
      const key = `${f.name}-${Math.random()}`;
      const local = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      setUploads((u) => [...u, { key, name: f.name, preview: local, progress: 0 }]);
      uploadEngagementFile(f, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((card) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, card, progress: 100 } : x))))
        .catch((e: Error) => { setUploads((u) => u.filter((x) => x.key !== key)); toast.error(e.message); });
    }
  }

  const busyUploading = uploads.some((u) => !u.card);
  const pollValid = !poll || poll.options.filter((o) => o.trim()).length >= 2;
  const canSave = !saving && !busyUploading && pollValid && (text.trim() || uploads.length || poll);
  const dirty = !!(text.trim() || uploads.length || (poll && poll.options.some((o) => o.trim())));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const body = {
      body: toWire(text.trim(), mentions),
      attachments: uploads.filter((u) => u.card).map((u) => u.card!.uuid),
      link_preview: preview && !uploads.some((u) => u.card?.kind === "image") ? preview : null,
      audience: audienceIsEveryone(audience) ? { all: true } : audience,
      allow_comments: allowComments,
      ...(poll && !editing ? { poll: { options: poll.options.map((o) => o.trim()).filter(Boolean), multiple: poll.multiple, closes_at: poll.closes ? new Date(`${poll.closes}T23:59:00`).toISOString() : null } } : {}),
    };
    try {
      const saved = editing ? await api.put<Post>(`/engagement/posts/${post!.uuid}`, body) : await api.post<Post>("/engagement/posts", body);
      onSaved(saved);
      toast.success(editing ? "Post updated" : saved.status === "pending" ? "Sent to a moderator" : "Posted");
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  const everyone = audienceIsEveryone(audience);
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty && !saving} busy={saving}
      title={editing ? "Edit post" : poll ? "Create a poll" : "Create a post"}
      footerStart={meta?.allow_comments !== false && (
        <Toggle size="sm" checked={allowComments} onChange={setAllowComments} label="Allow comments" />
      )}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!canSave}>{editing ? "Save" : "Post"}</Button></>}>
      <div className="flex items-center gap-3">
        <Avatar name={meta?.me.name ?? "Me"} src={meta?.me.image} size={42} />
        <div>
          <p className="text-[14.5px] text-ink">{meta?.me.name}</p>
          {meta?.allow_audience ? (
            <button type="button" onClick={() => setAudienceOpen(!audienceOpen)}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-muted hover:border-line-strong">
              {everyone ? <Globe2 size={13} strokeWidth={1.5} /> : <Users size={13} strokeWidth={1.5} />}
              {everyone ? "Everyone" : "Chosen groups"} ▾
            </button>
          ) : <p className="text-[12.5px] text-faint">Everyone in the company</p>}
        </div>
      </div>
      {audienceOpen && <div className="mt-4"><AudiencePicker value={audience} onChange={setAudience} /></div>}

      <div className="mt-4 min-h-[110px]">
        <MentionInput ref={input} value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions} rows={4} autoFocus
          placeholder={poll ? "Ask a question…" : "Share an update, a win, a thank-you… Use @ to mention someone and # for topics."}
          className="text-[16px]" onSubmit={save} />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploads.map((u) => (
            <div key={u.key} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-sunken">
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <Paperclip size={18} strokeWidth={1.4} className="text-faint" />
                  <span className="line-clamp-2 text-[11.5px] text-muted">{u.name}</span>
                </div>
              )}
              {!u.card && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-[12px] text-white">
                  <Loader2 size={15} className="mr-1 animate-spin" /> {u.progress}%
                </div>
              )}
              <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} aria-label="Remove"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && !uploads.some((u) => u.card?.kind === "image") && (
        <div className="mt-3"><LinkPreviewCard preview={preview} onRemove={() => { setPreviewOff(preview.url); setPreview(null); }} /></div>
      )}
      {loadingPreview && !preview && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-faint"><Loader2 size={13} className="animate-spin" /> Getting a preview…</p>}

      {poll && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted"><BarChart3 size={15} strokeWidth={1.5} className="text-sky-600" /> Poll options</p>
          <div className="space-y-2">
            {poll.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput value={o} maxLength={200} placeholder={`Option ${i + 1}`} onValueChange={(v) => setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? v : x)) })} />
                {poll.options.length > 2 && (
                  <button type="button" aria-label="Remove option" onClick={() => setPoll({ ...poll, options: poll.options.filter((_, j) => j !== i) })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-rose-600"><Trash2 size={15} strokeWidth={1.4} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
            {poll.options.length < 8 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setPoll({ ...poll, options: [...poll.options, ""] })}>Add option</Button>}
            <Toggle size="sm" checked={poll.multiple} onChange={(v) => setPoll({ ...poll, multiple: v })} label="Allow more than one choice" />
            <div className="flex items-center gap-2 text-[13px] text-muted">Closes <DateInput value={poll.closes} onChange={(v) => setPoll({ ...poll, closes: v })} clearable placeholder="Never" /></div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-line px-2 py-1.5">
        <span className="px-2 text-[12.5px] text-faint">Add</span>
        {meta?.allow_attachments !== false && <>
          <ToolButton icon={ImagePlus} label="Photos" tint="text-emerald-600" onClick={() => photoInput.current?.click()} />
          <ToolButton icon={Paperclip} label="File" tint="text-violet-600" onClick={() => fileInput.current?.click()} />
        </>}
        {!editing && meta?.allow_polls !== false && <ToolButton icon={BarChart3} label="Poll" tint="text-sky-600" active={!!poll}
          onClick={() => setPoll(poll ? null : { options: ["", ""], multiple: false, closes: "" })} />}
        <span className="relative">
          <ToolButton icon={Smile} label="Emoji" tint="text-amber-500" active={emoji} onClick={() => setEmoji(!emoji)} />
          {emoji && (
            <div className="absolute bottom-full left-0 z-30 mb-2 grid w-64 grid-cols-6 gap-1 rounded-xl border border-line bg-surface p-2 shadow-lg">
              {EMOJI.map((e) => <button key={e} type="button" onClick={() => { input.current?.insert(e); setEmoji(false); }} className="h-9 rounded-lg text-[20px] hover:bg-sunken">{e}</button>)}
            </div>
          )}
        </span>
        {!allowComments && <span className="ml-auto flex items-center gap-1 pr-2 text-[12px] text-faint"><MessageSquareOff size={13} strokeWidth={1.5} /> Comments off</span>}
      </div>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
    </Modal>
  );
}

function ToolButton({ icon: Icon, label, tint, onClick, active }: { icon: typeof ImagePlus; label: string; tint: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ${active ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink"}`}>
      <Icon size={17} strokeWidth={1.5} className={active ? "" : tint} /> {label}
    </button>
  );
}
