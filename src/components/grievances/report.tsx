"use client";

/* Annual POSH report (POSH Rules, rule 14) with awareness programmes. */
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { Paper } from "@/components/shell/page";
import {
  Badge, Button, DateInput, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, Skeleton, StatCard, TextInput,
  formatDisplayDate,
} from "@/components/ui-kit";

type Report = {
  year: number; company_name: string | null; employees: number; complaints_received: number; complaints_disposed: number;
  pending_at_year_end: number; pending_over_90_days: number; conciliations: number; late_filings: number;
  outcomes: Record<string, number>; actions_taken: { reference_no: string | null; outcome: string | null; action: string }[];
  programmes: { held_on: string; title: string; kind: string; participants: number }[]; workshops: number; participants: number;
  committee: { name: string; constituted_on: string | null; valid_until: string | null; members: { name: string; role: string; organisation: string | null }[] } | null;
  policy_acknowledgement: { assigned: number; acknowledged: number; overdue: number; policies: { title: string; assigned: number; acknowledged: number }[] };
};

const KINDS: Record<string, string> = { workshop: "Workshop", awareness: "Awareness programme", training: "Training" };

export function PoshReport({ canAddProgramme }: { canAddProgramme: boolean }) {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(thisYear);
  const [r, setR] = useState<Report | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setR(null);
    api.get<Report>(`/grievances/posh/annual-report?year=${year}`).then(setR).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the report"));
  }, [year, toast]);
  useEffect(() => { load(); }, [load]);

  const ack = r?.policy_acknowledgement;
  const ackPct = ack && ack.assigned ? Math.round((100 * ack.acknowledged) / ack.assigned) : null;

  return (
    <div className="posh-report">
      <style>{`@media print { body * { visibility: hidden; } .posh-report, .posh-report * { visibility: visible; } .posh-report { position: absolute; inset: 0; padding: 24px; } .no-print { display: none !important; } }`}</style>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="w-40">
          <Select value={year} onChange={(v) => v && setYear(v)} options={Array.from({ length: 6 }, (_, i) => ({ value: thisYear - i, label: String(thisYear - i) }))} />
        </div>
        <div className="flex gap-2">
          {canAddProgramme && <Button icon={CalendarPlus} onClick={() => setAdding(true)}>Add programme</Button>}
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      {!r ? (
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Annual report under the POSH Act, 2013 · calendar year {r.year}</p>
            <p className="mt-1 text-[18px] font-light text-ink">{r.company_name} · {r.employees} employees</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Complaints received" value={r.complaints_received} hint={r.late_filings ? `${r.late_filings} filed late` : undefined} />
            <StatCard label="Disposed of" value={r.complaints_disposed} hint={r.conciliations ? `${r.conciliations} by conciliation` : undefined} />
            <StatCard label="Pending at year end" value={r.pending_at_year_end} />
            <StatCard label="Pending over 90 days" value={r.pending_over_90_days} hint={r.pending_over_90_days ? "Past the inquiry limit" : "None"} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Paper className="p-5">
              <p className="mb-3 text-[15px] text-ink">Findings</p>
              {Object.keys(r.outcomes).length === 0 ? <p className="text-[13.5px] text-muted">No complaints disposed of in {r.year}.</p> : (
                <ul className="divide-y divide-line">
                  {Object.entries(r.outcomes).map(([k, n]) => <li key={k} className="flex justify-between py-2 text-[14px]"><span className="text-ink/80">{k}</span><span className="tabular">{n}</span></li>)}
                </ul>
              )}
              {r.actions_taken.length > 0 && (
                <>
                  <p className="mb-2 mt-5 text-[13px] text-muted">Nature of action taken</p>
                  <ul className="space-y-2">{r.actions_taken.map((a, i) => <li key={i} className="text-[13.5px] text-ink/80"><span className="text-faint">{a.reference_no} · </span>{a.action}</li>)}</ul>
                </>
              )}
            </Paper>
            <Paper className="p-5">
              <p className="mb-3 text-[15px] text-ink">Internal Committee</p>
              {!r.committee ? <p className="text-[13.5px] text-muted">No Internal Committee is set up.</p> : (
                <>
                  <p className="mb-3 text-[13px] text-muted">{r.committee.name}{r.committee.constituted_on ? ` · since ${formatDisplayDate(r.committee.constituted_on)}` : ""}{r.committee.valid_until ? ` · until ${formatDisplayDate(r.committee.valid_until)}` : ""}</p>
                  <ul className="divide-y divide-line">
                    {r.committee.members.map((m, i) => <li key={i} className="flex justify-between gap-3 py-2 text-[14px]"><span className="text-ink">{m.name}{m.organisation ? <span className="text-faint"> · {m.organisation}</span> : null}</span><span className="text-muted">{m.role}</span></li>)}
                  </ul>
                </>
              )}
            </Paper>
            <Paper className="p-5">
              <div className="mb-3 flex items-baseline justify-between"><p className="text-[15px] text-ink">Workshops and awareness</p><span className="text-[13px] text-muted">{r.workshops} held · {r.participants} people</span></div>
              {r.programmes.length === 0 ? <p className="text-[13.5px] text-muted">No programmes recorded for {r.year}.</p> : (
                <ul className="divide-y divide-line">
                  {r.programmes.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                      <span className="min-w-0"><span className="block truncate text-ink">{p.title}</span><span className="text-[12.5px] text-faint">{formatDisplayDate(p.held_on)} · {KINDS[p.kind] ?? p.kind}</span></span>
                      <span className="tabular text-muted">{p.participants}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
            <Paper className="p-5">
              <p className="mb-3 text-[15px] text-ink">POSH policy acknowledgement</p>
              {!ack || !ack.assigned ? <p className="text-[13.5px] text-muted">No POSH policy needing acknowledgement is published yet.</p> : (
                <>
                  <p className="tabular text-[30px] font-extralight text-ink">{ackPct}%</p>
                  <p className="text-[13px] text-muted">{ack.acknowledged} of {ack.assigned} employees have acknowledged{ack.overdue ? <> · <span className="text-rose-600">{ack.overdue} overdue</span></> : null}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary" style={{ width: `${ackPct}%` }} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">{ack.policies.map((p) => <Badge key={p.title}>{p.title}</Badge>)}</div>
                </>
              )}
            </Paper>
          </div>
        </div>
      )}
      <ProgrammeModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function ProgrammeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ held_on: todayISO(), title: "", kind: "workshop", participants: 0 as number | null, notes: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) { toast.error("Give the programme a title"); return; }
    setSaving(true);
    try {
      await api.post("/grievances/posh/programmes", { ...v, title: v.title.trim(), participants: v.participants ?? 0, notes: v.notes || null });
      toast.success("Programme added");
      setV({ held_on: todayISO(), title: "", kind: "workshop", participants: 0, notes: "" });
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Add a programme" description="Workshops and awareness sessions count towards the annual report."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="prog-form" loading={saving}>Add</Button></>}>
      <form id="prog-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Title" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder="e.g. POSH awareness for new joiners" /></Field>
          <Field label="Held on"><DateInput value={v.held_on} onChange={(x) => setV({ ...v, held_on: x })} max={todayISO()} /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x || "workshop" })} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Participants"><NumberInput value={v.participants} onChange={(x) => setV({ ...v, participants: x })} min={0} /></Field>
          <Field label="Notes" aside="Optional"><TextInput value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
