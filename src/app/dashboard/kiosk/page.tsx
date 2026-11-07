"use client";

/*
 * Kiosk screens: office TVs that cycle birthdays, anniversaries, new joiners,
 * announcements, news and kudos from a secret link (no sign-in). Each card shows a live
 * scaled-down preview; add and edit open in a modal where slides are switched on and
 * ordered. Changing the link stops the old one working at once.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown, ArrowUp, Copy, ExternalLink, MonitorPlay, Pencil, Plus, RefreshCw, Power,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, Menu, Modal, ModalCancel, NumberInput, RadioCards, Skeleton, TextInput, Toggle, useConfirm,
} from "@/components/ui-kit";
import { AudiencePicker } from "@/components/engagement/audience-picker";
import { useEngagementMeta } from "@/components/engagement/context";
import type { Audience } from "@/components/engagement/types";

type Slide = { type: string; enabled: boolean };
type Kiosk = {
  uuid: string; name: string; token: string; slides: Slide[]; seconds_per_slide: number; audience: Audience;
  audience_label: string | null; theme: "dark" | "light" | "festive"; welcome_text: string | null; active: boolean;
  created_at: string; path: string;
};
type ListOut = { items: Kiosk[]; slide_types: Record<string, string> };

const SLIDE_HINT: Record<string, string> = {
  welcome: "Big clock, date, your welcome line and today's highlights",
  birthdays: "Today's birthdays with photos, and the rest of the week",
  anniversaries: "Work anniversaries today and this week",
  new_joiners: "People who joined in the last two weeks",
  announcements: "Announcements marked “Show on kiosk”",
  news: "Company news marked “Show on kiosk”",
  kudos: "Kudos from the last two weeks",
};
const SLIDE_EMOJI: Record<string, string> = { welcome: "🕘", birthdays: "🎂", anniversaries: "🎉", new_joiners: "👋", announcements: "📣", news: "📰", kudos: "💛" };
const THEME_SWATCH: Record<string, string> = {
  dark: "radial-gradient(ellipse at 15% 0%, #312e81, #0b1020 60%)",
  light: "linear-gradient(135deg, #fffaf3, #f3f1ff 60%, #eef6ff)",
  festive: "linear-gradient(135deg, #3b0764, #831843 50%, #9a3412)",
};

const linkFor = (k: Kiosk) => (typeof window === "undefined" ? k.path : `${window.location.origin}${k.path}`);

/** The real kiosk page, scaled down to a thumbnail (1920x1080 drawn at card width). */
function LivePreview({ k, version }: { k: Kiosk; version: number }) {
  const [w, setW] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
  }, []);
  const scale = w / 1920;
  return (
    <div ref={ref} className="relative aspect-video w-full overflow-hidden rounded-xl border border-line" style={{ background: THEME_SWATCH[k.theme] }}>
      {k.active && w > 0 ? (
        <iframe key={version} src={k.path} title={`${k.name} preview`} tabIndex={-1} loading="lazy"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: 1920, height: 1080, transform: `scale(${scale})` }} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
          <Power size={22} strokeWidth={1.3} />
          <p className="mt-2 text-[13px]">Switched off</p>
        </div>
      )}
    </div>
  );
}

