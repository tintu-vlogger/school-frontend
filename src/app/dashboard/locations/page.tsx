"use client";

/*
 * Regions & locations. Tabs at the top switch between Locations (offices, branches, sites
 * with their state, timezone and attendance boundary) and Regions (groups of locations).
 * Each tab: FilterBar + DataTable; row click opens the detail modal; New / Edit open the
 * form modal; nothing is deleted, records are switched off.
 */
import { useMemo, useState } from "react";
import { Crosshair, Eye, Map as MapIcon, MapPin, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { allTimeZones, timeZoneOffsetLabel } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { CustomFields, useCustomFieldDraft, type CustomValues } from "@/components/custom-fields";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, FormSection, KeyValue, MasterSelect, Modal, ModalCancel, NumberInput,
  Section, Select, Tabs, TextInput, Textarea, paginate, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import {
  Dash, PersonInline, STATUS_FILTER, StatusBadge, errorText, matchesStatus, orNull, searchEmployees, toNumber, useList, useOptions,
  useSwitchActive, type PersonRef,
} from "@/components/org/shared";

interface Location {
  id: number; uuid: string; name: string; code: string | null; kind: string | null; kind_label: string | null;
  region_id: number | null; region_name: string | null; legal_entity_id: number | null; legal_entity_name: string | null;
  address_line1: string | null; address_line2: string | null; city: string | null; state_id: number | null; state_name: string | null;
  pincode: string | null; timezone: string | null; latitude: number | string | null; longitude: number | string | null; radius_m: number | null;
  phone: string | null; email: string | null; active: boolean; employee_count: number;
  custom?: CustomValues;
}
interface Region {
  id: number; uuid: string; name: string; code: string | null; description: string | null;
  head_employee_id: number | null; head: PersonRef; active: boolean; location_count: number;
}
type Entity = { id: number; name: string; active: boolean };

const KINDS: SelectOption[] = [
  { value: "head_office", label: "Head office" }, { value: "branch", label: "Branch" }, { value: "factory", label: "Factory" },
  { value: "warehouse", label: "Warehouse" }, { value: "site", label: "Site" }, { value: "remote", label: "Remote" },
];

let zoneOptions: SelectOption[] | null = null;
function timezoneOptions(): SelectOption[] {
  if (!zoneOptions) {
    // Some browsers list old names (Asia/Calcutta); show the current IANA names instead.
    const modern: Record<string, string> = {
      "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh",
      "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv", "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    };
    const zones = Array.from(new Set(allTimeZones().map((z) => modern[z] ?? z))).sort();
    zoneOptions = zones.map((z) => ({ value: z, label: z.replace(/_/g, " "), description: timeZoneOffsetLabel(z) }));
  }
  return zoneOptions;
}

const address = (l: Location) => [l.address_line1, l.address_line2, [l.city, l.state_name].filter(Boolean).join(", "), l.pincode].filter(Boolean).join(", ");

type Tab = "locations" | "regions";

export default function LocationsPage() {
  const [tab, setTab] = useState<Tab>("locations");
  const [newKey, setNewKey] = useState(0);
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Regions & locations"
        description="Your offices, branches and sites, grouped into regions. A location's state decides Professional Tax, LWF and holidays."
        actions={<Button variant="primary" icon={Plus} onClick={() => setNewKey((k) => k + 1)}>{tab === "locations" ? "New location" : "New region"}</Button>} />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "locations", label: "Locations", icon: MapPin }, { value: "regions", label: "Regions", icon: MapIcon }]} />
      {tab === "locations" ? <LocationsTab newKey={newKey} /> : <RegionsTab newKey={newKey} />}
    </div>
  );
}

/* ══ Locations ═══════════════════════════════════════════════════════════ */

