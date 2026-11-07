"use client";

/*
 * Marks entry. Pick an exam to see every mark sheet (section x subject) you may open; a sheet
 * opens in a full-size modal with a keyboard-friendly grid (Enter / arrows move between learners,
 * type AB, EX or ML for absent, exempt or medical). Save as draft, submit, and for the principal
 * or exam cell: moderate, send back, lock and unlock. Class teachers enter co-scholastic grades,
 * remarks and attendance in the second tab.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Download, FileUp, Lock, PencilLine, Save, Send, Undo2, Unlock, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, NumberInput, Select, Skeleton, Tabs, Textarea, TextInput, Toggle,
  useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { downloadFile, fmt, SheetBadge, useExamOptions, useSections, type Component } from "@/components/exams/shared";

type SheetRow = {
  paper_uuid: string; paper_id: number; subject_id: number; subject_name: string; section_id: number; section_label: string;
  program_id: number; status: string; moderated: boolean; entered: number; students: number; own: boolean;
  teacher_name: string | null; paper_date: string | null; max_marks: number; entry_mode: string;
};
type Learner = {
  student_id: number; name: string; roll_no: string | null; admission_no: string; marks: number | null;
  components: Record<string, number | null>; code: string | null; grade: string | null; grace: number; moderation: number; remarks: string | null;
};
type Sheet = {
  paper: { uuid: string; subject_name: string; max_marks: number; pass_marks: number | null; components: Component[]; entry_mode: "marks" | "grade"; paper_date: string | null };
  exam: { uuid: string; name: string; status: string }; section: { id: number; label: string };
  status: string; moderated: boolean; moderation_note: string | null; submitted_at: string | null; locked_at: string | null;
  can_enter: boolean; can_moderate: boolean; editable: boolean; codes: { code: string; label: string }[]; grades: string[];
  rows: Learner[]; stats: { students: number; entered: number; absent: number; average: number | null; highest: number | null; lowest: number | null; below_pass: number | null; max_marks: number };
};

export default function MarksPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><Marks /></Suspense>;
}

function Marks() {
  const params = useSearchParams();
  const { can } = useAccess();
  const { term } = useInstitution();
  const { options } = useExamOptions();
  const [tab, setTab] = useState("marks");
  // Deep links: ?exam=<uuid>, ?paper=<uuid>&section=<id> (from the home card).
  const [picked, setExam] = useState<string | null>(() => params.get("exam"));
  const [open, setOpen] = useState<{ paper: string; section: number } | null>(() =>
    params.get("paper") && params.get("section") ? { paper: params.get("paper")!, section: Number(params.get("section")) } : null);
  const seeAll = can("exams.marks.all", "exams.moderate", "exams.view");

  const exams = useMemo(() => (options?.exams ?? []).filter((e) => e.status !== "draft" || can("exams.manage")), [options, can]);
  // Default: the latest exam that has started and isn't published yet.
  const exam = useMemo(() => {
    if (picked || !exams.length) return picked;
    const today = new Date().toISOString().slice(0, 10);
    const past = exams.filter((e) => e.start_date && e.start_date <= today && e.status !== "published");
    return (past[past.length - 1] ?? exams[exams.length - 1]).uuid;
  }, [exams, picked]);

  return (
    <div>
      <PageHeader eyebrow="Exams" title="Marks entry" description={`Enter marks for the ${term("subjects").toLowerCase()} you teach. Submitted marks go to the principal for moderation.`} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "marks", label: "Marks" }, { value: "cosch", label: "Co-scholastic & remarks" }]} /></div>
      {tab === "marks" ? (
        <>
          <div className="mb-4 w-full sm:w-80">
            <Select value={exam} onChange={setExam} placeholder="Pick an exam" aria-label="Exam"
              options={exams.map((e) => ({ value: e.uuid, label: e.name, description: e.start_date ? formatDate(e.start_date) : undefined }))} />
          </div>
          {exam ? <SheetList exam={exam} seeAll={seeAll} defaultMine={!can("exams.marks.all", "exams.moderate", "exams.manage")} onOpen={(paper, section) => setOpen({ paper, section })} key={exam + String(open === null)} />
            : <Paper className="p-10 text-center text-[14px] text-muted">{options ? "No exams yet. Create one under Exams first." : <Skeleton className="mx-auto h-5 w-40" />}</Paper>}
        </>
      ) : <CoScholastic terms={options?.terms ?? []} />}
      <MarkSheetModal target={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function SheetList({ exam, seeAll, defaultMine, onOpen }: { exam: string; seeAll: boolean; defaultMine: boolean; onOpen: (paper: string, section: number) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [got, setGot] = useState<{ key: string; rows: SheetRow[] } | null>(null);
  const [mine, setMine] = useState(!seeAll || defaultMine);
  const reqKey = `${exam}|${mine}`;
  const rows = got?.key === reqKey ? got.rows : null;
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  useEffect(() => {
    let live = true;
    api.get<SheetRow[]>(`/exams/marks/sheets?exam=${exam}${mine ? "&mine=true" : ""}`).then((r) => { if (live) setGot({ key: reqKey, rows: r }); })
      .catch((e) => { if (live) { setGot({ key: reqKey, rows: [] }); toast.error("Couldn't load mark sheets", { description: e.message }); } });
    return () => { live = false; };
  }, [exam, mine, reqKey, toast]);
  const sections = useMemo(() => Array.from(new Map((rows ?? []).map((r) => [String(r.section_id), r.section_label])).entries()).map(([value, label]) => ({ value, label })), [rows]);
  const shown = (rows ?? []).filter((r) => (!q || `${r.subject_name} ${r.section_label} ${r.teacher_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    && (!filters.status?.length || filters.status.includes(r.status)) && (!filters.section?.length || filters.section.includes(String(r.section_id))));
  const [page, setPage] = useState(1);
  const columns: Column<SheetRow>[] = [
    { key: "subject", header: term("subject"), sortable: true, sortValue: (r) => r.subject_name, cell: (r) => (
      <div><p className="text-ink">{r.subject_name}</p><p className="text-[12.5px] text-muted">{r.entry_mode === "grade" ? "Grades" : `Out of ${fmt(r.max_marks)}`}{r.paper_date ? ` · ${formatDate(r.paper_date)}` : ""}</p></div>) },
    { key: "section", header: term("section"), sortable: true, sortValue: (r) => r.section_label, cell: (r) => r.section_label },
    { key: "teacher", header: term("teacher"), hideBelow: "md", cell: (r) => <span className="text-muted">{r.teacher_name ?? "—"}{r.own ? " (you)" : ""}</span> },
    { key: "progress", header: "Entered", sortable: true, sortValue: (r) => r.entered / Math.max(1, r.students), cell: (r) => (
      <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary/70" style={{ width: `${Math.min(100, (r.entered / Math.max(1, r.students)) * 100)}%` }} /></div>
        <span className="tabular text-[12.5px] text-muted">{r.entered}/{r.students}</span></div>) },
    { key: "status", header: "Status", cell: (r) => <span className="flex items-center gap-1.5"><SheetBadge status={r.status} />{r.moderated && <Badge tone="accent">Moderated</Badge>}</span> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder={`Search ${term("subjects").toLowerCase()} or ${term("sections").toLowerCase()}`} onSearchChange={(v) => { setQ(v); setPage(1); }}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "draft", label: "Draft" }, { value: "submitted", label: "Submitted" }, { value: "locked", label: "Locked" }] },
          { key: "section", label: term("section"), multiple: true, options: sections }]}
        actions={seeAll ? <Toggle checked={mine} onChange={setMine} label="Only mine" size="sm" /> : undefined} />
      <DataTable rows={shown.slice((page - 1) * 25, page * 25)} rowKey={(r) => `${r.paper_uuid}-${r.section_id}`} columns={columns} loading={rows === null}
        onRowClick={(r) => onOpen(r.paper_uuid, r.section_id)}
        rowActions={(r) => [{ label: "Open", icon: PencilLine, onSelect: () => onOpen(r.paper_uuid, r.section_id) }]}
        pagination={{ page, size: 25, total: shown.length, onPageChange: setPage }}
        emptyIcon={ClipboardList} emptyTitle={mine ? "No mark sheets for you in this exam" : "No mark sheets"}
        emptyHint={mine ? `Sheets appear for the ${term("subjects").toLowerCase()} you are allocated to teach.` : "Add papers to the exam first."} />
    </>
  );
}

/* ── The grid ──────────────────────────────────────────────────────────── */

