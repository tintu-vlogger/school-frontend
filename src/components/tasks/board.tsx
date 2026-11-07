"use client";

/* Kanban board: drag cards between To do, In progress and Done (HTML5 drag and drop). */
import { useState } from "react";
import { CalendarDays, ListChecks, MessageSquare, Repeat } from "lucide-react";
import { Avatar, Badge, Skeleton, formatDisplayDate } from "@/components/ui-kit";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/components/workplace/pickers";
import { todayISO } from "@/lib/datetime";
import { COLUMNS, isOverdue, type Task } from "./types";

export function TaskBoard({ tasks, loading, onOpen, onMove }: {
  tasks: Task[]; loading: boolean; onOpen: (t: Task) => void;
  onMove: (t: Task, status: string, before: Task | null, after: Task | null) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const today = todayISO();

  const byCol = (col: string) => tasks.filter((t) => t.status === col)
    .sort((a, b) => (col === "done" ? (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : a.position - b.position));

  function drop(col: string) {
    const t = tasks.find((x) => x.uuid === drag);
    let idx = over?.col === col ? over.index : byCol(col).length;
    setDrag(null); setOver(null);
    if (!t || !t.can_work) return;
    const orig = byCol(col).findIndex((x) => x.uuid === t.uuid);
    if (orig >= 0 && idx > orig) idx -= 1;
    if (orig >= 0 && idx === orig) return;
    const list = byCol(col).filter((x) => x.uuid !== t.uuid);
    const before = list[idx - 1] ?? null; // card above
    const after = list[idx] ?? null;      // card below
    // positions grow downwards: "before_uuid" is the card that ends up below, "after_uuid" the one above
    onMove(t, col, after, before);
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((c) => {
        const list = byCol(c.key);
        return (
          <div key={c.key} onDragOver={(e) => { e.preventDefault(); if (over?.col !== c.key && list.length === 0) setOver({ col: c.key, index: 0 }); }}
            onDrop={(e) => { e.preventDefault(); drop(c.key); }}
            className={`flex min-h-[320px] flex-col rounded-2xl border bg-sunken/40 p-3 transition-colors ${over?.col === c.key ? "border-primary/40 bg-primary-soft/30" : "border-line"}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[13.5px] text-ink">{c.label}</p>
              <span className="tabular text-[12.5px] text-faint">{list.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {loading && !tasks.length ? [0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />) : list.map((t, i) => (
                <div key={t.uuid} draggable={t.can_work}
                  onDragStart={(e) => { setDrag(t.uuid); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ col: c.key, index: e.clientY < r.top + r.height / 2 ? i : i + 1 }); }}
                  onClick={() => onOpen(t)}
                  className={`cursor-pointer rounded-xl border bg-surface p-3 text-left transition-all hover:border-line-strong ${drag === t.uuid ? "opacity-40" : ""} ${over?.col === c.key && over.index === i && drag && drag !== t.uuid ? "border-t-2 border-t-primary" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-[14px] leading-snug ${t.status === "done" ? "text-muted line-through" : "text-ink"}`}>{t.title}</p>
                    {t.assignee_name && <Avatar name={t.assignee_name} size={22} />}
                  </div>
                  {!!t.labels.length && <div className="mt-2 flex flex-wrap gap-1">{t.labels.slice(0, 3).map((l) => <span key={l} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-muted">{l}</span>)}</div>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{PRIORITY_LABEL[t.priority]}</Badge>
                    {t.due_date && <span className={`inline-flex items-center gap-1 ${isOverdue(t, today) ? "text-rose-600" : ""}`}><CalendarDays size={12} strokeWidth={1.4} />{formatDisplayDate(t.due_date)}</span>}
                    {t.checklist_total > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} strokeWidth={1.4} />{t.checklist_done}/{t.checklist_total}</span>}
                    {t.recurrence && <Repeat size={12} strokeWidth={1.4} />}
                    {!!t.comment_count && <span className="inline-flex items-center gap-1"><MessageSquare size={12} strokeWidth={1.4} />{t.comment_count}</span>}
                  </div>
                </div>
              ))}
              {!loading && !list.length && <p className="px-1 py-6 text-center text-[12.5px] text-faint">Drop tasks here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