function LocationsTab({ newKey }: { newKey: number }) {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Location>("/organization/locations", "Couldn't load locations");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Location | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Location | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (l: Location) => { setViewing(l); setViewOpen(true); };
  const openForm = (l: Location | "new") => { setFormKey((k) => k + 1); setFormFor(l); setFormOpen(true); };

  // The page header's "New" button bumps newKey.
  const [seenKey, setSeenKey] = useState(newKey);
  if (newKey !== seenKey) { setSeenKey(newKey); setFormKey((k) => k + 1); setFormFor("new"); setFormOpen(true); }

  const regionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of all) if (l.region_id) seen.set(String(l.region_id), l.region_name || "");
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const region = filters.region?.[0];
    const kind = filters.kind?.[0];
    return all.filter((l) => (!q || [l.name, l.code, l.city, l.state_name, l.region_name].some((x) => (x || "").toLowerCase().includes(q))) &&
      matchesStatus(l.active, filters) && (!region || String(l.region_id) === region) && (!kind || l.kind === kind));
  }, [all, search, filters]);

  async function toggle(l: Location) {
    const ok = await switchActive({ path: `/organization/locations/${l.uuid}`, name: l.name, active: l.active,
      message: "People here keep it on their record, but it can't be picked for anyone new." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Location>[] = [
    {
      key: "name", header: "Location", sortable: true, sortValue: (l) => l.name,
      cell: (l) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><MapPin size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{l.name}{l.code && <span className="ml-2 font-mono text-[12px] text-faint">{l.code}</span>}</p>
            <p className="truncate text-[12.5px] text-muted">{[l.city, l.state_name].filter(Boolean).join(", ") || "No address yet"}</p>
          </div>
        </div>
      ),
    },
    { key: "kind", header: "Type", sortable: true, sortValue: (l) => l.kind_label, hideBelow: "sm", cell: (l) => l.kind_label ? <Badge tone={l.kind === "head_office" ? "accent" : "neutral"}>{l.kind_label}</Badge> : <Dash /> },
    { key: "region", header: "Region", sortable: true, sortValue: (l) => l.region_name, hideBelow: "md", cell: (l) => l.region_name ? <span className="text-ink/80">{l.region_name}</span> : <Dash /> },
    { key: "entity", header: "Legal entity", sortable: true, sortValue: (l) => l.legal_entity_name, hideBelow: "lg", cell: (l) => l.legal_entity_name ? <span className="text-ink/80">{l.legal_entity_name}</span> : <Dash /> },
    { key: "employees", header: "Employees", align: "right", sortable: true, sortValue: (l) => l.employee_count, cell: (l) => <span className="tabular text-muted">{l.employee_count}</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (l) => <StatusBadge active={l.active} /> },
  ];

  const filtered = !!search || Object.values(filters).some((x) => x?.length);
  return (
    <>
      <FilterBar
        searchPlaceholder="Search by name, city or state"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "kind", label: "Type", options: KINDS.map((k) => ({ value: k.value, label: k.label })) },
          ...(regionOptions.length ? [{ key: "region", label: "Region", options: regionOptions }] : []),
          STATUS_FILTER,
        ]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(l) => l.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(l) => [
          { label: "View details", icon: Eye, onSelect: () => openView(l) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(l) },
          "separator",
          l.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(l) } : { label: "Switch on", icon: Power, onSelect: () => toggle(l) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={MapPin}
        emptyTitle={filtered ? "No locations match" : "No locations yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add your head office and branches. Each location's state sets its tax and holiday rules."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New location</Button>}
      />
      <LocationDetailModal location={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(l) => { setViewOpen(false); openForm(l); }} onToggle={toggle} />
      <LocationFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </>
  );
}