function KioskCard({ k, version, onEdit, onChanged }: { k: Kiosk; version: number; onEdit: () => void; onChanged: (k: Kiosk) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const on = k.slides.filter((s) => s.enabled);
  const copy = async () => {
    try { await navigator.clipboard.writeText(linkFor(k)); toast.success("Link copied", { description: "Open it in the TV's browser and make it full screen." }); }
    catch { toast.error("Couldn't copy. Select the link and copy it yourself."); }
  };
  const newLink = async () => {
    const ok = await confirm({
      title: `Change the link for ${k.name}?`, confirmLabel: "Change link", tone: "danger",
      message: "The screen showing the current link stops working straight away. You'll need to open the new link on it.",
    });
    if (!ok) return;
    try { onChanged(await api.post<Kiosk>(`/engagement/kiosks/${k.uuid}/new-link`)); toast.success("New link ready"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const toggle = async () => {
    try { onChanged(await api.put<Kiosk>(`/engagement/kiosks/${k.uuid}`, { active: !k.active })); toast.success(k.active ? "Screen switched off" : "Screen switched on"); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-3">
      <LivePreview k={k} version={version} />
      <div className="flex items-start justify-between gap-2 px-1 pt-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 truncate text-[15.5px] text-ink">{k.name}
            {k.active ? <Badge tone="good" dot>Live</Badge> : <Badge>Off</Badge>}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-faint">
            {on.length} slide{on.length === 1 ? "" : "s"} · {k.seconds_per_slide}s each · {k.audience_label || "Everyone"}
          </p>
        </div>
        <Menu items={[
            { label: "Edit", icon: Pencil, onSelect: onEdit },
            { label: k.active ? "Switch off" : "Switch on", icon: Power, onSelect: toggle },
            { label: "Change link", icon: RefreshCw, onSelect: newLink, danger: true },
          ]} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1 px-1">
        {on.map((s) => <span key={s.type} title={SLIDE_HINT[s.type]} className="rounded-full bg-sunken px-2 py-0.5 text-[12px] text-muted">{SLIDE_EMOJI[s.type]} {s.type.replace("_", " ")}</span>)}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-sunken px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-[12px] text-muted">{linkFor(k)}</code>
        <button type="button" onClick={copy} aria-label="Copy link" className="text-muted hover:text-ink"><Copy size={15} strokeWidth={1.4} /></button>
        <a href={k.path} target="_blank" rel="noreferrer" aria-label="Open" className="text-muted hover:text-ink"><ExternalLink size={15} strokeWidth={1.4} /></a>
      </div>
      <p className="mt-2 px-1 text-[11.5px] text-faint">Added {formatDate(k.created_at)}</p>
    </article>
  );
}

type Draft = Pick<Kiosk, "name" | "slides" | "seconds_per_slide" | "audience" | "theme" | "welcome_text" | "active">;

function blank(types: Record<string, string>): Draft {
  return {
    name: "", slides: Object.keys(types).map((t) => ({ type: t, enabled: true })), seconds_per_slide: 10,
    audience: { all: true }, theme: "dark", welcome_text: "Welcome! Have a great day.", active: true,
  };
}

function KioskModal({ open, kiosk, types, onClose, onSaved }: {
  open: boolean; kiosk: Kiosk | null; types: Record<string, string>; onClose: () => void; onSaved: (k: Kiosk) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => blank(types));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDirty(false);
    if (kiosk) {
      const known = new Set(kiosk.slides.map((s) => s.type));
      setD({ ...kiosk, slides: [...kiosk.slides, ...Object.keys(types).filter((t) => !known.has(t)).map((t) => ({ type: t, enabled: false }))] });
    } else setD(blank(types));
  }, [open, kiosk, types]);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setDirty(true); };
  const move = (i: number, dir: -1 | 1) => {
    const s = [...d.slides]; const j = i + dir;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]]; set({ slides: s });
  };
  const save = async () => {
    if (!d.name.trim()) { toast.error("Give the screen a name, such as “Reception TV”."); return; }
    if (!d.slides.some((s) => s.enabled)) { toast.error("Turn on at least one slide."); return; }
    setSaving(true);
    try {
      const body = { name: d.name, slides: d.slides, seconds_per_slide: d.seconds_per_slide, audience: d.audience, theme: d.theme, welcome_text: d.welcome_text, active: d.active };
      const out = kiosk ? await api.put<Kiosk>(`/engagement/kiosks/${kiosk.uuid}`, body) : await api.post<Kiosk>("/engagement/kiosks", body);
      toast.success(kiosk ? "Screen saved" : "Screen added", kiosk ? undefined : { description: "Copy its link and open it on the TV." });
      onSaved(out); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={kiosk ? `Edit ${kiosk.name}` : "Add a kiosk screen"}
      description="What a wall screen shows: first names and photos only, never birth years."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>{kiosk ? "Save" : "Add screen"}</Button></>}>
      <div className="space-y-6">
        <FormGrid>
          <Field label="Screen name" required><TextInput value={d.name} onValueChange={(v) => set({ name: v })} placeholder="Reception TV" autoFocusInModal /></Field>
          <Field label="Seconds per slide" hint="5 to 120"><NumberInput value={d.seconds_per_slide} onChange={(v) => set({ seconds_per_slide: v ?? 10 })} min={5} max={120} suffix="sec" /></Field>
        </FormGrid>
        <Field label="Welcome line" hint="Shown under the clock."><TextInput value={d.welcome_text ?? ""} onValueChange={(v) => set({ welcome_text: v })} maxLength={200} placeholder="Welcome! Have a great day." /></Field>
        <Field label="Look">
          <RadioCards columns={3} value={d.theme} onChange={(v) => set({ theme: v })} options={(["dark", "light", "festive"] as const).map((t) => ({
            value: t,
            label: <span className="flex items-center gap-2"><span className="h-5 w-8 rounded-md border border-line" style={{ background: THEME_SWATCH[t] }} />{t[0].toUpperCase() + t.slice(1)}</span>,
            description: t === "dark" ? "Best for TVs" : t === "light" ? "Bright rooms" : "Festivals and events",
          }))} />
        </Field>
        <Field label="Slides" hint="Switch slides on and put them in order. Empty slides are skipped.">
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {d.slides.map((s, i) => (
              <li key={s.type} className={`flex items-center gap-3 px-3 py-2.5 ${s.enabled ? "" : "bg-sunken/50"}`}>
                <span className="text-[20px]">{SLIDE_EMOJI[s.type] ?? "▫️"}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] ${s.enabled ? "text-ink" : "text-faint"}`}>{types[s.type] ?? s.type}</span>
                  <span className="block truncate text-[12px] text-faint">{SLIDE_HINT[s.type]}</span>
                </span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30"><ArrowUp size={15} /></button>
                <button type="button" aria-label="Move down" disabled={i === d.slides.length - 1} onClick={() => move(i, 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30"><ArrowDown size={15} /></button>
                <Toggle size="sm" checked={s.enabled} aria-label={`Show ${types[s.type]}`} onChange={(v) => set({ slides: d.slides.map((x, j) => (j === i ? { ...x, enabled: v } : x)) })} />
              </li>
            ))}
          </ul>
        </Field>
        <Field label="Whose celebrations and kudos to show" hint="For a branch TV, pick that location. Announcements show when meant for everyone or for exactly this group.">
          <AudiencePicker value={d.audience} onChange={(a) => set({ audience: a })} />
        </Field>
        <Toggle checked={d.active} onChange={(v) => set({ active: v })} label="Screen is on" description="When off, the link shows a “not active” message." />
      </div>
    </Modal>
  );
}

export default function KioskPage() {
  const meta = useEngagementMeta();
  const toast = useToast();
  const [data, setData] = useState<ListOut | null>(null);
  const [edit, setEdit] = useState<{ open: boolean; kiosk: Kiosk | null }>({ open: false, kiosk: null });
  const [versions, setVersions] = useState<Record<string, number>>({});

  useEffect(() => {
    api.get<ListOut>("/engagement/kiosks").then(setData).catch((e) => { toast.error((e as Error).message); setData({ items: [], slide_types: {} }); });
  }, [toast]);

  const saved = (k: Kiosk) => {
    setData((d) => d && ({ ...d, items: d.items.some((x) => x.uuid === k.uuid) ? d.items.map((x) => (x.uuid === k.uuid ? k : x)) : [...d.items, k] }));
    setVersions((v) => ({ ...v, [k.uuid]: (v[k.uuid] ?? 0) + 1 }));
  };

  if (meta && !meta.can_manage_settings) {
    return <EmptyState icon={MonitorPlay} title="Only admins can manage kiosk screens" hint="Ask your HR team if you'd like a screen set up for your office." />;
  }

  return (
    <div>
      <PageHeader eyebrow="Engage" title="Kiosk screens"
        description="Put Buzz on the office TV: birthdays, anniversaries, new joiners, announcements and kudos on a loop. Each screen has its own secret link, so no one needs to sign in."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEdit({ open: true, kiosk: null })} disabled={!data}>Add screen</Button>} />
      {!data ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={MonitorPlay} title="No screens yet" hint="Add a screen, copy its link and open it full screen on any TV or monitor with a browser."
          action={<Button variant="primary" icon={Plus} onClick={() => setEdit({ open: true, kiosk: null })}>Add screen</Button>} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((k) => <KioskCard key={k.uuid} k={k} version={versions[k.uuid] ?? 0} onEdit={() => setEdit({ open: true, kiosk: k })} onChanged={saved} />)}
        </div>
      )}
      <div className="mt-8 rounded-2xl border border-line bg-surface px-5 py-4 text-[13.5px] text-muted">
        <p className="text-ink">Setting up a TV</p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
          <li>Copy the screen&apos;s link and open it in the TV&apos;s browser (or a small stick PC plugged into it).</li>
          <li>Make the browser full screen. The screen refreshes itself every few minutes.</li>
          <li>Only announcements marked “Show on kiosk” appear. If a link is shared by mistake, change it.</li>
        </ol>
      </div>
      <KioskModal open={edit.open} kiosk={edit.kiosk} types={data?.slide_types ?? {}} onClose={() => setEdit((e) => ({ ...e, open: false }))} onSaved={saved} />
    </div>
  );
}
