"use client";

/*
 * Pay review setup (pay review admins):
 *   <IncrementCycleModal open cycle={IncrementCycle | null} onClose onSaved />
 *   Basics      name, effective date, the review cycle whose ratings drive it
 *   Guidelines  compa-ratio bands across, ratings down, the suggested % in each cell
 *   Pay ranges  min / mid / max per designation (the midpoint gives the compa-ratio)
 *   Letter      revision letter template with {placeholders}
 * And <BudgetsModal> for the budget per department (as % of current pay, or an amount).
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, Tabs, Textarea, TextInput,
} from "@/components/ui-kit";
import { money, useDesignations } from "../shared";
import type { Band, BudgetRow, Cycle, Guidelines, IncrementCycle } from "../types";

type Draft = {
  name: string; effective_date: string; review_cycle_id: number | null; guidelines: Guidelines;
  pay_ranges: { designation_id: number | null; min: number | null; mid: number | null; max: number | null }[]; letter_template: string;
};

const DEFAULT_GUIDE: Guidelines = {
  bands: [{ label: "Below 0.9", min: null, max: 0.9 }, { label: "0.9 – 1.1", min: 0.9, max: 1.1 }, { label: "Above 1.1", min: 1.1, max: null }],
  rows: [{ rating: 5, pcts: [14, 12, 9] }, { rating: 4, pcts: [11, 9, 7] }, { rating: 3, pcts: [8, 6, 4] }, { rating: 2, pcts: [4, 3, 2] }, { rating: 1, pcts: [0, 0, 0] }],
};

const PLACEHOLDERS = "{employee_name} {cycle_name} {current_ctc} {new_ctc} {increment_pct} {increment_amount} {effective_date} {promotion_line} {new_designation} {company_name}";

function draftOf(c: IncrementCycle | null): Draft {
  return {
    name: c?.name ?? "", effective_date: c?.effective_date ?? "", review_cycle_id: c?.review_cycle?.id ?? null,
    guidelines: c?.guidelines?.bands?.length ? c.guidelines : DEFAULT_GUIDE,
    pay_ranges: Object.entries(c?.pay_ranges ?? {}).map(([k, v]) => ({ designation_id: Number(k), ...v })),
    letter_template: c?.letter_template ?? "",
  };
}

export function IncrementCycleModal({ open, cycle, reviewCycles, onClose, onSaved }: {
  open: boolean; cycle: IncrementCycle | null; reviewCycles: Cycle[]; onClose: () => void; onSaved: (c: IncrementCycle) => void;
}) {
  const toast = useToast();
  const designations = useDesignations();
  const [v, setV] = useState<Draft>(() => draftOf(cycle));
  const [tab, setTab] = useState<"basics" | "guidelines" | "ranges" | "letter">("basics");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof Draft>(k: K, x: Draft[K]) => { setV((d) => ({ ...d, [k]: x })); setDirty(true); };
  const g = v.guidelines;
  const setG = (next: Guidelines) => set("guidelines", next);

  function setBand(i: number, patch: Partial<Band>) { setG({ ...g, bands: g.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }); }
  function addBand() { setG({ bands: [...g.bands, { label: "", min: null, max: null }], rows: g.rows.map((r) => ({ ...r, pcts: [...r.pcts, 0] })) }); }
  function removeBand(i: number) { setG({ bands: g.bands.filter((_, j) => j !== i), rows: g.rows.map((r) => ({ ...r, pcts: r.pcts.filter((_, j) => j !== i) })) }); }
  function setCell(ri: number, bi: number, x: number) { setG({ ...g, rows: g.rows.map((r, j) => (j === ri ? { ...r, pcts: r.pcts.map((p, k) => (k === bi ? x : p)) } : r)) }); }

  async function save() {
    if (!v.name.trim() || !v.effective_date) { toast.error("Give the pay review a name and an effective date"); setTab("basics"); return; }
    setBusy(true);
    try {
      const body = {
        name: v.name.trim(), effective_date: v.effective_date, review_cycle_id: v.review_cycle_id, guidelines: v.guidelines,
        pay_ranges: Object.fromEntries(v.pay_ranges.filter((r) => r.designation_id && r.mid).map((r) => [String(r.designation_id), { min: r.min ?? 0, mid: r.mid, max: r.max ?? 0 }])),
        letter_template: v.letter_template.trim() || null,
      };
      const saved = cycle
        ? await api.put<IncrementCycle>(`/performance/increment-cycles/${cycle.uuid}`, body)
        : await api.post<IncrementCycle>("/performance/increment-cycles", body);
      toast.success(cycle ? "Pay review saved" : "Pay review created");
      setDirty(false);
      onSaved(saved); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={busy} dirty={dirty} title={cycle ? `Edit ${cycle.name}` : "New pay review"}
      description="Ratings and where pay sits in its range suggest each person's increment."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>{cycle ? "Save" : "Create"}</Button></>}>
      <Tabs value={tab} onChange={setTab} className="mb-6" items={[
        { value: "basics", label: "Basics" }, { value: "guidelines", label: "Guidelines" },
        { value: "ranges", label: "Pay ranges" }, { value: "letter", label: "Letter" },
      ]} />

      {tab === "basics" && (
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => set("name", x)} placeholder="Annual pay review 2026" autoFocusInModal /></Field>
          <Field label="Effective from" required><DateInput value={v.effective_date} onChange={(x) => set("effective_date", x)} /></Field>
          <Field label="Ratings from" hint="Each person's final (or calibrated) rating in this review cycle picks the guideline row. Without one, everyone active is included.">
            <Select<number> value={v.review_cycle_id} onChange={(x) => set("review_cycle_id", x)} clearable placeholder="No review cycle"
              options={reviewCycles.filter((c) => c.status !== "draft").map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        </FormGrid>
      )}

      {tab === "guidelines" && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">Suggested increment % for each rating, by compa-ratio (current pay ÷ the range midpoint). People lower in their range get more.</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken/50">
                  <th className="px-3 py-2 text-left font-normal text-muted">Rating</th>
                  {g.bands.map((b, i) => (
                    <th key={i} className="min-w-[150px] px-2 py-2 font-normal">
                      <div className="flex items-center gap-1">
                        <TextInput value={b.label ?? ""} onValueChange={(x) => setBand(i, { label: x })} placeholder="Band" className="h-8" />
                        {g.bands.length > 1 && <IconButton icon={Trash2} label="Remove band" size="sm" onClick={() => removeBand(i)} />}
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        <NumberInput value={b.min} onChange={(x) => setBand(i, { min: x })} step={0.05} placeholder="from" />
                        <NumberInput value={b.max} onChange={(x) => setBand(i, { max: x })} step={0.05} placeholder="below" />
                      </div>
                    </th>
                  ))}
                  <th className="w-10 px-2"><IconButton icon={Plus} label="Add band" size="sm" onClick={addBand} /></th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <NumberInput value={r.rating} onChange={(x) => setG({ ...g, rows: g.rows.map((y, j) => (j === ri ? { ...y, rating: x ?? 0 } : y)) })} step={0.5} className="w-20" />
                        <IconButton icon={Trash2} label="Remove row" size="sm" onClick={() => setG({ ...g, rows: g.rows.filter((_, j) => j !== ri) })} />
                      </div>
                    </td>
                    {r.pcts.map((p, bi) => (
                      <td key={bi} className="px-2 py-2"><NumberInput value={p} onChange={(x) => setCell(ri, bi, x ?? 0)} min={0} max={100} step={0.5} suffix="%" /></td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button icon={Plus} size="sm" onClick={() => setG({ ...g, rows: [...g.rows, { rating: 0, pcts: g.bands.map(() => 0) }] })}>Add rating row</Button>
        </div>
      )}

      {tab === "ranges" && (
        <div className="space-y-3">
          <p className="text-[13.5px] text-muted">Annual CTC range per designation. Without a range, the first guideline band is used.</p>
          {v.pay_ranges.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_repeat(3,140px)_36px] items-end gap-2">
              <Field label={i === 0 ? "Designation" : undefined}>
                <Select<number> value={r.designation_id} options={designations} placeholder="Pick a designation"
                  onChange={(x) => set("pay_ranges", v.pay_ranges.map((y, j) => (j === i ? { ...y, designation_id: x } : y)))} />
              </Field>
              {(["min", "mid", "max"] as const).map((k) => (
                <Field key={k} label={i === 0 ? { min: "Minimum", mid: "Midpoint", max: "Maximum" }[k] : undefined}>
                  <NumberInput value={r[k]} min={0} step={10000} onChange={(x) => set("pay_ranges", v.pay_ranges.map((y, j) => (j === i ? { ...y, [k]: x } : y)))} />
                </Field>
              ))}
              <IconButton icon={Trash2} label="Remove" onClick={() => set("pay_ranges", v.pay_ranges.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button icon={Plus} size="sm" onClick={() => set("pay_ranges", [...v.pay_ranges, { designation_id: null, min: null, mid: null, max: null }])}>Add range</Button>
        </div>
      )}

      {tab === "letter" && (
        <div className="space-y-3">
          <Field label="Revision letter" hint={`Leave empty to use the company template. Placeholders: ${PLACEHOLDERS}`}>
            <Textarea value={v.letter_template} onValueChange={(x) => set("letter_template", x)} rows={12} autoGrow />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ── Budgets ─────────────────────────────────────────────────────────── */

