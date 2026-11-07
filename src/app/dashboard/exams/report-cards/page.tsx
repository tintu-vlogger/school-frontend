"use client";

/*
 * Results and report cards.
 *   Results      per-learner results of an exam or a combined result rule; recompute, publish
 *                (notifies parents and students) and unpublish; row click opens the subject breakdown.
 *   Report cards bulk PDF per section from a template.
 *   Templates    what a report card or grade sheet shows (columns, sections, signatures).
 *   Transcripts  all terms with credits, SGPA and CGPA for one learner.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Calculator, Eye, FileDown, FileText, Pencil, Plus, Printer, ScrollText, Send, Star, Trash2, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, IconButton, KeyValue, Modal, ModalCancel, Section, Select, Skeleton,
  Tabs, TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import {
  downloadFile, fmt, RESULT_LABEL, ResultBadge, sourceOptions, useExamOptions, useSections, type Options, type Result,
} from "@/components/exams/shared";

type ResultPage = { items: Result[]; total: number; page: number; size: number; source: { kind: string; uuid: string; name: string } };
type Template = {
  id: number; uuid: string; name: string; kind: "report_card" | "transcript"; title: string | null; session_id: number | null;
  program_ids: number[]; columns: { source: string; label: string }[]; summary_source: string | null; show_marks: boolean;
  show_grade: boolean; show_rank: boolean; show_coscholastic: boolean; show_attendance: boolean; show_remarks: boolean;
  show_logo: boolean; show_grading_key: boolean; signatures: string[]; footer_note: string | null; is_default: boolean; active: boolean;
};

export default function ReportCardsPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><ReportCards /></Suspense>;
}

function ReportCards() {
  const params = useSearchParams();
  const { options } = useExamOptions();
  const { can } = useAccess();
  const [tab, setTab] = useState("results");
  const [picked, setSource] = useState<string | null>(() => params.get("source"));
  const all = sourceOptions(options);
  const source = picked ?? all[all.length - 1]?.value ?? null;
  return (
    <div>
      <PageHeader eyebrow="Exams" title="Results & report cards" description="Check results, publish them to families and print report cards and grade sheets." />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[
        { value: "results", label: "Results" }, { value: "print", label: "Report cards" },
        ...(can("exams.manage") ? [{ value: "templates", label: "Templates" }] : []), { value: "transcripts", label: "Transcripts" },
      ]} /></div>
      {tab === "results" && <Results options={options} source={source} onSource={setSource} />}
      {tab === "print" && <PrintCards />}
      {tab === "templates" && <Templates options={options} />}
      {tab === "transcripts" && <Transcripts />}
    </div>
  );
}

/* ── Results ───────────────────────────────────────────────────────────── */