function LocationFormModal({ target, open, onClose, onSaved }: { target: Location | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const regions = useOptions<Region>("/organization/regions", (r) => ({ value: r.id, label: r.name }), (r) => r.active || r.id === editing?.region_id);
  const entities = useOptions<Entity>("/organization/legal-entities", (e) => ({ value: e.id, label: e.name }), (e) => e.active || e.id === editing?.legal_entity_id);
  const initial = {
    name: editing?.name ?? "", code: editing?.code ?? "", kind: editing?.kind ?? "branch",
    region: editing?.region_id ?? null, entity: editing?.legal_entity_id ?? null,
    line1: editing?.address_line1 ?? "", line2: editing?.address_line2 ?? "", city: editing?.city ?? "",
    state: editing?.state_id ?? null, pincode: editing?.pincode ?? "", timezone: editing?.timezone ?? "Asia/Kolkata",
    lat: editing?.latitude != null ? String(editing.latitude) : "", lng: editing?.longitude != null ? String(editing.longitude) : "", radius: (editing ? editing.radius_m : 200) as number | null,
    phone: editing?.phone ?? "", email: editing?.email ?? "",
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<{ name?: string; state?: string; pincode?: string; coords?: string }>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const cf = useCustomFieldDraft("location", editing?.custom);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty;
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));

  function locateMe() {
    if (!navigator.geolocation) { toast.error("Your browser can't share its location"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setV((p) => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setErrors((e) => ({ ...e, coords: undefined }));
        setLocating(false);
      },
      (err) => { setLocating(false); toast.error("Couldn't get your location", { description: err.code === err.PERMISSION_DENIED ? "Allow location access in your browser and try again." : err.message }); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!v.name.trim()) errs.name = "Give the location a name";
    if (!v.state && !editing) errs.state = "Pick the state";
    if (v.pincode.trim() && !/^\d{6}$/.test(v.pincode.trim())) errs.pincode = "Enter a 6-digit PIN code";
    const lat = v.lat.trim() ? Number(v.lat) : null, lng = v.lng.trim() ? Number(v.lng) : null;
    if ((lat === null) !== (lng === null)) errs.coords = "Enter both latitude and longitude";
    else if (lat !== null && lng !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) errs.coords = "These don't look like map coordinates";
    setErrors(errs);
    if (!cf.check() || Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = {
        custom: cf.values,
        name: v.name.trim(), code: orNull(v.code), kind: v.kind, region_id: v.region, legal_entity_id: v.entity,
        address_line1: orNull(v.line1), address_line2: orNull(v.line2), city: orNull(v.city), state_id: v.state, pincode: orNull(v.pincode),
        timezone: v.timezone || null, latitude: lat, longitude: lng, radius_m: v.radius, phone: orNull(v.phone), email: orNull(v.email),
      };
      if (editing) { await api.put(`/organization/locations/${editing.uuid}`, payload); toast.success("Location updated"); }
      else { await api.post("/organization/locations", payload); toast.success("Location created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the location", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New location"}
      description={editing ? undefined : "An office, branch or site where people work."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="location-form" loading={saving}>{editing ? "Save changes" : "Create location"}</Button></>}>
      <form id="location-form" onSubmit={submit} noValidate>
        <FormSection title="Basics">
          <FormGrid>
            <Field label="Name" required error={errors.name}>
              <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErrors({ ...errors, name: undefined }); }} placeholder="e.g. Bengaluru HQ" maxLength={150} />
            </Field>
            <Field label="Short code" aside="Optional">
              <TextInput value={v.code} onValueChange={(x) => set("code", x.toUpperCase())} maxLength={20} placeholder="e.g. BLR" className="font-mono" />
            </Field>
            <Field label="Type">
              <Select value={v.kind} onChange={(x) => set("kind", x ?? "branch")} options={KINDS} />
            </Field>
            <Field label="Region" aside="Optional">
              <Select value={v.region} onChange={(x) => set("region", x)} options={regions} clearable placeholder="No region" />
            </Field>
            <Field label="Legal entity" aside="Optional" className="sm:col-span-2">
              <Select value={v.entity} onChange={(x) => set("entity", x)} options={entities} clearable placeholder="Pick the company that employs people here" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Address">
          <FormGrid>
            <Field label="Address line 1" className="sm:col-span-2">
              <TextInput value={v.line1} onValueChange={(x) => set("line1", x)} placeholder="Building, floor, street" />
            </Field>
            <Field label="Address line 2" className="sm:col-span-2">
              <TextInput value={v.line2} onValueChange={(x) => set("line2", x)} placeholder="Area, landmark" />
            </Field>
            <Field label="City">
              <TextInput value={v.city} onValueChange={(x) => set("city", x)} maxLength={100} />
            </Field>
            <Field label="State" required={!editing} error={errors.state} hint="Decides Professional Tax, LWF and holidays">
              <MasterSelect type="state" value={v.state} onChange={(x) => { set("state", x); setErrors({ ...errors, state: undefined }); }} clearable={!!editing} placeholder="Pick a state" />
            </Field>
            <Field label="PIN code" error={errors.pincode}>
              <TextInput value={v.pincode} onValueChange={(x) => { set("pincode", x.replace(/\D/g, "").slice(0, 6)); setErrors({ ...errors, pincode: undefined }); }} inputMode="numeric" placeholder="560001" className="tabular" />
            </Field>
            <Field label="Timezone">
              <Select value={v.timezone || null} onChange={(x) => set("timezone", x ?? "")} options={timezoneOptions()} placeholder="Same as company" clearable />
            </Field>
            <Field label="Phone" aside="Optional">
              <TextInput value={v.phone} onValueChange={(x) => set("phone", x)} type="tel" maxLength={20} placeholder="+91 80 1234 5678" />
            </Field>
            <Field label="Email" aside="Optional">
              <TextInput value={v.email} onValueChange={(x) => set("email", x)} type="email" placeholder="office@company.com" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Attendance boundary" description="People can mark attendance from the app only within this distance of the location.">
          <FormGrid columns={3}>
            <Field label="Latitude" error={errors.coords}>
              <TextInput value={v.lat} inputMode="decimal" placeholder="12.9716" className="tabular"
                onValueChange={(x) => { set("lat", x.replace(/[^\d.-]/g, "")); setErrors({ ...errors, coords: undefined }); }} />
            </Field>
            <Field label="Longitude">
              <TextInput value={v.lng} inputMode="decimal" placeholder="77.5946" className="tabular"
                onValueChange={(x) => { set("lng", x.replace(/[^\d.-]/g, "")); setErrors({ ...errors, coords: undefined }); }} />
            </Field>
            <Field label="Radius" hint="Attendance boundary">
              <NumberInput value={v.radius} onChange={(x) => set("radius", x)} min={10} max={100000} step={25} suffix="m" />
            </Field>
          </FormGrid>
          <div className="mt-3">
            <Button size="sm" icon={Crosshair} loading={locating} onClick={locateMe}>Use my current location</Button>
          </div>
        </FormSection>
        <CustomFields entity="location" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
    </Modal>
  );
}

function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.006},${lng + 0.01},${lat + 0.006}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <iframe title="Map" src={src} className="block h-[220px] w-full border-0" loading="lazy" referrerPolicy="no-referrer" />
    </div>
  );
}

