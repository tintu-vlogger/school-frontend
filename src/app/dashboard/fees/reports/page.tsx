"use client";

/*
 * Fee reports: daily collection (by mode and collector), head-wise collection, outstanding by
 * section or class, concessions and the fee register. Each exports to CSV.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { useInstitution } from "@/lib/institution";
import { formatDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Button, DateRangeInput, Select, Skeleton, Tabs } from "@/components/ui-kit";
import { type Money, downloadFile, errMsg, money, useFeeMeta, useFetch, useSectionOptions } from "@/components/fees/shared";

type Kind = "daily" | "heads" | "outstanding" | "concessions" | "register";
type Row = Record<string, Money | string | number | null>;
type Report = { rows: Row[]; total?: Money; totals?: Record<string, Money>; count?: number; cancelled?: Money;
  by_mode?: { label: string; amount: Money }[]; by_collector?: { name: string; amount: Money }[]; by_concession?: { name: string; amount: Money }[] };

export default function ReportsPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const sections = useSectionOptions();
  const today = todayISO();
  const [kind, setKind] = useState<Kind>("daily");
  const [range, setRange] = useState({ from: today, to: today });
  const [group, setGroup] = useState("section");
  const [section, setSection] = useState<number | null>(null);
  const p = new URLSearchParams();
  if (kind === "daily" || kind === "heads") { if (range.from) p.set("from", range.from); if (range.to) p.set("to", range.to); }
  if (kind === "outstanding") p.set("group", group);
  if (kind === "register" && section) p.set("section_id", String(section));
  const path = `/fees/reports/${kind}?${p}`;
  const { data, loading } = useFetch<Report>(path, (e) => toast.error(errMsg(e)));

  const m = (v: Money | string | number | null) => money(v as Money, cur);
  const cols: Record<Kind, [string, string, ((v: Row[string]) => string)?][]> = {
    daily: [["number", "Receipt"], ["paid_on", "Date", (v) => formatDate(String(v))], ["student", term("student")], ["section", term("section")], ["modes", "Mode"], ["collected_by", "Collected by"], ["status", "Status"], ["amount", "Amount", m]],
    heads: [["head", "Fee head"], ["code", "Code"], ["ledger_account", "Ledger account"], ["amount", "Collected", m]],
    outstanding: [["group", group === "section" ? term("section") : term("program")], ["students", term("students")], ["billed", "Billed", m], ["concession", "Concession", m], ["collected", "Collected", m], ["outstanding", "Outstanding", m], ["defaulters", "Defaulters"], ["rate", "Collected %", (v) => `${v}%`]],
    concessions: [["student", term("student")], ["admission_no", "Admission no."], ["section", term("section")], ["concessions", "Concessions"], ["heads", "On"], ["amount", "Amount", m]],
    register: [["student", term("student")], ["admission_no", "Admission no."], ["section", term("section")], ["gross", "Gross", m], ["concession", "Concession", m], ["tax", "Tax", m], ["billed", "Billed", m], ["paid", "Paid", m], ["balance", "Balance", m]],
  };
  const money_cols = new Set(["amount", "billed", "concession", "collected", "outstanding", "gross", "tax", "paid", "balance"]);

  return (
    <div>
      <PageHeader eyebrow="Fees" title="Fee reports" description="Collections, outstanding dues, concessions and the fee register."
        actions={<Button icon={Download} onClick={() => downloadFile(`${path}&format=csv`, `${kind}.csv`).catch((e) => toast.error(errMsg(e)))}>Export CSV</Button>} />
      <Tabs value={kind} onChange={setKind} className="mb-4" items={[
        { value: "daily", label: "Daily collection" }, { value: "heads", label: "Head-wise" }, { value: "outstanding", label: "Outstanding" },
        { value: "concessions", label: "Concessions" }, { value: "register", label: "Fee register" }]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(kind === "daily" || kind === "heads") && <div className="w-72"><DateRangeInput value={range} onChange={setRange} /></div>}
        {kind === "outstanding" && <div className="w-48"><Select<string> value={group} onChange={(v) => setGroup(v || "section")} options={[{ value: "section", label: `By ${term("section").toLowerCase()}` }, { value: "program", label: `By ${term("program").toLowerCase()}` }]} /></div>}
        {kind === "register" && <div className="w-56"><Select<number> value={section} onChange={setSection} options={sections} clearable placeholder={`All ${term("sections").toLowerCase()}`} /></div>}
      </div>

      {kind === "daily" && data && (
        <div className="mb-5 grid gap-5 md:grid-cols-3">
          <Paper className="p-5"><p className="text-[13px] text-muted">Collected</p><p className="tabular mt-2 text-[28px] font-extralight text-ink">{m(data.total ?? 0)}</p><p className="text-[12.5px] text-faint">{data.count} receipts{data.cancelled ? ` · ${m(data.cancelled)} cancelled` : ""}</p></Paper>
          <Paper><PaperHeader title="By mode" /><ul className="divide-y divide-line text-[13.5px]">{(data.by_mode ?? []).map((x) => <li key={x.label} className="flex justify-between px-5 py-2"><span>{x.label}</span><span className="tabular">{m(x.amount)}</span></li>)}</ul></Paper>
          <Paper><PaperHeader title="By collector" /><ul className="divide-y divide-line text-[13.5px]">{(data.by_collector ?? []).map((x) => <li key={x.name} className="flex justify-between px-5 py-2"><span>{x.name}</span><span className="tabular">{m(x.amount)}</span></li>)}</ul></Paper>
        </div>
      )}

      <Paper>
        <div className="overflow-x-auto">
          {loading && !data ? <Skeleton className="m-5 h-40" /> : (
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead><tr className="border-b border-line text-left text-[12px] text-faint">
                {cols[kind].map(([k, label]) => <th key={k} className={`px-4 py-2.5 font-normal ${money_cols.has(k) ? "text-right" : ""}`}>{label}</th>)}
              </tr></thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => (
                  <tr key={i} className="border-b border-line/70">
                    {cols[kind].map(([k, , fmt]) => <td key={k} className={`px-4 py-2 ${money_cols.has(k) ? "text-right tabular" : "text-ink/85"}`}>{r[k] == null ? "—" : fmt ? fmt(r[k]) : String(r[k])}</td>)}
                  </tr>
                ))}
                {data && data.rows.length === 0 && <tr><td colSpan={cols[kind].length} className="px-4 py-10 text-center text-muted">Nothing for this period.</td></tr>}
                {data?.totals && (
                  <tr className="text-ink">{cols[kind].map(([k], i) => <td key={k} className={`px-4 py-2.5 ${money_cols.has(k) ? "text-right tabular" : ""}`}>{i === 0 ? "Total" : data.totals?.[k] != null ? m(data.totals[k]) : ""}</td>)}</tr>
                )}
                {data && !data.totals && data.total != null && kind !== "daily" && (
                  <tr className="text-ink">{cols[kind].map(([k], i) => <td key={k} className={`px-4 py-2.5 ${money_cols.has(k) ? "text-right tabular" : ""}`}>{i === 0 ? "Total" : k === "amount" ? m(data.total ?? 0) : ""}</td>)}</tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Paper>
    </div>
  );
}
