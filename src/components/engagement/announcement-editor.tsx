"use client";

/*
 * Write or edit an announcement: title, type, summary, rich text, cover, who sees it,
 * when it goes out and ends, acknowledgement and where it shows.
 *   <AnnouncementEditor open uuid={null | uuid} onClose onSaved={(a) => ...} />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarClock, Check, ImagePlus, Loader2, Megaphone, Monitor, Newspaper, PartyPopper, Pin, Send, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, Field, FormGrid, Modal, Skeleton, Textarea, TextInput, TimeInput, Toggle, toISODate,
} from "@/components/ui-kit";
import { COVER_PRESETS, CoverArt, PresetArt } from "./art";
import { AudiencePicker } from "./audience-picker";
import type { AnnouncementDetail } from "./announcement-view";
import { RichEditor } from "./rich-editor";
import { uploadEngagementFile } from "./upload";
import type { Audience, Cover } from "./types";

export const ANNOUNCEMENT_KINDS = [
  { value: "announcement", label: "Announcement", icon: Megaphone, description: "Company-wide news and updates" },
  { value: "news", label: "News", icon: Newspaper, description: "Wins, launches and milestones" },
  { value: "policy", label: "Policy update", icon: ShieldCheck, description: "Rules people need to know" },
  { value: "event", label: "Event", icon: PartyPopper, description: "Celebrations, town halls, outings" },
] as const;

type Form = {
  title: string; kind: string; summary: string; body_html: string; cover: Cover; audience: Audience;
  when: "now" | "later"; publish_date: string; publish_time: string; expires_on: string;
  requires_ack: boolean; ack_due_on: string; pinned: boolean; show_on_kiosk: boolean; allow_comments: boolean; send_email: boolean;
};

const blank = (): Form => ({
  title: "", kind: "announcement", summary: "", body_html: "", cover: { preset: "aurora" }, audience: { all: true },
  when: "now", publish_date: toISODate(new Date()), publish_time: "09:00", expires_on: "",
  requires_ack: false, ack_due_on: "", pinned: false, show_on_kiosk: true, allow_comments: true, send_email: false,
});

const pad = (n: number) => String(n).padStart(2, "0");
function splitLocal(iso: string | null): [string, string] {
  if (!iso) return ["", ""];
  const d = new Date(iso);
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
}
const joinLocal = (date: string, time: string) => (date ? new Date(`${date}T${time || "00:00"}`).toISOString() : null);

/** The card summary falls back to the opening text; only keep one that was written on purpose. */
function ownSummary(a: AnnouncementDetail): string {
  const norm = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/[&…]/g, " ").replace(/\s+/g, " ").trim();
  const head = norm(a.summary ?? "").slice(0, 60);
  return !head || norm(a.body_html).startsWith(head) ? "" : a.summary ?? "";
}

function fromDetail(a: AnnouncementDetail): Form {
  const [pd, pt] = splitLocal(a.publish_at);
  const [ed] = splitLocal(a.expires_at);
  return {
    title: a.title, kind: a.kind, summary: ownSummary(a),
    body_html: a.body_html, cover: a.cover?.file ? { file: a.cover.file, url: a.cover.url, thumb_url: a.cover.thumb_url } : a.cover ?? null,
    audience: a.audience ?? { all: true }, when: a.status === "scheduled" ? "later" : "now",
    publish_date: pd || toISODate(new Date()), publish_time: pt || "09:00", expires_on: ed,
    requires_ack: a.requires_ack, ack_due_on: a.ack_due_on ?? "", pinned: a.pinned, show_on_kiosk: a.show_on_kiosk,
    allow_comments: a.allow_comments, send_email: a.send_email,
  };
}

