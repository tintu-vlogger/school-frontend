"use client";

/*
 * Survey results.
 *   <SurveyResultsModal uuid={u} onClose />   per-question charts, departments, runs, who is pending
 *   <EnpsGauge score={44} />                   half-dial from -100 to +100
 *   <EnpsSplit enps={...} />                   promoters / passives / detractors bar
 *   <TrendChart points={[{ label, value }]} metric="enps" />
 * Anonymous results stay locked until the survey's minimum number of responses.
 */
import { useEffect, useState } from "react";
import { BellRing, Lock, MessageSquareQuote, Star, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Avatar, Badge, Button, Modal, Select, Skeleton, Tabs } from "@/components/ui-kit";
import { CoverArt } from "./art";
import type { Enps, Participation, ResultQuestion, SurveyResults } from "./survey-types";

/* ── eNPS pieces ─────────────────────────────────────────────────── */

export function enpsTone(score: number | null | undefined) {
  if (score == null) return { text: "text-faint", fill: "#a8a29e", label: "No score yet" };
  if (score >= 50) return { text: "text-emerald-600", fill: "#059669", label: "Excellent" };
  if (score >= 20) return { text: "text-emerald-600", fill: "#10b981", label: "Good" };
  if (score >= 0) return { text: "text-amber-600", fill: "#f59e0b", label: "Needs work" };
  return { text: "text-rose-600", fill: "#e11d48", label: "Critical" };
}

export function EnpsGauge({ score, size = 180 }: { score: number | null; size?: number }) {
  const r = 80, cx = 100, cy = 92;
  const pt = (v: number) => {
    const a = Math.PI * (1 - (v + 100) / 200);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from), [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const tone = enpsTone(score);
  const [nx, ny] = pt(score ?? 0);
  return (
    <svg viewBox="0 0 200 112" width={size} height={size * 0.56} role="img" aria-label={`eNPS ${score ?? "not available"}`}>
      <path d={arc(-100, 0)} stroke="#fecdd3" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(0, 30)} stroke="#fde68a" strokeWidth="14" fill="none" />
      <path d={arc(30, 100)} stroke="#a7f3d0" strokeWidth="14" fill="none" strokeLinecap="round" />
      {score != null && <path d={arc(-100, Math.max(-99.5, score))} stroke={tone.fill} strokeWidth="14" fill="none" strokeLinecap="round" opacity=".9" />}
      {score != null && <circle cx={nx} cy={ny} r="9" fill="#fff" stroke={tone.fill} strokeWidth="3" />}
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-current text-ink" style={{ fontSize: 34, fontWeight: 300 }}>
        {score == null ? "–" : score > 0 ? `+${score}` : score}
      </text>
      <text x={20} y={110} textAnchor="middle" style={{ fontSize: 9 }} fill="#a8a29e">-100</text>
      <text x={180} y={110} textAnchor="middle" style={{ fontSize: 9 }} fill="#a8a29e">+100</text>
    </svg>
  );
}

