/*
 * Hand-made SVG charts for reports, dashboards and the assistant: thin lines, paper look,
 * indigo first and a calm palette after it, with a themed tooltip.
 *
 *   <BarChart data={rows} xKey="department" series={[{ key: "count", label: "People" }]} />
 *   <LineChart data={rows} xKey="month" series={[...]} area />
 *   <PieChart data={rows} labelKey="gender" valueKey="count" donut />
 *   <Heatmap cells={[{ x, y, value }]} />   <Funnel data labelKey valueKey />   <Gauge value={72} max={100} />
 *   <Kpi value={128} label="People" format="number" />
 *   <WidgetChart data={widgetDataFromApi} />   // picks the right chart for a dashboard widget or report
 */
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDate } from "@/lib/datetime";

export const PALETTE = ["#4f46e5", "#14b8a6", "#f59e0b", "#e8798a", "#38bdf8", "#a78bfa", "#84cc16", "#94a3b8", "#fb923c", "#2dd4bf", "#c084fc", "#64748b"];
export const colorAt = (i: number) => PALETTE[i % PALETTE.length];

export type ValueFormat = "number" | "money" | "percent" | "hours";
export type Series = { key: string; label: string; color?: string };
type Row = Record<string, unknown>;

export function formatValue(v: unknown, format: ValueFormat = "number"): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  if (format === "money") return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: n >= 1000 ? 0 : 2 });
  if (format === "percent") return `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
  if (format === "hours") return `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} h`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function compact(n: number, format: ValueFormat = "number"): string {
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e7) s = `${+(n / 1e7).toFixed(1)}Cr`;
  else if (abs >= 1e5) s = `${+(n / 1e5).toFixed(1)}L`;
  else if (abs >= 1e3) s = `${+(n / 1e3).toFixed(1)}k`;
  else s = `${+n.toFixed(abs < 10 ? 1 : 0)}`;
  if (format === "money") return "₹" + s;
  if (format === "percent") return s + "%";
  return s;
}

/* ── Size and tooltip ─────────────────────────────────────────── */

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type Tip = { x: number; y: number; title: string; lines: { color?: string; label: string; value: string }[] } | null;

function TooltipBox({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 200));
  return (
    <div className="pointer-events-none absolute z-10 min-w-[140px] max-w-[240px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-[0_8px_24px_-12px_rgba(27,27,34,0.25)]"
      style={{ left, top: Math.max(0, tip.y - 12), transform: "translateY(-100%)" }}>
      <p className="mb-1 text-ink">{tip.title}</p>
      {tip.lines.map((l, i) => (
        <p key={i} className="flex items-center justify-between gap-3 text-muted">
          <span className="flex items-center gap-1.5">{l.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />}{l.label}</span>
          <span className="tabular text-ink">{l.value}</span>
        </p>
      ))}
    </div>
  );
}

function Frame({ height, children }: { height: number; children: (w: number, setTip: (t: Tip) => void) => ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setTip(null)}>
      {w > 0 && children(w, setTip)}
      <TooltipBox tip={tip} width={w} />
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function ticks(max: number, count = 4) {
  for (const c of [4, 5, 2, 3]) {
    if (Number.isInteger(max / c) || max / c >= 10) { count = c; break; }
  }
  if (max <= 4 && Number.isInteger(max)) count = max;
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length <= 1) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  );
}

/* ── Bar and stacked bar ──────────────────────────────────────── */

export function BarChart({ data, xKey, series, stacked = false, height = 240, format = "number", xLabel }: {
  data: Row[]; xKey: string; series: Series[]; stacked?: boolean; height?: number; format?: ValueFormat;
  xLabel?: (v: unknown) => string;
}) {
  const label = xLabel ?? ((v: unknown) => (v === null || v === undefined || v === "" ? "Not set" : String(v)));
  const cols = series.map((s, i) => ({ ...s, color: s.color ?? colorAt(i) }));
  const horizontal = data.length > 8 && !stacked && cols.length === 1;
  return (
    <div>
      <Frame height={horizontal ? Math.max(height, data.length * 26 + 24) : height}>
        {(w, setTip) => {
          const values = data.map((r) => stacked ? cols.reduce((a, s) => a + (Number(r[s.key]) || 0), 0) : Math.max(...cols.map((s) => Number(r[s.key]) || 0)));
          const max = niceMax(Math.max(0, ...values));
          if (horizontal) {
            const labelW = Math.min(160, Math.max(70, w * 0.3));
            const plotW = w - labelW - 48;
            const rowH = Math.max(18, (Math.max(height, data.length * 26 + 24) - 8) / data.length);
            return (
              <svg width={w} height={data.length * rowH + 8}>
                {data.map((r, i) => {
                  const v = Number(r[cols[0].key]) || 0;
                  const bw = Math.max(1, (v / max) * plotW);
                  const y = i * rowH + 4;
                  return (
                    <g key={i} onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: label(r[xKey]), lines: [{ color: cols[0].color, label: cols[0].label, value: formatValue(v, format) }] })}>
                      <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" className="fill-[#696975] text-[11.5px]">{truncate(label(r[xKey]), 22)}</text>
                      <rect x={labelW} y={y + rowH * 0.18} width={plotW} height={rowH * 0.64} fill="transparent" />
                      <rect x={labelW} y={y + rowH * 0.22} width={bw} height={rowH * 0.56} rx={3} fill={cols[0].color} opacity={0.88} />
                      <text x={labelW + bw + 6} y={y + rowH / 2 + 4} className="fill-[#1b1b22] text-[11.5px] tabular">{compact(v, format)}</text>
                    </g>
                  );
                })}
              </svg>
            );
          }
          const left = 40, bottom = 26, top = 8;
          const plotW = w - left - 8, plotH = height - bottom - top;
          const band = plotW / Math.max(1, data.length);
          const groupW = Math.min(64, band * 0.7);
          const barW = stacked ? groupW : groupW / cols.length;
          const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64)));
          return (
            <svg width={w} height={height}>
              {ticks(max).map((t) => {
                const y = top + plotH - (t / max) * plotH;
                return <g key={t}><line x1={left} x2={w - 8} y1={y} y2={y} stroke="#e4e3dc" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                  <text x={left - 6} y={y + 4} textAnchor="end" className="fill-[#a2a2ab] text-[10.5px] tabular">{compact(t, format)}</text></g>;
              })}
              {data.map((r, i) => {
                const x0 = left + i * band + (band - groupW) / 2;
                let acc = 0;
                return (
                  <g key={i} onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: label(r[xKey]), lines: cols.map((s) => ({ color: s.color, label: s.label, value: formatValue(r[s.key], format) })) })}>
                    <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" />
                    {cols.map((s, j) => {
                      const v = Number(r[s.key]) || 0;
                      const h = (v / max) * plotH;
                      const y = stacked ? top + plotH - ((acc + v) / max) * plotH : top + plotH - h;
                      const x = stacked ? x0 : x0 + j * barW;
                      acc += v;
                      return <rect key={s.key} x={x} y={y} width={Math.max(1, barW - (stacked ? 0 : 2))} height={Math.max(0, h)} rx={stacked ? 0 : 3} fill={s.color} opacity={0.9} />;
                    })}
                    {i % every === 0 && <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" className="fill-[#696975] text-[11px]">{truncate(label(r[xKey]), Math.max(4, Math.floor(band * every / 7)))}</text>}
                  </g>
                );
              })}
            </svg>
          );
        }}
      </Frame>
      <Legend items={cols.map((c) => ({ label: c.label, color: c.color }))} />
    </div>
  );
}

/* ── Line and area ────────────────────────────────────────────── */

export function LineChart({ data, xKey, series, area = false, height = 240, format = "number", xLabel }: {
  data: Row[]; xKey: string; series: Series[]; area?: boolean; height?: number; format?: ValueFormat;
  xLabel?: (v: unknown) => string;
}) {
  const label = xLabel ?? ((v: unknown) => String(v ?? "—"));
  const cols = series.map((s, i) => ({ ...s, color: s.color ?? colorAt(i) }));
  return (
    <div>
      <Frame height={height}>
        {(w, setTip) => {
          const left = 40, bottom = 26, top = 10;
          const plotW = w - left - 12, plotH = height - bottom - top;
          const max = niceMax(Math.max(0, ...data.flatMap((r) => cols.map((s) => Number(r[s.key]) || 0))));
          const step = data.length > 1 ? plotW / (data.length - 1) : 0;
          const xAt = (i: number) => left + (data.length > 1 ? i * step : plotW / 2);
          const yAt = (v: number) => top + plotH - (v / max) * plotH;
          const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 70)));
          return (
            <svg width={w} height={height}
              onMouseMove={(e) => {
                if (!data.length) return;
                const i = Math.max(0, Math.min(data.length - 1, Math.round((e.nativeEvent.offsetX - left) / (step || 1))));
                setTip({ x: xAt(i), y: e.nativeEvent.offsetY, title: label(data[i][xKey]), lines: cols.map((s) => ({ color: s.color, label: s.label, value: formatValue(data[i][s.key], format) })) });
              }}>
              {ticks(max).map((t) => {
                const y = yAt(t);
                return <g key={t}><line x1={left} x2={w - 12} y1={y} y2={y} stroke="#e4e3dc" strokeDasharray={t === 0 ? undefined : "2 4"} />
                  <text x={left - 6} y={y + 4} textAnchor="end" className="fill-[#a2a2ab] text-[10.5px] tabular">{compact(t, format)}</text></g>;
              })}
              {cols.map((s) => {
                const pts = data.map((r, i) => [xAt(i), yAt(Number(r[s.key]) || 0)] as const);
                const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
                return (
                  <g key={s.key}>
                    {area && pts.length > 0 && <path d={`${d} L${pts[pts.length - 1][0]},${top + plotH} L${pts[0][0]},${top + plotH} Z`} fill={s.color} opacity={0.1} />}
                    <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
                    {pts.length <= 40 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill="#fff" stroke={s.color} strokeWidth={1.4} />)}
                  </g>
                );
              })}
              {data.map((r, i) => i % every === 0 && (
                <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" className="fill-[#696975] text-[11px]">{truncate(label(r[xKey]), 12)}</text>
              ))}
            </svg>
          );
        }}
      </Frame>
      <Legend items={cols.map((c) => ({ label: c.label, color: c.color }))} />
    </div>
  );
}

/* ── Pie and donut ────────────────────────────────────────────── */

export function PieChart({ data, labelKey, valueKey, donut = true, height = 220, format = "number", label: labelFn }: {
  data: Row[]; labelKey: string; valueKey: string; donut?: boolean; height?: number; format?: ValueFormat;
  label?: (v: unknown) => string;
}) {
  const lab = labelFn ?? ((v: unknown) => (v === null || v === undefined || v === "" ? "Not set" : String(v)));
  const items = data.map((r, i) => ({ label: lab(r[labelKey]), value: Math.max(0, Number(r[valueKey]) || 0), color: colorAt(i) }))
    .filter((x) => x.value > 0);
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <Frame height={height}>
      {(w, setTip) => {
        const size = Math.min(height - 8, w * 0.5);
        const r = size / 2, cx = r + 4, cy = height / 2;
        const inner = donut ? r * 0.62 : 0;
        let a0 = -Math.PI / 2;
        return (
          <div className="flex h-full items-center gap-4">
            <svg width={size + 8} height={height}>
              {total === 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e4e3dc" />}
              {items.map((it) => {
                const a1 = a0 + (it.value / total) * Math.PI * 2;
                const large = a1 - a0 > Math.PI ? 1 : 0;
                const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
                const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, inner), [x3, y3] = p(a0, inner);
                const full = items.length === 1;
                const d = full
                  ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0` + (inner ? ` M${cx - inner},${cy} a${inner},${inner} 0 1,1 ${2 * inner},0 a${inner},${inner} 0 1,1 ${-2 * inner},0` : "")
                  : `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} ${inner ? `A${inner},${inner} 0 ${large} 0 ${x3},${y3}` : `L${cx},${cy}`} Z`;
                a0 = a1;
                return <path key={it.label} d={d} fill={it.color} fillRule="evenodd" stroke="#fff" strokeWidth={1.5} opacity={0.92}
                  onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: it.label, lines: [{ color: it.color, label: `${Math.round((it.value / total) * 100)}%`, value: formatValue(it.value, format) }] })} />;
              })}
              {donut && <>
                <text x={cx} y={cy - 2} textAnchor="middle" className="fill-[#1b1b22] text-[18px] font-light tabular">{compact(total, format)}</text>
                <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[#a2a2ab] text-[10.5px]">total</text>
              </>}
            </svg>
            <div className="min-w-0 flex-1 space-y-1 overflow-hidden text-[12.5px]">
              {items.slice(0, 8).map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: it.color }} /><span className="truncate">{it.label}</span></span>
                  <span className="tabular text-ink">{compact(it.value, format)}</span>
                </div>
              ))}
              {items.length > 8 && <p className="text-faint">+{items.length - 8} more</p>}
            </div>
          </div>
        );
      }}
    </Frame>
  );
}

