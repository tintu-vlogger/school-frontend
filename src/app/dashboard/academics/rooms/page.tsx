"use client";

/*
 * Rooms & houses: classrooms, labs, halls and online rooms (used by sections and the
 * timetable), and student houses with their colours. Two tabs, each a DataTable with modals.
 */
import { useMemo, useState } from "react";
import { DoorOpen, Flag, Pencil, Plus, Power } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, Tabs, TextInput, paginate, useConfirm,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { ROOM_KINDS, errText, useList, type House, type Room } from "@/components/academics/shared";
import { ColorDot, ColorField } from "@/components/academics/ui";

type Tab = "rooms" | "houses";

export default function RoomsPage() {
  const { term } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const [tab, setTab] = useState<Tab>("rooms");
  const rooms = useList<Room>("/academics/rooms");
  const houses = useList<House>("/academics/houses");
  const [roomForm, setRoomForm] = useState<{ open: boolean; target: Room | null; key: number }>({ open: false, target: null, key: 0 });
  const [houseForm, setHouseForm] = useState<{ open: boolean; target: House | null; key: number }>({ open: false, target: null, key: 0 });
  const openRoom = (r: Room | null) => setRoomForm((f) => ({ open: true, target: r, key: f.key + 1 }));
  const openHouse = (h: House | null) => setHouseForm((f) => ({ open: true, target: h, key: f.key + 1 }));

  return (
    <div>
      <PageHeader eyebrow="Academics" title="Rooms & houses"
        description={`Where ${term("sections").toLowerCase()} meet, and the houses ${term("students").toLowerCase()} belong to.`}
        actions={canManage ? (tab === "rooms"
          ? <Button variant="primary" icon={Plus} onClick={() => openRoom(null)}>Add room</Button>
          : <Button variant="primary" icon={Plus} onClick={() => openHouse(null)}>Add house</Button>) : undefined} />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "rooms", label: "Rooms", icon: DoorOpen, count: rooms.rows.filter((r) => r.active).length },
        { value: "houses", label: "Houses", icon: Flag, count: houses.rows.filter((h) => h.active).length },
      ]} />
      {tab === "rooms"
        ? <RoomsTab rows={rooms.rows} loading={rooms.loading} reload={rooms.reload} canManage={canManage} onEdit={openRoom} />
        : <HousesTab rows={houses.rows} loading={houses.loading} reload={houses.reload} canManage={canManage} onEdit={openHouse} />}
      <RoomModal key={`r${roomForm.key}`} open={roomForm.open} target={roomForm.target} onClose={() => setRoomForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setRoomForm((f) => ({ ...f, open: false })); rooms.reload(); }} />
      <HouseModal key={`h${houseForm.key}`} open={houseForm.open} target={houseForm.target} onClose={() => setHouseForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setHouseForm((f) => ({ ...f, open: false })); houses.reload(); }} />
    </div>
  );
}

function useToggle(path: string, reload: () => void) {
  const toast = useToast();
  const confirm = useConfirm();
  return async (row: { uuid: string; name: string; active: boolean }) => {
    try {
      if (row.active) {
        if (!await confirm({ title: `Switch off ${row.name}?`, tone: "danger", confirmLabel: "Switch off", message: "It is hidden from pickers. Past records keep it." })) return;
        await api.delete(`${path}/${row.uuid}`);
        toast.success(`${row.name} switched off`);
      } else {
        await api.put(`${path}/${row.uuid}`, { active: true });
        toast.success(`${row.name} is back on`);
      }
      reload();
    } catch (e) { toast.error("Couldn't change it", { description: errText(e) }); }
  };
}

function RoomsTab({ rows, loading, reload, canManage, onEdit }: { rows: Room[]; loading: boolean; reload: () => void; canManage: boolean; onEdit: (r: Room | null) => void }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const toggle = useToggle("/academics/rooms", reload);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!q || [r.name, r.code, r.building].some((x) => (x || "").toLowerCase().includes(q)))
      && (!filters.kind?.[0] || r.kind === filters.kind[0])
      && (!filters.status?.[0] || (filters.status[0] === "active" ? r.active : !r.active)));
  }, [rows, search, filters]);
  const columns: Column<Room>[] = [
    { key: "name", header: "Room", sortable: true, sortValue: (r) => r.name, cell: (r) => <span><span className="text-ink">{r.name}</span>{r.code && <span className="ml-2 font-mono text-[12px] text-faint">{r.code}</span>}</span> },
    { key: "kind", header: "Kind", sortable: true, sortValue: (r) => r.kind, cell: (r) => <Badge>{ROOM_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</Badge> },
    { key: "where", header: "Where", hideBelow: "sm", cell: (r) => [r.building, r.floor ? `Floor ${r.floor}` : null].filter(Boolean).join(" · ") || <span className="text-faint">—</span> },
    { key: "cap", header: "Seats", align: "right", sortable: true, sortValue: (r) => r.capacity ?? 0, cell: (r) => r.capacity ? <span className="tabular">{r.capacity}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", hideBelow: "md", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "Active" : "Off"}</Badge> },
  ];
  const filtered = !!search || !!filters.kind?.length;
  return (
    <>
      <FilterBar searchPlaceholder="Search rooms by name, code or building" onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "kind", label: "Kind", options: ROOM_KINDS.map((k) => ({ value: String(k.value), label: k.label })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "off", label: "Off" }] },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={paginate(list, page, 25)} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        onRowClick={canManage ? onEdit : undefined}
        rowActions={canManage ? (r) => [{ label: "Edit", icon: Pencil, onSelect: () => onEdit(r) }, "separator",
          { label: r.active ? "Switch off" : "Switch on", icon: Power, danger: r.active, onSelect: () => toggle(r) }] : undefined}
        pagination={{ page, size: 25, total: list.length, onPageChange: setPage }}
        emptyIcon={DoorOpen} emptyTitle={filtered ? "No rooms match" : "No rooms yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add classrooms, labs and halls so you can give each section a home and avoid timetable clashes."}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => onEdit(null)}>Add room</Button>} />
    </>
  );
}

