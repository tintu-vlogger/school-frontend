"use client";

/*
 * Grading set-up: grading schemes (grade bands, GPA scales, pass marks; editing a scheme in use
 * makes a new version), which scheme each program uses, result rules (how exams combine into
 * a term or final result, pass rules, grace, attendance, ranking), exam types and co-scholastic areas.
 */
import { useCallback, useEffect, useState } from "react";
import { Ban, Calculator, Pencil, Plus, Sigma, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Section, Select,
  Skeleton, Tabs, TextInput, Textarea, Toggle, useConfirm, type Column,
} from "@/components/ui-kit";
import { CATEGORY_OPTIONS, fmt, useExamOptions, type Band, type Options, type Rule, type Scheme } from "@/components/exams/shared";

const KINDS = [
  { value: "percentage_bands", label: "Percentage with grades" }, { value: "gpa", label: "GPA / CGPA with grade points" },
  { value: "pass_fail", label: "Pass / fail" }, { value: "descriptive", label: "Descriptive levels" }, { value: "marks", label: "Marks only" },
];

export default function GradingPage() {
  const [tab, setTab] = useState("schemes");
  const { options, reload } = useExamOptions();
  const { term } = useInstitution();
  return (
    <div>
      <PageHeader eyebrow="Exams" title="Grading" description="How marks become grades and results. Defaults suit most institutions; change anything here." />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} items={[
        { value: "schemes", label: "Grading schemes" }, { value: "rules", label: "Result rules" },
        { value: "types", label: "Exam types" }, { value: "areas", label: "Co-scholastic areas" },
      ]} /></div>
      {tab === "schemes" && <Schemes options={options} onChanged={reload} />}
      {tab === "rules" && <Rules options={options} />}
      {tab === "types" && <SimpleList kind="types" />}
      {tab === "areas" && <SimpleList kind="areas" options={options} />}
      <p className="mt-8 text-[12.5px] text-faint">Each {term("program").toLowerCase()} uses the institution default unless you pick another scheme for it.</p>
    </div>
  );
}

/* ── Schemes ───────────────────────────────────────────────────────────── */

