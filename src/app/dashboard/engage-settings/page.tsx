"use client";

/*
 * Engagement settings: Buzz, celebrations (with editable emails), kudos (with the values
 * people can give), announcements and surveys. One tab per section; each saves on its own
 * with PUT /engagement/settings/{section}. ?tab=<section> opens a tab directly.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown, ArrowUp, Award, Cake, ClipboardList, Eye, Megaphone, Pencil, Plus, Rss, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, FormSection, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Select, Skeleton,
  Tabs, TextInput, Textarea, Toggle,
} from "@/components/ui-kit";
import { useEngagementMeta } from "@/components/engagement/context";
import type { KudosValue } from "@/components/engagement/types";

type Template = { subject: string; body: string };
type Settings = {
  buzz: {
    enabled: boolean; who_can_post: "everyone" | "roles"; post_roles: string[]; review_posts: boolean; allow_comments: boolean;
    allow_polls: boolean; allow_attachments: boolean; allow_audience: boolean; reactions: string[]; blocked_words: string[];
    auto_hide_reports: number; edit_window_minutes: number;
  };
  celebrations: {
    post_birthdays: boolean; post_work_anniversaries: boolean; post_wedding_anniversaries: boolean; post_new_joiners: boolean;
    post_hour: number; show_upcoming_days: number; email_enabled: boolean; email_welcome_enabled: boolean;
    email_birthday: Template; email_work_anniversary: Template; email_welcome: Template; default_birthday_privacy: "show" | "hide";
  };
  kudos: { enabled: boolean; monthly_limit: number; allow_multiple_recipients: boolean; show_leaderboard: boolean; post_to_buzz: boolean };
  surveys: { min_anonymous_responses: number; default_reminder_days: number };
  announcements: { default_pinned_days: number; remind_ack_after_days: number };
  placeholders: Record<string, string>;
  all_reactions: string[];
};
type SectionKey = "buzz" | "celebrations" | "kudos" | "announcements" | "surveys";

const TABS: { value: SectionKey; label: string; icon: typeof Rss }[] = [
  { value: "buzz", label: "Buzz", icon: Rss },
  { value: "celebrations", label: "Celebrations", icon: Cake },
  { value: "kudos", label: "Kudos", icon: Award },
  { value: "announcements", label: "Announcements", icon: Megaphone },
  { value: "surveys", label: "Surveys", icon: ClipboardList },
];
const ROLES = [
  { value: "admin", label: "Admin" }, { value: "hr", label: "HR" }, { value: "manager", label: "Manager" }, { value: "employee", label: "Employee" },
];
const COLORS: Record<string, string> = {
  coral: "#e2524f", amber: "#d98a06", violet: "#6f48c9", green: "#2c8253", teal: "#17909b", indigo: "#4f46e5", rose: "#e11d74", sky: "#0284c7",
};
const VALUE_EMOJI = ["🙏", "🚀", "🤝", "💡", "🎯", "🌟", "❤️", "🏆", "🔥", "👏", "🧠", "🌱", "⚡", "🎨", "🛡️", "😊"];

function hourLabel(h: number) {
  const ampm = h < 12 ? "AM" : "PM";
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x}:00 ${ampm}`;
}

/** A card holding one section's form with its own Save bar. */
function SectionCard({ dirty, saving, onSave, onReset, children }: {
  dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="p-6">{children}</div>
      <div className={`sticky bottom-0 flex items-center justify-end gap-2 border-t border-line px-6 py-3 transition-colors ${dirty ? "bg-primary-soft/60" : "bg-surface"}`}>
        {dirty && <span className="mr-auto text-[13px] text-muted">You have unsaved changes</span>}
        <Button variant="ghost" disabled={!dirty || saving} onClick={onReset}>Discard</Button>
        <Button variant="primary" disabled={!dirty} loading={saving} onClick={onSave}>Save changes</Button>
      </div>
    </div>
  );
}

