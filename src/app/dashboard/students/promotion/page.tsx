"use client";

/*
 * Year-end promotion: pick the section learners are in now, pick where they go in the next
 * session (defaults to the next class of the program), tick learners, choose promoted /
 * detained / completed, confirm. Promoted learners drop off the source list.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowBigUpDash, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, EmptyState } from "@/components/shell/page";
import { Avatar, Button, DataTable, Field, RadioCards, Select, useConfirm, type Column } from "@/components/ui-kit";
import { errText, useList, useSectionOptions, useSessions, type Program } from "@/components/academics/shared";
import type { StudentBrief } from "@/components/students/shared";

type Outcome = "promoted" | "detained" | "completed";

export default function PromotionPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const { sessions, current } = useSessions();
  const programs = useList<Program>("/academics/programs").rows;
  const [fromSession, setFromSession] = useState<number | null>(null);
  const [toSession, setToSession] = useState<number | null>(null);
  const [fromSection, setFromSection] = useState<number | null>(null);
  const [toSection, setToSection] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("promoted");
  const [roster, setRoster] = useState<{ id: number; rows: StudentBrief[] } | null>(null);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [nonce, setNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ moved: number; outcome: Outcome; to: string | null } | null>(null);

  // Defaults: from the session before the current one (else the current), to the session after it.
  useEffect(() => {
    if (!sessions.length || fromSession) return;
    const asc = [...sessions].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const ci = asc.findIndex((s) => s.id === current?.id);
    const later = ci >= 0 ? asc[ci + 1] : undefined;
    if (later) { setFromSession(current!.id); setToSession(later.id); }
    else if (ci > 0) { setFromSession(asc[ci - 1].id); setToSession(current!.id); }
    else if (current) setFromSession(current.id);
  }, [sessions, current, fromSession]);

  const src = useSectionOptions(fromSession);
  const dst = useSectionOptions(toSession);
  const srcSection = src.sections.find((s) => s.id === fromSection);

  // Target default: a section of the next program with the same name, else its first section.
  useEffect(() => {
    if (!srcSection || !toSession) { setToSection(null); return; }
    const prog = programs.find((p) => p.id === srcSection.program_id);
    const targetProgram = outcome === "detained" ? srcSection.program_id : prog?.next_program_id;
    const options = dst.sections.filter((s) => s.program_id === targetProgram);
    const name = srcSection.label.split(" - ").pop();
    setToSection((options.find((s) => s.label.split(" - ").pop() === name) ?? options[0])?.id ?? null);
  }, [srcSection, toSession, dst.sections, programs, outcome]);

  useEffect(() => {
    if (!fromSection) return;
    let live = true;
    api.get<StudentBrief[]>(`/students/section/${fromSection}/roster`)
      .then((r) => { if (live) { setRoster({ id: fromSection, rows: r }); setSelected(r.map((x) => x.id)); } })
      .catch(() => { if (live) setRoster({ id: fromSection, rows: [] }); });
    return () => { live = false; };
  }, [fromSection, nonce]);
  const rows = roster?.id === fromSection ? roster.rows : [];

  const targetLabel = dst.sections.find((s) => s.id === toSection)?.label ?? null;
  const ready = !!fromSection && selected.length > 0 && (outcome === "completed" || !!toSection);
  const sessionOptions = sessions.map((s) => ({ value: s.id, label: s.name, description: s.is_current ? "Current" : undefined }));
  const sameSession = !!fromSession && fromSession === toSession;

  async function run() {
    const verb = outcome === "promoted" ? "Promote" : outcome === "detained" ? "Keep back" : "Mark as completed";
    const ok = await confirm({
      title: `${verb} ${selected.length} ${term(selected.length === 1 ? "student" : "students").toLowerCase()}?`,
      message: outcome === "completed"
        ? `They finish ${srcSection?.label}: their status becomes graduated and they leave the active list.`
        : `They move from ${srcSection?.label} to ${targetLabel}. Their record for the earlier session is kept.`,
      confirmLabel: verb,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await api.post<{ moved: number }>("/students/promote", {
        from_section_id: fromSection, to_section_id: outcome === "completed" ? null : toSection,
        student_ids: selected.map(Number), outcome,
      });
      setResult({ moved: r.moved, outcome, to: outcome === "completed" ? null : targetLabel });
      toast.success(`${r.moved} done`);
      setNonce((n) => n + 1);
    } catch (e) { toast.error("Couldn't complete the promotion", { description: errText(e) }); } finally { setSaving(false); }
  }

  const columns: Column<StudentBrief>[] = useMemo(() => [
    { key: "roll", header: term("roll"), width: "90px", cell: (r) => <span className="tabular text-muted">{r.roll_no ?? "—"}</span> },
    { key: "name", header: term("student"), cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} src={r.photo_url} size={28} /><span className="text-ink">{r.name}</span></span> },
    { key: "adm", header: "Admission no.", hideBelow: "sm", cell: (r) => <span className="font-mono text-[12.5px] text-muted">{r.admission_no}</span> },
  ], [term]);

  if (sessions.length === 0) {
    return (
      <div>
        <PageHeader eyebrow={term("students")} title="Promotion" />
        <Paper><EmptyState icon={ArrowBigUpDash} title={`No ${term("session").toLowerCase()} yet`} hint={`Add ${term("session").toLowerCase()}s first.`}
          action={<Link href="/dashboard/academics/sessions"><Button>Open sessions</Button></Link>} /></Paper>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow={term("students")} title="Promotion"
        description={`Move ${term("students").toLowerCase()} into the next ${term("session").toLowerCase()} at year end, keep some back, or mark those who finish as completed.`} />

      <Paper className="mb-5 p-5">
        <div className="grid items-end gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`From ${term("session").toLowerCase()}`}>
              <Select value={fromSession} onChange={(x) => { setFromSession(x); setFromSection(null); }} options={sessionOptions} />
            </Field>
            <Field label={term("section")}>
              <Select value={fromSection} onChange={(x) => { setFromSection(x); setResult(null); }} options={src.options} placeholder={`Pick a ${term("section").toLowerCase()}`} />
            </Field>
          </div>
          <ArrowRight size={20} strokeWidth={1.4} className="mx-auto mb-2.5 hidden text-faint lg:block" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`To ${term("session").toLowerCase()}`} error={sameSession && outcome !== "completed" ? `Pick a different ${term("session").toLowerCase()}` : undefined}>
              <Select value={toSession} onChange={setToSession} options={sessionOptions} placeholder="Pick" disabled={outcome === "completed"} />
            </Field>
            <Field label={term("section")} hint={toSession && !dst.sections.length && !dst.loading ? `No ${term("sections").toLowerCase()} in that ${term("session").toLowerCase()} yet` : undefined}>
              <Select value={toSection} onChange={setToSection} options={dst.options} placeholder="Pick" disabled={outcome === "completed"} />
            </Field>
          </div>
        </div>
        <div className="mt-5">
          <RadioCards columns={3} value={outcome} onChange={setOutcome} options={[
            { value: "promoted", label: "Promote", description: `Move up to the next ${term("program").toLowerCase()}` },
            { value: "detained", label: "Keep back", description: `Repeat the same ${term("program").toLowerCase()} next ${term("session").toLowerCase()}` },
            { value: "completed", label: "Completed", description: `Finished the ${term("program").toLowerCase()}; becomes graduated` },
          ]} />
        </div>
      </Paper>

      {result && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[14px] text-emerald-800">
          <CheckCircle2 size={18} strokeWidth={1.4} />
          {result.moved} {term(result.moved === 1 ? "student" : "students").toLowerCase()} {result.outcome === "promoted" ? `promoted to ${result.to}` : result.outcome === "detained" ? `kept back in ${result.to}` : "marked as completed"}.
        </div>
      )}

      {fromSection ? (
        <>
          <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} loading={roster?.id !== fromSection}
            selectable selected={selected} onSelectedChange={setSelected}
            emptyIcon={ArrowBigUpDash} emptyTitle={`Nobody left in ${srcSection?.label ?? "this section"}`}
            emptyHint="Everyone here has been moved on already, or no one is enrolled." />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <span className="text-[13.5px] text-muted">{selected.length} of {rows.length} ticked</span>
            <Button variant="primary" icon={ArrowBigUpDash} disabled={!ready || (sameSession && outcome !== "completed")} loading={saving} onClick={run}>
              {outcome === "promoted" ? "Promote" : outcome === "detained" ? "Keep back" : "Mark completed"}
            </Button>
          </div>
        </>
      ) : (
        <Paper><EmptyState icon={ArrowBigUpDash} title={`Pick a ${term("section").toLowerCase()} to start`} hint={`Its ${term("students").toLowerCase()} appear here, all ticked. Untick anyone who shouldn't move.`} /></Paper>
      )}
    </div>
  );
}