export function BudgetsModal({ open, cycle, rows, onClose, onSaved }: {
  open: boolean; cycle: IncrementCycle | null; rows: BudgetRow[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState(() => rows.map((r) => ({ department_id: r.department_id, department: r.department, base: r.current_payroll, pct: r.budget_pct, amount: r.budget_pct === null ? r.budget : null })));
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!cycle) return;
    setBusy(true);
    try {
      await api.put(`/performance/increment-cycles/${cycle.uuid}/budgets`, {
        budgets: items.map((i) => ({ department_id: i.department_id, budget_pct: i.pct, budget_amount: i.pct === null ? i.amount ?? 0 : 0 })),
      });
      toast.success("Budgets saved");
      onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={busy} title="Budgets" description="Set a % of each department's current pay, or a fixed amount."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {!items.length ? <p className="py-8 text-center text-[14px] text-muted">Open the pay review first so departments and current pay are known.</p> : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_140px_120px_160px] gap-3 px-1 text-[12.5px] text-muted">
            <span>Department</span><span className="text-right">Current pay</span><span>Budget %</span><span>or amount</span>
          </div>
          {items.map((it, i) => (
            <div key={String(it.department_id)} className="grid grid-cols-[1fr_140px_120px_160px] items-center gap-3 rounded-lg px-1 py-1">
              <span className="truncate text-[14px] text-ink">{it.department}</span>
              <span className="text-right text-[13px] text-muted tabular">{money(it.base, { compact: true })}</span>
              <NumberInput value={it.pct} min={0} max={100} step={0.5} suffix="%" onChange={(x) => setItems(items.map((y, j) => (j === i ? { ...y, pct: x, amount: x === null ? y.amount : null } : y)))} />
              <NumberInput value={it.pct !== null ? Math.round((it.base * it.pct) / 100) : it.amount} min={0} step={10000} disabled={it.pct !== null}
                onChange={(x) => setItems(items.map((y, j) => (j === i ? { ...y, amount: x } : y)))} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