function useSection<K extends SectionKey>(all: Settings | null, key: K, onSaved: (k: K, v: Settings[K]) => void) {
  const toast = useToast();
  const [draft, setDraft] = useState<Settings[K] | null>(all ? all[key] : null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (all) setDraft(all[key]); }, [all, key]);
  const dirty = !!all && !!draft && JSON.stringify(draft) !== JSON.stringify(all[key]);
  const set = (patch: Partial<Settings[K]>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try { onSaved(key, await api.put<Settings[K]>(`/engagement/settings/${key}`, draft)); toast.success("Settings saved"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return { draft, set, dirty, saving, save, reset: () => all && setDraft(all[key]) };
}

/* ── Buzz ───────────────────────────────────────────────────────── */

function BuzzSection({ all, onSaved }: { all: Settings; onSaved: (k: "buzz", v: Settings["buzz"]) => void }) {
  const s = useSection(all, "buzz", onSaved);
  const [words, setWords] = useState("");
  useEffect(() => { setWords((all.buzz.blocked_words || []).join(", ")); }, [all.buzz.blocked_words]);
  const d = s.draft;
  if (!d) return null;
  const toggleReaction = (e: string) => s.set({ reactions: d.reactions.includes(e) ? d.reactions.filter((x) => x !== e) : [...d.reactions, e] });
  return (
    <SectionCard dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={() => { s.reset(); setWords((all.buzz.blocked_words || []).join(", ")); }}>
      <FormSection title="The feed" description="Buzz is the company wall for posts, photos, polls, celebrations and kudos.">
        <div className="space-y-4">
          <Toggle checked={d.enabled} onChange={(v) => s.set({ enabled: v })} label="Turn on Buzz" description="When off, only moderators can post. Celebrations and announcements still appear." />
          <Field label="Who can post">
            <RadioCards value={d.who_can_post} onChange={(v) => s.set({ who_can_post: v })} options={[
              { value: "everyone", label: "Everyone", description: "Any employee can share a post" },
              { value: "roles", label: "Only some roles", description: "Others can still react and comment" },
            ]} />
          </Field>
          {d.who_can_post === "roles" && (
            <Field label="Roles that can post"><MultiSelect value={d.post_roles} onChange={(v) => s.set({ post_roles: v })} options={ROLES} /></Field>
          )}
          <Toggle checked={d.review_posts} onChange={(v) => s.set({ review_posts: v })} label="Review posts before they appear" description="New posts wait for a moderator's approval in Approvals." />
        </div>
      </FormSection>
      <FormSection title="What people can add">
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={d.allow_comments} onChange={(v) => s.set({ allow_comments: v })} label="Comments" />
          <Toggle checked={d.allow_polls} onChange={(v) => s.set({ allow_polls: v })} label="Polls" />
          <Toggle checked={d.allow_attachments} onChange={(v) => s.set({ allow_attachments: v })} label="Photos and files" />
          <Toggle checked={d.allow_audience} onChange={(v) => s.set({ allow_audience: v })} label="Post to a group" description="Pick a department, location or team instead of everyone." />
        </div>
      </FormSection>
      <FormSection title="Reactions" description={`Pick the emoji people can react with. The first eight show in the quick picker. ${d.reactions.length} chosen.`}>
        <div className="flex flex-wrap gap-2">
          {all.all_reactions.map((e) => {
            const on = d.reactions.includes(e);
            const pos = d.reactions.indexOf(e);
            return (
              <button key={e} type="button" onClick={() => toggleReaction(e)} aria-pressed={on}
                className={`relative flex h-12 w-12 items-center justify-center rounded-xl border text-[24px] transition-all ${on ? "border-primary/50 bg-primary-soft shadow-sm" : "border-line opacity-45 grayscale hover:opacity-80 hover:grayscale-0"}`}>
                {e}
                {on && pos < 8 && <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white" style={{ minWidth: 18, height: 18 }}>{pos + 1}</span>}
              </button>
            );
          })}
        </div>
      </FormSection>
      <FormSection title="Keeping it friendly">
        <div className="space-y-4">
          <FormGrid>
            <Field label="Hide a post after this many reports" hint="0 means never hide automatically; moderators still see reports.">
              <NumberInput value={d.auto_hide_reports} onChange={(v) => s.set({ auto_hide_reports: v ?? 0 })} min={0} max={50} suffix="reports" />
            </Field>
            <Field label="Authors can edit for" hint="0 means always.">
              <NumberInput value={d.edit_window_minutes} onChange={(v) => s.set({ edit_window_minutes: v ?? 0 })} min={0} max={10080} suffix="minutes" />
            </Field>
          </FormGrid>
          <Field label="Blocked words" hint="Separate with commas. Posts and comments that use them can't be published.">
            <Textarea value={words} rows={2} placeholder="e.g. spam, scam"
              onValueChange={(v) => { setWords(v); s.set({ blocked_words: v.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) }); }} />
          </Field>
        </div>
      </FormSection>
    </SectionCard>
  );
}

/* ── Celebrations ───────────────────────────────────────────────── */

const EMAILS: { key: "email_birthday" | "email_work_anniversary" | "email_welcome"; kind: string; label: string; emoji: string }[] = [
  { key: "email_birthday", kind: "birthday", label: "Birthday email", emoji: "🎂" },
  { key: "email_work_anniversary", kind: "work_anniversary", label: "Work anniversary email", emoji: "🎉" },
  { key: "email_welcome", kind: "welcome", label: "Welcome email", emoji: "👋" },
];

function EmailTemplateModal({ open, label, kind, value, placeholders, onClose, onApply }: {
  open: boolean; label: string; kind: string; value: Template; placeholders: Record<string, string>; onClose: () => void; onApply: (t: Template) => void;
}) {
  const toast = useToast();
  const [t, setT] = useState<Template>(value);
  const [preview, setPreview] = useState<Template | null>(null);
  const [field, setField] = useState<"subject" | "body">("body");
  useEffect(() => { if (open) { setT(value); setPreview(null); } }, [open, value]);
  useEffect(() => {
    if (!open || !t.subject.trim() || !t.body.trim()) return;
    const id = setTimeout(() => {
      api.post<Template>("/engagement/settings/celebrations/preview-email", { kind, subject: t.subject, body: t.body })
        .then(setPreview).catch((e) => setPreview({ subject: "", body: (e as Error).message }));
    }, 350);
    return () => clearTimeout(id);
  }, [open, kind, t]);
  const insert = (k: string) => setT((x) => ({ ...x, [field]: `${x[field]}{${k}}` }));
  return (
    <Modal open={open} onClose={onClose} size="xl" title={label} description="Placeholders in {braces} are filled in for each person."
      footer={<><ModalCancel /><Button variant="primary" onClick={() => {
        if (!t.subject.trim() || !t.body.trim()) { toast.error("An email needs a subject and a message."); return; }
        onApply(t); onClose();
      }}>Use this email</Button></>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Subject"><TextInput value={t.subject} onFocus={() => setField("subject")} onValueChange={(v) => setT((x) => ({ ...x, subject: v }))} /></Field>
          <Field label="Message"><Textarea value={t.body} rows={11} onFocus={() => setField("body")} onValueChange={(v) => setT((x) => ({ ...x, body: v }))} /></Field>
          <div>
            <p className="mb-1.5 text-[12.5px] text-faint">Insert into the {field === "subject" ? "subject" : "message"}</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(placeholders).map(([k, v]) => (
                <button key={k} type="button" title={v} onClick={() => insert(k)} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-primary/40 hover:text-primary">{`{${k}}`}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-faint"><Eye size={14} strokeWidth={1.4} /> Preview with sample details</p>
          <div className="overflow-hidden rounded-xl border border-line bg-canvas">
            <div className="h-20" style={{ background: kind === "birthday" ? "linear-gradient(120deg,#ec4899,#8b5cf6)" : kind === "welcome" ? "linear-gradient(120deg,#0ea5e9,#6366f1)" : "linear-gradient(120deg,#f59e0b,#dc2626)" }} />
            <div className="-mt-8 mx-4 mb-4 rounded-xl border border-line bg-surface p-4">
              <p className="text-[15px] text-ink">{preview?.subject || "…"}</p>
              <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{preview?.body || "Type a subject and a message to see the preview."}</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CelebrationsSection({ all, onSaved }: { all: Settings; onSaved: (k: "celebrations", v: Settings["celebrations"]) => void }) {
  const s = useSection(all, "celebrations", onSaved);
  const [editing, setEditing] = useState<(typeof EMAILS)[number] | null>(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => ({ value: h, label: hourLabel(h) })), []);
  const d = s.draft;
  if (!d) return null;
  return (
    <SectionCard dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset}>
      <FormSection title="Celebration posts" description="Each morning Buzz gets a post for every celebration, which colleagues can react to and wish on.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle checked={d.post_birthdays} onChange={(v) => s.set({ post_birthdays: v })} label="🎂 Birthdays" />
            <Toggle checked={d.post_work_anniversaries} onChange={(v) => s.set({ post_work_anniversaries: v })} label="🎉 Work anniversaries" />
            <Toggle checked={d.post_wedding_anniversaries} onChange={(v) => s.set({ post_wedding_anniversaries: v })} label="💍 Wedding anniversaries" description="Only for people who add their wedding date." />
            <Toggle checked={d.post_new_joiners} onChange={(v) => s.set({ post_new_joiners: v })} label="👋 New joiners" />
          </div>
          <FormGrid>
            <Field label="Post at" hint="Your company's local time.">
              <Select value={d.post_hour} onChange={(v) => s.set({ post_hour: v ?? 9 })} options={hours} />
            </Field>
            <Field label="Show upcoming celebrations for">
              <NumberInput value={d.show_upcoming_days} onChange={(v) => s.set({ show_upcoming_days: v ?? 14 })} min={1} max={60} suffix="days" />
            </Field>
          </FormGrid>
        </div>
      </FormSection>
      <FormSection title="Privacy" description="Birth years are never shown. Each person can choose for themselves on their profile.">
        <Field label="Until someone chooses, their birthday is">
          <RadioCards value={d.default_birthday_privacy} onChange={(v) => s.set({ default_birthday_privacy: v })} options={[
            { value: "show", label: "Celebrated", description: "Shown on Buzz and the kiosk" },
            { value: "hide", label: "Private", description: "Kept quiet until they opt in" },
          ]} />
        </Field>
      </FormSection>
      <FormSection title="Emails" description="A personal email on the day, in addition to the Buzz post.">
        <div className="space-y-4">
          <Toggle checked={d.email_enabled} onChange={(v) => s.set({ email_enabled: v })} label="Send birthday and anniversary emails" />
          <Toggle checked={d.email_welcome_enabled} onChange={(v) => s.set({ email_welcome_enabled: v })} label="Send a welcome email to new joiners" />
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {EMAILS.map((e) => {
              const on = e.key === "email_welcome" ? d.email_welcome_enabled : d.email_enabled;
              return (
                <li key={e.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[22px]">{e.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] text-ink">{e.label}{!on && <Badge>Off</Badge>}</span>
                    <span className="block truncate text-[12.5px] text-faint">{d[e.key].subject}</span>
                  </span>
                  <Button size="sm" icon={Pencil} onClick={() => setEditing(e)}>Edit</Button>
                </li>
              );
            })}
          </ul>
        </div>
      </FormSection>
      {editing && (
        <EmailTemplateModal open={!!editing} label={editing.label} kind={editing.kind} value={d[editing.key]} placeholders={all.placeholders}
          onClose={() => setEditing(null)} onApply={(t) => s.set({ [editing.key]: t } as Partial<Settings["celebrations"]>)} />
      )}
    </SectionCard>
  );
}

/* ── Kudos ──────────────────────────────────────────────────────── */

function ValueModal({ open, value, onClose, onSaved }: { open: boolean; value: KudosValue | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: "", description: "", emoji: "🌟", color: "amber", points: 10, active: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setV(value ? { name: value.name, description: value.description ?? "", emoji: value.emoji, color: value.color, points: value.points, active: value.active }
      : { name: "", description: "", emoji: "🌟", color: "amber", points: 10, active: true });
  }, [open, value]);
  const save = async () => {
    if (!v.name.trim()) { toast.error("Give the value a name."); return; }
    setSaving(true);
    try {
      if (value) await api.put(`/engagement/kudos/values/${value.uuid}`, v); else await api.post("/engagement/kudos/values", v);
      toast.success(value ? "Value saved" : "Value added"); onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const accent = COLORS[v.color] ?? COLORS.amber;
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={value ? "Edit value" : "Add a value"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>{value ? "Save" : "Add value"}</Button></>}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: `${accent}14`, border: `1px solid ${accent}33` }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-[30px]" style={{ background: `${accent}22` }}>{v.emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-[16px]" style={{ color: accent }}>{v.name || "Value name"}</p>
            <p className="truncate text-[13px] text-muted">{v.description || "What it recognises"}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12.5px]" style={{ color: accent }}><Sparkles size={12} />{v.points}</span>
        </div>
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name} maxLength={80} onValueChange={(x) => setV({ ...v, name: x })} placeholder="Customer first" autoFocusInModal /></Field>
          <Field label="Points" hint="0 to 1,000"><NumberInput value={v.points} onChange={(x) => setV({ ...v, points: x ?? 0 })} min={0} max={1000} /></Field>
        </FormGrid>
        <Field label="Description"><TextInput value={v.description} maxLength={300} onValueChange={(x) => setV({ ...v, description: x })} placeholder="For going the extra mile for a customer." /></Field>
        <Field label="Emoji">
          <div className="flex flex-wrap gap-1.5">
            {VALUE_EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => setV({ ...v, emoji: e })} className={`flex h-10 w-10 items-center justify-center rounded-xl border text-[20px] ${v.emoji === e ? "border-primary bg-primary-soft" : "border-line hover:bg-sunken"}`}>{e}</button>
            ))}
          </div>
        </Field>
        <Field label="Colour">
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLORS).map(([k, c]) => (
              <button key={k} type="button" aria-label={k} onClick={() => setV({ ...v, color: k })}
                className={`h-8 w-8 rounded-full transition-transform ${v.color === k ? "scale-110 ring-2 ring-offset-2" : "hover:scale-105"}`} style={{ background: c, ["--tw-ring-color" as string]: c }} />
            ))}
          </div>
        </Field>
        <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="People can give this value" />
      </div>
    </Modal>
  );
}