function LocationDetailModal({ location: l, open, onClose, onEdit, onToggle }: {
  location: Location | null; open: boolean; onClose: () => void; onEdit: (l: Location) => void; onToggle: (l: Location) => void;
}) {
  const lat = toNumber(l?.latitude), lng = toNumber(l?.longitude);
  return (
    <Modal open={open && !!l} onClose={onClose} size="lg"
      title={l?.name}
      description={l ? [l.kind_label, [l.city, l.state_name].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || undefined : undefined}
      leading={l && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><MapPin size={20} strokeWidth={1.4} /></span>}
      headerActions={l && <Button size="sm" icon={Pencil} onClick={() => onEdit(l)}>Edit</Button>}
      footer={l && (l.active ? <Button icon={PowerOff} onClick={() => onToggle(l)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(l)}>Switch on</Button>)}>
      {l && (
        <>
          <Section title="Overview">
            <KeyValue columns={3} items={[
              { label: "Code", value: l.code && <span className="font-mono text-[13px]">{l.code}</span> },
              { label: "Region", value: l.region_name },
              { label: "Status", value: <StatusBadge active={l.active} /> },
              { label: "Legal entity", value: l.legal_entity_name },
              { label: "Employees", value: <span className="tabular">{l.employee_count}</span> },
              { label: "Timezone", value: l.timezone && <span>{l.timezone.replace(/_/g, " ")} <span className="text-muted">{timeZoneOffsetLabel(l.timezone)}</span></span> },
            ]} />
          </Section>
          <Section title="Address and contact" className="border-t border-line">
            <KeyValue columns={3} items={[
              { label: "Address", value: address(l), span: 3 },
              { label: "State", value: l.state_name },
              { label: "Phone", value: l.phone },
              { label: "Email", value: l.email },
            ]} />
          </Section>
          <Section title="Attendance boundary" className="border-t border-line"
            description={lat !== null && lng !== null ? `People can mark attendance within ${l.radius_m ?? 0} m of this point.` : undefined}>
            {lat !== null && lng !== null ? (
              <>
                <MapPreview lat={lat} lng={lng} />
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                  <span className="tabular">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                  <span>Radius {l.radius_m ?? 0} m</span>
                  <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open the map</a>
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">
                <Crosshair size={16} strokeWidth={1.4} className="text-faint" /> No map point yet. Edit the location to set one.
              </p>
            )}
          </Section>
          <div className="border-t border-line empty:hidden"><CustomFields entity="location" mode="view" values={l.custom} /></div>
        </>
      )}
    </Modal>
  );
}

/* ══ Regions ═════════════════════════════════════════════════════════════ */

function RegionsTab({ newKey }: { newKey: number }) {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Region>("/organization/regions", "Couldn't load regions");
  const locations = useList<Location>("/organization/locations", "Couldn't load locations");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Region | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Region | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (r: Region) => { setViewing(r); setViewOpen(true); };
  const openForm = (r: Region | "new") => { setFormKey((k) => k + 1); setFormFor(r); setFormOpen(true); };

  const [seenKey, setSeenKey] = useState(newKey);
  if (newKey !== seenKey) { setSeenKey(newKey); setFormKey((k) => k + 1); setFormFor("new"); setFormOpen(true); }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => (!q || [r.name, r.code, r.description, r.head?.name].some((x) => (x || "").toLowerCase().includes(q))) && matchesStatus(r.active, filters));
  }, [all, search, filters]);

  async function toggle(r: Region) {
    const ok = await switchActive({ path: `/organization/regions/${r.uuid}`, name: r.name, active: r.active,
      message: "Its locations keep working, but the region can't be picked for new locations." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Region>[] = [
    {
      key: "name", header: "Region", sortable: true, sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><MapIcon size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{r.name}{r.code && <span className="ml-2 font-mono text-[12px] text-faint">{r.code}</span>}</p>
            {r.description && <p className="truncate text-[12.5px] text-muted">{r.description}</p>}
          </div>
        </div>
      ),
    },
    { key: "head", header: "Head", sortable: true, sortValue: (r) => r.head?.name, hideBelow: "sm", cell: (r) => <PersonInline person={r.head} /> },
    { key: "locations", header: "Locations", align: "right", sortable: true, sortValue: (r) => r.location_count, cell: (r) => <span className="tabular text-muted">{r.location_count}</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (r) => <StatusBadge active={r.active} /> },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <>
      <FilterBar
        searchPlaceholder="Search regions"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(r) => r.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(r) => [
          { label: "View details", icon: Eye, onSelect: () => openView(r) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(r) },
          "separator",
          r.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(r) } : { label: "Switch on", icon: Power, onSelect: () => toggle(r) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={MapIcon}
        emptyTitle={filtered ? "No regions match" : "No regions yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Group locations into regions such as South or West."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New region</Button>}
      />
      <RegionDetailModal region={viewing} locations={locations.rows} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(r) => { setViewOpen(false); openForm(r); }} onToggle={toggle} />
      <RegionFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </>
  );
}

function RegionFormModal({ target, open, onClose, onSaved }: { target: Region | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const initial = { name: editing?.name ?? "", code: editing?.code ?? "", description: editing?.description ?? "", head: editing?.head_employee_id ?? null };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the region a name"); return; }
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), code: orNull(v.code), description: orNull(v.description), head_employee_id: v.head };
      if (editing) { await api.put(`/organization/regions/${editing.uuid}`, payload); toast.success("Region updated"); }
      else { await api.post("/organization/regions", payload); toast.success("Region created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the region", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New region"}
      description={editing ? undefined : "A group of locations, such as South or West."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="region-form" loading={saving}>{editing ? "Save changes" : "Create region"}</Button></>}>
      <form id="region-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. South" maxLength={150} />
          </Field>
          <Field label="Short code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} placeholder="e.g. S" className="font-mono" />
          </Field>
          <Field label="Region head" aside="Optional" className="sm:col-span-2">
            <Select value={v.head} onChange={(x) => setV({ ...v, head: x })} loadOptions={searchEmployees} clearable placeholder="Search people"
              selectedOption={editing?.head_employee_id ? { value: editing.head_employee_id, label: editing.head?.name || "Current head" } : null} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="Which states or cities it covers" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function RegionDetailModal({ region: r, locations, open, onClose, onEdit, onToggle }: {
  region: Region | null; locations: Location[]; open: boolean; onClose: () => void; onEdit: (r: Region) => void; onToggle: (r: Region) => void;
}) {
  const list = r ? locations.filter((l) => l.region_id === r.id) : [];
  return (
    <Modal open={open && !!r} onClose={onClose} size="md"
      title={r?.name}
      description={r?.description || undefined}
      leading={r && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><MapIcon size={20} strokeWidth={1.4} /></span>}
      headerActions={r && <Button size="sm" icon={Pencil} onClick={() => onEdit(r)}>Edit</Button>}
      footer={r && (r.active ? <Button icon={PowerOff} onClick={() => onToggle(r)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(r)}>Switch on</Button>)}>
      {r && (
        <>
          <Section title="Overview">
            <KeyValue columns={2} items={[
              { label: "Code", value: r.code && <span className="font-mono text-[13px]">{r.code}</span> },
              { label: "Status", value: <StatusBadge active={r.active} /> },
              { label: "Head", value: r.head && <span className="flex items-center gap-2"><Avatar name={r.head.name} src={r.head.photo} size={24} />{r.head.name}</span>, span: 2 },
            ]} />
          </Section>
          <Section title="Locations" description={`${list.length} in this region`} className="border-t border-line">
            {list.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">
                <MapPin size={16} strokeWidth={1.4} className="text-faint" /> No locations yet. Pick this region on a location to add it.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {list.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <MapPin size={16} strokeWidth={1.4} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">{l.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[l.kind_label, l.city, l.state_name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="tabular text-[12.5px] text-muted">{l.employee_count} {l.employee_count === 1 ? "person" : "people"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
}