/* ── Heatmap ──────────────────────────────────────────────────── */

export function Heatmap({ cells, xLabel, yLabel, height = 240, format = "number" }: {
  cells: { x: unknown; y: unknown; value: number }[]; xLabel?: (v: unknown) => string; yLabel?: (v: unknown) => string;
  height?: number; format?: ValueFormat;
}) {
  const xl = xLabel ?? ((v: unknown) => String(v ?? "Not set"));
  const yl = yLabel ?? ((v: unknown) => String(v ?? "Not set"));
  const xs = useMemo(() => Array.from(new Set(cells.map((c) => JSON.stringify(c.x)))).sort(), [cells]);
  const ys = useMemo(() => Array.from(new Set(cells.map((c) => JSON.stringify(c.y)))), [cells]);
  const max = Math.max(1, ...cells.map((c) => c.value));
  const map = new Map(cells.map((c) => [`${JSON.stringify(c.x)}|${JSON.stringify(c.y)}`, c.value]));
  return (
    <Frame height={Math.max(height, ys.length * 24 + 30)}>
      {(w, setTip) => {
        const left = Math.min(150, w * 0.28), top = 4, bottom = 24;
        const cw = (w - left - 4) / Math.max(1, xs.length);
        const ch = Math.max(16, (Math.max(height, ys.length * 24 + 30) - top - bottom) / Math.max(1, ys.length));
        const every = Math.ceil(xs.length / Math.max(1, Math.floor((w - left) / 60)));
        return (
          <svg width={w} height={ys.length * ch + top + bottom}>
            {ys.map((yk, j) => (
              <g key={yk}>
                <text x={left - 8} y={top + j * ch + ch / 2 + 4} textAnchor="end" className="fill-[#696975] text-[11px]">{truncate(yl(JSON.parse(yk)), 20)}</text>
                {xs.map((xk, i) => {
                  const v = map.get(`${xk}|${yk}`) ?? 0;
                  const t = v / max;
                  return <rect key={xk} x={left + i * cw + 1} y={top + j * ch + 1} width={cw - 2} height={ch - 2} rx={3}
                    fill={v ? "#4f46e5" : "#f7f7f4"} opacity={v ? 0.12 + t * 0.8 : 1}
                    onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: `${yl(JSON.parse(yk))} · ${xl(JSON.parse(xk))}`, lines: [{ label: "Value", value: formatValue(v, format) }] })} />;
                })}
              </g>
            ))}
            {xs.map((xk, i) => i % every === 0 && (
              <text key={xk} x={left + i * cw + cw / 2} y={top + ys.length * ch + 16} textAnchor="middle" className="fill-[#696975] text-[10.5px]">{truncate(xl(JSON.parse(xk)), 10)}</text>
            ))}
          </svg>
        );
      }}
    </Frame>
  );
}

