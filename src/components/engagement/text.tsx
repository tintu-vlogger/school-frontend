"use client";

/*
 * Post text: rendering and writing.
 *   <PostText body={post.body} />      mentions, #hashtags and links become links (no HTML injection)
 *   <MentionInput value onChange ... /> textarea with @name suggestions; toWire()/fromWire()
 *     convert between what people see ("@Priya Sharma") and what is stored ("@[Priya Sharma](uuid)").
 * Also the shared CSS for Buzz motion (<EngagementStyles />).
 */
import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui-kit";
import type { Person } from "./types";

const TOKEN = /@\[([^\]\n]{1,120})\]\(([0-9a-fA-F-]{36})\)|(?<![\w#&])#([A-Za-z][A-Za-z0-9_]{1,49})|(https?:\/\/[^\s<>()"']+)/g;

export function PostText({ body, clamp = 0, className = "" }: { body: string | null | undefined; clamp?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const text = body || "";
  const long = clamp > 0 && text.length > clamp;
  const shown = long && !open ? text.slice(0, clamp).replace(/\s+\S*$/, "") + "…" : text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of shown.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(shown.slice(last, i));
    if (m[1]) {
      parts.push(<Link key={i} href={`/dashboard/buzz?person=${m[2]}`} className="text-primary hover:underline">@{m[1]}</Link>);
    } else if (m[3]) {
      parts.push(<Link key={i} href={`/dashboard/buzz?tag=${m[3].toLowerCase()}`} className="text-primary hover:underline">#{m[3]}</Link>);
    } else if (m[4]) {
      const url = m[4].replace(/[.,;:!?]+$/, "");
      parts.push(<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{url.replace(/^https?:\/\//, "")}</a>);
      if (url.length < m[4].length) parts.push(m[4].slice(url.length));
    }
    last = i + m[0].length;
  }
  if (last < shown.length) parts.push(shown.slice(last));
  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {parts}
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="ml-1 text-[13px] text-muted hover:text-ink">
          {open ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}

/** Stored text -> what the person edits, plus the name -> uuid map. */
export function fromWire(body: string | null | undefined): { text: string; mentions: Record<string, string> } {
  const mentions: Record<string, string> = {};
  const text = (body || "").replace(/@\[([^\]\n]{1,120})\]\(([0-9a-fA-F-]{36})\)/g, (_m, name: string, uuid: string) => {
    mentions[name] = uuid;
    return `@${name}`;
  });
  return { text, mentions };
}

export function toWire(text: string, mentions: Record<string, string>): string {
  let out = text;
  const names = Object.keys(mentions).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${esc}(?![\\w])`, "g"), `@[${name}](${mentions[name]})`);
  }
  return out;
}

export type MentionInputHandle = { focus: () => void; insert: (text: string) => void };

type MentionInputProps = {
  value: string;
  onChange: (v: string) => void;
  mentions: Record<string, string>;
  onMentionsChange: (m: Record<string, string>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  maxLength?: number;
  "aria-label"?: string;
};

/** A textarea that suggests colleagues after "@". */
export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(function MentionInput(
  { value, onChange, mentions, onMentionsChange, placeholder, rows = 3, className = "", onSubmit, autoFocus, maxLength = 5000, ...aria },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<Person[]>([]);
  const [active, setActive] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    insert: (t: string) => {
      const el = area.current;
      const pos = el?.selectionStart ?? value.length;
      const next = value.slice(0, pos) + t + value.slice(pos);
      onChange(next);
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + t.length, pos + t.length); });
    },
  }));

  useEffect(() => {
    if (query === null) return;
    let alive = true;
    const t = setTimeout(() => {
      api.get<Person[]>(`/engagement/people?limit=6&q=${encodeURIComponent(query)}`)
        .then((r) => { if (alive) { setOptions(r); setActive(0); } }).catch(() => {});
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [value]);

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\p{L}][\p{L} .]{0,30})?$/u);
    if (m && !(m[1] || "").includes("  ")) setQuery((m[1] || "").trim());
    else setQuery(null);
  }

  function pick(p: Person) {
    const el = area.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([\p{L}][\p{L} .]{0,30})?$/u, "");
    const insert = `@${p.name} `;
    const next = before + insert + value.slice(caret);
    onChange(next);
    if (p.uuid) onMentionsChange({ ...mentions, [p.name]: p.uuid });
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); const pos = before.length + insert.length; el.setSelectionRange(pos, pos); });
  }

  const open = query !== null && options.length > 0;
  return (
    <div className="relative">
      <textarea
        ref={area}
        value={value}
        rows={rows}
        maxLength={maxLength}
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? "" : undefined}
        placeholder={placeholder}
        aria-label={aria["aria-label"] ?? placeholder}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onClick={(e) => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[active]); return; }
            if (e.key === "Escape") { e.stopPropagation(); setQuery(null); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); }
        }}
        className={`kit-bare w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-faint ${className}`}
      />
      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {options.map((p, i) => (
            <li key={p.uuid ?? i} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${i === active ? "bg-sunken" : ""}`}>
                <Avatar name={p.name} src={p.image} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                  <span className="block truncate text-[12px] text-faint">{p.title || p.department || ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export function useFirstUrl(text: string) {
  return useMemo(() => {
    const m = text.match(/https?:\/\/[^\s<>()"']+/);
    return m ? m[0].replace(/[.,;:!?]+$/, "") : null;
  }, [text]);
}

export function EngagementStyles() {
  return (
    <style>{`
      @keyframes buzz-twinkle { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
      .buzz-twinkle { animation: buzz-twinkle 2.6s ease-in-out infinite; }
      @keyframes buzz-wave { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-16deg) } }
      .buzz-wave { animation: buzz-wave 1.6s ease-in-out infinite; transform-box: fill-box; }
      @keyframes buzz-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
      .buzz-pop { animation: buzz-pop .32s cubic-bezier(.2,.8,.3,1.2); }
      @keyframes buzz-burst { 0% { transform: translate(0,0) scale(.6) rotate(0); opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)) scale(1.1) rotate(var(--rot)); opacity: 0 } }
      .buzz-burst { animation: buzz-burst .85s ease-out forwards; }
      @keyframes buzz-rise { 0% { transform: translateY(8px); opacity: 0 } 100% { transform: none; opacity: 1 } }
      .buzz-rise { animation: buzz-rise .4s ease-out both; }
      @keyframes buzz-ring { 0% { box-shadow: 0 0 0 0 rgb(79 70 229 / .45) } 100% { box-shadow: 0 0 0 14px rgb(79 70 229 / 0) } }
      .buzz-ring { animation: buzz-ring 1.2s ease-out 3; }
      @media (prefers-reduced-motion: reduce) {
        .buzz-twinkle, .buzz-wave, .buzz-pop, .buzz-burst, .buzz-rise, .buzz-ring { animation: none !important; }
      }
    `}</style>
  );
}
