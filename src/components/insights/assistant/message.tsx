"use client";

/* One message in the assistant chat, with its answer blocks (numbers, tables, charts). */
import { Fragment } from "react";
import { Sparkles } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { BarChart, LineChart, PieChart, formatValue } from "@/components/insights/charts";

type Row = Record<string, unknown>;
export type Block =
  | { type: "kpi"; value: unknown; label?: string | null }
  | { type: "table"; columns: string[]; rows: Row[]; note?: string | null; totals?: Row | null }
  | { type: "chart"; chart: "bar" | "line" | "donut" | "pie"; x: string; y: string; rows: Row[] }
  | { type: "scope"; text: string };
export type ToolUse = { name: string; args?: Record<string, unknown>; rows?: number | null; error?: string | null };
export type Msg = { role: "user" | "assistant"; text: string; blocks?: Block[]; tools?: ToolUse[]; mode?: string; at?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return formatValue(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && ISO_DATE.test(v)) return formatDate(v);
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

function RichText({ text }: { text: string }) {
  const lines = text.replace(/\*\*(.+?)\*\*/g, "$1").split("\n");
  return (
    <div className="space-y-1 text-[14.5px] leading-[1.65] text-ink">
      {lines.map((l, i) => {
        const bullet = /^\s*(?:•|-|\*)\s+(.*)$/.exec(l);
        if (bullet) return <p key={i} className="flex gap-2 pl-1"><span className="text-faint">•</span><span className="min-w-0 flex-1">{bullet[1]}</span></p>;
        if (!l.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i} className="whitespace-pre-wrap">{l}</p>;
      })}
    </div>
  );
}

function TableBlock({ b }: { b: Extract<Block, { type: "table" }> }) {
  const numeric = (c: string) => b.rows.some((r) => typeof r[c] === "number");
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="max-h-[340px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-sunken">
            <tr>{b.columns.map((c) => <th key={c} className={`whitespace-nowrap border-b border-line px-3 py-2 font-normal text-muted ${numeric(c) ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                {b.columns.map((c) => (
                  <td key={c} className={`whitespace-nowrap px-3 py-1.5 ${typeof r[c] === "number" ? "tabular text-right text-ink" : r[c] === null || r[c] === undefined ? "text-faint" : "text-ink"}`}>{cell(r[c])}</td>
                ))}
              </tr>
            ))}
            {!b.rows.length && <tr><td colSpan={b.columns.length} className="px-3 py-5 text-center text-faint">No rows</td></tr>}
          </tbody>
          {b.totals && (
            <tfoot className="sticky bottom-0 bg-surface">
              <tr className="border-t border-line">
                {b.columns.map((c, i) => (
                  <td key={c} className={`whitespace-nowrap px-3 py-2 ${b.totals![c] !== undefined && b.totals![c] !== null ? "tabular text-right text-ink" : "text-muted"}`}>
                    {b.totals![c] !== undefined && b.totals![c] !== null ? cell(b.totals![c]) : i === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {b.note && <p className="border-t border-line bg-sunken/50 px-3 py-1.5 text-[12px] text-faint">{b.note}</p>}
    </div>
  );
}

function ChartBlock({ b }: { b: Extract<Block, { type: "chart" }> }) {
  const label = (v: unknown) => (v === null || v === undefined || v === "" ? "Not set" : typeof v === "string" && ISO_DATE.test(v) ? formatDate(v) : String(v));
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      {b.chart === "line" ? (
        <LineChart data={b.rows} xKey={b.x} series={[{ key: b.y, label: b.y }]} height={220} xLabel={label} />
      ) : b.chart === "pie" || b.chart === "donut" ? (
        <PieChart data={b.rows} labelKey={b.x} valueKey={b.y} donut={b.chart === "donut"} height={200} label={label} />
      ) : (
        <BarChart data={b.rows} xKey={b.x} series={[{ key: b.y, label: b.y }]} height={220} xLabel={label} />
      )}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.type === "kpi" && (
            <div className="rounded-xl border border-line px-4 py-3.5">
              <p className="tabular text-[34px] font-extralight leading-none text-ink">{typeof b.value === "number" ? formatValue(b.value) : cell(b.value)}</p>
              {b.label && <p className="mt-2 text-[12.5px] text-muted">{b.label}</p>}
            </div>
          )}
          {b.type === "table" && <TableBlock b={b} />}
          {b.type === "chart" && b.rows?.length > 0 && <ChartBlock b={b} />}
          {b.type === "scope" && <p className="text-[12px] text-faint">Showing: {b.text}</p>}
        </Fragment>
      ))}
    </>
  );
}

const toolName = (n: string) => n.replace(/_/g, " ");

export function MessageView({ m }: { m: Msg }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-[14.5px] text-ink">{m.text}</div>
      </div>
    );
  }
  const blocks = m.blocks ?? [];
  const tools = (m.tools ?? []).filter((t) => t.name);
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.06] text-primary">
        <Sparkles size={14} strokeWidth={1.4} />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {m.text && <RichText text={m.text} />}
        {blocks.length > 0 && <Blocks blocks={blocks} />}
        {tools.length > 0 && (
          <p className="text-[11.5px] text-faint">Used: {Array.from(new Set(tools.map((t) => toolName(t.name)))).join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export function Typing() {
  return (
    <div className="flex gap-3" aria-live="polite" aria-label="Working on an answer">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.06] text-primary">
        <Sparkles size={14} strokeWidth={1.4} />
      </span>
      <div className="flex h-7 items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }} />
        ))}
      </div>
    </div>
  );
}