function Schemes({ options, onChanged }: { options: Options | null; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [rows, setRows] = useState<Scheme[] | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<Scheme | "new" | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { api.get<Scheme[]>("/exams/schemes").then(setRows).catch(() => setRows([])); }, [tick]);
  const refresh = useCallback(() => { setTick((t) => t + 1); onChanged(); }, [onChanged]);
  const open = (s: Scheme | "new") => { setKey((k) => k + 1); setEditing(s); };
  async function makeDefault(s: Scheme) {
    try { await api.post(`/exams/schemes/${s.uuid}/default`); toast.success(`${s.name} is now the default`); refresh(); }
    catch (x) { toast.error("Couldn't change the default", { description: (x as Error).message }); }
  }
  async function off(s: Scheme) {
    if (!(await confirm({ title: `Switch off ${s.name}?`, message: "Existing results keep it. It won't be offered for new exams.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/exams/schemes/${s.uuid}`); refresh(); } catch (x) { toast.error("Couldn't switch it off", { description: (x as Error).message }); }
  }
  async function setProgram(programId: number, schemeId: number | null) {
    try { await api.put("/exams/program-schemes", { program_id: programId, grading_scheme_id: schemeId }); toast.success("Saved"); refresh(); }
    catch (x) { toast.error("Couldn't save", { description: (x as Error).message }); }
  }
  if (!rows) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-8">
      <div className="flex justify-end"><Button variant="primary" icon={Plus} onClick={() => open("new")}>New scheme</Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <Paper key={s.uuid} className="flex flex-col p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-[15px] text-ink">{s.name}</p>
                <p className="text-[12.5px] text-muted">{KINDS.find((k) => k.value === s.kind)?.label}{s.scale_max ? ` · on ${fmt(s.scale_max)}` : ""} · pass {fmt(s.pass_percent)}%{s.version > 1 ? ` · v${s.version}` : ""}</p></div>
              {s.is_default && <Badge tone="accent">Default</Badge>}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[...s.bands].sort((a, b) => b.min_percent - a.min_percent).map((b) => (
                <span key={b.label} title={`${b.description ?? ""} ${b.min_percent}%+`} className={`rounded-md border px-1.5 py-0.5 text-[12px] ${b.is_pass ? "border-line text-ink/80" : "border-rose-200 text-rose-700"}`}>
                  {b.label}<span className="text-faint"> {fmt(b.min_percent, 0)}%{b.grade_point !== null ? ` (${fmt(b.grade_point)})` : ""}</span></span>
              ))}
              {!s.bands.length && <span className="text-[12.5px] text-faint">No grades, marks and percentage only</span>}
            </div>
            {s.programs && s.programs.length > 0 && <p className="mb-3 text-[12.5px] text-muted">Used by {s.programs.join(", ")}</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" icon={Pencil} onClick={() => open(s)}>Edit</Button>
              {!s.is_default && <Button size="sm" icon={Star} onClick={() => makeDefault(s)}>Make default</Button>}
              {!s.is_default && <IconButton icon={Ban} label="Switch off" onClick={() => off(s)} />}
            </div>
          </Paper>
        ))}
      </div>
      <Section title={`Grading by ${term("program").toLowerCase()}`} description={`Pick a different scheme for a ${term("program").toLowerCase()}, e.g. descriptive levels for early years or GPA for a degree.`}>
        <div className="divide-y divide-line rounded-xl border border-line">
          {(options?.programs ?? []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span className="text-[14px] text-ink">{p.name}</span>
              <div className="w-full sm:w-72"><Select value={p.grading_scheme_id} clearable placeholder="Institution default" onChange={(x) => setProgram(p.id, x)}
                options={rows.map((s) => ({ value: s.id, label: s.name }))} /></div>
            </div>
          ))}
          {!options?.programs.length && <p className="px-4 py-6 text-[13.5px] text-muted">No {term("programs").toLowerCase()} yet.</p>}
        </div>
      </Section>
      <SchemeModal key={key} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
    </div>
  );
}

