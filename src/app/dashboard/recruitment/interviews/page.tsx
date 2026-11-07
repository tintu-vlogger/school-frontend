"use client";

/*
 * Interviews calendar: week or month. The hiring team sees every interview; interviewers
 * see the ones they sit on and fill in their scorecard from the details modal.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatTime, todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Button, IconButton, Tabs, Toggle } from "@/components/ui-kit";
import { useHiringMeta } from "@/components/recruitment/common";
import { InterviewModal } from "@/components/recruitment/interviews";
import { errText, type Interview } from "@/components/recruitment/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const localDay = (isoStr: string) => iso(new Date(isoStr));

const TONE: Record<string, string> = {
  scheduled: "border-l-primary bg-primary-soft/40", completed: "border-l-emerald-500 bg-emerald-50/70",
  cancelled: "border-l-faint bg-sunken line-through text-muted", no_show: "border-l-rose-400 bg-rose-50/70",
};

export default function InterviewsPage() {
  const toast = useToast();
  const meta = useHiringMeta();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => parse(todayISO()));
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState<Interview[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const { start, days } = useMemo(() => {
    if (mode === "week") { const s = monday(anchor); return { start: s, days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) }; }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = monday(first);
    return { start: s, days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) };
  }, [mode, anchor]);

  useEffect(() => {
    const end = days[days.length - 1];
    api.get<{ items: Interview[] }>(`/recruitment/interviews?start=${iso(start)}&end=${iso(end)}${mine ? "&mine=true" : ""}`)
      .then((r) => setItems(r.items)).catch((e) => toast.error(errText(e)));
  }, [start, days, mine, nonce, toast]);

  const byDay = useMemo(() => {
    const m = new Map<string, Interview[]>();
    for (const iv of items) { const k = localDay(iv.starts_at); m.set(k, [...(m.get(k) ?? []), iv]); }
    return m;
  }, [items]);
  const today = todayISO();
  const move = (n: number) => setAnchor((a) => mode === "week" ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1));
  const label = mode === "week"
    ? `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todo = items.filter((iv) => iv.my_scorecard && !iv.my_scorecard.submitted_at && iv.status !== "cancelled" && new Date(iv.starts_at) < new Date());

  return (
    <div>
      <PageHeader title="Interviews" description={meta?.is_admin ? "Every interview across your openings." : "Interviews you are on. Open one to fill in your scorecard."}
        actions={<>
          {meta?.is_admin && <Toggle checked={mine} onChange={setMine} label="Only mine" size="sm" />}
          <Tabs variant="pill" value={mode} onChange={setMode} items={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        </>} />
      {!!todo.length && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13.5px] text-amber-800">
          <ClipboardCheck size={15} strokeWidth={1.4} />{todo.length} scorecard(s) waiting for you:
          {todo.map((iv) => <button key={iv.uuid} type="button" onClick={() => setOpen(iv.uuid)} className="underline-offset-2 hover:underline">{iv.candidate_name}</button>)}
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <IconButton icon={ChevronLeft} label="Previous" onClick={() => move(-1)} />
        <IconButton icon={ChevronRight} label="Next" onClick={() => move(1)} />
        <Button size="sm" variant="secondary" onClick={() => setAnchor(parse(todayISO()))}>Today</Button>
        <p className="ml-2 text-[15px] text-ink">{label}</p>
      </div>
      {mode === "week" ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((d) => {
            const k = iso(d);
            const list = (byDay.get(k) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            return (
              <div key={k} className={`min-h-[300px] rounded-2xl border p-2 ${k === today ? "border-primary/40 bg-primary-soft/20" : "border-line bg-surface"}`}>
                <p className="mb-2 px-1 text-[12.5px] text-muted">{DAYS[(d.getDay() + 6) % 7]} <span className={k === today ? "text-primary" : "text-ink"}>{d.getDate()}</span></p>
                <div className="space-y-1.5">
                  {list.map((iv) => (
                    <button key={iv.uuid} type="button" onClick={() => setOpen(iv.uuid)}
                      className={`w-full rounded-lg border-l-2 px-2 py-1.5 text-left transition-colors hover:brightness-95 ${TONE[iv.status] ?? ""}`}>
                      <p className="text-[12px] text-muted tabular">{formatTime(iv.starts_at)}</p>
                      <p className="truncate text-[13px] text-ink">{iv.candidate_name}</p>
                      <p className="truncate text-[11.5px] text-faint">{iv.round_name} · {iv.job_title}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-sunken/50">{DAYS.map((d) => <p key={d} className="px-2 py-1.5 text-[12px] text-muted">{d}</p>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const k = iso(d);
              const list = byDay.get(k) ?? [];
              const other = d.getMonth() !== anchor.getMonth();
              return (
                <div key={k} className={`min-h-[96px] border-b border-r border-line p-1.5 ${other ? "bg-sunken/30" : "bg-surface"}`}>
                  <p className={`mb-1 text-[12px] ${k === today ? "text-primary" : other ? "text-faint" : "text-muted"}`}>{d.getDate()}</p>
                  {list.slice(0, 3).map((iv) => (
                    <button key={iv.uuid} type="button" onClick={() => setOpen(iv.uuid)} className={`mb-0.5 block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[11.5px] ${TONE[iv.status] ?? ""}`}>
                      {formatTime(iv.starts_at)} {iv.candidate_name}
                    </button>
                  ))}
                  {list.length > 3 && <p className="px-1 text-[11px] text-faint">+{list.length - 3} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!items.length && <p className="mt-4 flex items-center gap-2 text-[13.5px] text-faint"><CalendarDays size={15} strokeWidth={1.4} />No interviews in this period.</p>}
      <InterviewModal uuid={open} onClose={() => setOpen(null)} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
