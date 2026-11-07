"use client";

/*
 * Hostel > Boarders: who lives where. Allocate (or move) opens a modal listing only beds that
 * suit the learner (block gender, room open, bed free); check-out ends the stay.
 */
import { useState } from "react";
import { BedDouble, DoorOpen, Pencil, Plus, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, Textarea, Toggle,
  formatDisplayDate, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { errText, money, PersonLine, searchStudents, useApiData, type Paged } from "@/components/transport/common";
import type { Allocation, Block, MessPlan } from "./types";

export type AllocTarget = { student?: { id: number; name: string } | null; bed?: { uuid: string; label: string } | null; move?: boolean };

export function BoardersTab({ canManage, onAllocate }: { canManage: boolean; onAllocate: (t: AllocTarget) => void }) {
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const blocks = useApiData<{ items: Block[] }>("/hostel/blocks");
  const params = new URLSearchParams({ page: String(page), size: "25", q, status: filters.status?.[0] ?? "" });
  if (filters.block?.[0]) params.set("block_id", filters.block[0]);
  const { data, loading, reload } = useApiData<Paged<Allocation>>(`/hostel/allocations?${params}`);
  const [checkout, setCheckout] = useState<Allocation | null>(null);
  const [edit, setEdit] = useState<Allocation | null>(null);

  const columns: Column<Allocation>[] = [
    { key: "student", header: term("student"), cell: (a) => <PersonLine name={a.student_name} photo={a.photo_url} detail={[a.admission_no, a.section_label].filter(Boolean).join(" · ")} /> },
    { key: "room", header: "Room and bed", cell: (a) => <div><p className="text-ink/90">{a.block} · Room {a.room}</p><p className="text-[12.5px] text-muted">Bed {a.bed}{a.floor ? ` · Floor ${a.floor}` : ""}</p></div> },
    { key: "mess", header: "Mess plan", hideBelow: "lg", cell: (a) => a.mess_plan ? <span className="text-ink/80">{a.mess_plan}</span> : <span className="text-faint">—</span> },
    { key: "in", header: "Checked in", hideBelow: "md", cell: (a) => <span className="text-muted">{formatDisplayDate(a.check_in)}{a.check_out ? ` – ${formatDisplayDate(a.check_out)}` : ""}</span> },
    { key: "fee", header: "Fee", align: "right", hideBelow: "md", cell: (a) => a.fee_amount ? <span className="tabular text-ink/80">{money(a.fee_amount)}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (a) => <Badge tone={a.status === "active" ? "good" : "neutral"} dot>{a.status === "active" ? "Staying" : "Checked out"}</Badge> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder={`Search ${term("students").toLowerCase()} or room`} onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[
          { key: "block", label: "Block", options: (blocks.data?.items ?? []).map((b) => ({ value: String(b.id), label: b.name })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Staying" }, { value: "checked_out", label: "Checked out" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => onAllocate({})}>Allocate bed</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(a) => a.uuid} columns={columns} loading={loading}
        rowActions={(a) => canManage && a.status === "active" ? [
          { label: "Move to another bed", icon: Repeat, onSelect: () => onAllocate({ student: { id: a.student_id, name: a.student_name }, move: true }) },
          { label: "Mess plan and notes", icon: Pencil, onSelect: () => setEdit(a) },
          "separator", { label: "Check out", icon: DoorOpen, danger: true, onSelect: () => setCheckout(a) },
        ] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={BedDouble} emptyTitle="No boarders here" emptyHint="Allocate a bed to a boarder from here or from the room grid."
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => onAllocate({})}>Allocate bed</Button>} />
      <CheckOutModal alloc={checkout} onClose={() => setCheckout(null)} onSaved={() => { setCheckout(null); reload(); }} />
      <EditAllocModal key={edit?.uuid ?? "none"} alloc={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </div>
  );
}

export function useMessOptions(): SelectOption<number>[] {
  const { data } = useApiData<Paged<MessPlan>>("/hostel/mess-plans?all=true&active=true");
  return (data?.items ?? []).map((m) => ({ value: m.id, label: m.name, description: money(m.fee) }));
}

export function AllocateModal({ open, target, onClose, onSaved }: { open: boolean; target: AllocTarget; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const mess = useMessOptions();
  const [student, setStudent] = useState<number | null>(target.student?.id ?? null);
  const [bed, setBed] = useState<string | null>(target.bed?.uuid ?? null);
  const [checkIn, setCheckIn] = useState(todayISO());
  const [messId, setMessId] = useState<number | null>(null);
  const [bill, setBill] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const beds = useApiData<{ uuid: string; label: string; room_type: string; fee: string | null }[]>(
    open ? `/hostel/beds/free${student ? `?student_id=${student}` : ""}` : null);
  const bedOpts: SelectOption<string>[] = [
    ...(target.bed && !(beds.data ?? []).some((b) => b.uuid === target.bed!.uuid) ? [{ value: target.bed.uuid, label: target.bed.label }] : []),
    ...(beds.data ?? []).map((b) => ({ value: b.uuid, label: b.label, description: [b.room_type, b.fee && money(b.fee)].filter(Boolean).join(" · ") })),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !bed) { setErr(`Pick the ${term("student").toLowerCase()} and a bed`); return; }
    setSaving(true);
    try {
      await api.post("/hostel/allocations", { student_id: student, bed_uuid: bed, check_in: checkIn, mess_plan_id: messId,
        notes: notes.trim() || null, bill_fee: bill, move: !!target.move });
      toast.success(target.move ? "Moved to the new bed" : "Bed allocated");
      onSaved();
    } catch (e2) { setErr(errText(e2)); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={target.move ? `Move ${target.student?.name}` : "Allocate a bed"}
      description={target.move ? "The current bed is checked out the day before the new date." : "Only beds that suit the learner are listed."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hostel-alloc" loading={saving}>{target.move ? "Move" : "Allocate"}</Button></>}>
      <form id="hostel-alloc" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("student")} required className="sm:col-span-2">
            <Select value={student} onChange={(x) => { setStudent(x); setErr(""); if (!target.bed) setBed(null); }} loadOptions={searchStudents}
              placeholder={`Search ${term("students").toLowerCase()}`} disabled={!!target.move}
              selectedOption={target.student ? { value: target.student.id, label: target.student.name } : null} />
          </Field>
          <Field label="Bed" required className="sm:col-span-2" hint={beds.data && !beds.data.length ? "No free beds suit this learner" : undefined}>
            <Select value={bed} onChange={(x) => { setBed(x); setErr(""); }} options={bedOpts} placeholder="Pick a free bed" />
          </Field>
          <Field label={target.move ? "Moves on" : "Check-in date"}><DateInput value={checkIn} onChange={(x) => setCheckIn(x || todayISO())} /></Field>
          <Field label="Mess plan" aside="Optional"><Select value={messId} onChange={setMessId} options={mess} clearable placeholder="None" /></Field>
          <Field label="Notes" aside="Optional" className="sm:col-span-2"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
          {!target.move && (
            <div className="sm:col-span-2 rounded-xl border border-line bg-sunken/50 px-4 py-3">
              <Toggle checked={bill} onChange={setBill} label="Add the hostel and mess fee to fees"
                description="Raises a charge when the fees module is set up; otherwise the amount is only recorded." />
            </div>
          )}
          {err && <p className="sm:col-span-2 text-[13px] text-rose-700">{err}</p>}
        </FormGrid>
      </form>
    </Modal>
  );
}

function CheckOutModal({ alloc, onClose, onSaved }: { alloc: Allocation | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [day, setDay] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!alloc) return;
    setSaving(true);
    try { await api.post(`/hostel/allocations/${alloc.uuid}/check-out`, { check_out: day, notes: notes.trim() || null }); toast.success("Checked out"); onSaved(); }
    catch (e) { toast.error("Couldn't check out", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!alloc} onClose={onClose} size="sm" busy={saving} title={alloc ? `Check out ${alloc.student_name}?` : ""}
      description={alloc ? `${alloc.block} · Room ${alloc.room} · Bed ${alloc.bed} becomes free.` : undefined}
      footer={<><ModalCancel /><Button variant="danger" onClick={save} loading={saving}>Check out</Button></>}>
      <FormGrid columns={1}>
        <Field label="Check-out date"><DateInput value={day} onChange={(x) => setDay(x || todayISO())} /></Field>
        <Field label="Notes" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={2} placeholder="Room handed over, keys returned" /></Field>
      </FormGrid>
    </Modal>
  );
}

function EditAllocModal({ alloc, onClose, onSaved }: { alloc: Allocation | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const mess = useMessOptions();
  const [messId, setMessId] = useState<number | null>(alloc?.mess_plan_id ?? null);
  const [notes, setNotes] = useState(alloc?.notes ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!alloc) return;
    setSaving(true);
    try { await api.put(`/hostel/allocations/${alloc.uuid}`, { mess_plan_id: messId, notes: notes.trim() || null }); toast.success("Saved"); onSaved(); }
    catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!alloc} onClose={onClose} size="sm" busy={saving} title={alloc?.student_name}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <FormGrid columns={1}>
        <Field label="Mess plan"><Select value={messId} onChange={setMessId} options={mess} clearable placeholder="None" /></Field>
        <Field label="Notes"><Textarea value={notes} onValueChange={setNotes} rows={3} /></Field>
      </FormGrid>
    </Modal>
  );
}