function SchemeModal({ target, onClose, onSaved }: { target: Scheme | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s = target && target !== "new" ? target : null;
  const initial = {
    name: s?.name ?? "", kind: s?.kind ?? "percentage_bands", scale_max: s?.scale_max ?? null as number | null, pass_percent: s?.pass_percent ?? 33 as number | null,
    percent_formula: s?.percent_formula ?? "", description: s?.description ?? "",
    bands: (s?.bands ?? [{ label: "Pass", min_percent: 33, grade_point: null, description: null, is_pass: true }, { label: "Fail", min_percent: 0, grade_point: null, description: null, is_pass: false }])
      .map((b) => ({ ...b })).sort((a, b) => b.min_percent - a.min_percent) as Band[],
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<number | null>(null);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const band = (i: number, patch: Partial<Band>) => set("bands", v.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const preview = lookup === null ? null : [...v.bands].sort((a, b) => b.min_percent - a.min_percent).find((b) => lookup >= b.min_percent);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { toast.error("Give the scheme a name"); return; }
    setSaving(true);
    const payload = { name: v.name.trim(), kind: v.kind, scale_max: v.kind === "gpa" ? v.scale_max : null, pass_percent: v.pass_percent ?? 0,
      percent_formula: v.percent_formula.trim() || null, description: v.description.trim() || null,
      bands: v.kind === "marks" ? [] : v.bands.filter((b) => b.label.trim()).map((b) => ({ ...b, label: b.label.trim() })) };
    try {
      const r = s ? await api.put<Scheme>(`/exams/schemes/${s.uuid}`, payload) : await api.post<Scheme>("/exams/schemes", payload);
      toast.success(s && r.version > s.version ? `Saved as version ${r.version}` : "Scheme saved",
        s && r.version > s.version ? { description: "Published results keep the old version." } : undefined);
      onSaved();
    } catch (x) { toast.error("Couldn't save the scheme", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!target} onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={s ? `Edit ${s.name}` : "New grading scheme"}
      description={s ? "If results using this scheme are published, saving creates a new version." : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="scheme-form" loading={saving}>Save scheme</Button></>}>
      <form id="scheme-form" onSubmit={submit} className="space-y-6">
        <FormGrid>
          <Field label="Name" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. State board grades" /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => x && set("kind", x)} options={KINDS} /></Field>
          <Field label="Pass at" hint="Percentage needed to pass a subject"><NumberInput value={v.pass_percent} onChange={(x) => set("pass_percent", x)} min={0} max={100} suffix="%" /></Field>
          {v.kind === "gpa" && <>
            <Field label="Scale" hint="Top grade point, e.g. 4, 5 or 10"><NumberInput value={v.scale_max} onChange={(x) => set("scale_max", x)} min={1} max={100} /></Field>
            <Field label="CGPA to percentage" aside="Optional" hint="A formula with cgpa, e.g. cgpa * 9.5"><TextInput value={v.percent_formula} onValueChange={(x) => set("percent_formula", x)} className="font-mono" /></Field>
          </>}
          <Field label="Description" aside="Optional" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={2} /></Field>
        </FormGrid>
        {v.kind !== "marks" && (
          <Section title="Grades" description="Each grade starts at a percentage and runs up to the next one. One must start at 0%.">
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_96px_96px_1.3fr_72px_36px] gap-2 text-[12px] text-muted sm:grid"><span>Grade</span><span>From %</span><span>Points</span><span>Meaning</span><span>Pass</span><span /></div>
              {v.bands.map((b, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_96px_96px_1.3fr_72px_36px] sm:items-center">
                  <TextInput value={b.label} onValueChange={(x) => band(i, { label: x })} placeholder="A1" aria-label="Grade" />
                  <NumberInput value={b.min_percent} onChange={(x) => band(i, { min_percent: x ?? 0 })} min={0} max={100} />
                  <NumberInput value={b.grade_point} onChange={(x) => band(i, { grade_point: x })} min={0} max={100} step={0.1} placeholder="—" />
                  <TextInput value={b.description ?? ""} onValueChange={(x) => band(i, { description: x || null })} placeholder="e.g. Outstanding" aria-label="Meaning" />
                  <Checkbox checked={b.is_pass} onChange={(x) => band(i, { is_pass: x })} label="Pass" />
                  <IconButton icon={Trash2} label="Remove grade" onClick={() => set("bands", v.bands.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Button size="sm" icon={Plus} onClick={() => set("bands", [...v.bands, { label: "", min_percent: 0, grade_point: null, description: null, is_pass: true }])}>Add grade</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px]">
              <span className="text-muted">Try a score</span>
              <div className="w-32"><NumberInput value={lookup} onChange={setLookup} min={0} max={100} suffix="%" /></div>
              {preview && <span>→ <b className="font-normal text-ink">{preview.label}</b>{preview.grade_point !== null ? ` (${preview.grade_point} points)` : ""}{!preview.is_pass ? <Badge tone="bad" className="ml-2">Fail</Badge> : null}</span>}
            </div>
          </Section>
        )}
      </form>
    </Modal>
  );
}

/* ── Result rules ──────────────────────────────────────────────────────── */

function Rules({ options }: { options: Options | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [rows, setRows] = useState<Rule[] | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { api.get<Rule[]>("/exams/rules").then(setRows).catch(() => setRows([])); }, [tick]);
  const open = (r: Rule | "new") => { setKey((k) => k + 1); setEditing(r); };
  const columns: Column<Rule>[] = [
    { key: "name", header: "Result", cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12.5px] text-muted">{r.term_name ?? "Whole session"}</p></div> },
    { key: "how", header: "How it is worked out", hideBelow: "md", cell: (r) => <span className="text-muted">{r.method === "formula" ? r.formula : r.groups.map((g) => `${g.label || g.key} ${g.weight}%${g.combine === "best_of" ? ` (best ${g.best_of})` : ""}`).join(" + ")}</span> },
    { key: "rules", header: "Rules", hideBelow: "lg", cell: (r) => <span className="text-[12.5px] text-muted">{[r.min_attendance_percent !== null && `attendance ${r.min_attendance_percent}%`, r.grace_per_subject && `grace ${r.grace_per_subject}`, r.ranking && "ranked", r.cumulative && "CGPA"].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "results", header: "Results", align: "right", cell: (r) => <span className="tabular text-muted">{r.published ? `${r.published} published` : r.results}</span> },
  ];
  async function off(r: Rule) {
    if (!(await confirm({ title: `Switch off ${r.name}?`, message: "Its results stay but it is no longer recalculated.", confirmLabel: "Switch off", tone: "danger" }))) return;
    await api.delete(`/exams/rules/${r.uuid}`); setTick((t) => t + 1);
  }
  async function compute(r: Rule) {
    try { const x = await api.post<{ computed: number }>("/exams/results/compute", { source: `rule:${r.uuid}` }); toast.success(`${x.computed} results worked out`); setTick((t) => t + 1); }
    catch (e) { toast.error("Couldn't recalculate", { description: (e as Error).message }); }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13.5px] text-muted">Combine exams into a {term("term").toLowerCase()} or final result, e.g. unit tests 20% (best 2 of 3) plus mid-term 80%.</p>
        <Button variant="primary" icon={Plus} onClick={() => open("new")} disabled={!options?.exams.length}>New result rule</Button>
      </div>
      <DataTable rows={rows ?? []} rowKey={(r) => r.uuid} columns={columns} loading={rows === null} onRowClick={open}
        rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => open(r) }, { label: "Recalculate", icon: Calculator, onSelect: () => compute(r) }, "separator", { label: "Switch off", icon: Ban, danger: true, onSelect: () => off(r) }]}
        emptyIcon={Sigma} emptyTitle="No result rules yet" emptyHint={options?.exams.length ? "Add one to combine exams into a term or final result." : "Create exams first, then combine them here."} />
      <RuleModal key={key} target={editing} options={options} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick((t) => t + 1); }} />
    </>
  );
}

