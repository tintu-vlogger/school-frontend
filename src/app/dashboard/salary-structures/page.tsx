"use client";

/*
 * Salary structures: templates by grade that split CTC into components, with a salary range,
 * the 50% wage rule check and a sample split. Editing saves a new version (salaries keep the
 * version they were assigned with). Add / edit / details in modals; ?view=<uuid> deep-links.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Select, Skeleton, TextInput,
  Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { Row, can, errMsg, inr, usePayrollAccess } from "@/components/payroll/common";

type Line = { component: string; calc: string; value?: number; formula?: string };
type Preview = { monthly_gross: string; components: { code: string; name: string; kind: string; monthly: string }[]; wage_rule: { core_share: string; compliant: boolean }; warnings: { message: string }[]; error?: string };
type Structure = { uuid: string; name: string; code: string | null; description: string | null; version: number; effective_from: string;
  grade_ids: number[]; grades: string[]; min_ctc: string | null; max_ctc: string | null; lines: Line[]; include_employer_pf_in_ctc: boolean;
  include_gratuity_in_ctc: boolean; active: boolean; employees?: number; sample?: Preview | null };
type Comp = { code: string; name: string; kind: string; calc: string };

export default function StructuresPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = usePayrollAccess();
  const [rows, setRows] = useState<Structure[] | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: Structure | null; key: number }>({ open: false, target: null, key: 0 });
  const viewing = params.get("view");
  const load = useCallback(() => { api.get<Structure[]>("/payroll/structures").then(setRows).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const canEdit = can(access, "payroll.settings");
  const view = rows?.find((r) => r.uuid === viewing) ?? null;

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Salary structures" description="Templates that split CTC into Basic, HRA and allowances, with a balancing figure and a salary range."
        actions={<>
          <Button variant="ghost" onClick={() => router.push("/dashboard/payroll/components")}>Salary components</Button>
          {canEdit && <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>New structure</Button>}
        </>} />
      {!rows ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div> : !rows.length ? (
        <Paper><EmptyState icon={Layers} title="No structures yet" hint="Create one to split CTC into salary parts." /></Paper>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <button key={s.uuid} onClick={() => router.replace(`/dashboard/salary-structures?view=${s.uuid}`, { scroll: false })}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-[16px] text-ink">{s.name}</p>
                  <p className="text-[12.5px] text-faint">{[s.code, `v${s.version}`, s.grades.length ? s.grades.join(", ") : "All grades"].filter(Boolean).join(" · ")}</p></div>
                {!s.active ? <Badge>Off</Badge> : <Badge tone="accent">{s.employees ?? 0} people</Badge>}
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] text-muted">{s.description}</p>
              {s.sample && !s.sample.error && (
                <div className="mt-4 space-y-1.5">
                  <SplitBar parts={s.sample.components.filter((c) => c.kind !== "employer")} />
                  <p className="text-[12.5px] text-faint">Sample at {inr((Number(s.min_ctc ?? 0) + Number(s.max_ctc ?? 0)) / 2 || 600000)} · Basic + DA {s.sample.wage_rule.core_share}%</p>
                </div>
              )}
              <p className="mt-auto pt-4 text-[13px] text-muted">{s.min_ctc ? `${inr(s.min_ctc)} – ${inr(s.max_ctc)}` : "No range"}</p>
            </button>
          ))}
        </div>
      )}
      <StructureDetail s={view} open={!!view} onClose={() => router.replace("/dashboard/salary-structures", { scroll: false })} canEdit={canEdit}
        onEdit={(s) => setForm({ open: true, target: s, key: form.key + 1 })} />
      <StructureForm key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })}
        onSaved={(s) => { setForm({ ...form, open: false }); load(); router.replace(`/dashboard/salary-structures?view=${s.uuid}`, { scroll: false }); }} />
    </div>
  );
}

const COLORS = ["bg-primary", "bg-primary/60", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-300", "bg-violet-300", "bg-slate-300"];
function SplitBar({ parts }: { parts: { code: string; name: string; monthly: string }[] }) {
  const total = parts.reduce((a, p) => a + Number(p.monthly), 0) || 1;
  return (
    <>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
        {parts.map((p, i) => <span key={p.code} className={COLORS[i % COLORS.length]} style={{ width: `${(Number(p.monthly) / total) * 100}%` }} title={`${p.name} ${inr(p.monthly)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
        {parts.map((p, i) => <span key={p.code} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${COLORS[i % COLORS.length]}`} />{p.name}</span>)}
      </div>
    </>
  );
}

const CALC_LABEL: Record<string, string> = { fixed: "Fixed", percent_ctc: "% of monthly CTC", formula: "Formula", balance: "Balancing figure" };

function StructureDetail({ s, open, onClose, canEdit, onEdit }: { s: Structure | null; open: boolean; onClose: () => void; canEdit: boolean; onEdit: (s: Structure) => void }) {
  const [ctc, setCtc] = useState<number | null>(null);
  const [metro, setMetro] = useState(true);
  const [p, setP] = useState<Preview | null>(null);
  useEffect(() => { if (s) setCtc(Math.round(((Number(s.min_ctc ?? 0) + Number(s.max_ctc ?? 0)) / 2 || 600000) / 12000) * 12000); }, [s]);
  useEffect(() => {
    if (!s || !ctc) return;
    const t = setTimeout(() => api.post<Preview>("/payroll/structures/preview", { annual_ctc: ctc, metro, lines: s.lines, include_employer_pf_in_ctc: s.include_employer_pf_in_ctc, include_gratuity_in_ctc: s.include_gratuity_in_ctc, min_ctc: s.min_ctc, max_ctc: s.max_ctc })
      .then(setP).catch((e) => setP({ error: errMsg(e) } as Preview)), 250);
    return () => clearTimeout(t);
  }, [s, ctc, metro]);
  if (!s) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg" title={s.name} description={`${s.code ?? ""} · version ${s.version} from ${formatDate(s.effective_from)}`}
      footer={canEdit ? <Button variant="primary" icon={Pencil} onClick={() => onEdit(s)}>Edit</Button> : undefined}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">How CTC is split</p>
          <ul className="divide-y divide-line">
            {s.lines.map((l) => (
              <li key={l.component} className="py-2"><p className="text-[14px] text-ink">{l.component}</p>
                <p className="font-mono text-[12px] text-muted">{l.calc === "formula" ? l.formula : l.calc === "fixed" ? `₹${l.value}` : l.calc === "percent_ctc" ? `${l.value}% of monthly CTC` : "Whatever is left"}</p></li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Employer PF {s.include_employer_pf_in_ctc ? "is" : "is not"} part of CTC · gratuity {s.include_gratuity_in_ctc ? "is" : "is not"}.</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <FormGrid>
            <Field label="Try a CTC"><NumberInput value={ctc} onChange={setCtc} step={12000} /></Field>
            <div className="pt-6"><Toggle checked={metro} onChange={setMetro} label="Metro city" /></div>
          </FormGrid>
          {p?.error ? <p className="mt-3 text-[13px] text-rose-700">{p.error}</p> : p && (
            <div className="mt-3 divide-y divide-line">
              {p.components.map((c) => <Row key={c.code} label={c.name} sub={c.kind === "employer" ? "Employer" : undefined} value={inr(c.monthly)} />)}
              <Row label="Monthly gross" value={inr(p.monthly_gross)} strong />
              <div className="pt-2"><Badge tone={p.wage_rule.compliant ? "good" : "warn"}>Basic + DA {p.wage_rule.core_share}%</Badge></div>
              {p.warnings.map((w, i) => <p key={i} className="pt-2 text-[12.5px] text-amber-700">{w.message}</p>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StructureForm({ open, target, onClose, onSaved }: { open: boolean; target: Structure | null; onClose: () => void; onSaved: (s: Structure) => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: target?.name ?? "", code: target?.code ?? "", description: target?.description ?? "",
    min_ctc: target?.min_ctc ? Number(target.min_ctc) : null as number | null, max_ctc: target?.max_ctc ? Number(target.max_ctc) : null as number | null,
    grade_ids: target?.grade_ids ?? [] as number[], include_employer_pf_in_ctc: target?.include_employer_pf_in_ctc ?? true,
    include_gratuity_in_ctc: target?.include_gratuity_in_ctc ?? false, active: target?.active ?? true,
    effective_from: target?.effective_from ?? new Date().toISOString().slice(0, 10), change_note: "" });
  const [lines, setLines] = useState<Line[]>(target?.lines ?? [{ component: "BASIC", calc: "formula", formula: "round(monthly_ctc * 0.5)" }, { component: "SPECIAL", calc: "balance" }]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [grades, setGrades] = useState<SelectOption<number>[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<Comp[]>("/payroll/components").then(setComps).catch(() => {});
    api.get<{ id: number; name: string }[] | { items: { id: number; name: string }[] }>("/organization/grades").then((g) => {
      const list = Array.isArray(g) ? g : g.items;
      setGrades(list.map((x) => ({ value: x.id, label: x.name })));
    }).catch(() => setGrades([]));
  }, [open]);
  const compOpts = useMemo(() => comps.filter((c) => ["earning", "reimbursement", "employer"].includes(c.kind) && c.calc !== "system")
    .map((c) => ({ value: c.code, label: c.name, description: c.code })), [comps]);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => setLines((ls) => { const n = [...ls]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  async function save() {
    setBusy(true);
    try {
      const body = { ...v, code: v.code || undefined, lines };
      const s = target ? await api.put<Structure>(`/payroll/structures/${target.uuid}`, body) : await api.post<Structure>("/payroll/structures", body);
      toast.success(target ? "New version saved" : "Structure created");
      onSaved(s);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="xl" title={target ? `Edit ${target.name}` : "New salary structure"} busy={busy} dirty
      description={target ? "Saving creates a new version; existing salaries keep the version they were given." : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save} disabled={!v.name}>Save</Button></>}>
      <div className="space-y-6">
        <FormGrid columns={3}>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
          <Field label="Code"><TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} /></Field>
          <Field label="Effective from"><DateInput value={v.effective_from} onChange={(x) => setV({ ...v, effective_from: x })} /></Field>
          <Field label="Minimum CTC"><NumberInput value={v.min_ctc} onChange={(x) => setV({ ...v, min_ctc: x })} step={10000} /></Field>
          <Field label="Maximum CTC"><NumberInput value={v.max_ctc} onChange={(x) => setV({ ...v, max_ctc: x })} step={10000} /></Field>
          <Field label="Grades"><MultiSelect value={v.grade_ids} onChange={(x) => setV({ ...v, grade_ids: x })} options={grades} placeholder="All grades" /></Field>
        </FormGrid>
        <Field label="Description"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-[14px] text-ink">Parts</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setLines([...lines, { component: "", calc: "fixed", value: 0 }])}>Add part</Button></div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-3 md:grid-cols-[1.2fr_1fr_1.6fr_auto]">
                <Select value={l.component || null} onChange={(x) => setLine(i, { component: x ?? "" })} options={compOpts} placeholder="Component" />
                <Select value={l.calc} onChange={(x) => setLine(i, { calc: x ?? "fixed" })} options={Object.entries(CALC_LABEL).map(([value, label]) => ({ value, label }))} />
                {l.calc === "formula" ? <TextInput value={l.formula ?? ""} onValueChange={(x) => setLine(i, { formula: x })} placeholder="round(basic * 0.4)" className="font-mono" />
                  : l.calc === "balance" ? <p className="px-1 pt-2 text-[13px] text-muted">CTC minus everything else</p>
                  : <NumberInput value={l.value ?? null} onChange={(x) => setLine(i, { value: x ?? 0 })} suffix={l.calc === "percent_ctc" ? "%" : "₹"} />}
                <div className="flex gap-1">
                  <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === lines.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-faint">Formulas can use ctc, monthly_ctc, metro and earlier parts by code in lower case, e.g. <span className="font-mono">if(metro, basic * 0.5, basic * 0.4)</span>.</p>
        </div>
        <FormGrid>
          <Toggle checked={v.include_employer_pf_in_ctc} onChange={(x) => setV({ ...v, include_employer_pf_in_ctc: x })} label="Employer PF is part of CTC" />
          <Toggle checked={v.include_gratuity_in_ctc} onChange={(x) => setV({ ...v, include_gratuity_in_ctc: x })} label="Gratuity is part of CTC" />
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />
          {target && <Field label="What changed"><TextInput value={v.change_note} onValueChange={(x) => setV({ ...v, change_note: x })} /></Field>}
        </FormGrid>
      </div>
    </Modal>
  );
}
