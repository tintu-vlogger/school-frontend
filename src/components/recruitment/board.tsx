"use client";

/*
 * Pipeline kanban for one job: a column per stage, cards dragged between them (HTML5 drag
 * and drop, optimistic, then saved). Clicking a card opens the candidate.
 *   <PipelineBoard jobUuid={uuid} onOpen={(card) => ...} reloadKey={n} />
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDayMonth, formatTime } from "@/lib/datetime";
import { Avatar, Badge, Skeleton, TextInput } from "@/components/ui-kit";
import { ScorePill, Stars } from "./common";
import { REC_LABEL, REC_TONE, errText, type Card, type Job, type Stage } from "./types";

type Board = { job: Job; stages: Stage[]; cards: Card[]; closed: Record<string, number> };

export function PipelineBoard({ jobUuid, onOpen, reloadKey = 0, onLoaded }: {
  jobUuid: string; onOpen: (c: Card) => void; reloadKey?: number; onLoaded?: (b: Board) => void;
}) {
  const toast = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);

  const load = useCallback(() => {
    api.get<Board>(`/recruitment/jobs/${jobUuid}/board`).then((b) => { setBoard(b); onLoaded?.(b); }).catch((e) => toast.error(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobUuid]);
  useEffect(() => { load(); }, [load, reloadKey]);

  if (!board) {
    return <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 w-72 shrink-0 rounded-2xl" />)}</div>;
  }
  const term = q.trim().toLowerCase();
  const visible = board.cards.filter((c) => !term || c.candidate_name.toLowerCase().includes(term) || (c.current_company ?? "").toLowerCase().includes(term));
  const byCol = (key: string) => visible.filter((c) => c.stage === key).sort((a, b) => a.position - b.position);

  async function drop(col: string) {
    const card = board!.cards.find((x) => x.uuid === drag);
    let idx = over?.col === col ? over.index : byCol(col).length;
    setDrag(null); setOver(null);
    if (!card || card.status !== "active") return;
    const list = byCol(col);
    const orig = list.findIndex((x) => x.uuid === card.uuid);
    if (orig >= 0 && idx > orig) idx -= 1;
    if (orig >= 0 && idx === orig) return;
    const rest = list.filter((x) => x.uuid !== card.uuid);
    const above = rest[idx - 1] ?? null;
    const below = rest[idx] ?? null;
    const pos = above && below ? (above.position + below.position) / 2 : above ? above.position + 1 : below ? below.position - 1 : 1;
    const prev = board!;
    setBoard({ ...prev, cards: prev.cards.map((x) => (x.uuid === card.uuid ? { ...x, stage: col, position: pos } : x)) });
    try {
      await api.post(`/recruitment/applications/${card.uuid}/move`, { stage: col, after_uuid: above?.uuid ?? null, before_uuid: below?.uuid ?? null });
      if (col !== card.stage) toast.success(`${card.candidate_name} moved to ${board!.stages.find((s) => s.key === col)?.label}`);
    } catch (e) {
      setBoard(prev);
      toast.error(errText(e));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-72"><TextInput value={q} onValueChange={setQ} leading={Search} placeholder="Find a candidate" aria-label="Find a candidate" /></div>
        <span className="text-[13px] text-faint">
          {board.cards.filter((c) => c.status === "active").length} in the running
          {board.closed.rejected ? ` · ${board.closed.rejected} not moving ahead` : ""}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {board.stages.map((s) => {
          const list = byCol(s.key);
          return (
            <div key={s.key}
              onDragOver={(e) => { e.preventDefault(); if (over?.col !== s.key && list.length === 0) setOver({ col: s.key, index: 0 }); }}
              onDrop={(e) => { e.preventDefault(); drop(s.key); }}
              className={`flex min-h-[420px] w-[272px] shrink-0 flex-col rounded-2xl border p-2.5 transition-colors duration-150 ${over?.col === s.key ? "border-primary/40 bg-primary-soft/30" : "border-line bg-sunken/40"}`}>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="text-[13.5px] text-ink">{s.label}</p>
                <span className="tabular text-[12.5px] text-faint">{list.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {list.map((c, i) => (
                  <div key={c.uuid} draggable={c.status === "active"}
                    onDragStart={(e) => { setDrag(c.uuid); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ col: s.key, index: e.clientY < r.top + r.height / 2 ? i : i + 1 }); }}
                    onClick={() => onOpen(c)}
                    className={`cursor-pointer rounded-xl border bg-surface p-3 transition-all duration-150 hover:border-line-strong ${drag === c.uuid ? "scale-[0.98] opacity-40" : ""} ${over?.col === s.key && over.index === i && drag && drag !== c.uuid ? "border-t-2 border-t-primary" : "border-line"}`}>
                    <div className="flex items-start gap-2.5">
                      <Avatar name={c.candidate_name} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-ink">{c.candidate_name}</p>
                        <p className="truncate text-[12.5px] text-muted">{[c.current_title, c.current_company].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <ScorePill score={c.score} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                      {c.total_experience !== null && <span>{c.total_experience} yrs</span>}
                      {c.average_rating !== null && <Stars value={c.average_rating} />}
                      {c.source_label && <span>{c.source_label}</span>}
                    </div>
                    {(c.next_interview || c.recommendation || c.offer_status || c.tags.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {c.next_interview && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11.5px] text-sky-700">
                            <CalendarClock size={11} strokeWidth={1.4} />{formatDayMonth(c.next_interview.starts_at)} {formatTime(c.next_interview.starts_at)}
                          </span>
                        )}
                        {c.recommendation && <Badge tone={REC_TONE[c.recommendation] ?? "neutral"}>{REC_LABEL[c.recommendation] ?? c.recommendation}</Badge>}
                        {c.offer_status && <Badge tone={c.offer_status === "accepted" ? "good" : "accent"}>Offer {c.offer_status.replace("_", " ")}</Badge>}
                        {c.tags.slice(0, 2).map((t) => <span key={t} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-muted">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
                {!list.length && <p className="px-1 py-8 text-center text-[12.5px] text-faint">Drop candidates here</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