function Results({ options, source, onSource }: { options: Options | null; source: string | null; onSource: (s: string | null) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { can } = useAccess();
  const sections = useSections();
  const [section, setSection] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: ResultPage } | null>(null);
  const [viewing, setViewing] = useState<Result | null>(null);
  const [busy, setBusy] = useState("");
  const key = `${source}|${section}|${q}|${filters.status?.[0] ?? ""}|${page}|${nonce}`;
  useEffect(() => {
    if (!source) return;
    let live = true;
    const p = new URLSearchParams({ source, page: String(page), size: "50" });
    if (section) p.set("section_id", String(section));
    if (q) p.set("q", q);
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    api.get<ResultPage>(`/exams/results?${p}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 50, source: { kind: "", uuid: "", name: "" } } }); toast.error("Couldn't load results", { description: e.message }); } });
    return () => { live = false; };
  }, [source, section, q, filters, page, key, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const rows = data?.page.items ?? [];
  const published = rows.filter((r) => r.published).length;
  const useGpa = rows.some((r) => r.gpa !== null);

  async function run(kind: "compute" | "publish" | "unpublish") {
    if (!source) return;
    const where = section ? sections.find((s) => s.id === section)?.label : `every ${term("section").toLowerCase()}`;
    if (kind !== "compute" && !(await confirm(kind === "publish"
      ? { title: "Publish these results?", message: `Results for ${where} become visible to ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()}, who get a notification.`, confirmLabel: "Publish" }
      : { title: "Unpublish these results?", message: `Families of ${where} will no longer see them.`, confirmLabel: "Unpublish", tone: "danger" }))) return;
    setBusy(kind);
    try {
      const body = { source, section_ids: section ? [section] : null };
      if (kind === "compute") { const r = await api.post<{ computed: number }>("/exams/results/compute", body); toast.success(`${r.computed} results worked out again`); }
      if (kind === "publish") {
        const r = await api.post<{ published: number; incomplete: number; notified: number }>("/exams/results/publish", body);
        toast.success(`${r.published} results published`, { description: `${r.notified} people notified${r.incomplete ? ` · ${r.incomplete} results are incomplete (marks missing)` : ""}` });
      }
      if (kind === "unpublish") { const r = await api.post<{ unpublished: number }>("/exams/results/unpublish", body); toast.success(`${r.unpublished} results unpublished`); }
      refresh();
    } catch (x) { toast.error("Couldn't do that", { description: (x as Error).message }); }
    finally { setBusy(""); }
  }

  const columns: Column<Result>[] = [
    { key: "rank", header: "Rank", width: "64px", sortable: true, sortValue: (r) => r.rank ?? 9999, cell: (r) => <span className="tabular text-muted">{r.rank ?? "—"}</span> },
    { key: "name", header: term("student"), sortable: true, sortValue: (r) => r.student_name, cell: (r) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={r.student_name ?? ""} src={r.photo_url ?? undefined} size={30} />
        <div className="min-w-0"><p className="truncate text-ink">{r.student_name}</p><p className="truncate text-[12.5px] text-muted">{r.section_label} · {r.admission_no}</p></div></div>) },
    { key: "total", header: "Total", align: "right", hideBelow: "md", sortable: true, sortValue: (r) => r.total_obtained, cell: (r) => r.total_max ? <span className="tabular">{fmt(r.total_obtained)}<span className="text-faint">/{fmt(r.total_max)}</span></span> : <span className="text-faint">—</span> },
    { key: "pct", header: useGpa ? "GPA" : "%", align: "right", sortable: true, sortValue: (r) => (useGpa ? r.gpa : r.percentage), cell: (r) => <span className="tabular text-ink">{useGpa ? fmt(r.gpa) : r.percentage !== null ? `${fmt(r.percentage, 1)}%` : "—"}</span> },
    { key: "grade", header: "Grade", cell: (r) => r.grade ? <Badge tone="accent">{r.grade}</Badge> : <span className="text-faint">—</span> },
    { key: "status", header: "Result", cell: (r) => <ResultBadge status={r.status} /> },
    { key: "pub", header: "Shared", hideBelow: "sm", cell: (r) => r.published ? <Badge tone="good" dot>Published</Badge> : <Badge>Not yet</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72"><Select value={source} onChange={(v) => { onSource(v); setPage(1); }} options={sourceOptions(options)} placeholder="Pick an exam or result" aria-label="Exam or result" /></div>
        <div className="w-full sm:w-56"><Select value={section} onChange={(v) => { setSection(v); setPage(1); }} clearable placeholder={`Every ${term("section").toLowerCase()}`}
          options={sections.map((s) => ({ value: s.id, label: s.label }))} aria-label={term("section")} /></div>
        <div className="ml-auto flex flex-wrap gap-2">
          {can("exams.manage", "exams.publish") && <Button icon={Calculator} loading={busy === "compute"} onClick={() => run("compute")}>Recalculate</Button>}
          {can("exams.publish") && published > 0 && <Button icon={Undo2} loading={busy === "unpublish"} onClick={() => run("unpublish")}>Unpublish</Button>}
          {can("exams.publish") && <Button variant="primary" icon={Send} loading={busy === "publish"} onClick={() => run("publish")} disabled={!rows.length}>Publish</Button>}
        </div>
      </div>
      <FilterBar searchPlaceholder={`Search ${term("students").toLowerCase()}`} onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Result", options: Object.entries(RESULT_LABEL).map(([value, label]) => ({ value, label })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.uuid} columns={columns} loading={!!source && data?.key !== key} onRowClick={setViewing}
        rowActions={(r) => [{ label: "View subjects", icon: Eye, onSelect: () => setViewing(r) },
          { label: "Report card", icon: FileDown, onSelect: () => downloadFile(`/exams/report-cards.pdf?student=${r.student_uuid}`, "report-card.pdf").catch((e) => toast.error(e.message)) }]}
        pagination={{ page, size: 50, total: data?.page.total ?? 0, onPageChange: setPage }}
        emptyIcon={ScrollText} emptyTitle={source ? "No results yet" : "Pick an exam"}
        emptyHint={source ? "Results appear here as marks are entered." : "Choose an exam or a combined result above."} />
      <ResultModal result={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function ResultModal({ result: r, onClose }: { result: Result | null; onClose: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const subjects = r?.subjects ?? [];
  const parts = Array.from(new Set(subjects.flatMap((s) => Object.keys(s.parts ?? {}))));
  return (
    <Modal open={!!r} onClose={onClose} size="lg" title={r?.student_name} description={r ? `${r.section_label ?? ""} · ${r.admission_no ?? ""}` : undefined}
      leading={r && <Avatar name={r.student_name ?? ""} src={r.photo_url ?? undefined} size={44} />}
      headerActions={r && <Button size="sm" icon={FileDown} onClick={() => downloadFile(`/exams/report-cards.pdf?student=${r.student_uuid}`, "report-card.pdf").catch((e) => toast.error(e.message))}>Report card</Button>}>
      {r && (
        <>
          <Section title="Overall">
            <KeyValue columns={3} items={[
              { label: "Total", value: r.total_max ? `${fmt(r.total_obtained)} / ${fmt(r.total_max)}` : null },
              { label: "Percentage", value: r.percentage !== null ? `${fmt(r.percentage)}%` : null },
              { label: "Grade", value: r.grade },
              ...(r.gpa !== null ? [{ label: "GPA / SGPA", value: fmt(r.gpa) }] : []),
              ...(r.cgpa !== null ? [{ label: "CGPA", value: fmt(r.cgpa) }] : []),
              ...(r.credits_attempted !== null ? [{ label: "Credits earned", value: `${fmt(r.credits_earned)} / ${fmt(r.credits_attempted)}` }] : []),
              { label: "Result", value: <ResultBadge status={r.status} /> },
              { label: "Rank", value: r.rank ? `${r.rank} in ${term("section").toLowerCase()}${r.program_rank ? ` · ${r.program_rank} in ${term("program").toLowerCase()}` : ""}` : null },
              ...(r.attendance_percent !== null ? [{ label: "Attendance", value: `${fmt(r.attendance_percent)}%` }] : []),
              ...(r.grace_applied ? [{ label: "Grace marks", value: fmt(r.grace_applied) }] : []),
              { label: "Published", value: r.published_at ? formatDateTime(r.published_at) : "Not yet" },
            ]} />
          </Section>
          <Section title={term("subjects")} className="border-t border-line">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr>
                  <th className="px-3 py-2 font-normal">{term("subject")}</th>
                  {parts.map((p) => <th key={p} className="px-2 py-2 text-right font-normal uppercase">{p}</th>)}
                  <th className="px-2 py-2 text-right font-normal">Marks</th><th className="px-2 py-2 text-right font-normal">%</th>
                  <th className="px-2 py-2 font-normal">Grade</th>{subjects.some((s) => s.credits !== null) && <th className="px-2 py-2 text-right font-normal">Credits</th>}</tr></thead>
                <tbody className="divide-y divide-line">
                  {subjects.map((s) => (
                    <tr key={s.subject_id} className={s.passed === false ? "text-rose-700" : ""}>
                      <td className="px-3 py-2">{s.subject}{s.grace ? <span className="ml-1 text-[11.5px] text-muted">+{s.grace} grace</span> : null}</td>
                      {parts.map((p) => <td key={p} className="px-2 py-2 text-right tabular">{fmt(s.parts?.[p] ?? null, 1)}</td>)}
                      <td className="px-2 py-2 text-right tabular">{s.excluded ? (s.mark_code ?? "EX") : s.missing ? "—" : s.absent && s.mark_code === "AB" ? "AB" : s.obtained !== null ? `${fmt(s.obtained)}/${fmt(s.max)}` : "—"}</td>
                      <td className="px-2 py-2 text-right tabular">{fmt(s.percent, 1)}</td>
                      <td className="px-2 py-2">{s.grade ?? "—"}{s.grade_point !== null ? <span className="text-muted"> ({fmt(s.grade_point)})</span> : null}</td>
                      {subjects.some((x) => x.credits !== null) && <td className="px-2 py-2 text-right tabular">{fmt(s.credits)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </Modal>
  );
}

/* ── Printing ──────────────────────────────────────────────────────────── */

function useTemplates(kind?: string) {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<{ items: Template[] }>(`/exams/templates?all=true${kind ? `&kind=${kind}` : ""}`).then((r) => { if (live) setRows(r.items); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [kind, tick]);
  return { rows, reload: () => setTick((t) => t + 1) };
}

function PrintCards() {
  const toast = useToast();
  const { term } = useInstitution();
  const sections = useSections();
  const { rows: templates } = useTemplates("report_card");
  const [tpl, setTpl] = useState<string | null>(null);
  const [section, setSection] = useState<number | null>(null);
  const [onlyPublished, setOnlyPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!tpl && templates?.length) setTpl((templates.find((t) => t.is_default && t.active) ?? templates[0]).uuid); }, [templates, tpl]);
  async function go() {
    if (!section) { toast.error(`Pick a ${term("section").toLowerCase()}`); return; }
    setBusy(true);
    try { await downloadFile(`/exams/report-cards.pdf?section_id=${section}${tpl ? `&template=${tpl}` : ""}${onlyPublished ? "&published_only=true" : ""}`, "report-cards.pdf"); }
    catch (x) { toast.error("Couldn't make the report cards", { description: (x as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <Paper className="max-w-2xl p-6">
      <p className="mb-1 text-[15px] text-ink">Print report cards</p>
      <p className="mb-5 text-[13.5px] text-muted">One page per {term("student").toLowerCase()} for a whole {term("section").toLowerCase()}, ready to print or share.</p>
      <FormGrid>
        <Field label="Template"><Select value={tpl} onChange={setTpl} options={(templates ?? []).filter((t) => t.active).map((t) => ({ value: t.uuid, label: t.name, description: t.is_default ? "Default" : undefined }))} /></Field>
        <Field label={term("section")}><Select value={section} onChange={setSection} placeholder={`Pick a ${term("section").toLowerCase()}`} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        <div className="sm:col-span-2"><Toggle checked={onlyPublished} onChange={setOnlyPublished} label="Only published results" description="Leave off to print drafts for checking." /></div>
      </FormGrid>
      <div className="mt-6 flex justify-end"><Button variant="primary" icon={Printer} loading={busy} onClick={go}>Download PDF</Button></div>
    </Paper>
  );
}

/* ── Templates ─────────────────────────────────────────────────────────── */

function Templates({ options }: { options: Options | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, reload } = useTemplates();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [key, setKey] = useState(0);
  const columns: Column<Template>[] = [
    { key: "name", header: "Template", cell: (t) => <div><p className="text-ink">{t.name}</p><p className="text-[12.5px] text-muted">{t.title || "—"}</p></div> },
    { key: "kind", header: "Kind", cell: (t) => t.kind === "transcript" ? "Grade sheet / transcript" : "Report card" },
    { key: "cols", header: "Columns", hideBelow: "md", cell: (t) => <span className="text-muted">{t.columns.length ? t.columns.map((c) => c.label || c.source).join(", ") : "Every exam of the session"}</span> },
    { key: "state", header: "", cell: (t) => <span className="flex gap-1.5">{t.is_default && <Badge tone="accent">Default</Badge>}{!t.active && <Badge>Off</Badge>}</span> },
  ];
  async function remove(t: Template) {
    if (!(await confirm({ title: `Switch off ${t.name}?`, message: "It won't be offered for printing.", confirmLabel: "Switch off", tone: "danger" }))) return;
    await api.delete(`/exams/templates/${t.uuid}`); toast.success("Template switched off"); reload();
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => { setKey((k) => k + 1); setEditing("new"); }}>New template</Button></div>
      <DataTable rows={rows ?? []} rowKey={(t) => t.uuid} columns={columns} loading={rows === null}
        onRowClick={(t) => { setKey((k) => k + 1); setEditing(t); }}
        rowActions={(t) => [{ label: "Edit", icon: Pencil, onSelect: () => { setKey((k) => k + 1); setEditing(t); } },
          ...(!t.is_default ? [{ label: "Make default", icon: Star, onSelect: async () => { await api.put(`/exams/templates/${t.uuid}`, { is_default: true }); reload(); } }] : []),
          "separator", { label: "Switch off", icon: Trash2, danger: true, onSelect: () => remove(t) }]}
        emptyIcon={FileText} emptyTitle="No templates yet" emptyHint="A template says which exams and sections a report card shows." />
      <TemplateModal key={key} target={editing} options={options} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </>
  );
}

function TemplateModal({ target, options, onClose, onSaved }: { target: Template | "new" | null; options: Options | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const t = target && target !== "new" ? target : null;
  const sourceById = useMemo(() => {
    const m = new Map<string, string>();
    (options?.exams ?? []).forEach((e) => m.set(`exam:${e.id}`, e.name));
    (options?.rules ?? []).forEach((r) => m.set(`rule:${r.id}`, r.name));
    return m;
  }, [options]);
  const sourceOpts: SelectOption[] = Array.from(sourceById.entries()).map(([value, label]) => ({ value, label, description: value.startsWith("rule") ? "Combined result" : "Exam" }));
  const initial = {
    name: t?.name ?? "", kind: t?.kind ?? "report_card", title: t?.title ?? "Report card", columns: t?.columns ?? [],
    summary_source: t?.summary_source ?? null as string | null, show_marks: t?.show_marks ?? true, show_grade: t?.show_grade ?? true,
    show_rank: t?.show_rank ?? false, show_coscholastic: t?.show_coscholastic ?? true, show_attendance: t?.show_attendance ?? true,
    show_remarks: t?.show_remarks ?? true, show_logo: t?.show_logo ?? true, show_grading_key: t?.show_grading_key ?? true,
    signatures: (t?.signatures ?? ["Class teacher", "Principal", "Parent"]).join(", "), footer_note: t?.footer_note ?? "", is_default: t?.is_default ?? false,
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const move = (i: number, d: number) => { const c = [...v.columns]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); set("columns", c); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { toast.error("Give the template a name"); return; }
    setSaving(true);
    const payload = { ...v, name: v.name.trim(), columns: v.columns.filter((c) => c.source), footer_note: v.footer_note || null,
      signatures: v.signatures.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      if (t) await api.put(`/exams/templates/${t.uuid}`, payload); else await api.post("/exams/templates", payload);
      toast.success("Template saved"); onSaved();
    } catch (x) { toast.error("Couldn't save the template", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  const toggles: [keyof typeof v, string][] = [["show_marks", "Marks"], ["show_grade", "Grades"], ["show_rank", "Rank"], ["show_coscholastic", "Co-scholastic areas"],
    ["show_attendance", "Attendance"], ["show_remarks", "Remarks"], ["show_logo", "Logo"], ["show_grading_key", "Grading key"]];
  return (
    <Modal open={!!target} onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={t ? `Edit ${t.name}` : "New template"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="tpl-form" loading={saving}>Save template</Button></>}>
      <form id="tpl-form" onSubmit={submit} className="space-y-6">
        <FormGrid>
          <Field label="Name" required><TextInput autoFocusInModal value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Term 1 report card" /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => x && set("kind", x as Template["kind"])} options={[{ value: "report_card", label: "Report card" }, { value: "transcript", label: "Grade sheet / transcript" }]} /></Field>
          <Field label="Title printed on top" className="sm:col-span-2"><TextInput value={v.title} onValueChange={(x) => set("title", x)} /></Field>
        </FormGrid>
        <Section title="Columns" description="Exams or combined results, left to right. Leave empty to show every exam of the session.">
          <div className="space-y-2">
            {v.columns.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <div className="min-w-[200px] flex-1"><Select value={c.source || null} onChange={(x) => set("columns", v.columns.map((y, j) => j === i ? { source: x ?? "", label: y.label || (x ? sourceById.get(x) ?? "" : "") } : y))} options={sourceOpts} placeholder="Exam or result" /></div>
                <div className="w-40"><TextInput value={c.label} onValueChange={(x) => set("columns", v.columns.map((y, j) => j === i ? { ...y, label: x } : y))} placeholder="Heading" /></div>
                <IconButton icon={ArrowUp} label="Move left" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label="Move right" disabled={i === v.columns.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={Trash2} label="Remove column" onClick={() => set("columns", v.columns.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" icon={Plus} onClick={() => set("columns", [...v.columns, { source: "", label: "" }])}>Add column</Button>
          </div>
          <Field label="Overall result from" hint="Total, percentage, grade and result at the bottom. Empty = last column." className="mt-4">
            <Select value={v.summary_source} clearable onChange={(x) => set("summary_source", x)} options={sourceOpts} placeholder="Last column" />
          </Field>
        </Section>
        <Section title="Show">
          <div className="grid gap-3 sm:grid-cols-2">{toggles.map(([k, label]) => <Toggle key={k} checked={v[k] as boolean} onChange={(x) => set(k, x as never)} label={label} size="sm" />)}</div>
        </Section>
        <FormGrid>
          <Field label="Signatures" hint="Separated by commas, up to four" className="sm:col-span-2"><TextInput value={v.signatures} onValueChange={(x) => set("signatures", x)} /></Field>
          <Field label="Footer note" aside="Optional" className="sm:col-span-2"><Textarea value={v.footer_note} onValueChange={(x) => set("footer_note", x)} rows={2} /></Field>
          <div className="sm:col-span-2"><Toggle checked={v.is_default} onChange={(x) => set("is_default", x)} label="Default template" description="Used for the portal download and when none is picked." /></div>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Transcripts ───────────────────────────────────────────────────────── */

type Transcript = {
  student: { name: string; admission_no: string; program_name: string | null };
  terms: { label: string; sgpa: number | null; cgpa: number | null; credits_attempted: number | null; credits_earned: number | null; status: string; published: boolean;
    subjects: { code: string | null; subject: string; credits: number | null; grade: string | null; grade_point: number | null; passed: boolean | null }[] }[];
  cgpa: number | null; percent_equivalent: number | null; credits_earned: number | null; scheme: string | null; scale: number | null;
};

function Transcripts() {
  const toast = useToast();
  const { term } = useInstitution();
  const { can } = useAccess();
  const [student, setStudent] = useState<string | null>(null);
  const [got, setGot] = useState<(Transcript & { uuid: string }) | null>(null);
  const data = student && got?.uuid === student ? got : null;
  const loading = !!student && !data;
  const search = async (q: string): Promise<SelectOption[]> => {
    const r = await api.get<{ items: { uuid: string; name: string; admission_no: string; section_label: string | null }[] }>(`/students?size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    return r.items.map((s) => ({ value: s.uuid, label: s.name, description: [s.admission_no, s.section_label].filter(Boolean).join(" · ") }));
  };
  useEffect(() => {
    if (!student) return;
    let live = true;
    api.get<Transcript>(`/exams/transcripts/${student}`).then((r) => { if (live) setGot({ ...r, uuid: student }); })
      .catch((e) => { toast.error("Couldn't load the transcript", { description: e.message }); setStudent(null); });
    return () => { live = false; };
  }, [student, toast]);
  if (!can("exams.view")) return <Paper className="p-8 text-center text-[14px] text-muted">You don&apos;t have access to transcripts.</Paper>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-80"><Select value={student} onChange={setStudent} loadOptions={search} placeholder={`Search a ${term("student").toLowerCase()}`} clearable /></div>
        {data && data.terms.length > 0 && <Button icon={FileDown} onClick={() => downloadFile(`/exams/transcripts/${student}/pdf`, "transcript.pdf").catch((e) => toast.error(e.message))}>Download PDF</Button>}
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : !data ? (
        <Paper className="p-10 text-center text-[14px] text-muted">Pick a {term("student").toLowerCase()} to see every {term("term").toLowerCase()} with credits, SGPA and CGPA.</Paper>
      ) : data.terms.length === 0 ? (
        <Paper className="p-10 text-center text-[14px] text-muted">No {term("term").toLowerCase()} results yet. Transcripts come from combined results set up under Grading.</Paper>
      ) : (
        <Paper className="p-5">
          <div className="mb-4 flex flex-wrap gap-6 text-[14px]">
            <span><span className="text-muted">CGPA </span><span className="tabular text-[22px] font-light">{fmt(data.cgpa)}</span>{data.scale ? <span className="text-muted"> / {data.scale}</span> : null}</span>
            {data.percent_equivalent !== null && <span><span className="text-muted">Percentage equivalent </span>{fmt(data.percent_equivalent)}%</span>}
            <span><span className="text-muted">Credits earned </span>{fmt(data.credits_earned)}</span>
          </div>
          <div className="space-y-5">
            {data.terms.map((t, i) => (
              <div key={i}>
                <p className="mb-2 flex flex-wrap items-center gap-2 text-[14px] text-ink">{t.label}<ResultBadge status={t.status} />{!t.published && <Badge>Not published</Badge>}
                  <span className="text-[13px] text-muted">SGPA {fmt(t.sgpa)} · credits {fmt(t.credits_earned)}/{fmt(t.credits_attempted)}{t.cgpa !== null ? ` · CGPA ${fmt(t.cgpa)}` : ""}</span></p>
                <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[480px] text-[13.5px]">
                  <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr><th className="px-3 py-2 font-normal">Code</th><th className="px-3 py-2 font-normal">{term("subject")}</th>
                    <th className="px-3 py-2 text-right font-normal">Credits</th><th className="px-3 py-2 font-normal">Grade</th><th className="px-3 py-2 text-right font-normal">Points</th></tr></thead>
                  <tbody className="divide-y divide-line">{t.subjects.map((s, j) => (
                    <tr key={j} className={s.passed === false ? "text-rose-700" : ""}><td className="px-3 py-2 text-muted">{s.code}</td><td className="px-3 py-2">{s.subject}</td>
                      <td className="px-3 py-2 text-right tabular">{fmt(s.credits)}</td><td className="px-3 py-2">{s.grade ?? "—"}</td><td className="px-3 py-2 text-right tabular">{fmt(s.grade_point)}</td></tr>))}</tbody>
                </table></div>
              </div>
            ))}
          </div>
        </Paper>
      )}
    </div>
  );
}
