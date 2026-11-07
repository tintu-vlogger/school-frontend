"use client";

/*
 * Settings → Company website. Pick one of four designs and edit what the company's own
 * address shows: hero, about, numbers, values, life at work, leadership, offices, contact.
 * Preview opens the real design in a full-screen modal with the unsaved changes.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Eye, ImagePlus, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell/page";
import {
  Button, Field, FormGrid, IconButton, Modal, Skeleton, Tabs, TextInput, Textarea, Toggle, useConfirm, useToast,
} from "@/components/ui-kit";
import { PHOTOS, type SectionKey, type SiteData, type Website } from "@/components/site/shared";
import { SiteView, THEMES } from "@/components/site/view";

type Resp = { website: Website; slug: string | null };
type Tab = "design" | "content" | "values" | "people";

const ACCENTS = ["#4f46e5", "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#b45309", "#16a34a", "#0f172a"];
const SECTION_LABELS: [SectionKey, string][] = [
  ["about", "About"], ["values", "Values"], ["life", "Life at work"], ["leaders", "Leadership"],
  ["jobs", "Open jobs"], ["offices", "Offices"], ["contact", "Contact"],
];
const card = "rounded-2xl border border-line bg-surface p-6";

/** Settings open on the company's own address, so the website is this host's front page. */
function siteAddress(slug: string | null) {
  if (!slug || typeof window === "undefined") return null;
  return `${window.location.origin}/`;
}