/* ── Funnel ───────────────────────────────────────────────────── */

export function Funnel({ data, labelKey, valueKey, height = 240, format = "number", label: labelFn }: {
  data: Row[]; labelKey: string; valueKey: string; height?: number; format?: ValueFormat; label?: (v: unknown) => string;
}) {
  const lab = labelFn ?? ((v: unknown) => String(v ?? "Not set"));
  const max = Math.max(1, ...data.map((r) => Number(r[valueKey]) || 0));
  const first = Number(data[0]?.[valueKey]) || 0;
  return (
    <Frame height={Math.max(height, data.length * 34)}>
      {(w, setTip) => {
        const rowH = Math.max(26, Math.max(height, data.length * 34) / Math.max(1, data.length));
        const labelW = Math.min(140, w * 0.3);
        const plotW = w - labelW - 60;
        return (
          <svg width={w} height={data.length * rowH}>
            {data.map((r, i) => {
              const v = Number(r[valueKey]) || 0;
              const bw = Math.max(4, (v / max) * plotW);
              const x = labelW + (plotW - bw) / 2;
              return (
                <g key={i} onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: lab(r[labelKey]), lines: [{ color: colorAt(0), label: "Count", value: formatValue(v, format) }, ...(first ? [{ label: "Of the first stage", value: `${Math.round((v / first) * 100)}%` }] : [])] })}>
                  <text x={labelW - 8} y={i * rowH + rowH / 2 + 4} textAnchor="end" className="fill-[#696975] text-[11.5px]">{truncate(lab(r[labelKey]), 18)}</text>
                  <rect x={x} y={i * rowH + 3} width={bw} height={rowH - 6} rx={4} fill="#4f46e5" opacity={0.85 - (i / Math.max(1, data.length)) * 0.5} />
                  <text x={labelW + plotW + 8} y={i * rowH + rowH / 2 + 4} className="fill-[#1b1b22] text-[11.5px] tabular">{compact(v, format)}{first && i ? ` · ${Math.round((v / first) * 100)}%` : ""}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Frame>
  );
}

/* ── Gauge and KPI ────────────────────────────────────────────── */

export function Gauge({ value, max = 100, label, format = "number", height = 150 }: {
  value: number | null; max?: number | null; label?: string; format?: ValueFormat; height?: number;
}) {
  const m = max && max > 0 ? max : 100;
  const v = Math.max(0, Math.min(m, Number(value) || 0));
  const t = v / m;
  return (
    <Frame height={height}>
      {(w) => {
        const r = Math.min(w / 2 - 8, height - 30);
        const cx = w / 2, cy = height - 18;
        const arc = (a: number) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
        const [sx, sy] = arc(0), [ex, ey] = arc(1), [vx, vy] = arc(t);
        const color = t >= 0.8 ? "#14b8a6" : t >= 0.5 ? "#4f46e5" : "#f59e0b";
        return (
          <svg width={w} height={height}>
            <path d={`M${sx},${sy} A${r},${r} 0 0 1 ${ex},${ey}`} fill="none" stroke="#ecebe5" strokeWidth={10} strokeLinecap="round" />
            {t > 0 && <path d={`M${sx},${sy} A${r},${r} 0 0 1 ${vx},${vy}`} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />}
            <text x={cx} y={cy - 8} textAnchor="middle" className="fill-[#1b1b22] text-[26px] font-extralight tabular">{value === null || value === undefined ? "—" : formatValue(v, format)}</text>
            {label && <text x={cx} y={cy + 10} textAnchor="middle" className="fill-[#a2a2ab] text-[11px]">{label}</text>}
          </svg>
        );
      }}
    </Frame>
  );
}

export function Kpi({ value, label, format = "number", hint }: { value: unknown; label?: string; format?: ValueFormat; hint?: ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="tabular text-[34px] font-extralight leading-none text-ink">{formatValue(value, format)}</p>
      {label && <p className="mt-2 text-[12.5px] text-muted">{label}</p>}
      {hint && <p className="mt-1 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

/* ── Widget data from the API ─────────────────────────────────── */

export type WidgetColumn = { key: string; label: string; type: string; grain?: string | null; options?: { value: unknown; label: string }[] | null; measure?: boolean };
export type WidgetData = {
  id?: string; type: string; title?: string; status: string; message?: string; options?: Record<string, unknown>;
  columns?: WidgetColumn[]; rows?: Row[]; totals?: Record<string, unknown> | null; x?: WidgetColumn | null;
  series?: WidgetColumn | null; measures?: WidgetColumn[]; value?: number | null; max?: number | null; scope_label?: string;
  row_count?: number;
};

export function labelFor(col: WidgetColumn | null | undefined): (v: unknown) => string {
  return (v: unknown) => {
    if (v === null || v === undefined || v === "") return "Not set";
    if (col?.options?.length) {
      const o = col.options.find((x) => String(x.value) === String(v));
      if (o) return o.label;
    }
    if (col?.type === "bool") return v ? "Yes" : "No";
    if (col && (col.type === "date" || col.grain) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(v + "T00:00:00");
      if (col.grain === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      if (col.grain === "year") return String(d.getFullYear());
      if (col.grain === "quarter") return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
      if (col.grain === "week") return "Wk " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      return formatDate(v);
    }
    if (typeof v === "string" && /^[a-z]+(_[a-z]+)+$/.test(v)) return v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    return String(v);
  };
}

function formatOf(d: WidgetData, col?: WidgetColumn): ValueFormat {
  const f = (d.options?.format as ValueFormat) || undefined;
  if (f) return f;
  if (d.options?.percent) return "percent";
  if (col?.type === "money") return "money";
  if (col?.type === "percent") return "percent";
  if (col?.type === "hours") return "hours";
  return "number";
}

export function WidgetChart({ data, height = 220 }: { data: WidgetData; height?: number }) {
  if (data.status !== "ok") {
    return <div className="flex h-full min-h-[80px] items-center justify-center px-4 text-center text-[13px] text-faint">{data.message || "No data"}</div>;
  }
  const rows = data.rows ?? [];
  const measures = data.measures ?? [];
  const m0 = measures[0];
  const fmt = formatOf(data, m0);
  const t = data.type;
  if (t === "kpi") return <Kpi value={data.value} label={m0?.label} format={fmt} hint={data.scope_label && data.scope_label !== "Everyone" ? data.scope_label : undefined} />;
  if (t === "gauge") return <Gauge value={data.value ?? null} max={data.max ?? 100} label={m0?.label} format={data.options?.percent ? "percent" : fmt} height={height} />;
  if (t === "table") {
    const cols = (data.columns ?? []).filter((c) => !c.key.startsWith("_"));
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface"><tr>{cols.map((c) => <th key={c.key} className="border-b border-line px-2 py-1.5 text-left font-normal text-muted">{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                {cols.map((c) => <td key={c.key} className={`px-2 py-1.5 ${["number", "money", "percent", "hours"].includes(c.type) ? "tabular text-right" : ""}`}>
                  {["number", "money", "percent", "hours"].includes(c.type) ? formatValue(r[c.key], c.type === "money" ? "money" : c.type === "percent" ? "percent" : "number") : labelFor(c)(r[c.key])}
                </td>)}
              </tr>
            ))}
            {!rows.length && <tr><td className="px-2 py-6 text-center text-faint" colSpan={cols.length}>No rows</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }
  if (!rows.length || !data.x) return <div className="flex h-full min-h-[80px] items-center justify-center text-[13px] text-faint">Nothing to show yet</div>;
  const xKey = data.x.key;
  const xl = labelFor(data.x);
  if (t === "pie" || t === "donut") return <PieChart data={rows} labelKey={xKey} valueKey={m0.key} donut={t === "donut"} height={height} format={fmt} label={xl} />;
  if (t === "funnel") return <Funnel data={rows} labelKey={xKey} valueKey={m0.key} height={height} format={fmt} label={xl} />;
  if (t === "heatmap") {
    const yCol = data.series;
    return <Heatmap cells={rows.map((r) => ({ x: yCol ? r[yCol.key] : r[xKey], y: yCol ? r[xKey] : m0.label, value: Number(r[m0.key]) || 0 }))}
      xLabel={labelFor(yCol ?? data.x)} yLabel={xl} height={height} format={fmt} />;
  }
  // pivot a second group into series
  let chartRows = rows;
  let series: Series[] = measures.map((m) => ({ key: m.key, label: m.label }));
  if (data.series) {
    const sKey = data.series.key;
    const sl = labelFor(data.series);
    const order: string[] = [];
    const byX = new Map<string, Row>();
    for (const r of rows) {
      const xk = JSON.stringify(r[xKey]);
      const sk = sl(r[sKey]);
      if (!order.includes(sk)) order.push(sk);
      const row = byX.get(xk) ?? { [xKey]: r[xKey] };
      row[sk] = (Number(row[sk]) || 0) + (Number(r[m0.key]) || 0);
      byX.set(xk, row);
    }
    chartRows = Array.from(byX.values());
    series = order.map((s) => ({ key: s, label: s }));
  }
  if (data.x.grain || data.x.type === "date") chartRows = [...chartRows].sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])));
  if (t === "line" || t === "area") return <LineChart data={chartRows} xKey={xKey} series={series} area={t === "area"} height={height} format={fmt} xLabel={xl} />;
  return <BarChart data={chartRows} xKey={xKey} series={series} stacked={t === "stacked_bar"} height={height} format={fmt} xLabel={xl} />;
}
