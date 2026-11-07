"use client";

/*
 * Builder modals: assign a period (CellModal), generate from the allocation, copy one
 * section's timetable to others.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, Select, TextInput, Toggle, useConfirm,
  type SelectOption,
} from "@/components/ui-kit";
import { EntryChip, WEEKDAY_NAMES, type TtEntry } from "./week-grid";

export type Allocation = {
  subject_id: number; subject_name: string; subject_code: string | null; subject_color: string | null;
  teacher_id: number | null; teacher_name: string | null; weekly_periods: number | null; placed: number;
};
export type SectionRow = {
  id: number; uuid: string; label: string; program_id: number; entries: number; published: boolean;
  published_at: string | null; published_by: string | null; version: number; changed: boolean;
};

export function CellModal({
  open, onClose, sectionId, sectionLabel, weekday, periodNo, entries, allocation, teachers, rooms, sections, homeRoom, onSaved,
}: {
  open: boolean; onClose: () => void; sectionId: number; sectionLabel: string; weekday: number; periodNo: number;
  entries: TtEntry[]; allocation: Allocation[]; teachers: SelectOption<number>[]; rooms: SelectOption<number>[];
  sections: SectionRow[]; homeRoom: number | null; onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [editing, setEditing] = useState<TtEntry | null>(entries.length === 1 ? entries[0] : null);
  const [adding, setAdding] = useState(entries.length === 0);
  const [subject, setSubject] = useState<number | null>(editing?.subject_id ?? null);
  const [teacher, setTeacher] = useState<number | null>(editing?.teacher_id ?? null);
  const [room, setRoom] = useState<number | null>(editing ? editing.room_id : homeRoom);
  const [elective, setElective] = useState(editing?.elective_group ?? "");
  const [combined, setCombined] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [clash, setClash] = useState<string | null>(null);

  const startEdit = (e: TtEntry | null) => {
    setEditing(e); setAdding(e === null); setClash(null);
    setSubject(e?.subject_id ?? null); setTeacher(e?.teacher_id ?? null); setRoom(e ? e.room_id : homeRoom);
    setElective(e?.elective_group ?? (e === null && entries.length ? entries[0].elective_group ?? "" : "")); setCombined([]);
  };

  const subjectOpts = useMemo(() => allocation.map((a) => ({
    value: a.subject_id, label: a.subject_name,
    description: `${a.teacher_name ?? `No ${term("teacher").toLowerCase()}`} · ${a.placed}${a.weekly_periods ? ` of ${a.weekly_periods}` : ""} placed`,
  })), [allocation, term]);

  const pickSubject = (v: number | null) => {
    setSubject(v);
    const a = allocation.find((x) => x.subject_id === v);
    if (a) setTeacher(a.teacher_id);
  };

  async function save(force = false) {
    setSaving(true);
    setClash(null);
    const body = { subject_id: subject, teacher_id: teacher, room_id: room, elective_group: elective.trim() || null, force };
    try {
      if (editing) await api.put(`/timetable/entries/${editing.uuid}`, body);
      else await api.post("/timetable/entries", {
        ...body, weekday, period_no: periodNo,
        ...(combined.length ? { section_ids: [sectionId, ...combined] } : { section_id: sectionId }),
      });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      const msg = (e as Error).message;
      if (/already/.test(msg)) setClash(msg);
      else toast.error("Couldn't save", { description: msg });
    } finally { setSaving(false); }
  }

  async function remove(e: TtEntry) {
    const many = !!e.group_key;
    if (!(await confirm({ title: "Remove this period?", message: many ? "It is a combined class; it goes from every section in it." : undefined, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/timetable/entries/${e.uuid}`); toast.success("Removed"); onSaved(); }
    catch (err) { toast.error((err as Error).message); }
  }

  const replaces = !editing && entries.length > 0 && !elective.trim();
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving}
      title={`${WEEKDAY_NAMES[weekday]}, period ${periodNo}`} description={sectionLabel}
      footer={(adding || editing) ? (
        <>
          <ModalCancel />
          {clash && <Button variant="danger" onClick={() => save(true)} loading={saving}>Save anyway</Button>}
          {!clash && <Button variant="primary" onClick={() => save(false)} loading={saving}>Save</Button>}
        </>
      ) : <ModalCancel>Close</ModalCancel>}>
      <div className="space-y-5">
        {entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.uuid} className={`flex items-center gap-2 rounded-xl border p-1.5 ${editing?.uuid === e.uuid ? "border-primary/40" : "border-line"}`}>
                <div className="min-w-0 flex-1"><EntryChip e={e} mode="section" /></div>
                <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => startEdit(e)} />
                <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => remove(e)} />
              </div>
            ))}
            {!adding && <Button variant="ghost" size="sm" onClick={() => startEdit(null)}>Add an elective or replace</Button>}
          </div>
        )}
        {(adding || editing) && (
          <div className="space-y-4">
            <FormGrid columns={2}>
              <Field label={term("subject")}>
                <Select value={subject} onChange={pickSubject} options={subjectOpts} clearable placeholder="Free period" />
              </Field>
              <Field label={term("teacher")}>
                <Select value={teacher} onChange={setTeacher} options={teachers} clearable placeholder="Nobody" />
              </Field>
              <Field label="Room">
                <Select value={room} onChange={setRoom} options={rooms} clearable placeholder="No room" />
              </Field>
              <Field label="Elective group" hint="Same group = taught side by side in this period">
                <TextInput value={elective} onValueChange={setElective} placeholder="e.g. Language II" />
              </Field>
            </FormGrid>
            {!editing && (
              <Field label={`Combined with other ${term("sections").toLowerCase()}`} hint="One class, one teacher and room for all of them">
                <MultiSelect value={combined} onChange={setCombined}
                  options={sections.filter((s) => s.id !== sectionId).map((s) => ({ value: s.id, label: s.label }))} placeholder="Only this one" />
              </Field>
            )}
            {replaces && <p className="text-[12.5px] text-muted">This replaces what is in the period now. Give both an elective group to keep them side by side.</p>}
            {clash && (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
                <AlertTriangle size={16} strokeWidth={1.4} className="mt-0.5 shrink-0" />
                <p>{clash} You can save anyway; it will show as a clash.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function GenerateModal({ open, onClose, sections, current, onDone }: {
  open: boolean; onClose: () => void; sections: SectionRow[]; current: number | null; onDone: () => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const [ids, setIds] = useState<number[]>(current ? [current] : []);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ placed: number; unplaced: { section_label: string; subject_name: string; missing: number }[] } | null>(null);
  useEffect(() => { if (open) { setIds(current ? [current] : []); setResult(null); } }, [open, current]);
  async function run() {
    if (!ids.length) { toast.error(`Pick at least one ${term("section").toLowerCase()}`); return; }
    setBusy(true);
    try {
      const r = await api.post<typeof result>("/timetable/generate", { section_ids: ids, replace });
      setResult(r);
      onDone();
    } catch (e) { toast.error("Couldn't generate", { description: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title="Generate timetables"
      description="Fills empty periods from the teacher allocation (weekly periods per subject), spreading each subject over the week without clashes."
      footer={result ? <ModalCancel>Done</ModalCancel> : <><ModalCancel /><Button variant="primary" icon={Wand2} loading={busy} onClick={run}>Generate</Button></>}>
      {result ? (
        <div className="space-y-3">
          <p className="text-[14px] text-ink">{result.placed} periods placed.</p>
          {result.unplaced.length > 0 ? (
            <div>
              <p className="mb-1 text-[13px] text-muted">Could not place (no free slot for the teacher or the {term("section").toLowerCase()}):</p>
              <ul className="space-y-1 text-[13px]">
                {result.unplaced.map((u, i) => <li key={i} className="flex justify-between"><span>{u.section_label} · {u.subject_name}</span><Badge tone="warn">{u.missing} left</Badge></li>)}
              </ul>
            </div>
          ) : <p className="text-[13px] text-muted">Everything in the allocation fits.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={term("sections")}>
            <MultiSelect value={ids} onChange={setIds} options={sections.map((s) => ({ value: s.id, label: s.label, description: s.entries ? `${s.entries} periods set` : undefined }))} />
          </Field>
          <Toggle checked={replace} onChange={setReplace} label="Start from scratch" description="Clear these timetables first. Otherwise what is there now is kept." />
        </div>
      )}
    </Modal>
  );
}

export function CopyModal({ open, onClose, sections, from, onDone }: {
  open: boolean; onClose: () => void; sections: SectionRow[]; from: SectionRow | null; onDone: () => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const [ids, setIds] = useState<number[]>([]);
  const [mode, setMode] = useState<string>("allocation");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setIds([]); }, [open]);
  async function run() {
    if (!from || !ids.length) { toast.error(`Pick where to copy to`); return; }
    setBusy(true);
    try {
      const r = await api.post<{ copied: number; skipped: number }>("/timetable/copy", { from_section_id: from.id, to_section_ids: ids, teachers: mode });
      toast.success(`Copied ${r.copied} periods`, r.skipped ? { description: `${r.skipped} skipped: subject not taught there.` } : undefined);
      onDone();
      onClose();
    } catch (e) { toast.error("Couldn't copy", { description: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title={`Copy ${from?.label ?? ""}`}
      description="The timetables you pick are replaced by this one."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={run}>Copy</Button></>}>
      <div className="space-y-4">
        <Field label={`To ${term("sections").toLowerCase()}`}>
          <MultiSelect value={ids} onChange={setIds} options={sections.filter((s) => s.id !== from?.id).map((s) => ({ value: s.id, label: s.label }))} />
        </Field>
        <Field label={term("teachers")}>
          <Select value={mode} onChange={(v) => v && setMode(v)} options={[
            { value: "allocation", label: `Each ${term("section").toLowerCase()}'s own ${term("teachers").toLowerCase()}`, description: "From the teacher allocation" },
            { value: "same", label: `The same ${term("teachers").toLowerCase()}` },
            { value: "none", label: `No ${term("teachers").toLowerCase()}`, description: "Fill them in later" },
          ]} />
        </Field>
      </div>
    </Modal>
  );
}