type Draft = Record<number, { value: string; comps: Record<string, string>; remarks: string; grace: string }>;

function cellText(l: Learner, grade: boolean) {
  if (l.code) return l.code;
  if (grade) return l.grade ?? "";
  return l.marks === null ? "" : String(l.marks);
}

function MarkSheetModal({ target, onClose }: { target: { paper: string; section: number } | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [bump, setBump] = useState<number | null>(null);
  const [showRemarks, setShowRemarks] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  const load = useCallback((s: Sheet) => {
    setSheet(s);
    const grade = s.paper.entry_mode === "grade";
    setDraft(Object.fromEntries(s.rows.map((l) => [l.student_id, {
      value: cellText(l, grade), remarks: l.remarks ?? "", grace: l.grace ? String(l.grace) : "",
      comps: Object.fromEntries(s.paper.components.map((c) => [c.key, l.code ? "" : l.components?.[c.key] == null ? "" : String(l.components[c.key])])),
    }])));
    setErrors({});
  }, []);
  useEffect(() => {
    if (!target) { setSheet(null); return; }
    let live = true;
    api.get<Sheet>(`/exams/marks/sheet?paper=${target.paper}&section_id=${target.section}`).then((s) => { if (live) load(s); })
      .catch((e) => { toast.error("Couldn't open the mark sheet", { description: e.message }); onClose(); });
    return () => { live = false; };
  }, [target, load, toast, onClose]);

  const s = sheet;
  const grade = s?.paper.entry_mode === "grade";
  const comps = useMemo(() => s?.paper.components ?? [], [s]);
  const dirty = !!s && s.rows.some((l) => {
    const d = draft[l.student_id];
    if (!d) return false;
    if (d.remarks !== (l.remarks ?? "")) return true;
    if (comps.length && !/^[a-z]{2}$/i.test(d.value)) return comps.some((c) => (d.comps[c.key] ?? "") !== (l.code ? "" : l.components?.[c.key] == null ? "" : String(l.components[c.key])));
    return d.value !== cellText(l, !!grade);
  });

  function check(sid: number, d: Draft[number]): string {
    if (!s) return "";
    const v = d.value.trim().toUpperCase();
    if (["AB", "EX", "ML"].includes(v)) return "";
    if (grade) return !v || s.grades.some((g) => g.toUpperCase() === v) ? "" : `Use ${s.grades.join(", ")}`;
    if (comps.length) {
      for (const c of comps) {
        const x = d.comps[c.key]?.trim();
        if (x && (isNaN(Number(x)) || Number(x) < 0 || Number(x) > c.max_marks)) return `${c.label}: 0 to ${c.max_marks}`;
      }
      return "";
    }
    if (!v) return "";
    if (isNaN(Number(v))) return "Type marks or AB, EX, ML";
    if (Number(v) < 0 || Number(v) > s.paper.max_marks) return `0 to ${s.paper.max_marks}`;
    return "";
  }
  const update = (sid: number, patch: Partial<Draft[number]>) => {
    setDraft((d) => {
      const next = { ...d[sid], ...patch, comps: { ...d[sid].comps, ...(patch.comps ?? {}) } };
      setErrors((e) => ({ ...e, [sid]: check(sid, next) }));
      return { ...d, [sid]: next };
    });
  };

  function entries() {
    return s!.rows.map((l) => {
      const d = draft[l.student_id];
      const v = d.value.trim().toUpperCase();
      const code = ["AB", "EX", "ML"].includes(v) ? v : null;
      const e: Record<string, unknown> = { student_id: l.student_id, code, remarks: d.remarks.trim() || null };
      if (!code) {
        if (grade) e.grade = d.value.trim() || null;
        else if (comps.length) e.components = Object.fromEntries(comps.map((c) => [c.key, d.comps[c.key]?.trim() || null]));
        else e.marks = d.value.trim() || null;
      }
      return e;
    });
  }
  async function save(quiet = false): Promise<boolean> {
    if (!s || !target) return false;
    if (Object.values(errors).some(Boolean)) { toast.error("Fix the highlighted marks first"); return false; }
    setBusy("save");
    try {
      const r = await api.put<{ saved: number; errors: { student_id: number; error: string }[]; sheet: Sheet }>("/exams/marks/sheet", { paper: target.paper, section_id: target.section, entries: entries() });
      load(r.sheet);
      if (r.errors.length) { setErrors(Object.fromEntries(r.errors.map((e) => [e.student_id, e.error]))); toast.error(`${r.errors.length} entries were not saved`); return false; }
      if (!quiet) toast.success("Marks saved");
      return true;
    } catch (x) { toast.error("Couldn't save the marks", { description: (x as Error).message }); return false; }
    finally { setBusy(""); }
  }
  async function action(a: "submit" | "return" | "lock" | "unlock") {
    if (!s || !target) return;
    const text = { submit: ["Submit these marks?", "You won't be able to change them unless they are sent back.", "Submit"],
      return: ["Send back to the teacher?", "The teacher can edit the marks again.", "Send back"],
      lock: ["Lock these marks?", "Nobody can change them until they are unlocked.", "Lock"],
      unlock: ["Unlock these marks?", "They go back to submitted, so moderators can change them.", "Unlock"] }[a];
    if (!(await confirm({ title: text[0], message: text[1], confirmLabel: text[2] }))) return;
    if (dirty && s.editable && !(await save(true))) return;
    setBusy(a);
    try { load(await api.post<Sheet>("/exams/marks/sheet/action", { paper: target.paper, section_id: target.section, action: a })); toast.success({ submit: "Marks submitted", return: "Sent back", lock: "Marks locked", unlock: "Marks unlocked" }[a]); }
    catch (x) { toast.error("Couldn't do that", { description: (x as Error).message }); }
    finally { setBusy(""); }
  }
  async function moderateAll() {
    if (!target || bump === null) return;
    setBusy("moderate");
    try {
      const r = await api.post<{ changed: number; sheet: Sheet }>("/exams/marks/sheet/moderate", { paper: target.paper, section_id: target.section, add_to_all: bump });
      load(r.sheet); toast.success(`Moderation applied to ${r.changed} learners`);
    } catch (x) { toast.error("Couldn't moderate", { description: (x as Error).message }); }
    finally { setBusy(""); }
  }
  async function saveGrace() {
    if (!s || !target) return;
    setBusy("grace");
    try {
      const adjustments = s.rows.map((l) => ({ student_id: l.student_id, grace: Number(draft[l.student_id]?.grace || 0) }))
        .filter((a, i) => a.grace !== (s.rows[i].grace || 0));
      const r = await api.post<{ sheet: Sheet }>("/exams/marks/sheet/moderate", { paper: target.paper, section_id: target.section, adjustments });
      load(r.sheet); toast.success("Grace marks saved");
    } catch (x) { toast.error("Couldn't save grace marks", { description: (x as Error).message }); }
    finally { setBusy(""); }
  }

  // Enter / ArrowDown -> next learner, ArrowUp -> previous, same column.
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const el = e.currentTarget;
    const col = el.dataset.col, row = Number(el.dataset.row);
    const next = grid.current?.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${row + (e.key === "ArrowUp" ? -1 : 1)}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  }

  const editable = !!s?.editable;
  const cls = (bad: boolean) => `h-9 w-full rounded-lg border bg-surface px-2.5 text-[14px] tabular outline-none transition-colors focus:border-primary disabled:bg-sunken/50 disabled:text-muted ${bad ? "border-rose-400 bg-rose-50/40" : "border-line"}`;
  const liveStats = useMemo(() => {
    if (!s || grade) return null;
    const vals = s.rows.map((l) => {
      const d = draft[l.student_id];
      if (!d) return null;
      if (comps.length && !/^[a-z]{2}$/i.test(d.value)) {
        const parts = comps.map((c) => d.comps[c.key]).filter((x) => x && !isNaN(Number(x)));
        return parts.length ? parts.reduce((a, b) => a + Number(b), 0) : null;
      }
      return d.value && !isNaN(Number(d.value)) ? Number(d.value) : null;
    }).filter((x): x is number => x !== null);
    return { entered: s.rows.filter((l) => { const d = draft[l.student_id]; return d && (d.value || Object.values(d.comps).some(Boolean)); }).length,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, max: vals.length ? Math.max(...vals) : null,
      below: s.paper.pass_marks !== null ? vals.filter((v) => v < s.paper.pass_marks!).length : null };
  }, [s, draft, grade, comps]);

  return (
    <Modal open={!!target} onClose={onClose} size="full" dirty={dirty && editable} busy={!!busy} flush
      title={s ? `${s.paper.subject_name} · ${s.section.label}` : "Mark sheet"}
      description={s ? `${s.exam.name} · ${grade ? "grades" : `out of ${fmt(s.paper.max_marks)}${s.paper.pass_marks !== null ? `, pass ${fmt(s.paper.pass_marks)}` : ""}`}` : undefined}
      headerActions={s && <span className="flex items-center gap-1.5"><SheetBadge status={s.status} />{s.moderated && <Badge tone="accent">Moderated</Badge>}</span>}
      footerStart={s && <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Download} onClick={() => downloadFile(`/exams/marks/sheet/template.csv?paper=${target!.paper}&section_id=${target!.section}`, "marks.csv", false)}>CSV</Button>
        {editable && <Button size="sm" icon={FileUp} onClick={() => setImportOpen(true)}>Import</Button>}
      </div>}
      footer={s && <div className="flex flex-wrap justify-end gap-2">
        {s.can_moderate && s.status === "submitted" && <Button icon={Undo2} loading={busy === "return"} onClick={() => action("return")}>Send back</Button>}
        {s.can_moderate && s.status !== "locked" && <Button icon={Lock} loading={busy === "lock"} onClick={() => action("lock")}>Lock</Button>}
        {s.can_moderate && s.status === "locked" && <Button icon={Unlock} loading={busy === "unlock"} onClick={() => action("unlock")}>Unlock</Button>}
        {editable && <Button icon={Save} loading={busy === "save"} disabled={!dirty} onClick={() => save()}>Save draft</Button>}
        {s.can_enter && s.status === "draft" && <Button variant="primary" icon={Send} loading={busy === "submit"} onClick={() => action("submit")}>Submit</Button>}
      </div>}>
      {!s ? <div className="space-y-3 p-6">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div> : (
        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div ref={grid} className="min-w-0 overflow-x-auto p-4 sm:p-6">
            {!editable && <p className="mb-3 rounded-lg bg-sunken/70 px-3 py-2 text-[13px] text-muted">
              {s.status === "locked" ? `Locked${s.locked_at ? ` on ${formatDateTime(s.locked_at)}` : ""}. Ask the principal to unlock to change marks.`
                : s.status === "submitted" ? `Submitted${s.submitted_at ? ` on ${formatDateTime(s.submitted_at)}` : ""}. Waiting for moderation.`
                : "You can view these marks but not change them."}</p>}
            <table className="w-full min-w-[520px] text-[14px]">
              <thead className="text-left text-[12px] text-muted"><tr>
                <th className="w-14 pb-2 font-normal">{term("roll")}</th><th className="pb-2 font-normal">{term("student")}</th>
                {comps.length ? comps.map((c) => <th key={c.key} className="w-28 pb-2 font-normal">{c.label} <span className="text-faint">/{c.max_marks}</span></th>)
                  : <th className="w-32 pb-2 font-normal">{grade ? "Grade" : "Marks"}</th>}
                {comps.length > 0 && <th className="w-20 pb-2 font-normal">Code</th>}
                {s.can_moderate && !grade && <th className="w-20 pb-2 font-normal">Grace</th>}
                {showRemarks && <th className="pb-2 font-normal">Remarks</th>}
              </tr></thead>
              <tbody>
                {s.rows.map((l, i) => {
                  const d = draft[l.student_id];
                  if (!d) return null;
                  const err = errors[l.student_id];
                  const coded = /^(AB|EX|ML)$/i.test(d.value.trim());
                  return (
                    <tr key={l.student_id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2 tabular text-muted">{l.roll_no ?? "—"}</td>
                      <td className="py-1.5 pr-3"><p className="truncate text-ink">{l.name}</p>{err && <p className="text-[12px] text-rose-600">{err}</p>}
                        {(l.moderation !== 0 || l.grace !== 0) && <p className="text-[11.5px] text-muted">{l.moderation ? `moderation ${l.moderation > 0 ? "+" : ""}${l.moderation}` : ""}{l.moderation && l.grace ? " · " : ""}{l.grace ? `grace +${l.grace}` : ""}</p>}</td>
                      {comps.length ? comps.map((c, ci) => (
                        <td key={c.key} className="py-1.5 pr-2"><input className={cls(!!err)} inputMode="decimal" disabled={!editable || coded} value={d.comps[c.key] ?? ""}
                          data-col={`c${ci}`} data-row={i} onKeyDown={onKeyDown(onKey)} onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => update(l.student_id, { comps: { [c.key]: e.target.value } })} aria-label={`${c.label} for ${l.name}`} /></td>
                      )) : (
                        <td className="py-1.5 pr-2"><input className={cls(!!err)} inputMode={grade ? "text" : "decimal"} disabled={!editable} value={d.value}
                          data-col="m" data-row={i} onKeyDown={onKeyDown(onKey)} onFocus={(e) => e.currentTarget.select()} placeholder={grade ? s.grades.slice(0, 3).join("/") : ""}
                          onChange={(e) => update(l.student_id, { value: e.target.value })} aria-label={`${grade ? "Grade" : "Marks"} for ${l.name}`} /></td>
                      )}
                      {comps.length > 0 && <td className="py-1.5 pr-2"><input className={cls(false)} disabled={!editable} value={coded ? d.value : ""} placeholder="—" maxLength={2}
                        data-col="code" data-row={i} onKeyDown={onKeyDown(onKey)} onChange={(e) => update(l.student_id, { value: e.target.value.toUpperCase() })} aria-label={`Code for ${l.name}`} /></td>}
                      {s.can_moderate && !grade && <td className="py-1.5 pr-2"><input className={cls(false)} inputMode="decimal" value={d.grace} disabled={coded}
                        data-col="g" data-row={i} onKeyDown={onKeyDown(onKey)} onChange={(e) => setDraft((x) => ({ ...x, [l.student_id]: { ...x[l.student_id], grace: e.target.value } }))} aria-label={`Grace for ${l.name}`} /></td>}
                      {showRemarks && <td className="py-1.5"><input className={cls(false)} disabled={!editable} value={d.remarks} maxLength={300}
                        data-col="r" data-row={i} onKeyDown={onKeyDown(onKey)} onChange={(e) => update(l.student_id, { remarks: e.target.value })} aria-label={`Remarks for ${l.name}`} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {s.rows.length === 0 && <p className="py-10 text-center text-[14px] text-muted">No learners are enrolled in this {term("section").toLowerCase()}.</p>}
          </div>
          <aside className="space-y-5 border-t border-line p-5 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <Stat label="Entered" value={`${liveStats?.entered ?? s.stats.entered}/${s.stats.students}`} />
              {!grade && <Stat label="Average" value={fmt(liveStats?.avg ?? s.stats.average, 1)} />}
              {!grade && <Stat label="Highest" value={fmt(liveStats?.max ?? s.stats.highest)} />}
              {!grade && liveStats?.below !== null && <Stat label="Below pass" value={String(liveStats?.below ?? s.stats.below_pass ?? "—")} />}
            </div>
            <div className="space-y-1.5 text-[12.5px] text-muted">
              <p>Type <b className="font-normal text-ink">AB</b> absent (counts as zero), <b className="font-normal text-ink">EX</b> exempt or <b className="font-normal text-ink">ML</b> medical (left out of totals).</p>
              <p>Enter or ↓ moves to the next {term("student").toLowerCase()}. Ctrl+S saves.</p>
            </div>
            <Toggle checked={showRemarks} onChange={setShowRemarks} label="Show remarks" size="sm" />
            {s.can_moderate && !grade && (
              <div className="space-y-2 border-t border-line pt-4">
                <p className="text-[13px] text-ink">Moderation</p>
                <Field label="Add to everyone" hint="Negative numbers take marks away. Typed marks stay as they are.">
                  <NumberInput value={bump} onChange={setBump} step={0.5} placeholder="e.g. 2" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={Wand2} loading={busy === "moderate"} disabled={bump === null} onClick={moderateAll}>Apply</Button>
                  <Button size="sm" loading={busy === "grace"} onClick={saveGrace}>Save grace marks</Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
      {s && target && <ImportModal open={importOpen} onClose={() => setImportOpen(false)} target={target} onDone={(x) => { load(x); setImportOpen(false); }} />}
    </Modal>
  );
}

const onKeyDown = (fn: (e: React.KeyboardEvent<HTMLInputElement>) => void) => (e: React.KeyboardEvent<HTMLInputElement>) => fn(e);

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line px-3 py-2"><p className="text-[11.5px] text-muted">{label}</p><p className="tabular text-[18px] font-light text-ink">{value}</p></div>;
}

function ImportModal({ open, onClose, target, onDone }: { open: boolean; onClose: () => void; target: { paper: string; section: number }; onDone: (s: Sheet) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  async function pick(file: File | undefined) { if (file) setText(await file.text()); }
  async function run() {
    setBusy(true);
    try {
      const r = await api.post<{ saved: number; errors: { line?: number; student_id?: number; error: string }[]; sheet: Sheet }>("/exams/marks/sheet/import", { paper: target.paper, section_id: target.section, csv: text });
      toast.success(`${r.saved} learners imported`);
      if (r.errors.length) setProblems(r.errors.map((e) => `${e.line ? `Line ${e.line}: ` : ""}${e.error}`));
      else onDone(r.sheet);
    } catch (x) { toast.error("Couldn't import", { description: (x as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Import marks" zIndex={70} busy={busy}
      description="A CSV with roll_no (or admission_no) and marks, or one column per part, plus optional code and remarks. Download the CSV first to get the right columns."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>Import</Button></>}>
      <div className="space-y-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-ink" />
        <Field label="Or paste the rows"><Textarea value={text} onValueChange={setText} rows={8} placeholder={"roll_no,marks,code\n1,78\n2,,AB"} className="font-mono text-[12.5px]" /></Field>
        {problems.length > 0 && <ul className="max-h-40 overflow-auto rounded-lg bg-rose-50/60 px-3 py-2 text-[12.5px] text-rose-700">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </div>
    </Modal>
  );
}

/* ── Co-scholastic grades, remarks, attendance ─────────────────────────── */

type CoSheet = {
  section: { id: number; label: string }; term_id: number | null; editable: boolean;
  areas: { id: number; name: string; group_name: string | null; grades: string[] }[];
  rows: { student_id: number; name: string; roll_no: string | null; grades: Record<string, string>; remarks: string | null; days_present: number | null; days_total: number | null }[];
};

function CoScholastic({ terms }: { terms: { id: number; name: string }[] }) {
  const toast = useToast();
  const { term } = useInstitution();
  const sections = useSections();
  const [section, setSection] = useState<number | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<CoSheet | null>(null);
  const [rows, setRows] = useState<CoSheet["rows"]>([]);
  const [saving, setSaving] = useState(false);
  const [workDays, setWorkDays] = useState<number | null>(null);
  useEffect(() => { if (termId === null && terms.length) setTermId(terms[0].id); }, [terms, termId]);
  useEffect(() => {
    if (!section) return;
    let live = true;
    setSheet(null);
    api.get<CoSheet>(`/exams/coscholastic?section_id=${section}${termId ? `&term_id=${termId}` : ""}`).then((r) => { if (live) { setSheet(r); setRows(r.rows); } })
      .catch((e) => toast.error("Couldn't open", { description: e.message }));
    return () => { live = false; };
  }, [section, termId, toast]);
  const set = (sid: number, patch: Partial<CoSheet["rows"][number]>) => setRows((rs) => rs.map((r) => r.student_id === sid ? { ...r, ...patch } : r));
  async function save() {
    setSaving(true);
    try {
      const r = await api.put<{ sheet: CoSheet }>("/exams/coscholastic", { section_id: section, term_id: termId, rows });
      setSheet(r.sheet); setRows(r.sheet.rows); toast.success("Saved");
    } catch (x) { toast.error("Couldn't save", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  const input = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[14px] outline-none focus:border-primary disabled:bg-sunken/50";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-64"><Select value={section} onChange={setSection} placeholder={`Pick a ${term("section").toLowerCase()}`} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></div>
        <div className="w-full sm:w-48"><Select value={termId} onChange={setTermId} clearable placeholder="Whole session" options={terms.map((t) => ({ value: t.id, label: t.name }))} /></div>
      </div>
      {!section ? <Paper className="p-10 text-center text-[14px] text-muted">Pick your {term("section").toLowerCase()} to enter co-scholastic grades, remarks and attendance.</Paper>
        : !sheet ? <Skeleton className="h-60 w-full" /> : (
          <Paper className="overflow-hidden">
            {!sheet.editable && <p className="border-b border-line bg-sunken/60 px-5 py-2 text-[13px] text-muted">Only the class {term("teacher").toLowerCase()} can change these.</p>}
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[760px] text-[14px]">
                <thead className="text-left text-[12px] text-muted"><tr>
                  <th className="w-12 pb-2 font-normal">{term("roll")}</th><th className="pb-2 font-normal">{term("student")}</th>
                  {sheet.areas.map((a) => <th key={a.id} className="w-24 pb-2 font-normal" title={a.group_name ?? ""}>{a.name}</th>)}
                  <th className="w-20 pb-2 font-normal">Present</th>
                  <th className="w-24 pb-2 font-normal"><span className="flex items-center gap-1">Of<input className="h-6 w-14 rounded border border-line px-1 text-[12px]" disabled={!sheet.editable} inputMode="numeric" value={workDays ?? ""} placeholder="days"
                    onChange={(e) => { const n = e.target.value ? Number(e.target.value) : null; setWorkDays(n); setRows((rs) => rs.map((r) => ({ ...r, days_total: n }))); }} aria-label="Working days for all" /></span></th>
                  <th className="min-w-[220px] pb-2 font-normal">Remarks</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student_id} className="border-t border-line">
                      <td className="py-1.5 tabular text-muted">{r.roll_no}</td><td className="py-1.5 pr-3 text-ink">{r.name}</td>
                      {sheet.areas.map((a) => (
                        <td key={a.id} className="py-1.5 pr-2"><input className={input} disabled={!sheet.editable} value={r.grades[String(a.id)] ?? ""} maxLength={12}
                          placeholder={a.grades.join("/")} aria-label={`${a.name} for ${r.name}`}
                          onChange={(e) => set(r.student_id, { grades: { ...r.grades, [String(a.id)]: e.target.value.toUpperCase() } })} /></td>
                      ))}
                      <td className="py-1.5 pr-2"><input className={input} inputMode="decimal" disabled={!sheet.editable} value={r.days_present ?? ""} aria-label={`Days present for ${r.name}`}
                        onChange={(e) => set(r.student_id, { days_present: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td className="py-1.5 pr-2"><input className={input} inputMode="decimal" disabled={!sheet.editable} value={r.days_total ?? ""} aria-label={`Working days for ${r.name}`}
                        onChange={(e) => set(r.student_id, { days_total: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td className="py-1.5"><TextInput value={r.remarks ?? ""} disabled={!sheet.editable} maxLength={500} onValueChange={(x) => set(r.student_id, { remarks: x })} aria-label={`Remarks for ${r.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.editable && <div className="flex justify-end border-t border-line px-5 py-3"><Button variant="primary" loading={saving} onClick={save}>Save</Button></div>}
          </Paper>
        )}
    </div>
  );
}
