"use client";

/*
 * Payroll budgets: a yearly employer-cost budget per department or cost centre, typed in a
 * grid, with the cost so far and the full-year projection beside it. The same figures feed
 * the "Payroll cost against budget" reports.
 */
import { useCallback, useEffect, useState } from "react";
import { PiggyBank, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, NumberInput, Select, Skeleton, StatCard, Tabs } from "@/components/ui-kit";
import { can, currentFY, errMsg, fyOptions, inr, usePayrollAccess } from "@/components/payroll/common";

type Item = { ref_id: number; name: string; amount: string | null; headcount: number | null; actual: number; projected: number; people: number; status: string };
type Data = { fy: string; dimension: string; items: Item[]; unassigned: { actual: number } | null };

export default function BudgetsPage() {
  const toast = useToast();
  const access = usePayrollAccess();
  const [fy, setFy] = useState<string | null>(currentFY());
  const [dim, setDim] = useState("department");
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setData(null);
    api.get<Data>(`/payroll/budgets?fy=${fy}&dimension=${dim}`).then((d) => { setData(d); setEdits(Object.fromEntries(d.items.map((i) => [i.ref_id, i.amount ? Number(i.amount) : null]))); })
      .catch((e) => toast.error(errMsg(e)));
  }, [fy, dim, toast]);
  useEffect(() => { load(); }, [load]);
  const dirty = data?.items.some((i) => (i.amount ? Number(i.amount) : null) !== (edits[i.ref_id] ?? null)) ?? false;
  async function save() {
    setBusy(true);
    try {
      const d = await api.put<Data>("/payroll/budgets", { fy, dimension: dim, items: Object.entries(edits).map(([k, v]) => ({ ref_id: Number(k), amount: v })) });
      setData(d); toast.success("Budgets saved");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const budget = Object.values(edits).reduce<number>((a, b) => a + (b ?? 0), 0);
  const actual = data?.items.reduce((a, b) => a + b.actual, 0) ?? 0;
  const projected = data?.items.reduce((a, b) => a + b.projected, 0) ?? 0;
  const canEdit = can(access, "payroll.settings");
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Payroll budgets" description="Yearly employer cost budgets, with the cost so far and where the year is heading."
        actions={<div className="flex items-center gap-2"><div className="w-40"><Select value={fy} onChange={setFy} options={fyOptions()} /></div>
          {canEdit && <Button variant="primary" icon={Save} disabled={!dirty} loading={busy} onClick={save}>Save</Button>}</div>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Budget for the year" value={inr(budget)} icon={PiggyBank} />
        <StatCard label="Cost so far" value={inr(actual)} hint={budget ? `${((actual / budget) * 100).toFixed(1)}% used` : undefined} />
        <StatCard label="Projected for the year" value={inr(projected)} hint={budget ? (projected > budget ? `${inr(projected - budget)} over` : `${inr(budget - projected)} under`) : undefined} />
      </div>
      <Tabs value={dim} onChange={setDim} className="mb-4" items={[{ value: "department", label: "Departments" }, { value: "cost_centre", label: "Cost centres" }]} />
      <Paper>
        {!data ? <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : !data.items.length ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-muted">No {dim === "department" ? "departments" : "cost centres"} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead><tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.06em] text-faint">
                <th className="px-5 py-3 font-normal">{dim === "department" ? "Department" : "Cost centre"}</th><th className="px-3 py-3 font-normal">Budget for the year</th>
                <th className="px-3 py-3 text-right font-normal">Cost so far</th><th className="px-3 py-3 text-right font-normal">Projected</th><th className="px-5 py-3 font-normal">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((i) => {
                  const b = edits[i.ref_id] ?? null;
                  const over = b !== null && i.projected > b;
                  return (
                    <tr key={i.ref_id}>
                      <td className="px-5 py-2.5"><p className="text-ink">{i.name}</p><p className="text-[12.5px] text-faint">{i.people} paid</p></td>
                      <td className="w-56 px-3 py-2.5">{canEdit ? <NumberInput value={b} onChange={(v) => setEdits({ ...edits, [i.ref_id]: v })} min={0} aria-label={`Budget for ${i.name}`} /> : <span className="tabular">{inr(b)}</span>}</td>
                      <td className="tabular px-3 py-2.5 text-right text-ink/85">{inr(i.actual)}</td>
                      <td className="tabular px-3 py-2.5 text-right text-muted">{inr(i.projected)}</td>
                      <td className="px-5 py-2.5">{b === null ? <Badge>No budget</Badge> : <Badge tone={over ? "bad" : "good"} dot>{over ? "Heading over" : "On track"}</Badge>}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
      {data?.unassigned && data.unassigned.actual > 0 && <p className="mt-3 text-[13px] text-muted">{inr(data.unassigned.actual)} was paid to people with no {dim === "department" ? "department" : "cost centre"}.</p>}
      <p className="mt-3 text-[12.5px] text-faint">Pay equity, CTC, variance, statutory liability and cost against budget are in Reports, under Pay.</p>
    </div>
  );
}