export function EnpsSplit({ enps }: { enps: Enps }) {
  const n = enps.responses || 1;
  const parts = [
    { key: "Promoters", sub: "9–10", v: enps.promoters, pct: enps.promoters_pct ?? Math.round((enps.promoters * 100) / n), cls: "bg-emerald-500", dot: "bg-emerald-500" },
    { key: "Passives", sub: "7–8", v: enps.passives, pct: enps.passives_pct ?? Math.round((enps.passives * 100) / n), cls: "bg-amber-400", dot: "bg-amber-400" },
    { key: "Detractors", sub: "0–6", v: enps.detractors, pct: enps.detractors_pct ?? Math.round((enps.detractors * 100) / n), cls: "bg-rose-500", dot: "bg-rose-500" },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-sunken">
        {parts.map((p) => p.v > 0 && <div key={p.key} className={`${p.cls} transition-[width] duration-500`} style={{ width: `${(p.v * 100) / n}%` }} title={`${p.key}: ${p.v}`} />)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key}>
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted"><span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />{p.key} <span className="hidden text-faint sm:inline">{p.sub}</span></p>
            <p className="mt-0.5 text-[18px] font-light tabular text-ink">{p.pct}%<span className="ml-1 text-[12px] text-faint">({p.v})</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendChart({ points, metric, height = 160 }: { points: { label: string; value: number; responses?: number }[]; metric: "enps" | "average"; height?: number }) {
  if (points.length < 2) {
    return <p className="flex items-center justify-center rounded-xl bg-sunken/60 text-[13px] text-faint" style={{ height }}>The trend appears after the second round.</p>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="enps-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
          </defs>
          <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} domain={metric === "enps" ? [-100, 100] : [0, "auto"]} ticks={metric === "enps" ? [-100, -50, 0, 50, 100] : undefined} />
          {metric === "enps" && <ReferenceLine y={0} stroke="#d6d3d1" />}
          <Tooltip cursor={{ stroke: "#d6d3d1" }} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12.5 }}
            formatter={(v) => [metric === "enps" ? `${Number(v) > 0 ? "+" : ""}${v}` : v, metric === "enps" ? "eNPS" : "Average"]} />
          <Line type="monotone" dataKey="value" stroke="url(#enps-line)" strokeWidth={3} dot={{ r: 4, fill: "#fff", stroke: "#8b5cf6", strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Per question ────────────────────────────────────────────────── */

function Bars({ rows, max }: { rows: { label: React.ReactNode; count: number; pct: number; color?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-[13.5px] text-ink">{r.label}</span>
          <span className="text-[12.5px] tabular text-muted">{r.pct}% <span className="text-faint">· {r.count}</span></span>
          <span className="col-span-2 h-2.5 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(r.count * 100) / top}%`, background: r.color ?? "linear-gradient(90deg,#6366f1,#a855f7)" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ dist, color }: { dist: { value: number; count: number }[]; color: (v: number) => string }) {
  const top = Math.max(1, ...dist.map((d) => d.count));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {dist.map((d) => (
        <div key={d.value} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] tabular text-faint">{d.count || ""}</span>
          <span className="w-full rounded-t-md transition-[height] duration-500" style={{ height: `${Math.max(3, (d.count * 96) / top)}px`, background: color(d.value), opacity: d.count ? 1 : 0.25 }} />
          <span className="text-[11.5px] tabular text-muted">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function Groups({ q }: { q: ResultQuestion }) {
  if (!q.groups?.length) return null;
  const enps = q.qtype === "enps";
  const hi = q.qtype === "rating" ? q.settings.max ?? 5 : q.settings.points ?? 5;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.08em] text-faint"><Users size={13} /> By department</p>
      <ul className="space-y-1.5">
        {q.groups.map((g) => {
          const v = enps ? g.enps ?? 0 : g.average;
          const pct = enps ? (v + 100) / 2 : (g.average * 100) / hi;
          return (
            <li key={g.group} className="grid grid-cols-[140px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]">
              <span className="truncate text-muted">{g.group}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: enps ? enpsTone(v).fill : "#8b5cf6" }} /></span>
              <span className="text-right tabular text-ink">{enps && v > 0 ? "+" : ""}{v}<span className="text-faint"> · {g.responses}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function QuestionResult({ q, index }: { q: ResultQuestion; index: number }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] uppercase tracking-[0.08em] text-faint">Question {index + 1} · {({ single: "Single choice", multi: "Multiple choice", rating: "Star rating", scale: "Agreement scale", text: "Text", enps: "eNPS" })[q.qtype]}</p>
          <p className="mt-1 text-[15.5px] text-ink">{q.text}</p>
        </div>
        <span className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-[12px] tabular text-muted">{q.answered} answer{q.answered === 1 ? "" : "s"}</span>
      </div>

      {q.choices && <Bars rows={q.choices.map((c) => ({ label: c.label, count: c.count, pct: c.pct }))} />}

      {q.qtype === "enps" && q.enps && q.distribution && (
        <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <EnpsGauge score={q.enps.score} />
            <p className={`text-[13px] ${enpsTone(q.enps.score).text}`}>{enpsTone(q.enps.score).label}</p>
          </div>
          <div className="space-y-5">
            <EnpsSplit enps={q.enps} />
            <Columns dist={q.distribution} color={(v) => (v <= 6 ? "#fb7185" : v <= 8 ? "#fbbf24" : "#34d399")} />
          </div>
        </div>
      )}

      {(q.qtype === "rating" || q.qtype === "scale") && q.distribution && (
        <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="flex flex-col justify-center">
            <p className="text-[40px] font-extralight leading-none tabular text-ink">{q.average ?? "–"}<span className="text-[15px] text-faint"> / {q.qtype === "rating" ? q.settings.max ?? 5 : q.settings.points ?? 5}</span></p>
            {q.qtype === "rating" && q.average != null && (
              <div className="mt-2 flex gap-0.5">{Array.from({ length: q.settings.max ?? 5 }, (_, i) => (
                <Star key={i} size={16} strokeWidth={1.3} className={i + 0.5 <= (q.average ?? 0) ? "fill-amber-400 text-amber-500" : "text-line-strong"} />
              ))}</div>
            )}
            {q.qtype === "scale" && q.favourable_pct != null && (
              <p className="mt-2 text-[13px] text-muted"><span className="text-emerald-600">{q.favourable_pct}% agree</span> · <span className="text-rose-600">{q.unfavourable_pct}% disagree</span></p>
            )}
          </div>
          <div>
            <Columns dist={q.distribution} color={(v) => {
              const hi = q.qtype === "rating" ? q.settings.max ?? 5 : q.settings.points ?? 5;
              if (q.qtype === "rating") return "#f59e0b";
              const mid = (hi + 1) / 2;
              return v < mid ? "#fb7185" : v > mid ? "#34d399" : "#d6d3d1";
            }} />
            {q.qtype === "scale" && <div className="mt-1 flex justify-between text-[11.5px] text-faint"><span>{q.settings.low_label}</span><span>{q.settings.high_label}</span></div>}
          </div>
        </div>
      )}

      {q.texts && (q.texts.length === 0 ? <p className="text-[13px] text-faint">No written answers.</p> : (
        <ul className="hr-scroll grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {q.texts.map((t, i) => (
            <li key={i} className="rounded-xl bg-sunken/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
              <MessageSquareQuote size={13} className="mb-1 text-faint" />{t.text}
              {t.by && <span className="mt-1 block text-[12px] text-faint">{t.by}</span>}
            </li>
          ))}
        </ul>
      ))}

      <Groups q={q} />
    </section>
  );
}

/* ── Modal ───────────────────────────────────────────────────────── */

export function SurveyResultsModal({ uuid, onClose }: { uuid: string | null; onClose: () => void }) {
  const toast = useToast();
  const [run, setRun] = useState<string | null>(null);
  const [data, setData] = useState<SurveyResults | null>(null);
  const [part, setPart] = useState<Participation | null>(null);
  const [tab, setTab] = useState<"results" | "people">("results");
  const [reminding, setReminding] = useState(false);

  useEffect(() => { setRun(null); setTab("results"); }, [uuid]);
  useEffect(() => {
    if (!uuid) return;
    setData(null); setPart(null);
    const q = run ? `?run=${run}` : "";
    api.get<SurveyResults>(`/engagement/surveys/${uuid}/results${q}`).then(setData).catch((e) => { toast.error((e as Error).message); onClose(); });
    api.get<Participation>(`/engagement/surveys/${uuid}/participation${q}`).then(setPart).catch(() => {});
  }, [uuid, run, toast, onClose]);

  async function remind() {
    if (!uuid) return;
    setReminding(true);
    try { const r = await api.post<{ reminded: number }>(`/engagement/surveys/${uuid}/remind`); toast.success(r.reminded ? `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}` : "Everyone has answered or was just reminded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setReminding(false); }
  }

  const s = data?.survey;
  const open = data?.run?.status === "open";
  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" flush title={s?.title ?? "Results"} bodyClassName="bg-canvas"
      description={s ? `${s.kind_label} · ${s.identity_label}` : undefined}
      headerActions={data && data.runs.length > 1 ? (
        <Select value={data.run?.uuid ?? null} onChange={(v) => setRun(v)} className="w-52" aria-label="Round"
          options={[...data.runs].reverse().map((r) => ({ value: r.uuid, label: `Round ${r.number} · ${formatDate(r.opens_at, { day: "numeric", month: "short", year: "numeric" })}`, description: `${r.responses} responses · ${r.status}` }))} />
      ) : undefined}>
      {!data ? <div className="space-y-4 p-6"><Skeleton className="h-28" /><Skeleton className="h-52" /></div> : (
        <div>
          <CoverArt cover={data.survey.cover} fallback={data.survey.kind === "enps" ? "lavender" : "ocean"} className="h-28">
            <div className="flex h-28 items-end gap-6 px-6 pb-4 text-white">
              {[
                { k: "Responses", v: data.responses },
                { k: "Invited", v: data.invited },
                { k: "Response rate", v: `${data.response_rate}%` },
              ].map((x) => (
                <div key={x.k}><p className="text-[11px] uppercase tracking-[0.1em] text-white/75">{x.k}</p><p className="text-[26px] font-light leading-tight tabular">{x.v}</p></div>
              ))}
              <div className="ml-auto hidden text-right sm:block">
                <p className="text-[11px] uppercase tracking-[0.1em] text-white/75">Round {data.run?.number ?? 1}</p>
                <p className="text-[13.5px]">{data.run ? `${formatDate(data.run.opens_at, { day: "numeric", month: "short" })} – ${formatDate(data.run.closes_at, { day: "numeric", month: "short" })}` : "Not opened"}</p>
              </div>
            </div>
          </CoverArt>
          <div className="border-b border-line bg-surface px-6">
            <Tabs value={tab} onChange={setTab} items={[{ value: "results", label: "Results" }, { value: "people", label: "Participation", count: part ? part.invited - part.submitted : undefined }]} />
          </div>
          <div className="space-y-4 p-6">
            {tab === "results" ? (
              <>
                {data.trend.length > 1 && (
                  <section className="rounded-2xl border border-line bg-surface p-5">
                    <p className="mb-2 text-[14.5px] text-ink">{data.trend[0].metric === "enps" ? "eNPS by round" : "Average score by round"}</p>
                    <TrendChart metric={data.trend[0].metric} points={data.trend.map((t) => ({ label: `R${t.run} · ${formatDate(t.opens_at, { month: "short", year: "2-digit" })}`, value: t.value, responses: t.responses }))} />
                  </section>
                )}
                {data.locked ? (
                  <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Lock size={24} strokeWidth={1.4} /></span>
                    <p className="mt-4 text-[16px] text-ink">Results are hidden for now</p>
                    <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">
                      To keep answers anonymous, results show once at least {data.survey.min_responses} people answer. {data.needed} more {data.needed === 1 ? "response is" : "responses are"} needed.
                    </p>
                    <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(data.responses * 100) / data.survey.min_responses}%` }} /></div>
                  </div>
                ) : data.questions.length === 0 ? (
                  <p className="py-10 text-center text-[13.5px] text-faint">No answers yet.</p>
                ) : data.questions.map((q, i) => <QuestionResult key={q.uuid} q={q} index={i} />)}
              </>
            ) : (
              <section className="rounded-2xl border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <p className="text-[15px] text-ink">{part ? `${part.submitted} of ${part.invited} answered` : "Loading…"}</p>
                    <p className="text-[12.5px] text-faint">{part?.names_shown ? "Names of people who have not answered yet." : "Names are only shown for named or required surveys."}</p>
                  </div>
                  {open && <Button size="sm" icon={BellRing} loading={reminding} onClick={remind}>Remind everyone pending</Button>}
                </div>
                {part && (
                  <div className="px-5 py-4">
                    <div className="h-2.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${part.invited ? (part.submitted * 100) / part.invited : 0}%` }} /></div>
                  </div>
                )}
                {part?.names_shown && (part.pending.length === 0 ? <p className="px-5 pb-6 text-[13.5px] text-faint">Everyone has answered. 🎉</p> : (
                  <ul className="grid gap-x-4 px-5 pb-4 sm:grid-cols-2">
                    {part.pending.map((p) => (
                      <li key={p.person.uuid} className="flex items-center gap-3 border-t border-line/70 py-2.5">
                        <Avatar name={p.person.name} src={p.person.image} size={32} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-ink">{p.person.name}</span><span className="block truncate text-[12px] text-faint">{p.person.department ?? p.person.title ?? ""}</span></span>
                        {p.reminders > 0 && <Badge tone="warn">{p.reminders} reminder{p.reminders === 1 ? "" : "s"}</Badge>}
                      </li>
                    ))}
                  </ul>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