function KudosValues() {
  const toast = useToast();
  const [values, setValues] = useState<KudosValue[] | null>(null);
  const [edit, setEdit] = useState<{ open: boolean; value: KudosValue | null }>({ open: false, value: null });
  const load = () => api.get<KudosValue[]>("/engagement/kudos/values?include_inactive=true").then(setValues).catch(() => setValues([]));
  useEffect(() => { load(); }, []);
  const move = async (i: number, dir: -1 | 1) => {
    if (!values) return;
    const list = [...values]; const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setValues(list);
    try { setValues(await api.post<KudosValue[]>("/engagement/kudos/values/reorder", { uuids: list.map((x) => x.uuid) })); }
    catch (e) { toast.error((e as Error).message); load(); }
  };
  return (
    <FormSection title="Values" description="The badges people pick when giving kudos. Points add up on the leaderboard.">
      <div>
        {!values ? <Skeleton className="h-40 rounded-xl" /> : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {values.map((v, i) => (
              <li key={v.uuid} className={`flex items-center gap-3 px-3 py-2.5 ${v.active ? "" : "bg-sunken/50"}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[20px]" style={{ background: v.soft }}>{v.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px]" style={{ color: v.active ? v.accent : undefined }}>{v.name}{!v.active && <Badge>Hidden</Badge>}</span>
                  <span className="block truncate text-[12.5px] text-faint">{v.description}</span>
                </span>
                <span className="hidden text-[12.5px] tabular-nums text-muted sm:block">{v.points} pts{v.uses != null ? ` · given ${v.uses}×` : ""}</span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30"><ArrowUp size={15} /></button>
                <button type="button" aria-label="Move down" disabled={i === values.length - 1} onClick={() => move(i, 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30"><ArrowDown size={15} /></button>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ open: true, value: v })}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-3" size="sm" icon={Plus} onClick={() => setEdit({ open: true, value: null })}>Add value</Button>
      </div>
      <ValueModal open={edit.open} value={edit.value} onClose={() => setEdit((e) => ({ ...e, open: false }))} onSaved={load} />
    </FormSection>
  );
}

function KudosSection({ all, onSaved }: { all: Settings; onSaved: (k: "kudos", v: Settings["kudos"]) => void }) {
  const s = useSection(all, "kudos", onSaved);
  const d = s.draft;
  if (!d) return null;
  return (
    <div className="space-y-6">
      <SectionCard dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset}>
        <FormSection title="Kudos" description="Public thank-yous with a value badge and points.">
          <div className="space-y-4">
            <Toggle checked={d.enabled} onChange={(v) => s.set({ enabled: v })} label="Turn on kudos" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle checked={d.post_to_buzz} onChange={(v) => s.set({ post_to_buzz: v })} label="Share kudos on Buzz" />
              <Toggle checked={d.show_leaderboard} onChange={(v) => s.set({ show_leaderboard: v })} label="Show the leaderboard" />
              <Toggle checked={d.allow_multiple_recipients} onChange={(v) => s.set({ allow_multiple_recipients: v })} label="Thank several people at once" />
            </div>
            <Field label="Kudos one person can give each month" hint="0 means no limit." className="max-w-xs">
              <NumberInput value={d.monthly_limit} onChange={(v) => s.set({ monthly_limit: v ?? 0 })} min={0} max={100} />
            </Field>
          </div>
        </FormSection>
      </SectionCard>
      <div className="rounded-2xl border border-line bg-surface p-6"><KudosValues /></div>
    </div>
  );
}

/* ── Announcements and surveys ─────────────────────────────────── */

function AnnouncementsSection({ all, onSaved }: { all: Settings; onSaved: (k: "announcements", v: Settings["announcements"]) => void }) {
  const s = useSection(all, "announcements", onSaved);
  const d = s.draft;
  if (!d) return null;
  return (
    <SectionCard dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset}>
      <FormSection title="Announcements" description="Defaults for new announcements. Each one can still be changed when it is written.">
        <FormGrid>
          <Field label="Keep pinned to the top of Buzz for" hint="0 means not pinned.">
            <NumberInput value={d.default_pinned_days} onChange={(v) => s.set({ default_pinned_days: v ?? 0 })} min={0} max={90} suffix="days" />
          </Field>
          <Field label="Remind people to acknowledge after" hint="For announcements that need an acknowledgement.">
            <NumberInput value={d.remind_ack_after_days} onChange={(v) => s.set({ remind_ack_after_days: v ?? 2 })} min={1} max={30} suffix="days" />
          </Field>
        </FormGrid>
      </FormSection>
    </SectionCard>
  );
}

function SurveysSection({ all, onSaved }: { all: Settings; onSaved: (k: "surveys", v: Settings["surveys"]) => void }) {
  const s = useSection(all, "surveys", onSaved);
  const d = s.draft;
  if (!d) return null;
  return (
    <SectionCard dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset}>
      <FormSection title="Surveys" description="Anonymous results stay hidden until enough people have answered, so no one can be singled out.">
        <FormGrid>
          <Field label="Show anonymous results after" hint="At least 5.">
            <NumberInput value={d.min_anonymous_responses} onChange={(v) => s.set({ min_anonymous_responses: Math.max(5, v ?? 5) })} min={5} max={50} suffix="responses" />
          </Field>
          <Field label="Remind people who haven't answered every" hint="Default for required surveys.">
            <NumberInput value={d.default_reminder_days} onChange={(v) => s.set({ default_reminder_days: v ?? 2 })} min={1} max={30} suffix="days" />
          </Field>
        </FormGrid>
      </FormSection>
    </SectionCard>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

function EngageSettings() {
  const meta = useEngagementMeta();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab") as SectionKey | null;
  const tab: SectionKey = raw && TABS.some((t) => t.value === raw) ? raw : "buzz";
  const [all, setAll] = useState<Settings | null>(null);

  useEffect(() => {
    api.get<Settings>("/engagement/settings").then(setAll).catch((e) => toast.error((e as Error).message));
  }, [toast]);

  const setTab = (t: SectionKey) => router.replace(t === "buzz" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const onSaved = <K extends SectionKey>(k: K, v: Settings[K]) => setAll((a) => (a ? { ...a, [k]: v } : a));

  if (meta && !meta.can_manage_settings) {
    return <EmptyState icon={Sparkles} title="Only admins can change engagement settings" />;
  }
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Settings" title="Engagement" description="How Buzz, celebrations, kudos, announcements and surveys work for your company." />
      <Tabs items={TABS} value={tab} onChange={setTab} className="mb-6" />
      {!all ? <Skeleton className="h-96 rounded-2xl" /> : (
        <>
          {tab === "buzz" && <BuzzSection all={all} onSaved={onSaved} />}
          {tab === "celebrations" && <CelebrationsSection all={all} onSaved={onSaved} />}
          {tab === "kudos" && <KudosSection all={all} onSaved={onSaved} />}
          {tab === "announcements" && <AnnouncementsSection all={all} onSaved={onSaved} />}
          {tab === "surveys" && <SurveysSection all={all} onSaved={onSaved} />}
        </>
      )}
    </div>
  );
}

export default function EngageSettingsPage() {
  return <Suspense fallback={null}><EngageSettings /></Suspense>;
}