function CoverPicker({ value, onChange }: { value: Cover; onChange: (c: Cover) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    setBusy(true);
    try {
      const card = await uploadEngagementFile(f);
      if (card.kind !== "image") throw new Error("The cover must be a picture.");
      onChange({ file: card.uuid, url: card.url, thumb_url: card.thumb_url });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {Object.entries(COVER_PRESETS).map(([k, p]) => {
        const on = value?.preset === k;
        return (
          <button key={k} type="button" onClick={() => onChange({ preset: k })} title={p.label} aria-pressed={on}
            className={`group relative overflow-hidden rounded-lg ring-offset-2 ring-offset-surface transition ${on ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-line-strong"}`}>
            <PresetArt preset={k} className="h-12 w-full" />
            {on && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-primary"><Check size={11} strokeWidth={2.5} /></span>}
            <span className="absolute inset-x-0 bottom-0 bg-black/25 px-1 py-0.5 text-[10.5px] text-white">{p.label}</span>
          </button>
        );
      })}
      <button type="button" onClick={() => input.current?.click()}
        className={`relative flex h-12 items-center justify-center overflow-hidden rounded-lg border border-dashed text-[12px] ring-offset-2 ring-offset-surface ${value?.file ? "border-transparent ring-2 ring-primary" : "border-line-strong text-muted hover:border-primary hover:text-primary"}`}>
        {value?.file ? <CoverArt cover={value} className="absolute inset-0" /> : busy ? <Loader2 size={16} className="animate-spin" /> : <span className="flex flex-col items-center text-[10.5px] leading-tight"><ImagePlus size={15} strokeWidth={1.5} />Upload</span>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

export function AnnouncementEditor({ open, uuid, onClose, onSaved }: {
  open: boolean; uuid: string | null; onClose: () => void; onSaved: (a: AnnouncementDetail) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [status, setStatus] = useState<string>("draft");
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  useEffect(() => {
    if (!open) return;
    if (!uuid) { const b = blank(); setF(b); setStatus("draft"); setInitial(JSON.stringify(b)); return; }
    setF(null);
    api.get<AnnouncementDetail>(`/engagement/announcements/${uuid}`).then((a) => {
      const x = fromDetail(a); setF(x); setStatus(a.status); setInitial(JSON.stringify(x));
    }).catch((e) => { toast.error((e as Error).message); onClose(); });
  }, [open, uuid, toast, onClose]);

  const dirty = useMemo(() => !!f && JSON.stringify(f) !== initial, [f, initial]);
  const live = status === "published" || status === "expired";

  async function save(action: "draft" | "publish") {
    if (!f) return;
    if (!f.title.trim()) { toast.error("Give the announcement a title."); return; }
    const publishAt = f.when === "later" && !live ? joinLocal(f.publish_date, f.publish_time) : null;
    if (action === "publish" && publishAt && new Date(publishAt) < new Date()) { toast.error("Pick a time in the future, or publish now."); return; }
    setSaving(action);
    try {
      const body = {
        title: f.title, kind: f.kind, summary: f.summary || null, body_html: f.body_html,
        cover: f.cover?.file ? { file: f.cover.file } : f.cover?.preset ? { preset: f.cover.preset } : null,
        audience: f.audience, ...(live ? {} : { publish_at: publishAt }),
        expires_at: f.expires_on ? joinLocal(f.expires_on, "23:59") : null,
        requires_ack: f.requires_ack, ack_due_on: f.requires_ack && f.ack_due_on ? f.ack_due_on : null,
        pinned: f.pinned, show_on_kiosk: f.show_on_kiosk, allow_comments: f.allow_comments, send_email: f.send_email,
        action: live ? undefined : action,
      };
      const a = uuid ? await api.put<AnnouncementDetail>(`/engagement/announcements/${uuid}`, body)
        : await api.post<AnnouncementDetail>("/engagement/announcements", body);
      toast.success(live ? "Changes saved" : action === "draft" ? "Saved as a draft" : a.status === "scheduled" ? "Scheduled" : "Published",
        action === "publish" && a.status === "published" && !live ? { description: "It's on Buzz now." } : undefined);
      setInitial(JSON.stringify(f));
      onSaved(a);
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  const scheduleLabel = f?.when === "later" ? "Schedule" : "Publish now";
  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={!!saving}
      title={uuid ? "Edit announcement" : "New announcement"}
      description={live ? "Changes show straight away for everyone who can see it." : "Save a draft any time; publish when it's ready."}
      footerStart={!live ? <Button variant="ghost" loading={saving === "draft"} onClick={() => save("draft")}>Save draft</Button> : undefined}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={live ? Check : f?.when === "later" ? CalendarClock : Send} loading={saving === "publish"} onClick={() => save("publish")}>
          {live ? "Save changes" : scheduleLabel}
        </Button>
      </>}>
      {!f ? <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-64" /></div> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <CoverArt cover={f.cover} className="h-28 rounded-xl">
              <div className="flex h-28 items-end p-4">
                <span className="rounded-full bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-white backdrop-blur">
                  {ANNOUNCEMENT_KINDS.find((k) => k.value === f.kind)?.label}
                </span>
              </div>
            </CoverArt>
            <TextInput value={f.title} onValueChange={(v) => set("title", v)} placeholder="Title" autoFocusInModal maxLength={200}
              className="!h-12 !text-[20px] !font-light" aria-label="Title" />
            <RichEditor value={f.body_html} onChange={(v) => set("body_html", v)} />
            <Field label="Summary" hint="Shown on Buzz and in emails. Leave empty to use the first lines.">
              <Textarea value={f.summary} onValueChange={(v) => set("summary", v)} rows={2} maxLength={400} placeholder="One or two lines about what changed" />
            </Field>
            <Field label="Who sees it"><AudiencePicker value={f.audience} onChange={(a) => set("audience", a)} /></Field>
          </div>

          <div className="space-y-5">
            <Field label="Type">
              <div className="grid grid-cols-2 gap-1.5">
                {ANNOUNCEMENT_KINDS.map((k) => (
                  <button key={k.value} type="button" onClick={() => set("kind", k.value)} aria-pressed={f.kind === k.value} title={k.description}
                    className={`flex h-10 items-center gap-2 rounded-lg border px-2.5 text-left text-[13px] transition-colors ${f.kind === k.value ? "border-primary/50 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>
                    <k.icon size={15} strokeWidth={1.5} className="shrink-0" /><span className="truncate">{k.label}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Cover"><CoverPicker value={f.cover} onChange={(c) => set("cover", c)} /></Field>
            {!live && (
              <Field label="When">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1">
                  {(["now", "later"] as const).map((w) => (
                    <button key={w} type="button" onClick={() => set("when", w)}
                      className={`h-8 rounded-md text-[13px] ${f.when === w ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                      {w === "now" ? "Publish now" : "Schedule"}
                    </button>
                  ))}
                </div>
                {f.when === "later" && (
                  <FormGrid columns={2} className="mt-2">
                    <DateInput value={f.publish_date} onChange={(v) => set("publish_date", v)} min={toISODate(new Date())} />
                    <TimeInput value={f.publish_time} onChange={(v) => set("publish_time", v)} aria-label="Publish time" />
                  </FormGrid>
                )}
              </Field>
            )}
            <Field label="Ends on" hint="After this it moves to older announcements and leaves kiosks.">
              <DateInput value={f.expires_on} onChange={(v) => set("expires_on", v)} clearable placeholder="Never" min={toISODate(new Date())} />
            </Field>
            <div className="space-y-3 rounded-xl border border-line p-3.5">
              <Toggle checked={f.requires_ack} onChange={(v) => set("requires_ack", v)} label="Ask people to acknowledge"
                description="Each person confirms they have read it. Reminders go to those who haven't." />
              {f.requires_ack && (
                <Field label="Acknowledge by"><DateInput value={f.ack_due_on} onChange={(v) => set("ack_due_on", v)} clearable placeholder="No deadline" /></Field>
              )}
              <Toggle checked={f.pinned} onChange={(v) => set("pinned", v)} label={<span className="inline-flex items-center gap-1.5"><Pin size={13} strokeWidth={1.6} /> Pin to the top of Buzz</span>} />
              <Toggle checked={f.allow_comments} onChange={(v) => set("allow_comments", v)} label="Allow comments and reactions" />
              <Toggle checked={f.show_on_kiosk} onChange={(v) => set("show_on_kiosk", v)} label={<span className="inline-flex items-center gap-1.5"><Monitor size={13} strokeWidth={1.6} /> Show on kiosk screens</span>} />
              <Toggle checked={f.send_email} onChange={(v) => set("send_email", v)} disabled={live}
                label={<span className="inline-flex items-center gap-1.5"><Bell size={13} strokeWidth={1.6} /> Also send by email</span>}
                description={live ? "Emails go out when it is first published." : undefined} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