type GroupDraft = { key: string; label: string; exam_ids: number[]; combine: string; best_of: number | null; weight: number | null };

function RuleModal({ target, options, onClose, onSaved }: { target: Rule | "new" | null; options: Options | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const r = target && target !== "new" ? target : null;
  const initial = {
    name: r?.name ?? "", term_id: r?.term_id ?? null as number | null, program_ids: r?.program_ids ?? [] as number[],
    grading_scheme_id: r?.grading_scheme_id ?? null as number | null, method: r?.method ?? "weighted", formula: r?.formula ?? "",
    groups: (r?.groups ?? [{ key: "ut", label: "Unit tests", exam_ids: [], combine: "average", best_of: null, weight: 20 }, { key: "main", label: "Main exam", exam_ids: [], combine: "average", best_of: null, weight: 80 }]).map((g) => ({ ...g })) as GroupDraft[],
    pass_all_subjects: r?.pass_all_subjects ?? true, subject_pass_percent: r?.subject_pass_percent ?? null, min_aggregate_percent: r?.min_aggregate_percent ?? null,
    max_failed_subjects: r?.max_failed_subjects ?? null, min_attendance_percent: r?.min_attendance_percent ?? null,
    grace_per_subject: r?.grace_per_subject ?? null, grace_max_subjects: r?.grace_max_subjects ?? null, grace_total: r?.grace_total ?? null,
    ranking: r?.ranking ?? true, cumulative: r?.cumulative ?? false, out_of: r?.out_of ?? null,
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const group = (i: number, patch: Partial<GroupDraft>) => set("groups", v.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const examOpts = (options?.exams ?? []).map((e) => ({ value: e.id, label: e.name }));
  const totalWeight = v.groups.reduce((a, g) => a + (g.weight ?? 0), 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { toast.error("Give the result a name"); return; }
    if (v.groups.some((g) => !g.exam_ids.length)) { toast.error("Pick at least one exam in every part"); return; }
    setSaving(true);
    const payload = { ...v, name: v.name.trim(), formula: v.method === "formula" ? v.formula : null,
      groups: v.groups.map((g, i) => ({ ...g, key: (g.key || `p${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]/, "p"), weight: g.weight ?? 0 })) };
    try {
      if (r) await api.put(`/exams/rules/${r.uuid}`, payload); else await api.post("/exams/rules", payload);
      toast.success("Result rule saved", { description: "Results were worked out again." }); onSaved();
    } catch (x) { toast.error("Couldn't save the rule", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!target} onClose={onClose} size="xl" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={r ? `Edit ${r.name}` : "New result rule"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="rule-form" loading={saving}>Save and calculate</Button></>}>
      <form id="rule-form" onSubmit={submit} className="space-y-6">
        <FormGrid columns={3}>
          <Field label="Name" required><TextInput autoFocusInModal value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Term 1 result" /></Field>
          <Field label={term("term")}><Select value={v.term_id} clearable onChange={(x) => set("term_id", x)} placeholder="Whole session (final)" options={(options?.terms ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Grading" aside="Optional"><Select value={v.grading_scheme_id} clearable onChange={(x) => set("grading_scheme_id", x)} placeholder="Default" options={(options?.schemes ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label={term("programs")} hint="Empty = every one writing the exams" className="sm:col-span-3">
            <MultiSelect value={v.program_ids} onChange={(x) => set("program_ids", x)} options={(options?.programs ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="All" />
          </Field>
        </FormGrid>
        <Section title="Parts" description={v.method === "weighted" ? `Each part's percentage counts by its weight (now ${totalWeight}). Missing parts don't count against a learner.` : "Use the short keys in the formula."}>
          <div className="space-y-3">
            {v.groups.map((g, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[90px_1fr_2fr_150px_90px_90px_36px] sm:items-end">
                <Field label="Key"><TextInput value={g.key} onValueChange={(x) => group(i, { key: x.toLowerCase() })} className="font-mono" /></Field>
                <Field label="Label"><TextInput value={g.label} onValueChange={(x) => group(i, { label: x })} /></Field>
                <Field label="Exams"><MultiSelect value={g.exam_ids} onChange={(x) => group(i, { exam_ids: x })} options={examOpts} placeholder="Pick exams" /></Field>
                <Field label="Combine"><Select value={g.combine} onChange={(x) => x && group(i, { combine: x })} options={[{ value: "average", label: "Average" }, { value: "best_of", label: "Best of" }, { value: "sum", label: "Sum" }, { value: "max", label: "Highest" }, { value: "latest", label: "Latest" }]} /></Field>
                <Field label="Best">{g.combine === "best_of" ? <NumberInput value={g.best_of} onChange={(x) => group(i, { best_of: x })} min={1} /> : <span className="block h-9 pt-2 text-faint">—</span>}</Field>
                <Field label="Weight"><NumberInput value={g.weight} onChange={(x) => group(i, { weight: x })} min={0} /></Field>
                <IconButton icon={Trash2} label="Remove part" disabled={v.groups.length < 2} onClick={() => set("groups", v.groups.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" icon={Plus} onClick={() => set("groups", [...v.groups, { key: `p${v.groups.length + 1}`, label: "", exam_ids: [], combine: "average", best_of: null, weight: 0 }])}>Add part</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle checked={v.method === "formula"} onChange={(x) => set("method", x ? "formula" : "weighted")} label="Use a formula instead of weights" />
            {v.method === "formula" && <TextInput value={v.formula} onValueChange={(x) => set("formula", x)} className="font-mono" placeholder="e.g. max(ut, main * 0.9)" />}
          </div>
        </Section>
        <Section title="Passing">
          <FormGrid columns={3}>
            <div className="sm:col-span-3"><Toggle checked={v.pass_all_subjects} onChange={(x) => set("pass_all_subjects", x)} label={`Must pass every ${term("subject").toLowerCase()}`} /></div>
            <Field label="Subject pass mark" hint="Empty = the scheme's"><NumberInput value={v.subject_pass_percent} onChange={(x) => set("subject_pass_percent", x)} min={0} max={100} suffix="%" /></Field>
            <Field label="Minimum aggregate" aside="Optional"><NumberInput value={v.min_aggregate_percent} onChange={(x) => set("min_aggregate_percent", x)} min={0} max={100} suffix="%" /></Field>
            <Field label="Supplementary up to" hint="Failing this many = may re-sit"><NumberInput value={v.max_failed_subjects} onChange={(x) => set("max_failed_subjects", x)} min={0} /></Field>
            <Field label="Minimum attendance" aside="Optional" hint="From attendance, or days typed in by the class teacher"><NumberInput value={v.min_attendance_percent} onChange={(x) => set("min_attendance_percent", x)} min={0} max={100} suffix="%" /></Field>
          </FormGrid>
        </Section>
        <Section title="Grace marks" description="Added only where they lift a fail to a pass. Leave empty for none.">
          <FormGrid columns={3}>
            <Field label="Per subject, up to"><NumberInput value={v.grace_per_subject} onChange={(x) => set("grace_per_subject", x)} min={0} max={100} suffix="%" /></Field>
            <Field label="In at most"><NumberInput value={v.grace_max_subjects} onChange={(x) => set("grace_max_subjects", x)} min={0} suffix="subjects" /></Field>
            <Field label="Total, up to"><NumberInput value={v.grace_total} onChange={(x) => set("grace_total", x)} min={0} /></Field>
          </FormGrid>
        </Section>
        <Section title="More">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={v.ranking} onChange={(x) => set("ranking", x)} label="Rank learners" />
            <Toggle checked={v.cumulative} onChange={(x) => set("cumulative", x)} label="Work out CGPA across terms" description="For GPA schemes: adds this term to earlier ones." />
            <Field label="Marks out of" hint="Each subject's combined score, default 100"><NumberInput value={v.out_of} onChange={(x) => set("out_of", x)} min={1} /></Field>
          </div>
        </Section>
      </form>
    </Modal>
  );
}

/* ── Exam types and co-scholastic areas ───────────────────────────────── */

type Row = { id: number; uuid: string; name: string; code?: string | null; category?: string; default_max_marks?: number | null; group_name?: string | null; grading_scheme_id?: number | null; sort_order: number; active: boolean };

function SimpleList({ kind, options }: { kind: "types" | "areas"; options?: Options | null }) {
  const toast = useToast();
  const path = kind === "types" ? "/exams/types" : "/exams/coscholastic-areas";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [v, setV] = useState<Partial<Row>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<{ items: Row[] }>(`${path}?all=true`).then((r) => setRows(r.items)).catch(() => setRows([])); }, [path, tick]);
  const open = (r: Row | "new") => { setEditing(r); setV(r === "new" ? { name: "", category: "other", sort_order: (rows?.length ?? 0) + 1 } : { ...r }); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name?.trim()) { toast.error("Give it a name"); return; }
    setSaving(true);
    const body = kind === "types" ? { name: v.name.trim(), code: v.code || null, category: v.category || "other", default_max_marks: v.default_max_marks ?? null, sort_order: v.sort_order ?? 1 }
      : { name: v.name.trim(), group_name: v.group_name || null, grading_scheme_id: v.grading_scheme_id ?? null, sort_order: v.sort_order ?? 1 };
    try {
      if (editing && editing !== "new") await api.put(`${path}/${editing.uuid}`, { ...body, active: v.active }); else await api.post(path, body);
      toast.success("Saved"); setEditing(null); setTick((t) => t + 1);
    } catch (x) { toast.error("Couldn't save", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  const columns: Column<Row>[] = kind === "types" ? [
    { key: "name", header: "Exam type", cell: (r) => <span className="text-ink">{r.name}{r.code ? <span className="ml-2 font-mono text-[12px] text-muted">{r.code}</span> : null}</span> },
    { key: "cat", header: "Kind", cell: (r) => CATEGORY_OPTIONS.find((c) => c.value === r.category)?.label ?? r.category },
    { key: "max", header: "Usual maximum", align: "right", cell: (r) => <span className="tabular text-muted">{fmt(r.default_max_marks ?? null)}</span> },
    { key: "on", header: "", cell: (r) => !r.active && <Badge>Off</Badge> },
  ] : [
    { key: "name", header: "Area", cell: (r) => <span className="text-ink">{r.name}</span> },
    { key: "group", header: "Group", cell: (r) => <span className="text-muted">{r.group_name ?? "—"}</span> },
    { key: "scheme", header: "Grades", hideBelow: "md", cell: (r) => <span className="text-muted">{options?.schemes.find((s) => s.id === r.grading_scheme_id)?.name ?? "A / B / C"}</span> },
    { key: "on", header: "", cell: (r) => !r.active && <Badge>Off</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => open("new")}>{kind === "types" ? "New exam type" : "New area"}</Button></div>
      <DataTable rows={rows ?? []} rowKey={(r) => r.uuid} columns={columns} loading={rows === null} onRowClick={open}
        rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => open(r) }]}
        emptyTitle="Nothing here yet" emptyHint={kind === "types" ? "Add types such as unit test, mid-term or practical." : "Add areas such as Work education or Discipline."} />
      <Modal open={!!editing} onClose={() => setEditing(null)} size="md" busy={saving} title={editing === "new" ? (kind === "types" ? "New exam type" : "New area") : `Edit ${v.name ?? ""}`}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="simple-form" loading={saving}>Save</Button></>}>
        <form id="simple-form" onSubmit={save}>
          <FormGrid>
            <Field label="Name" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.name ?? ""} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
            {kind === "types" ? <>
              <Field label="Short code" aside="Optional"><TextInput value={v.code ?? ""} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} className="font-mono" /></Field>
              <Field label="Kind"><Select value={v.category ?? "other"} onChange={(x) => setV({ ...v, category: x ?? "other" })} options={CATEGORY_OPTIONS} /></Field>
              <Field label="Usual maximum marks" aside="Optional"><NumberInput value={v.default_max_marks ?? null} onChange={(x) => setV({ ...v, default_max_marks: x })} min={1} /></Field>
            </> : <>
              <Field label="Group" aside="Optional"><TextInput value={v.group_name ?? ""} onValueChange={(x) => setV({ ...v, group_name: x })} placeholder="e.g. Personal qualities" /></Field>
              <Field label="Grades from" aside="Optional"><Select value={v.grading_scheme_id ?? null} clearable onChange={(x) => setV({ ...v, grading_scheme_id: x })} placeholder="A / B / C" options={(options?.schemes ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
            </>}
            <Field label="Order"><NumberInput value={v.sort_order ?? 1} onChange={(x) => setV({ ...v, sort_order: x ?? 1 })} min={0} /></Field>
            {editing !== "new" && <div className="sm:col-span-2"><Toggle checked={v.active ?? true} onChange={(x) => setV({ ...v, active: x })} label="In use" /></div>}
          </FormGrid>
        </form>
      </Modal>
    </>
  );
}