export default function WebsiteSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [orig, setOrig] = useState<Resp | null>(null);
  const [w, setW] = useState<Website | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [company, setCompany] = useState<{ name: string; logo_url: string; industry: string | null; city: string | null } | null>(null);
  const [jobs, setJobs] = useState<SiteData["jobs"]>([]);

  useEffect(() => {
    api.get<Resp>("/company/website").then((r) => { setOrig(r); setW(r.website); }).catch((e) => toast.error("Couldn't load the website", { description: e.message }));
  }, [toast]);

  useEffect(() => {
    if (!orig?.slug) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/companies/${orig.slug}/site`).then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setJobs(d.jobs); setCompany(d.company); } }).catch(() => {});
  }, [orig?.slug]);

  const dirty = useMemo(() => !!orig && !!w && JSON.stringify(orig.website) !== JSON.stringify(w), [orig, w]);
  const set = <K extends keyof Website>(k: K, v: Website[K]) => setW((cur) => (cur ? { ...cur, [k]: v } : cur));
  const patch = <K extends "hero" | "about" | "life" | "contact" | "social">(k: K, v: Partial<Website[K]>) =>
    setW((cur) => (cur ? { ...cur, [k]: { ...cur[k], ...v } } : cur));

  async function save() {
    if (!w) return;
    setSaving(true);
    try {
      const r = await api.put<Resp>("/company/website", w);
      setOrig(r); setW(r.website);
      toast.success("Website saved");
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally { setSaving(false); }
  }

  async function reset() {
    const ok = await confirm({ title: "Start over?", message: "All website content goes back to the starting version. Your design choice is reset too.", confirmLabel: "Start over", tone: "danger",
      onConfirm: async () => { const r = await api.post<Resp>("/company/website/reset", {}); setOrig(r); setW(r.website); } });
    if (ok) toast.success("Website reset");
  }

  const address = siteAddress(orig?.slug ?? null);

  if (!w || !orig) {
    return <div><PageHeader title="Company website" /><div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div></div>;
  }

  return (
    <div className="pb-24">
      <PageHeader title="Company website" eyebrow="Settings"
        description="Your company address opens this website. Employees sign in from the same place."
        actions={<>
          {address && <a href={address} target="_blank" rel="noreferrer"><Button icon={ExternalLink}>Open site</Button></a>}
          <Button icon={Eye} onClick={() => setPreview(true)}>Preview</Button>
          <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save</Button>
        </>} />

      <Tabs<Tab> value={tab} onChange={setTab} className="mb-6" items={[
        { value: "design", label: "Design" }, { value: "content", label: "Main content" },
        { value: "values", label: "Values & life" }, { value: "people", label: "People, offices & contact" },
      ]} />

      {tab === "design" && (
        <div className="space-y-5">
          <section className={card}>
            <h3 className="text-[16px] text-ink">Design</h3>
            <p className="mt-1 text-[13.5px] text-muted">The same content, four different looks.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {THEMES.map((t) => {
                const sel = w.theme === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => set("theme", t.id)}
                    className={`overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow] ${sel ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-line-strong"}`}>
                    <ThemeThumb id={t.id} bg={t.bg} ink={t.ink} accent={w.accent} />
                    <div className="flex items-start justify-between gap-2 p-4">
                      <div><p className="text-[15px] text-ink">{t.name}</p><p className="mt-0.5 text-[13px] leading-snug text-muted">{t.desc}</p></div>
                      {sel && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white"><Check size={14} strokeWidth={2} /></span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={card}>
            <h3 className="text-[16px] text-ink">Brand colour</h3>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {ACCENTS.map((c) => (
                <button key={c} type="button" onClick={() => set("accent", c)} aria-label={c}
                  className={`h-9 w-9 rounded-full transition-transform hover:scale-110 ${w.accent === c ? "ring-2 ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: c, ["--tw-ring-color" as string]: c }} />
              ))}
              <label className="ml-2 flex items-center gap-2 text-[13.5px] text-muted">
                <input type="color" value={w.accent} onChange={(e) => set("accent", e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface" />
                Custom
              </label>
            </div>
          </section>

          <section className={card}>
            <h3 className="text-[16px] text-ink">What to show</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Toggle checked={w.published} onChange={(v) => set("published", v)} label="Website is live" description="When off, your address goes straight to sign-in." />
              <Toggle checked={w.show_signin} onChange={(v) => set("show_signin", v)} label="Employee sign-in button" description="Shown at the top of every page." />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SECTION_LABELS.map(([k, label]) => (
                <Toggle key={k} size="sm" checked={w.sections[k] !== false} onChange={(v) => set("sections", { ...w.sections, [k]: v })} label={label} />
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-5">
          <section className={card}>
            <h3 className="mb-5 text-[16px] text-ink">Top of the page</h3>
            <FormGrid columns={1}>
              <Field label="Small line above the headline"><TextInput value={w.hero.eyebrow} maxLength={80} onValueChange={(v) => patch("hero", { eyebrow: v })} /></Field>
              <Field label="Headline"><TextInput value={w.hero.headline} maxLength={140} onValueChange={(v) => patch("hero", { headline: v })} /></Field>
              <Field label="Introduction"><Textarea value={w.hero.subline} maxLength={320} rows={2} onValueChange={(v) => patch("hero", { subline: v })} /></Field>
              <Field label="Main photo" hint="Pick one, or paste a link to your own photo."><PhotoPicker value={w.hero.image_url} onChange={(v) => patch("hero", { image_url: v })} /></Field>
            </FormGrid>
          </section>
          <section className={card}>
            <h3 className="mb-5 text-[16px] text-ink">About</h3>
            <FormGrid columns={1}>
              <Field label="Title"><TextInput value={w.about.title} maxLength={120} onValueChange={(v) => patch("about", { title: v })} /></Field>
              <Field label="Your story" hint="Leave a blank line between paragraphs."><Textarea value={w.about.body} maxLength={3000} rows={6} autoGrow onValueChange={(v) => patch("about", { body: v })} /></Field>
              <Field label="Photo"><PhotoPicker value={w.about.image_url} onChange={(v) => patch("about", { image_url: v })} /></Field>
            </FormGrid>
          </section>
          <section className={card}>
            <ListHead title="Numbers" hint="Up to 6, for example 2015 · Founded." onAdd={w.stats.length < 6 ? () => set("stats", [...w.stats, { value: "", label: "" }]) : undefined} />
            <div className="mt-4 space-y-3">
              {w.stats.map((s, i) => (
                <Row key={i} onRemove={() => set("stats", w.stats.filter((_, j) => j !== i))}>
                  <TextInput placeholder="Value" value={s.value} maxLength={24} onValueChange={(v) => set("stats", w.stats.map((x, j) => j === i ? { ...x, value: v } : x))} />
                  <TextInput placeholder="Label" value={s.label} maxLength={60} onValueChange={(v) => set("stats", w.stats.map((x, j) => j === i ? { ...x, label: v } : x))} />
                </Row>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "values" && (
        <div className="space-y-5">
          <section className={card}>
            <ListHead title="Values" hint="Up to 8." onAdd={w.values.length < 8 ? () => set("values", [...w.values, { title: "", body: "" }]) : undefined} />
            <div className="mt-4 space-y-3">
              {w.values.map((v, i) => (
                <Row key={i} onRemove={() => set("values", w.values.filter((_, j) => j !== i))}>
                  <TextInput placeholder="Value" value={v.title} maxLength={80} onValueChange={(x) => set("values", w.values.map((y, j) => j === i ? { ...y, title: x } : y))} />
                  <TextInput placeholder="What it means" value={v.body} maxLength={400} onValueChange={(x) => set("values", w.values.map((y, j) => j === i ? { ...y, body: x } : y))} />
                </Row>
              ))}
            </div>
          </section>
          <section className={card}>
            <h3 className="mb-5 text-[16px] text-ink">Life at work</h3>
            <FormGrid columns={1}>
              <Field label="Title"><TextInput value={w.life.title} maxLength={120} onValueChange={(v) => patch("life", { title: v })} /></Field>
              <Field label="Description"><Textarea value={w.life.body} maxLength={1500} rows={3} onValueChange={(v) => patch("life", { body: v })} /></Field>
              <Field label="Perks and benefits" hint="One per line.">
                <Textarea value={w.life.perks.join("\n")} rows={5} onValueChange={(v) => patch("life", { perks: v.split("\n").slice(0, 16) })} />
              </Field>
              <Field label="Photos" hint="Choose up to 3. With none chosen, we use a set that fits your design.">
                <PhotoMulti value={w.life.images} onChange={(v) => patch("life", { images: v })} />
              </Field>
            </FormGrid>
          </section>
        </div>
      )}

      {tab === "people" && (
        <div className="space-y-5">
          <section className={card}>
            <ListHead title="Leadership" hint="Shown only when you add someone." onAdd={w.leaders.length < 12 ? () => set("leaders", [...w.leaders, { name: "", role: "", bio: "", photo_url: null }]) : undefined} />
            <div className="mt-4 space-y-4">
              {w.leaders.map((l, i) => {
                const up = (p: Partial<typeof l>) => set("leaders", w.leaders.map((x, j) => j === i ? { ...x, ...p } : x));
                return (
                  <div key={i} className="rounded-xl border border-line p-4">
                    <Row onRemove={() => set("leaders", w.leaders.filter((_, j) => j !== i))}>
                      <TextInput placeholder="Name" value={l.name} maxLength={100} onValueChange={(v) => up({ name: v })} />
                      <TextInput placeholder="Role" value={l.role} maxLength={100} onValueChange={(v) => up({ role: v })} />
                    </Row>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <TextInput placeholder="A line about them (optional)" value={l.bio} maxLength={400} onValueChange={(v) => up({ bio: v })} />
                      <TextInput placeholder="Photo link (optional)" value={l.photo_url ?? ""} onValueChange={(v) => up({ photo_url: v || null })} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className={card}>
            <ListHead title="Offices" onAdd={w.offices.length < 12 ? () => set("offices", [...w.offices, { city: "", address: "", phone: "", head_office: false }]) : undefined} />
            <div className="mt-4 space-y-4">
              {w.offices.map((o, i) => {
                const up = (p: Partial<typeof o>) => set("offices", w.offices.map((x, j) => j === i ? { ...x, ...p } : x));
                return (
                  <div key={i} className="rounded-xl border border-line p-4">
                    <Row onRemove={() => set("offices", w.offices.filter((_, j) => j !== i))}>
                      <TextInput placeholder="City" value={o.city} maxLength={80} onValueChange={(v) => up({ city: v })} />
                      <TextInput placeholder="Phone" value={o.phone} maxLength={30} onValueChange={(v) => up({ phone: v })} />
                    </Row>
                    <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto]">
                      <TextInput placeholder="Address" value={o.address} maxLength={300} onValueChange={(v) => up({ address: v })} />
                      <Toggle size="sm" checked={o.head_office} onChange={(v) => up({ head_office: v })} label="Head office" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className={card}>
            <h3 className="mb-5 text-[16px] text-ink">Contact</h3>
            <FormGrid>
              <Field label="Email"><TextInput type="email" value={w.contact.email} onValueChange={(v) => patch("contact", { email: v })} /></Field>
              <Field label="Phone"><TextInput value={w.contact.phone} onValueChange={(v) => patch("contact", { phone: v })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={w.contact.address} onValueChange={(v) => patch("contact", { address: v })} /></Field>
            </FormGrid>
          </section>
          <section className={card}>
            <h3 className="mb-5 text-[16px] text-ink">Social links</h3>
            <FormGrid>
              {(["linkedin", "instagram", "x", "facebook", "youtube"] as const).map((k) => (
                <Field key={k} label={{ linkedin: "LinkedIn", instagram: "Instagram", x: "X", facebook: "Facebook", youtube: "YouTube" }[k]}>
                  <TextInput placeholder="https://" value={w.social[k]} onValueChange={(v) => patch("social", { [k]: v })} />
                </Field>
              ))}
            </FormGrid>
          </section>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" icon={RotateCcw} onClick={reset}>Start over</Button>
        <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} size="full" title="Preview" description="Unsaved changes are included." flush>
        {company && (
          <div className="relative isolate [transform:translateZ(0)]">
            <SiteView preview data={{ company: { slug: orig.slug ?? "", logo_url: company.logo_url, name: company.name, industry: company.industry, city: company.city }, site: w, jobs }} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ListHead({ title, hint, onAdd }: { title: string; hint?: string; onAdd?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="text-[16px] text-ink">{title}</h3>{hint && <p className="mt-0.5 text-[13.5px] text-muted">{hint}</p>}</div>
      {onAdd && <Button size="sm" icon={Plus} onClick={onAdd}>Add</Button>}
    </div>
  );
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_2fr]">{children}</div>
      <IconButton icon={Trash2} label="Remove" onClick={onRemove} />
    </div>
  );
}

function PhotoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const custom = value && !PHOTOS.some((p) => p.url === value) ? value : "";
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        <button type="button" onClick={() => onChange(null)}
          className={`flex aspect-[4/3] items-center justify-center rounded-lg border text-center text-[12px] text-muted ${!value ? "border-primary ring-2 ring-primary/20" : "border-line"}`}>Design default</button>
        {PHOTOS.map((p) => (
          <button key={p.id} type="button" onClick={() => onChange(p.url)} title={p.label}
            className={`relative overflow-hidden rounded-lg border ${value === p.url ? "border-primary ring-2 ring-primary/30" : "border-line"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.label} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          </button>
        ))}
      </div>
      <div className="mt-3"><TextInput leading={ImagePlus} placeholder="Or paste a photo link (https://…)" value={custom} onValueChange={(v) => onChange(v.trim() || null)} /></div>
    </div>
  );
}

function PhotoMulti({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {PHOTOS.map((p) => {
        const i = value.indexOf(p.url);
        return (
          <button key={p.id} type="button" title={p.label}
            onClick={() => onChange(i >= 0 ? value.filter((x) => x !== p.url) : value.length < 3 ? [...value, p.url] : value)}
            className={`relative overflow-hidden rounded-lg border ${i >= 0 ? "border-primary ring-2 ring-primary/30" : "border-line"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.label} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            {i >= 0 && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">{i + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ThemeThumb({ id, bg, ink, accent }: { id: string; bg: string; ink: string; accent: string }) {
  const serif = id === "serene", bold = id === "pulse";
  return (
    <div className="h-[132px] p-4" style={{ background: bg, color: ink }}>
      <div className="flex items-center justify-between text-[9px] opacity-70"><span>Your company</span><span className="rounded-full px-2 py-0.5" style={{ background: id === "classic" ? "transparent" : accent, color: "#fff", border: id === "classic" ? `1px solid ${ink}55` : "none" }}>Sign in</span></div>
      <p className="mt-4 text-[16px] leading-[1.05]" style={{ fontFamily: serif ? "Georgia, serif" : undefined, fontStyle: serif ? "italic" : "normal", fontWeight: bold ? 700 : 200, letterSpacing: bold ? "-0.03em" : 0 }}>People who care,<br />doing work that matters.</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((k) => <div key={k} className={`h-7 ${serif ? "rounded-t-full rounded-b-md" : bold ? "rounded-lg" : "rounded-md"}`} style={{ background: k === 1 ? accent : `${ink}1f` }} />)}
      </div>
    </div>
  );
}
