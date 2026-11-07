"use client";

/*
 * Exits board: Waiting for acceptance, Serving notice, Exited (recent). Cards drag with
 * HTML5 drag and drop; dropping a card on Exited asks the page to complete the exit.
 */
import { useState } from "react";
import { AlarmClock, CalendarDays, ClipboardCheck } from "lucide-react";
import { Avatar, Badge, Skeleton, formatDisplayDate } from "@/components/ui-kit";
import { SETTLEMENT_STATE, type ExitRow } from "./types";

const COLUMNS = [
  { key: "requested", label: "Waiting for acceptance" },
  { key: "in_progress", label: "Serving notice" },
  { key: "completed", label: "Exited" },
];

export function ExitBoard({ rows, loading, onOpen, onDropTo }: {
  rows: ExitRow[]; loading: boolean; onOpen: (r: ExitRow) => void; onDropTo: (r: ExitRow, status: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = rows.filter((r) => r.status === col.key)
          .sort((a, b) => (col.key === "completed" ? b.last_working_day.localeCompare(a.last_working_day) : a.last_working_day.localeCompare(b.last_working_day)));
        return (
          <div key={col.key}
            onDragOver={(e) => { e.preventDefault(); if (over !== col.key) setOver(col.key); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => {
              e.preventDefault();
              const r = rows.find((x) => x.uuid === drag);
              setDrag(null); setOver(null);
              if (r && r.status !== col.key) onDropTo(r, col.key);
            }}
            className={`flex min-h-[340px] flex-col rounded-2xl border bg-sunken/40 p-3 transition-colors duration-150 ${over === col.key && drag ? "border-primary/40 bg-primary-soft/30" : "border-line"}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[13.5px] text-ink">{col.label}</p>
              <span className="tabular text-[12.5px] text-faint">{list.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {loading && !rows.length ? [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />) : list.map((r) => {
                const st = SETTLEMENT_STATE[r.settlement?.state ?? "not_started"];
                return (
                  <div key={r.uuid} draggable
                    onDragStart={(e) => { setDrag(r.uuid); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => onOpen(r)}
                    className={`cursor-grab rounded-xl border border-line bg-surface p-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-line-strong active:cursor-grabbing ${drag === r.uuid ? "scale-[0.98] opacity-40" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <Avatar name={r.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-ink">{r.name}</p>
                        <p className="truncate text-[12px] text-muted">{[r.designation, r.department].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <Badge tone={r.exit_type === "resignation" ? "neutral" : r.exit_type === "retirement" ? "info" : "warn"}>{r.exit_type_label}</Badge>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} strokeWidth={1.4} />
                        {formatDisplayDate(r.last_working_day)}
                        {r.status === "in_progress" && r.days_to_last_day >= 0 && <span className="text-faint">({r.days_to_last_day} d)</span>}
                      </span>
                      {r.clearances_total > 0 && (
                        <span className={`inline-flex items-center gap-1 ${r.clearances_delayed ? "text-rose-600" : ""}`}>
                          <ClipboardCheck size={12} strokeWidth={1.4} />{r.clearances_done}/{r.clearances_total}
                        </span>
                      )}
                      {r.status !== "requested" && r.settlement?.due_date && (
                        <span className={`inline-flex items-center gap-1 ${st?.tone === "bad" ? "text-rose-600" : ""}`}>
                          <AlarmClock size={12} strokeWidth={1.4} />{st?.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!loading && !list.length && <p className="px-1 py-6 text-center text-[12.5px] text-faint">Nobody here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