function HousesTab({ rows, loading, reload, canManage, onEdit }: { rows: House[]; loading: boolean; reload: () => void; canManage: boolean; onEdit: (h: House | null) => void }) {
  const toggle = useToggle("/academics/houses", reload);
  const columns: Column<House>[] = [
    { key: "name", header: "House", sortable: true, sortValue: (h) => h.name, cell: (h) => <span className="flex items-center gap-2.5"><ColorDot color={h.color} size={14} /><span className="text-ink">{h.name}</span></span> },
    { key: "motto", header: "Motto", hideBelow: "sm", cell: (h) => h.motto ? <span className="text-muted">{h.motto}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (h) => <Badge tone={h.active ? "good" : "neutral"} dot>{h.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <DataTable rows={[...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))} rowKey={(h) => h.uuid} columns={columns} loading={loading}
      onRowClick={canManage ? onEdit : undefined}
      rowActions={canManage ? (h) => [{ label: "Edit", icon: Pencil, onSelect: () => onEdit(h) }, "separator",
        { label: h.active ? "Switch off" : "Switch on", icon: Power, danger: h.active, onSelect: () => toggle(h) }] : undefined}
      emptyIcon={Flag} emptyTitle="No houses yet" emptyHint="Houses group students across classes for sports and events. Add them if your institution uses them."
      emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => onEdit(null)}>Add house</Button>} />
  );
}

function RoomModal({ open, target, onClose, onSaved }: { open: boolean; target: Room | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = { name: target?.name ?? "", code: target?.code ?? "", kind: target?.kind ?? "classroom", building: target?.building ?? "", floor: target?.floor ?? "", capacity: target?.capacity ?? null as number | null };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the room a name"); return; }
    setSaving(true);
    try {
      const body = { ...v, name: v.name.trim(), code: v.code.trim() || null, building: v.building.trim() || null, floor: v.floor.trim() || null };
      if (target) await api.put(`/academics/rooms/${target.uuid}`, body); else await api.post("/academics/rooms", body);
      toast.success(target ? "Saved" : "Room added");
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit ${target.name}` : "Add room"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="room-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="room-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Room 204, Physics lab" maxLength={80} /></Field>
          <Field label="Code" aside="Optional"><TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} className="font-mono" maxLength={30} /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x ?? "classroom" })} options={ROOM_KINDS} /></Field>
          <Field label="Seats" aside="Optional"><NumberInput value={v.capacity} onChange={(x) => setV({ ...v, capacity: x })} min={0} max={100000} /></Field>
          <Field label="Building" aside="Optional"><TextInput value={v.building} onValueChange={(x) => setV({ ...v, building: x })} maxLength={80} placeholder="e.g. Main block" /></Field>
          <Field label="Floor" aside="Optional"><TextInput value={v.floor} onValueChange={(x) => setV({ ...v, floor: x })} maxLength={20} placeholder="e.g. 2" /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function HouseModal({ open, target, onClose, onSaved }: { open: boolean; target: House | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = { name: target?.name ?? "", color: target?.color ?? "", motto: target?.motto ?? "" };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the house a name"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), color: v.color || null, motto: v.motto.trim() || null };
      if (target) await api.put(`/academics/houses/${target.uuid}`, body); else await api.post("/academics/houses", body);
      toast.success(target ? "Saved" : "House added");
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit ${target.name}` : "Add house"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="house-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="house-form" onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <Field label="Name" required error={error}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Tagore, Red" maxLength={60} /></Field>
          <Field label="Colour" aside="Optional"><ColorField value={v.color} onChange={(x) => setV({ ...v, color: x })} /></Field>
          <Field label="Motto" aside="Optional"><TextInput value={v.motto} onValueChange={(x) => setV({ ...v, motto: x })} maxLength={200} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
