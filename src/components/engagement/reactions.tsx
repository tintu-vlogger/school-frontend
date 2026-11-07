"use client";

/*
 * Emoji reactions for posts and comments.
 *   <ReactButton mine={post.my_reaction} quick={meta.reactions} all={meta.all_reactions} onReact={(e) => ...} />
 *     click = 👍 (or remove yours), hover / long-press = picker; a small burst plays when you react.
 *   <ReactionSummary reactions total recent onOpen />   stacked emoji + "Priya and 12 others"
 *   <WhoReactedModal open path onClose />               everyone who reacted, by emoji
 */
import { useEffect, useRef, useState } from "react";
import { Plus, SmilePlus, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { Avatar, Modal, Skeleton } from "@/components/ui-kit";
import type { Person, Reaction } from "./types";

function Burst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const [parts] = useState(() => Array.from({ length: 6 }, () => ({
    dx: `${Math.round((Math.random() - 0.5) * 90)}px`, dy: `${-30 - Math.round(Math.random() * 50)}px`, rot: `${Math.round((Math.random() - 0.5) * 120)}deg`,
  })));
  useEffect(() => { const t = setTimeout(onDone, 900); return () => clearTimeout(t); }, [onDone]);
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {parts.map((p, i) => (
        <span key={i} className="buzz-burst absolute text-[18px]" style={{ ["--dx" as string]: p.dx, ["--dy" as string]: p.dy, ["--rot" as string]: p.rot }}>{emoji}</span>
      ))}
    </span>
  );
}

export function ReactButton({
  mine, quick, all, onReact, size = "md", label = "React",
}: { mine: string | null; quick: string[]; all: string[]; onReact: (emoji: string | null) => void; size?: "md" | "sm"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setMore(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const choose = (e: string) => {
    const next = mine === e ? null : e;
    if (next) setBurst(next);
    onReact(next);
    setOpen(false);
    setMore(false);
  };
  const enter = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 380); };
  const leave = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { setOpen(false); setMore(false); }, 420); };

  const sm = size === "sm";
  return (
    <span ref={wrap} className="relative inline-flex" onMouseEnter={enter} onMouseLeave={leave}>
      <button type="button" onClick={() => choose(mine ?? quick[0] ?? "👍")}
        onContextMenu={(e) => { e.preventDefault(); setOpen(true); }}
        aria-label={mine ? `You reacted ${mine}. Remove` : label}
        className={`relative inline-flex items-center gap-1.5 rounded-lg transition-colors ${sm ? "h-7 px-1.5 text-[12.5px]" : "h-9 px-3 text-[13.5px]"} ${mine ? "text-primary hover:bg-primary-soft" : "text-muted hover:bg-sunken hover:text-ink"}`}>
        {mine ? <span key={mine} className={`buzz-pop ${sm ? "text-[14px]" : "text-[17px]"} leading-none`}>{mine}</span>
          : sm ? <SmilePlus size={15} strokeWidth={1.4} /> : <ThumbsUp size={17} strokeWidth={1.4} />}
        {!sm && <span>{mine ? "Reacted" : label}</span>}
        {burst && <Burst emoji={burst} onDone={() => setBurst(null)} />}
      </button>
      {open && (
        <div role="menu" className={`absolute bottom-full z-40 mb-1.5 ${sm ? "left-0" : "-left-1"}`} onMouseEnter={enter} onMouseLeave={leave}>
          {!more ? (
            <div className="buzz-rise flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-lg">
              {quick.slice(0, 8).map((e) => (
                <button key={e} type="button" role="menuitem" onClick={() => choose(e)} aria-label={`React ${e}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[21px] transition-transform hover:-translate-y-1 hover:scale-125 ${mine === e ? "bg-primary-soft" : ""}`}>{e}</button>
              ))}
              {all.length > quick.slice(0, 8).length && (
                <button type="button" onClick={() => setMore(true)} aria-label="More reactions"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunken"><Plus size={16} strokeWidth={1.4} /></button>
              )}
            </div>
          ) : (
            <div className="buzz-rise grid w-[296px] grid-cols-8 gap-0.5 rounded-2xl border border-line bg-surface p-2 shadow-lg">
              {all.map((e) => (
                <button key={e} type="button" onClick={() => choose(e)} aria-label={`React ${e}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[19px] hover:bg-sunken ${mine === e ? "bg-primary-soft" : ""}`}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export function ReactionSummary({ reactions, total, recent, onOpen, compact }: {
  reactions: Reaction[]; total: number; recent?: Person[]; onOpen: () => void; compact?: boolean;
}) {
  if (!total) return null;
  const first = recent?.[0]?.name?.split(" ")[0];
  return (
    <button type="button" onClick={onOpen} className="group inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
      <span className="flex -space-x-1">
        {reactions.slice(0, 3).map((r) => (
          <span key={r.emoji} className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface bg-sunken text-[12.5px]">{r.emoji}</span>
        ))}
      </span>
      <span className="group-hover:underline">
        {compact || !first ? total : total === 1 ? first : `${first} and ${total - 1} other${total - 1 === 1 ? "" : "s"}`}
      </span>
    </button>
  );
}

type Reactor = { emoji: string; person: Person | null; at: string };

export function WhoReactedModal({ path, open, onClose }: { path: string | null; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Reactor[] | null>(null);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    if (!open || !path) return;
    setRows(null);
    setTab("all");
    api.get<Reactor[]>(path).then(setRows).catch(() => setRows([]));
  }, [open, path]);
  const counts = (rows ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.emoji]: (m[r.emoji] ?? 0) + 1 }), {});
  const shown = (rows ?? []).filter((r) => tab === "all" || r.emoji === tab);
  return (
    <Modal open={open} onClose={onClose} title={rows ? `${rows.length} reaction${rows.length === 1 ? "" : "s"}` : "Reactions"} size="sm" flush>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-4 pt-1">
        {[["all", rows?.length ?? 0] as const, ...Object.entries(counts).sort((a, b) => b[1] - a[1])].map(([k, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px flex items-center gap-1 border-b-2 px-2.5 py-2 text-[13px] ${tab === k ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {k === "all" ? "All" : <span className="text-[16px]">{k}</span>} <span className="tabular text-faint">{n}</span>
          </button>
        ))}
      </div>
      <ul className="max-h-[50vh] divide-y divide-line/70 overflow-y-auto">
        {rows === null ? Array.from({ length: 4 }, (_, i) => <li key={i} className="px-4 py-3"><Skeleton className="h-8" /></li>)
          : shown.map((r, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="relative">
                <Avatar name={r.person?.name ?? "?"} src={r.person?.image} size={34} />
                <span className="absolute -bottom-1 -right-1 text-[14px]">{r.emoji}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink">{r.person?.name}</span>
                <span className="block truncate text-[12px] text-faint">{r.person?.title || ""}</span>
              </span>
              <span className="text-[12px] text-faint">{formatRelative(r.at)}</span>
            </li>
          ))}
      </ul>
    </Modal>
  );
}
