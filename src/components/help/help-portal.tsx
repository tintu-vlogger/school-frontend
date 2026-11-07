"use client";

/*
 * Help portal: topics on the left, search on top, the chosen guide on the right. Each guide section
 * shows the real page (or one of its pop-ups) in a view-only frame running on SAMPLE DATA
 * (?embed=1&demo=1, never the company's own data), with numbered outlines on each part and a legend.
 * Everything follows the chosen language: the guide text is translated like the rest of the app,
 * and the call-outs find their parts by the English text or its translation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Briefcase, CalendarCheck2, ChevronRight, CornerDownLeft, DoorOpen, ExternalLink, HeartHandshake, Home,
  Lightbulb, LifeBuoy, ListChecks, Monitor, MousePointerClick, Rocket, Search, Settings2, Target, Users, Wallet, X,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { loadDict, lookup } from "@/i18n/live-translate";
import { HELP_CATEGORIES, type HelpSection, type HelpTopic } from "./help-types";
import { HELP_TOPICS, topicById } from "./help-index";

const CAT_ICON: Record<string, React.ElementType> = {
  "Getting started": Rocket, "Home and self-service": Home, People: Users, "Time and leave": CalendarCheck2, Payroll: Wallet,
  "Hiring and onboarding": Briefcase, "Performance and learning": Target, Exits: DoorOpen, "Engagement and support": HeartHandshake,
  "Reports and insights": BarChart3, "Company setup": Settings2,
};
const W = 1280, VIEW_H = 820, MAX_H = 2400;
const STROKE = 1.4;

/* ── search ────────────────────────────────────────────────────────── */
function searchTopics(q: string, tr: (s: string) => string): HelpTopic[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return HELP_TOPICS;
  return HELP_TOPICS.map((t) => {
    const title = `${t.title} ${tr(t.title)}`.toLowerCase();
    const keys = t.keywords.join(" ").toLowerCase();
    const body = [t.summary, tr(t.summary), ...(t.steps || []), ...t.sections.flatMap((s) => [s.title, s.desc, ...s.parts.map((p) => `${p.label} ${p.desc}`)])].join(" ").toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 8;
      else if (keys.includes(w)) score += 5;
      else if (body.includes(w)) score += 2;
      else return { t, score: 0 };
    }
    return { t, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.t);
}

/* ── finding parts inside the frame ────────────────────────────────── */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
function findByText(doc: Document, root: Element, wants: string[]): Element | null {
  for (const text of wants) {
    const want = norm(text);
    if (!want) continue;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let starts: Element | null = null;
    while (walker.nextNode()) {
      const t = norm(walker.currentNode.textContent || "");
      if (!t) continue;
      const el = walker.currentNode.parentElement;
      if (!el || !visible(el)) continue;
      if (t === want) return el;
      if (!starts && t.startsWith(want)) starts = el;
    }
    if (starts) return starts;
    const all = [...root.querySelectorAll<HTMLElement>("button,a,label,h1,h2,h3,h4,p,span,th,div")].filter(visible);
    const byText = all.filter((e) => norm(e.innerText || "").startsWith(want)).sort((a, b) => a.innerText.length - b.innerText.length)[0];
    if (byText) return byText;
    const attr = [...root.querySelectorAll<HTMLElement>("[title],[aria-label],[placeholder]")].filter(visible)
      .find((e) => [e.title, e.getAttribute("aria-label"), e.getAttribute("placeholder")].some((v) => v && norm(v).startsWith(want)));
    if (attr) return attr;
  }
  return null;
}
/** The block worth outlining: the control itself, the field around a label, or the card around a heading. */
function blockFor(el: Element, root: Element): Element {
  const ctrl = el.closest("button,a,select,input,textarea,[role=button],[role=tab],th,tr");
  if (ctrl && root.contains(ctrl)) return ctrl;
  if (el.tagName === "LABEL" || el.closest("label")) return (el.closest("label") || el).parentElement || el;
  const win = el.ownerDocument.defaultView!;
  const rootBox = root.getBoundingClientRect();
  let cur: Element | null = el;
  for (let i = 0; i < 7 && cur && cur !== root; i++) {
    const cs = win.getComputedStyle(cur);
    const r = cur.getBoundingClientRect();
    const framed = (parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none" || cs.backgroundColor !== "rgba(0, 0, 0, 0)") && parseFloat(cs.borderTopLeftRadius) > 4;
    if (framed && r.width < rootBox.width * 0.98 && r.height < 900) return cur;
    cur = cur.parentElement;
  }
  return el;
}
function clickByText(doc: Document, wants: string[]): boolean {
  for (const text of wants) {
    const want = norm(text);
    const els = [...doc.querySelectorAll<HTMLElement>("button,a,[role=button],[role=tab],tr,[class*=cursor-pointer]")].filter(visible);
    const el = els.find((e) => norm(e.innerText || "") === want || norm(e.title || "") === want || norm(e.getAttribute("aria-label") || "") === want)
      || els.find((e) => norm(e.innerText || "").startsWith(want));
    if (el) { el.click(); return true; }
  }
  return false;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Box = { x: number; y: number; w: number; h: number } | null;

/** One guide section: the page in a frame with numbered outlines, plus the legend. */
function Scene({ section, index, tr }: { section: HelpSection; index: number; tr: (s: string) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [inView, setInView] = useState(false);
  const [scale, setScale] = useState(0.55);
  const [height, setHeight] = useState(VIEW_H);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [ready, setReady] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const modal = !!section.click?.length;
  const both = useCallback((s: string) => { const t = tr(s); return t && t !== s ? [s, t] : [s]; }, [tr]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    const fit = () => setScale(el.clientWidth / W);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => { io.disconnect(); ro.disconnect(); };
  }, []);

  const sep = section.path.includes("?") ? "&" : "?";
  const src = `${section.path}${sep}embed=1&demo=1`;

  const annotate = useCallback(async () => {
    const f = frame.current; const doc = f?.contentDocument; if (!doc) return;
    // wait for the page to draw (the first part, or the click target, appears)
    const first = section.click?.[0] || section.parts[0]?.find;
    for (let i = 0; i < 40; i++) { if (first && findByText(doc, doc.body, both(first))) break; await sleep(250); }
    await sleep(600);
    for (const c of section.click || []) { clickByText(doc, both(c)); await sleep(1100); }
    const dialogs = [...doc.querySelectorAll('[role=dialog]')].filter(visible);
    const root = (modal && dialogs.length ? dialogs[dialogs.length - 1] : doc.body) as Element;
    const docH = Math.min(MAX_H, Math.max(VIEW_H, doc.documentElement.scrollHeight));
    setHeight(modal ? VIEW_H : docH);
    await sleep(250);
    const found = section.parts.map((p) => {
      const el = findByText(doc, root, both(p.find)) || (root !== doc.body ? findByText(doc, doc.body, both(p.find)) : null);
      if (!el) return null;
      const r = blockFor(el, root).getBoundingClientRect();
      const sy = doc.defaultView?.scrollY || 0;
      return { x: r.left, y: r.top + sy, w: r.width, h: r.height };
    });
    setBoxes(found);
    setReady(true);
  }, [section, modal, both]);

  return (
    <section className="scroll-mt-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] text-white">{index + 1}</span>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-light text-ink">
            {section.title}
            {modal && <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted"><MousePointerClick size={11} strokeWidth={STROKE} /> after clicking {section.click!.join(" → ")}</span>}
          </h2>
          <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{section.desc}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line bg-sunken/60 px-3 py-2">
          <span className="flex gap-1">{["#f0a8a0", "#f2d38b", "#a8d5b9"].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
          <span className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11.5px] text-faint" data-no-translate>
            <Monitor size={11} strokeWidth={STROKE} /><span className="truncate">{section.path}</span>
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">Sample data</span>
        </div>
        <div ref={wrap} className="relative w-full overflow-hidden bg-canvas" style={{ height: height * scale }}>
          {(!inView || !ready) && <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-sunken to-canvas"><span className="h-1 w-24 overflow-hidden rounded-full bg-line"><span className="block h-full w-1/3 animate-pulse rounded-full bg-primary/60" /></span></div>}
          {inView && (
            <iframe ref={frame} src={src} title={section.title} tabIndex={-1} aria-hidden onLoad={annotate}
              className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
              style={{ width: W, height, transform: `scale(${scale})` }} />
          )}
          {ready && boxes.map((b, i) => b && (
            <div key={i} className="pointer-events-none absolute z-20 transition-all duration-200"
              style={{ left: b.x * scale - 3, top: b.y * scale - 3, width: b.w * scale + 6, height: b.h * scale + 6 }}>
              <div className={`h-full w-full rounded-[10px] border-2 transition-all ${hot === null || hot === i ? "border-primary" : "border-primary/25"} ${hot === i ? "bg-primary/[0.07]" : ""}`} />
              <span className={`absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] text-white ${hot === null || hot === i ? "bg-primary" : "bg-primary/40"}`}>{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {section.parts.map((p, i) => (
          <li key={i} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
            className={`flex gap-3 rounded-2xl border px-3.5 py-3 transition ${hot === i ? "border-primary/50 bg-primary/[0.03]" : "border-line bg-surface"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] ${ready && !boxes[i] ? "bg-sunken text-faint" : "bg-primary-soft text-primary"}`}>{i + 1}</span>
            <span className="min-w-0"><span className="block text-[14px] text-ink">{p.label}</span><span className="block text-[13px] leading-relaxed text-muted">{p.desc}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const w = q.trim().split(/\s+/).filter((x) => x.length > 1).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!w.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${w.join("|")})`, "ig"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-primary/15 px-0.5 text-ink">{p}</mark> : p))}</>;
}

/* ── portal ────────────────────────────────────────────────────────── */
export function HelpPortal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const { locale } = useI18n();
  const [dict, setDict] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (locale === "en") setDict(null); else loadDict(locale).then(setDict); }, [locale]);
  const tr = useCallback((s: string) => (dict ? lookup(dict, s)?.trim() ?? s : s), [dict]);

  const [sel, setSel] = useState<string>(initial || HELP_TOPICS[0]?.id);
  useEffect(() => { if (open && initial) setSel(initial); }, [open, initial]);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchTopics(q, tr), [q, tr]);
  const topic = topicById(sel) || HELP_TOPICS[0];

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (q) setQ(""); else onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose, q]);

  if (!open || !topic) return null;

  const pick = (id: string) => { setSel(id); setQ(""); setFocus(false); bodyRef.current?.scrollTo({ top: 0 }); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % results.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + results.length) % results.length); }
    if (e.key === "Enter") { e.preventDefault(); pick(results[Math.min(hi, results.length - 1)].id); inputRef.current?.blur(); }
  };
  const idx = HELP_TOPICS.findIndex((t) => t.id === topic.id);
  const next = HELP_TOPICS[idx + 1];
  const CatIcon = CAT_ICON[topic.category] || LifeBuoy;
  const openPath = topic.sections[0]?.path;
  const screens = HELP_TOPICS.reduce((a, t) => a + t.sections.length, 0);

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-ink/30 backdrop-blur-[3px] sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Help"
        className="flex h-full w-full max-w-[1320px] flex-col overflow-hidden bg-canvas sm:rounded-[24px] sm:border sm:border-line" onClick={(e) => e.stopPropagation()}>
        {/* top bar + search */}
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft sm:flex"><LifeBuoy size={17} strokeWidth={STROKE} className="text-primary" /></span>
          <div className="hidden min-w-[140px] sm:block">
            <p className="text-[15px] text-ink">Help</p>
            <p className="text-[12px] text-faint">{HELP_TOPICS.length} guides · {screens} screens</p>
          </div>
          <div className="relative mx-auto w-full max-w-xl">
            <Search size={16} strokeWidth={STROKE} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input ref={inputRef} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} onKeyDown={onKey}
              placeholder="Search help, e.g. leave, payslip, PF, approval"
              className="h-11 w-full rounded-full border border-line bg-sunken pl-11 pr-16 text-[14px] text-ink outline-none transition placeholder:text-faint focus:border-primary/50 focus:bg-surface focus:ring-4 focus:ring-primary/10" />
            <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-faint sm:block">⌘K</kbd>
            {focus && q.trim() && (
              <div className="absolute left-0 right-0 top-[52px] z-30 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_40px_-24px_rgba(20,23,31,0.35)]">
                {results.length === 0 ? (
                  <p className="px-4 py-5 text-center text-[13.5px] text-faint">No guide matches this. Try another word.</p>
                ) : (
                  <ul className="max-h-[60vh] overflow-y-auto py-1.5">
                    {results.slice(0, 12).map((t, i) => {
                      const Icon = CAT_ICON[t.category] || LifeBuoy;
                      return (
                        <li key={t.id}>
                          <button onMouseDown={(e) => { e.preventDefault(); pick(t.id); }} onMouseEnter={() => setHi(i)}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${i === hi ? "bg-sunken" : ""}`}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken"><Icon size={14} strokeWidth={STROKE} className="text-muted" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] text-ink"><Highlight text={t.title} q={q} /></span>
                              <span className="block truncate text-[12.5px] text-faint">{t.summary}</span>
                            </span>
                            {i === hi && <CornerDownLeft size={13} className="shrink-0 text-faint" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close help" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"><X size={18} strokeWidth={STROKE} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* topics */}
          <nav className="hr-scroll hidden w-[270px] shrink-0 overflow-y-auto border-r border-line bg-surface px-3 py-4 md:block" aria-label="Help topics">
            {HELP_CATEGORIES.map((cat) => {
              const Icon = CAT_ICON[cat] || LifeBuoy;
              const list = HELP_TOPICS.filter((t) => t.category === cat);
              if (!list.length) return null;
              return (
                <div key={cat} className="mb-4">
                  <p className="mb-1 flex items-center gap-2 px-3 text-[11px] uppercase tracking-[0.12em] text-faint"><Icon size={12} strokeWidth={STROKE} />{cat}</p>
                  {list.map((t) => {
                    const on = t.id === topic.id;
                    return (
                      <button key={t.id} onClick={() => pick(t.id)}
                        className={`relative flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13.5px] transition ${on ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink"}`}>
                        <span className="truncate">{t.title}</span>
                        <span className="text-[11px] text-faint">{t.sections.length}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* guide */}
          <div ref={bodyRef} className="hr-scroll min-w-0 flex-1 overflow-y-auto">
            <div className="border-b border-line bg-surface px-4 py-2.5 md:hidden">
              <select value={topic.id} onChange={(e) => pick(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] outline-none">
                {HELP_CATEGORIES.map((cat) => <optgroup key={cat} label={cat}>{HELP_TOPICS.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>)}
              </select>
            </div>

            <article key={topic.id} className="mx-auto max-w-[940px] px-5 py-7 sm:px-8">
              <p className="flex items-center gap-1.5 text-[12.5px] text-faint"><CatIcon size={12} strokeWidth={STROKE} />{topic.category}<ChevronRight size={12} />{topic.title}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-[28px] font-extralight leading-tight text-ink">{topic.title}</h1>
                  <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-muted">{topic.summary}</p>
                  {topic.audience && topic.audience !== "everyone" && (
                    <p className="mt-2 inline-flex rounded-full bg-sunken px-2.5 py-0.5 text-[12px] text-muted">{topic.audience === "hr" ? "For HR and admins" : "For managers"}</p>
                  )}
                </div>
                {openPath && (
                  <Link href={openPath.split("?")[0]} onClick={onClose} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] text-white transition hover:opacity-90">
                    Open this page <ExternalLink size={13} strokeWidth={STROKE} />
                  </Link>
                )}
              </div>

              {topic.sections.length > 1 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {topic.sections.map((s, i) => (
                    <button key={i} onClick={() => document.getElementById(`help-sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-muted transition hover:border-line-strong hover:text-ink">
                      <span className="text-faint">{i + 1}</span>{s.title}
                    </button>
                  ))}
                </div>
              )}

              {topic.steps && topic.steps.length > 0 && (
                <section className="mt-7">
                  <h2 className="flex items-center gap-2 text-[12px] uppercase tracking-[0.1em] text-faint"><ListChecks size={13} strokeWidth={STROKE} /> Step by step</h2>
                  <ol className="mt-3 space-y-2">
                    {topic.steps.map((s, i) => (
                      <li key={i} className="flex gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11.5px] text-white">{i + 1}</span>
                        <span className="text-[14.5px] leading-relaxed text-ink">{s}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <div className="mt-8 space-y-12">
                {topic.sections.map((s, i) => <div key={`${topic.id}-${i}`} id={`help-sec-${i}`}><Scene section={s} index={i} tr={tr} /></div>)}
              </div>

              {topic.tips && topic.tips.length > 0 && (
                <section className="mt-10 rounded-2xl border border-amber-200/70 bg-amber-50/50 px-4 py-3.5">
                  {topic.tips.map((t, i) => (
                    <p key={i} className={`flex gap-2.5 text-[14px] leading-relaxed text-amber-900 ${i ? "mt-2" : ""}`}><Lightbulb size={15} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-amber-600" />{t}</p>
                  ))}
                </section>
              )}

              {topic.related && topic.related.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-[12px] uppercase tracking-[0.1em] text-faint">Related guides</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {topic.related.map(topicById).filter((r): r is HelpTopic => !!r).map((r) => (
                      <button key={r.id} onClick={() => pick(r.id)} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-line-strong">
                        <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{r.title}</span><span className="block truncate text-[12.5px] text-faint">{r.summary}</span></span>
                        <ArrowRight size={14} className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {next && (
                <button onClick={() => pick(next.id)} className="mt-10 flex w-full items-center justify-between rounded-2xl border border-dashed border-line-strong px-5 py-4 text-left transition hover:bg-surface">
                  <span><span className="block text-[12px] text-faint">Next guide</span><span className="text-[15px] text-ink">{next.title}</span></span>
                  <ArrowRight size={16} className="text-faint" />
                </button>
              )}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
