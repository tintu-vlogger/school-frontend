"use client";

/*
 * Hostel > Rooms: one card per block (beds, occupied, warden) and a grid of its rooms with
 * each bed and who sleeps there. Blocks and rooms are added and edited in modals; a free bed
 * can be allocated straight from the grid.
 */
import { useMemo, useState } from "react";
import { BedDouble, Building, Pencil, Plus, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, EmptyState } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Select, Skeleton, TextInput,
  Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { errText, money, searchStaff, STROKE, useApiData } from "@/components/transport/common";
import { GENDER_LABEL, ROOM_TYPES, type Block, type Room } from "./types";

export function RoomsTab({ canManage, onAllocate }: { canManage: boolean; onAllocate: (bedUuid: string, label: string) => void }) {
  const blocks = useApiData<{ items: Block[] }>("/hostel/blocks");
  const [blockId, setBlockId] = useState<number | null>(null);
  const list = blocks.data?.items ?? [];
  const current = list.find((b) => b.id === blockId) ?? list[0] ?? null;
  const rooms = useApiData<{ items: Room[] }>(current ? `/hostel/rooms?block_id=${current.id}` : null);
  const [blockForm, setBlockForm] = useState<{ open: boolean; target: Block | null; key: number }>({ open: false, target: null, key: 0 });
  const [roomForm, setRoomForm] = useState<{ open: boolean; target: Room | null; key: number }>({ open: false, target: null, key: 0 });
  const byFloor = useMemo(() => {
    const m = new Map<string, Room[]>();
    for (const r of rooms.data?.items ?? []) {
      const k = r.floor ? `Floor ${r.floor}` : "Rooms";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [rooms.data]);
  const refresh = () => { blocks.reload(); rooms.reload(); };

  if (blocks.loading && !blocks.data) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
  return (
    <div>
      {!list.length ? (
        <Paper><EmptyState icon={Building} title="No hostel blocks yet" hint="Add a block (building), then its rooms. Beds are created from each room's bed count."
          action={canManage && <Button variant="primary" icon={Plus} onClick={() => setBlockForm((f) => ({ open: true, target: null, key: f.key + 1 }))}>Add block</Button>} /></Paper>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((b) => {
              const on = current?.id === b.id;
              return (
                <div key={b.uuid} role="button" tabIndex={0} onClick={() => setBlockId(b.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBlockId(b.id); } }}
                  className={`cursor-pointer rounded-2xl border bg-surface p-4 text-left transition-colors ${on ? "border-primary/50 ring-1 ring-primary/20" : "border-line hover:border-line-strong"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-[15px] text-ink">{b.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{GENDER_LABEL[b.gender]} · {b.rooms} rooms{b.warden_name ? ` · ${b.warden_name}` : ""}</p></div>
                    {canManage && <IconButton icon={Pencil} label="Edit block" size="sm" onClick={(e) => { e.stopPropagation(); setBlockForm((f) => ({ open: true, target: b, key: f.key + 1 })); }} />}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary" style={{ width: `${b.beds ? (b.occupied / b.beds) * 100 : 0}%` }} /></div>
                  <p className="mt-1.5 text-[12.5px] text-muted"><span className="tabular text-ink">{b.occupied}</span> of {b.beds} beds taken · {b.free} free</p>
                </div>
              );
            })}
            {canManage && (
              <button type="button" onClick={() => setBlockForm((f) => ({ open: true, target: null, key: f.key + 1 }))}
                className="flex min-h-[112px] items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-[13.5px] text-muted hover:text-primary">
                <Plus size={16} strokeWidth={STROKE} /> Add block
              </button>
            )}
          </div>
          {current && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[15px] text-ink">Rooms in {current.name}</h3>
                {canManage && <Button size="sm" icon={Plus} onClick={() => setRoomForm((f) => ({ open: true, target: null, key: f.key + 1 }))}>Add room</Button>}
              </div>
              {rooms.loading && !rooms.data ? <Skeleton className="h-40 w-full rounded-2xl" /> : !byFloor.length ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">No rooms yet. Add the rooms of this block.</p>
              ) : byFloor.map(([floor, rs]) => (
                <div key={floor} className="mb-5">
                  <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">{floor}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {rs.map((r) => (
                      <div key={r.uuid} className={`rounded-xl border bg-surface p-3 ${r.status === "maintenance" ? "border-amber-200 bg-amber-50/30" : "border-line"}`}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[14px] text-ink">Room {r.room_no}</p>
                            <p className="text-[12px] text-muted">{ROOM_TYPES.find((t) => t.value === r.room_type)?.label}{r.fee ? ` · ${money(r.fee)}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {r.status === "maintenance" && <Badge tone="warn"><Wrench size={11} strokeWidth={STROKE} />Repair</Badge>}
                            {canManage && <IconButton icon={Pencil} label="Edit room" size="sm" onClick={() => setRoomForm((f) => ({ open: true, target: r, key: f.key + 1 }))} />}
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {r.bed_list.map((b) => (
                            <li key={b.uuid} className="flex items-center gap-2 text-[13px]">
                              <BedDouble size={14} strokeWidth={STROKE} className={b.occupant ? "text-primary" : "text-faint"} />
                              <span className="w-10 shrink-0 text-muted">Bed {b.label}</span>
                              {b.occupant ? <span className="min-w-0 truncate text-ink/90">{b.occupant.name}</span>
                                : canManage && r.status === "open" ? (
                                  <button type="button" className="text-[12.5px] text-primary hover:underline"
                                    onClick={() => onAllocate(b.uuid, `${current.name} · Room ${r.room_no} · Bed ${b.label}`)}>Free · allocate</button>
                                ) : <span className="text-faint">Free</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <BlockForm key={`b${blockForm.key}`} open={blockForm.open} target={blockForm.target} onClose={() => setBlockForm((f) => ({ ...f, open: false }))}
        onSaved={(b) => { setBlockForm((f) => ({ ...f, open: false })); setBlockId(b.id); refresh(); }} />
      {current && <RoomForm key={`r${roomForm.key}`} open={roomForm.open} target={roomForm.target} block={current}
        onClose={() => setRoomForm((f) => ({ ...f, open: false }))} onSaved={() => { setRoomForm((f) => ({ ...f, open: false })); refresh(); }} />}
    </div>
  );
}

function BlockForm({ open, target, onClose, onSaved }: { open: boolean; target: Block | null; onClose: () => void; onSaved: (b: Block) => void }) {
  const toast = useToast();
  const initial = {
    name: target?.name ?? "", code: target?.code ?? "", gender: target?.gender ?? "mixed", warden_id: target?.warden_id ?? null as number | null,
    assistant_ids: target?.assistant_ids ?? [] as number[], floors: target?.floors ?? null as number | null, phone: target?.phone ?? "",
    address: target?.address ?? "", notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));
  const known: SelectOption<number>[] = target ? [
    ...(target.warden_id ? [{ value: target.warden_id, label: target.warden_name || "Warden" }] : []),
    ...target.assistants.map((a) => ({ value: a.id, label: a.name })),
  ] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Name the block"); return; }
    setSaving(true);
    const payload = { ...v, name: v.name.trim(), code: v.code.trim() || null, phone: v.phone.trim() || null,
      address: v.address.trim() || null, notes: v.notes.trim() || null };
    try {
      const b = target ? await api.put<Block>(`/hostel/blocks/${target.uuid}`, payload) : await api.post<Block>("/hostel/blocks", payload);
      toast.success(target ? "Block updated" : "Block added");
      onSaved(b);
    } catch (e2) { toast.error("Couldn't save the block", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={target ? `Edit ${target.name}` : "Add hostel block"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="block-form" loading={saving}>{target ? "Save changes" : "Add block"}</Button></>}>
      <form id="block-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={err}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} placeholder="e.g. Tagore House" /></Field>
          <Field label="Short code" aside="Optional"><TextInput value={v.code} onValueChange={(x) => set("code", x.toUpperCase())} maxLength={20} /></Field>
          <Field label="For">
            <Select value={v.gender} onChange={(x) => set("gender", (x as Block["gender"]) || "mixed")} options={[{ value: "boys", label: "Boys" }, { value: "girls", label: "Girls" }, { value: "mixed", label: "Mixed" }]} />
          </Field>
          <Field label="Floors" aside="Optional"><NumberInput value={v.floors} onChange={(x) => set("floors", x)} min={1} max={50} /></Field>
          <Field label="Warden"><Select value={v.warden_id} onChange={(x) => set("warden_id", x)} loadOptions={searchStaff} clearable placeholder="Search staff"
            selectedOption={known.find((k) => k.value === v.warden_id) ?? null} /></Field>
          <Field label="Assistant wardens" aside="Optional"><MultiSelect value={v.assistant_ids} onChange={(x) => set("assistant_ids", x)} loadOptions={searchStaff}
            selectedOptions={known.filter((k) => v.assistant_ids.includes(k.value))} placeholder="Search staff" /></Field>
          <Field label="Hostel phone" aside="Optional"><TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} /></Field>
          <div className="hidden sm:block" />
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function RoomForm({ open, target, block, onClose, onSaved }: { open: boolean; target: Room | null; block: Block; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    room_no: target?.room_no ?? "", floor: target?.floor ?? "", room_type: target?.room_type ?? "double", beds: target?.beds ?? 2,
    fee: target?.fee != null ? Number(target.fee) : null as number | null, amenities: (target?.amenities ?? []).join(", "),
    maintenance: target?.status === "maintenance", notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.room_no.trim()) { setErr("Enter the room number"); return; }
    setSaving(true);
    const payload = { room_no: v.room_no.trim(), floor: v.floor.trim() || null, room_type: v.room_type, beds: v.beds || 1, fee: v.fee,
      amenities: v.amenities.split(",").map((a) => a.trim()).filter(Boolean), status: v.maintenance ? "maintenance" : "open", notes: v.notes.trim() || null };
    try {
      if (target) await api.put(`/hostel/rooms/${target.uuid}`, payload);
      else await api.post("/hostel/rooms", { ...payload, block_id: block.id });
      toast.success(target ? "Room updated" : "Room added");
      onSaved();
    } catch (e2) { toast.error("Couldn't save the room", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit room ${target.room_no}` : `Add room to ${block.name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="room-form" loading={saving}>{target ? "Save changes" : "Add room"}</Button></>}>
      <form id="room-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Room number" required error={err}><TextInput autoFocusInModal value={v.room_no} onValueChange={(x) => { set("room_no", x); setErr(""); }} /></Field>
          <Field label="Floor" aside="Optional"><TextInput value={v.floor} onValueChange={(x) => set("floor", x)} placeholder="e.g. 1" /></Field>
          <Field label="Type"><Select value={v.room_type} onChange={(x) => set("room_type", (x as Room["room_type"]) || "double")} options={ROOM_TYPES} /></Field>
          <Field label="Beds" hint={target ? "Beds that are taken can't be removed" : undefined}><NumberInput value={v.beds} onChange={(x) => set("beds", x ?? 1)} min={1} max={40} /></Field>
          <Field label="Fee per year" aside="Optional"><NumberInput value={v.fee} onChange={(x) => set("fee", x)} min={0} step={1000} suffix="₹" /></Field>
          <Field label="Amenities" aside="Optional" hint="Separate with commas"><TextInput value={v.amenities} onValueChange={(x) => set("amenities", x)} placeholder="Attached bath, Study table" /></Field>
          <div className="sm:col-span-2"><Toggle checked={v.maintenance} onChange={(x) => set("maintenance", x)} label="Under maintenance" description="No new boarders are placed here." /></div>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
