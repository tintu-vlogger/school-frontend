"use client";

/*
 * Legal entities: the companies people are employed by, each with its own statutory IDs,
 * state registrations (PT, LWF, shops), bank accounts and signatory. FilterBar + DataTable;
 * row click opens the detail modal; New / Edit open a tabbed form modal; entities are
 * switched off, never deleted.
 */
import { useMemo, useState } from "react";
import { Eye, Landmark, Pencil, Plus, Power, PowerOff, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { CustomFields, useCustomFieldDraft, type CustomValues } from "@/components/custom-fields";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, IconButton, KeyValue, MasterSelect, Modal, ModalCancel, Section,
  Select, Tabs, TextInput, Toggle, paginate, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { Dash, STATUS_FILTER, StatusBadge, errorText, matchesStatus, orNull, useList, useSwitchActive } from "@/components/org/shared";

type Kind = "pt" | "lwf" | "shops";
interface Registration { kind: Kind; state_id: number | null; number: string; valid_from: string | null; valid_to: string | null; state_name?: string | null; kind_label?: string | null }
interface BankAccount { bank_id: number | null; account_name: string | null; account_number: string; ifsc: string; branch: string | null; purpose: string | null; primary: boolean; bank_name?: string | null }
interface Signatory { name?: string | null; designation?: string | null; pan?: string | null; email?: string | null; phone?: string | null }
interface Entity {
  id: number; uuid: string; name: string; legal_name: string | null; code: string | null;
  pan: string | null; tan: string | null; cin: string | null; gstin: string | null; pf_code: string | null; esi_code: string | null; lin: string | null;
  incorporation_date: string | null; address_line1: string | null; address_line2: string | null; city: string | null;
  state_id: number | null; state_name: string | null; pincode: string | null; email: string | null; phone: string | null;
  registrations: Registration[] | null; bank_accounts: BankAccount[] | null; signatory: Signatory | null;
  is_primary: boolean; active: boolean; employee_count: number;
  custom?: CustomValues;
}

const KINDS: SelectOption<Kind>[] = [
  { value: "pt", label: "Professional Tax" }, { value: "lwf", label: "Labour Welfare Fund" }, { value: "shops", label: "Shops and establishments" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

const mono = (s: string | null | undefined) => (s ? <span className="font-mono text-[13px]">{s}</span> : null);
const addressOf = (e: Entity) => [e.address_line1, e.address_line2, [e.city, e.state_name].filter(Boolean).join(", "), e.pincode].filter(Boolean).join(", ");

export default function EntitiesPage() {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Entity>("/organization/legal-entities", "Couldn't load legal entities");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Entity | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Entity | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (e: Entity) => { setViewing(e); setViewOpen(true); };
  const openForm = (e: Entity | "new") => { setFormKey((k) => k + 1); setFormFor(e); setFormOpen(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((e) => (!q || [e.name, e.legal_name, e.code, e.pan, e.gstin, e.city].some((x) => (x || "").toLowerCase().includes(q))) && matchesStatus(e.active, filters));
  }, [all, search, filters]);

  async function toggle(e: Entity) {
    const ok = await switchActive({ path: `/organization/legal-entities/${e.uuid}`, name: e.name, active: e.active,
      message: "People employed by it keep their records, but it can't be picked for new joiners, locations or payroll." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Entity>[] = [
    {
      key: "name", header: "Entity", sortable: true, sortValue: (e) => e.name,
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Landmark size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{e.name}</p>
            {e.legal_name && <p className="truncate text-[12.5px] text-muted">{e.legal_name}</p>}
          </div>
        </div>
      ),
    },
    { key: "pan", header: "PAN", sortable: true, sortValue: (e) => e.pan, hideBelow: "md", cell: (e) => e.pan ? <span className="font-mono text-[12.5px] text-muted">{e.pan}</span> : <Dash /> },
    { key: "gstin", header: "GSTIN", sortable: true, sortValue: (e) => e.gstin, hideBelow: "lg", cell: (e) => e.gstin ? <span className="font-mono text-[12.5px] text-muted">{e.gstin}</span> : <Dash /> },
    { key: "state", header: "State", sortable: true, sortValue: (e) => e.state_name, hideBelow: "sm", cell: (e) => e.state_name ? <span className="text-ink/80">{e.state_name}</span> : <Dash /> },
    { key: "employees", header: "Employees", align: "right", sortable: true, sortValue: (e) => e.employee_count, cell: (e) => <span className="tabular text-muted">{e.employee_count}</span> },
    {
      key: "status", header: "Status", hideBelow: "sm", sortable: true, sortValue: (e) => (e.is_primary ? 0 : 1),
      cell: (e) => <span className="flex items-center gap-1.5">{e.is_primary && <Badge tone="accent">Primary</Badge>}<StatusBadge active={e.active} /></span>,
    },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Legal entities" description="The companies that employ your people, with their tax IDs, state registrations, bank accounts and signatory."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New entity</Button>} />
      <FilterBar
        searchPlaceholder="Search by name, PAN or GSTIN"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(e) => e.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(e) => [
          { label: "View details", icon: Eye, onSelect: () => openView(e) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(e) },
          "separator",
          e.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(e) } : { label: "Switch on", icon: Power, onSelect: () => toggle(e) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Landmark}
        emptyTitle={filtered ? "No entities match" : "No legal entities yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add the company that employs your people, with its PAN, TAN and registrations."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New entity</Button>}
      />

      <EntityDetailModal entity={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(e) => { setViewOpen(false); openForm(e); }} onToggle={toggle} />
      <EntityFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

type RegRow = { k: number; kind: Kind; state_id: number | null; number: string; valid_from: string; valid_to: string };
type BankRow = { k: number; bank_id: number | null; account_name: string; account_number: string; ifsc: string; branch: string; purpose: string; primary: boolean };
type FormTab = "details" | "registrations" | "banks" | "signatory";
type Errors = Record<string, string>;

let rowSeq = 0;
const nextKey = () => ++rowSeq;

function initialFor(e: Entity | null) {
  return {
    name: e?.name ?? "", legal_name: e?.legal_name ?? "", code: e?.code ?? "",
    pan: e?.pan ?? "", tan: e?.tan ?? "", cin: e?.cin ?? "", gstin: e?.gstin ?? "", pf_code: e?.pf_code ?? "", esi_code: e?.esi_code ?? "", lin: e?.lin ?? "",
    incorporation_date: e?.incorporation_date ?? "",
    address_line1: e?.address_line1 ?? "", address_line2: e?.address_line2 ?? "", city: e?.city ?? "", state_id: e?.state_id ?? null,
    pincode: e?.pincode ?? "", email: e?.email ?? "", phone: e?.phone ?? "", is_primary: e?.is_primary ?? false,
    registrations: (e?.registrations ?? []).map<RegRow>((r) => ({ k: nextKey(), kind: r.kind, state_id: r.state_id ?? null, number: r.number ?? "", valid_from: r.valid_from ?? "", valid_to: r.valid_to ?? "" })),
    banks: (e?.bank_accounts ?? []).map<BankRow>((b) => ({
      k: nextKey(), bank_id: b.bank_id ?? null, account_name: b.account_name ?? "", account_number: b.account_number ?? "",
      ifsc: b.ifsc ?? "", branch: b.branch ?? "", purpose: b.purpose ?? "", primary: !!b.primary,
    })),
    signatory: { name: e?.signatory?.name ?? "", designation: e?.signatory?.designation ?? "", pan: e?.signatory?.pan ?? "", email: e?.signatory?.email ?? "", phone: e?.signatory?.phone ?? "" },
  };
}
type FormState = ReturnType<typeof initialFor>;

function validate(v: FormState): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = "Give the entity a name";
  if (v.pan.trim() && !PAN_RE.test(v.pan.trim())) e.pan = "PAN looks like ABCDE1234F";
  if (v.gstin.trim() && !GSTIN_RE.test(v.gstin.trim())) e.gstin = "GSTIN has 15 characters, like 29ABCDE1234F1Z5";
  if (v.pincode.trim() && !/^\d{6}$/.test(v.pincode.trim())) e.pincode = "Enter a 6-digit PIN code";
  v.registrations.forEach((r, i) => {
    if (!r.number.trim()) e[`reg${i}.number`] = "Enter the registration number";
    if (!r.state_id) e[`reg${i}.state`] = "Pick the state";
    if (r.valid_from && r.valid_to && r.valid_to < r.valid_from) e[`reg${i}.valid_to`] = "Ends before it starts";
  });
  v.banks.forEach((b, i) => {
    if (!b.account_number.trim()) e[`bank${i}.account_number`] = "Enter the account number";
    if (!b.ifsc.trim()) e[`bank${i}.ifsc`] = "Enter the IFSC";
    else if (!IFSC_RE.test(b.ifsc.trim())) e[`bank${i}.ifsc`] = "IFSC looks like HDFC0001234";
  });
  if (v.signatory.pan.trim() && !PAN_RE.test(v.signatory.pan.trim())) e["sig.pan"] = "PAN looks like ABCDE1234F";
  return e;
}

const tabOf = (key: string): FormTab => key.startsWith("reg") ? "registrations" : key.startsWith("bank") ? "banks" : key.startsWith("sig") ? "signatory" : "details";

function EntityFormModal({ target, open, onClose, onSaved }: { target: Entity | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const [initial] = useState(() => initialFor(editing));
  const [v, setV] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [tab, setTab] = useState<FormTab>("details");
  const [saving, setSaving] = useState(false);
  const cf = useCustomFieldDraft("legal_entity", editing?.custom);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty;

  const set = <K extends keyof FormState>(k: K, x: FormState[K]) => { setV((p) => ({ ...p, [k]: x })); clear(String(k)); };
  const clear = (key: string) => setErrors((e) => { if (!(key in e)) return e; const n = { ...e }; delete n[key]; return n; });
  const setReg = (i: number, patch: Partial<RegRow>) => setV((p) => ({ ...p, registrations: p.registrations.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const setBank = (i: number, patch: Partial<BankRow>) => setV((p) => ({
    ...p, banks: p.banks.map((b, j) => (j === i ? { ...b, ...patch } : patch.primary ? { ...b, primary: false } : b)),
  }));
  const setSig = (k: keyof FormState["signatory"], x: string) => { setV((p) => ({ ...p, signatory: { ...p.signatory, [k]: x } })); clear(`sig.${k}`); };

  const counts = useMemo(() => {
    const c: Record<FormTab, number> = { details: 0, registrations: 0, banks: 0, signatory: 0 };
    for (const k of Object.keys(errors)) c[tabOf(k)]++;
    return c;
  }, [errors]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const errs = validate(v);
    setErrors(errs);
    const keys = Object.keys(errs);
    if (keys.length) {
      if (!keys.some((k) => tabOf(k) === tab)) setTab(tabOf(keys[0]));
      return;
    }
    if (!cf.check()) { setTab("details"); return; }
    setSaving(true);
    try {
      const sig = v.signatory;
      const payload = {
        name: v.name.trim(), legal_name: orNull(v.legal_name), code: orNull(v.code),
        pan: orNull(v.pan), tan: orNull(v.tan), cin: orNull(v.cin), gstin: orNull(v.gstin), pf_code: orNull(v.pf_code), esi_code: orNull(v.esi_code), lin: orNull(v.lin),
        incorporation_date: v.incorporation_date || null,
        address_line1: orNull(v.address_line1), address_line2: orNull(v.address_line2), city: orNull(v.city), state_id: v.state_id,
        pincode: orNull(v.pincode), email: orNull(v.email), phone: orNull(v.phone), is_primary: v.is_primary,
        registrations: v.registrations.map((r) => ({ kind: r.kind, state_id: r.state_id, number: r.number.trim(), valid_from: r.valid_from || null, valid_to: r.valid_to || null })),
        bank_accounts: v.banks.map((b) => ({
          bank_id: b.bank_id, account_name: orNull(b.account_name), account_number: b.account_number.trim(), ifsc: b.ifsc.trim(),
          branch: orNull(b.branch), purpose: orNull(b.purpose), primary: b.primary,
        })),
        signatory: { name: orNull(sig.name), designation: orNull(sig.designation), pan: orNull(sig.pan), email: orNull(sig.email), phone: orNull(sig.phone) },
        custom: cf.values,
      };
      if (editing) { await api.put(`/organization/legal-entities/${editing.uuid}`, payload); toast.success("Legal entity updated"); }
      else { await api.post("/organization/legal-entities", payload); toast.success("Legal entity created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the legal entity", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  const label = (t: string, n: number) => (n ? `${t} (${n} to fix)` : t);
  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New legal entity"}
      description={editing ? undefined : "A company that employs people, with its own tax IDs and registrations."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="entity-form" loading={saving}>{editing ? "Save changes" : "Create entity"}</Button></>}>
      <Tabs className="-mt-1 mb-6" value={tab} onChange={setTab} items={[
        { value: "details", label: label("Details", counts.details) },
        { value: "registrations", label: label("Registrations", counts.registrations), count: counts.registrations ? undefined : v.registrations.length || undefined },
        { value: "banks", label: label("Bank accounts", counts.banks), count: counts.banks ? undefined : v.banks.length || undefined },
        { value: "signatory", label: label("Signatory", counts.signatory) },
      ]} />
      <form id="entity-form" onSubmit={submit} noValidate>
        {tab === "details" && (
          <div>
            <FormSection title="Basics">
              <FormGrid columns={3}>
                <Field label="Name" required error={errors.name}>
                  <TextInput autoFocusInModal value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Next Gen India" maxLength={200} />
                </Field>
                <Field label="Registered name" aside="As on the certificate">
                  <TextInput value={v.legal_name} onValueChange={(x) => set("legal_name", x)} placeholder="e.g. Next Gen India Private Limited" maxLength={250} />
                </Field>
                <Field label="Short code" aside="Optional" hint="Shown as {ENTITY} in numbers such as employee IDs">
                  <TextInput value={v.code} onValueChange={(x) => set("code", x.toUpperCase())} maxLength={20} placeholder="e.g. NGI" className="font-mono" />
                </Field>
                <Field label="Incorporated on">
                  <DateInput value={v.incorporation_date} onChange={(x) => set("incorporation_date", x)} clearable />
                </Field>
                <div className="flex items-end pb-2 sm:col-span-2">
                  <Toggle checked={v.is_primary} onChange={(x) => set("is_primary", x)} label="Primary entity" description="Used by default for new joiners and payroll" />
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title="Tax and statutory IDs">
              <FormGrid columns={3}>
                <Field label="PAN" error={errors.pan}>
                  <TextInput value={v.pan} onValueChange={(x) => set("pan", x.toUpperCase().replace(/\s/g, ""))} maxLength={10} placeholder="ABCDE1234F" className="font-mono" />
                </Field>
                <Field label="TAN">
                  <TextInput value={v.tan} onValueChange={(x) => set("tan", x.toUpperCase().replace(/\s/g, ""))} maxLength={10} placeholder="BLRA12345B" className="font-mono" />
                </Field>
                <Field label="CIN">
                  <TextInput value={v.cin} onValueChange={(x) => set("cin", x.toUpperCase().replace(/\s/g, ""))} maxLength={21} placeholder="U72900KA2018PTC112233" className="font-mono" />
                </Field>
                <Field label="GSTIN" error={errors.gstin}>
                  <TextInput value={v.gstin} onValueChange={(x) => set("gstin", x.toUpperCase().replace(/\s/g, ""))} maxLength={15} placeholder="29ABCDE1234F1Z5" className="font-mono" />
                </Field>
                <Field label="PF code">
                  <TextInput value={v.pf_code} onValueChange={(x) => set("pf_code", x.toUpperCase())} maxLength={30} className="font-mono" />
                </Field>
                <Field label="ESI code">
                  <TextInput value={v.esi_code} onValueChange={(x) => set("esi_code", x)} maxLength={30} className="font-mono" />
                </Field>
                <Field label="LIN" hint="Labour Identification Number">
                  <TextInput value={v.lin} onValueChange={(x) => set("lin", x)} maxLength={20} className="font-mono" />
                </Field>
              </FormGrid>
            </FormSection>

            <FormSection title="Registered address">
              <FormGrid columns={3}>
                <Field label="Address line 1" className="sm:col-span-2 lg:col-span-3">
                  <TextInput value={v.address_line1} onValueChange={(x) => set("address_line1", x)} placeholder="Building, floor, street" />
                </Field>
                <Field label="Address line 2" className="sm:col-span-2 lg:col-span-3">
                  <TextInput value={v.address_line2} onValueChange={(x) => set("address_line2", x)} placeholder="Area, landmark" />
                </Field>
                <Field label="City">
                  <TextInput value={v.city} onValueChange={(x) => set("city", x)} maxLength={100} />
                </Field>
                <Field label="State">
                  <MasterSelect type="state" value={v.state_id} onChange={(x) => set("state_id", x)} clearable placeholder="Pick a state" />
                </Field>
                <Field label="PIN code" error={errors.pincode}>
                  <TextInput value={v.pincode} onValueChange={(x) => set("pincode", x.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="560001" className="tabular" />
                </Field>
                <Field label="Email">
                  <TextInput type="email" value={v.email} onValueChange={(x) => set("email", x)} placeholder="compliance@company.com" maxLength={255} />
                </Field>
                <Field label="Phone">
                  <TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} placeholder="+91 80 1234 5678" maxLength={20} />
                </Field>
              </FormGrid>
            </FormSection>
            <CustomFields entity="legal_entity" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
          </div>
        )}

        {tab === "registrations" && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-muted">Professional Tax, Labour Welfare Fund and shop registrations, one per state.</p>
            {v.registrations.map((r, i) => (
              <RowCard key={r.k} title={`${kindLabel(r.kind)}${r.number ? ` · ${r.number}` : ""}`} onRemove={() => setV((p) => ({ ...p, registrations: p.registrations.filter((_, j) => j !== i) }))} removeLabel="Remove registration">
                <FormGrid columns={3}>
                  <Field label="Type">
                    <Select value={r.kind} onChange={(x) => setReg(i, { kind: x ?? "pt" })} options={KINDS} />
                  </Field>
                  <Field label="State" required error={errors[`reg${i}.state`]}>
                    <MasterSelect type="state" value={r.state_id} onChange={(x) => { setReg(i, { state_id: x }); clear(`reg${i}.state`); }} placeholder="Pick a state" />
                  </Field>
                  <Field label="Registration number" required error={errors[`reg${i}.number`]}>
                    <TextInput value={r.number} onValueChange={(x) => { setReg(i, { number: x }); clear(`reg${i}.number`); }} className="font-mono" />
                  </Field>
                  <Field label="Valid from">
                    <DateInput value={r.valid_from} onChange={(x) => setReg(i, { valid_from: x })} clearable />
                  </Field>
                  <Field label="Valid until" aside="Empty if it doesn't expire" error={errors[`reg${i}.valid_to`]}>
                    <DateInput value={r.valid_to} min={r.valid_from || undefined} onChange={(x) => { setReg(i, { valid_to: x }); clear(`reg${i}.valid_to`); }} clearable />
                  </Field>
                </FormGrid>
              </RowCard>
            ))}
            <AddRow onClick={() => setV((p) => ({ ...p, registrations: [...p.registrations, { k: nextKey(), kind: "pt", state_id: p.state_id, number: "", valid_from: "", valid_to: "" }] }))}>
              Add registration
            </AddRow>
          </div>
        )}

        {tab === "banks" && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-muted">Accounts used for salary payouts and statutory payments. Mark one as primary.</p>
            {v.banks.map((b, i) => (
              <RowCard key={b.k} removeLabel="Remove account" onRemove={() => setV((p) => ({ ...p, banks: p.banks.filter((_, j) => j !== i) }))}
                title={<span className="flex items-center gap-2">{b.purpose || `Account ${i + 1}`}{b.primary && <Badge tone="accent">Primary</Badge>}</span>}>
                <FormGrid columns={3}>
                  <Field label="Bank">
                    <MasterSelect type="bank" value={b.bank_id} onChange={(x) => setBank(i, { bank_id: x })} clearable placeholder="Pick a bank" />
                  </Field>
                  <Field label="Account holder name">
                    <TextInput value={b.account_name} onValueChange={(x) => setBank(i, { account_name: x })} />
                  </Field>
                  <Field label="Account number" required error={errors[`bank${i}.account_number`]}
                    hint={b.account_number.includes("•") ? "Hidden for safety. Leave it to keep the saved number." : undefined}>
                    <TextInput value={b.account_number} onValueChange={(x) => { setBank(i, { account_number: x.replace(/\s/g, "") }); clear(`bank${i}.account_number`); }}
                      onFocus={(e) => { if (e.currentTarget.value.includes("•")) e.currentTarget.select(); }} className="font-mono" inputMode="numeric" />
                  </Field>
                  <Field label="IFSC" required error={errors[`bank${i}.ifsc`]}>
                    <TextInput value={b.ifsc} onValueChange={(x) => { setBank(i, { ifsc: x.toUpperCase().replace(/\s/g, "") }); clear(`bank${i}.ifsc`); }} maxLength={11} placeholder="HDFC0001234" className="font-mono" />
                  </Field>
                  <Field label="Branch">
                    <TextInput value={b.branch} onValueChange={(x) => setBank(i, { branch: x })} />
                  </Field>
                  <Field label="Used for">
                    <TextInput value={b.purpose} onValueChange={(x) => setBank(i, { purpose: x })} placeholder="e.g. Salary payouts" />
                  </Field>
                </FormGrid>
                <div className="mt-4">
                  <Toggle size="sm" checked={b.primary} onChange={(x) => setBank(i, { primary: x })} label="Primary account" />
                </div>
              </RowCard>
            ))}
            <AddRow onClick={() => setV((p) => ({ ...p, banks: [...p.banks, { k: nextKey(), bank_id: null, account_name: p.legal_name || p.name, account_number: "", ifsc: "", branch: "", purpose: "", primary: p.banks.length === 0 }] }))}>
              Add bank account
            </AddRow>
          </div>
        )}

        {tab === "signatory" && (
          <div className="space-y-4">
            <p className="text-[13.5px] text-muted">The person who signs statutory returns and letters for this entity.</p>
            <FormGrid columns={2}>
              <Field label="Name">
                <TextInput value={v.signatory.name} onValueChange={(x) => setSig("name", x)} placeholder="e.g. Arjun Mehta" />
              </Field>
              <Field label="Designation">
                <TextInput value={v.signatory.designation} onValueChange={(x) => setSig("designation", x)} placeholder="e.g. Director" />
              </Field>
              <Field label="PAN" error={errors["sig.pan"]}>
                <TextInput value={v.signatory.pan} onValueChange={(x) => setSig("pan", x.toUpperCase().replace(/\s/g, ""))} maxLength={10} placeholder="ABCDE1234F" className="font-mono" />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={v.signatory.email} onValueChange={(x) => setSig("email", x)} />
              </Field>
              <Field label="Phone">
                <TextInput type="tel" value={v.signatory.phone} onValueChange={(x) => setSig("phone", x)} maxLength={20} />
              </Field>
            </FormGrid>
          </div>
        )}
      </form>
    </Modal>
  );
}

function RowCard({ title, onRemove, removeLabel, children }: { title: React.ReactNode; onRemove: () => void; removeLabel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/40 px-4 py-2">
        <p className="min-w-0 truncate text-[13.5px] text-ink">{title}</p>
        <IconButton icon={Trash2} label={removeLabel} onClick={onRemove} />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function AddRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-[13.5px] text-muted transition-colors hover:border-primary/40 hover:bg-primary-soft/40 hover:text-primary">
      <Plus size={15} strokeWidth={1.4} />{children}
    </button>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function EntityDetailModal({ entity: e, open, onClose, onEdit, onToggle }: {
  entity: Entity | null; open: boolean; onClose: () => void; onEdit: (e: Entity) => void; onToggle: (e: Entity) => void;
}) {
  const regs = e?.registrations ?? [];
  const banks = e?.bank_accounts ?? [];
  const sig = e?.signatory;
  const hasSig = !!sig && Object.values(sig).some(Boolean);
  return (
    <Modal open={open && !!e} onClose={onClose} size="lg"
      title={<span className="flex items-center gap-2">{e?.name}{e?.is_primary && <Badge tone="accent"><Star size={11} strokeWidth={1.4} />Primary</Badge>}</span>}
      description={e?.legal_name || undefined}
      leading={e && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Landmark size={20} strokeWidth={1.4} /></span>}
      headerActions={e && <Button size="sm" icon={Pencil} onClick={() => onEdit(e)}>Edit</Button>}
      footer={e && (e.active ? <Button icon={PowerOff} onClick={() => onToggle(e)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(e)}>Switch on</Button>)}>
      {e && (
        <>
          <Section title="Overview">
            <KeyValue columns={3} items={[
              { label: "Code", value: mono(e.code) },
              { label: "Incorporated on", value: e.incorporation_date ? formatDate(e.incorporation_date) : null },
              { label: "Status", value: <StatusBadge active={e.active} /> },
              { label: "Employees", value: <span className="tabular">{e.employee_count}</span> },
              { label: "Email", value: e.email },
              { label: "Phone", value: e.phone },
              { label: "Registered address", value: addressOf(e), span: 3 },
            ]} />
          </Section>
          <Section title="Tax and statutory IDs" className="border-t border-line">
            <KeyValue columns={3} items={[
              { label: "PAN", value: mono(e.pan) }, { label: "TAN", value: mono(e.tan) }, { label: "GSTIN", value: mono(e.gstin) },
              { label: "CIN", value: mono(e.cin) }, { label: "PF code", value: mono(e.pf_code) }, { label: "ESI code", value: mono(e.esi_code) },
              { label: "LIN", value: mono(e.lin) },
            ]} />
          </Section>
          <Section title="Registrations" description={regs.length ? `${regs.length} on record` : undefined} className="border-t border-line">
            {regs.length === 0 ? <EmptyLine>No Professional Tax, LWF or shop registrations yet.</EmptyLine> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {regs.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-ink">{r.kind_label || kindLabel(r.kind)} <span className="text-muted">· {r.state_name || "No state"}</span></span>
                      <span className="block font-mono text-[12.5px] text-muted">{r.number}</span>
                    </span>
                    <span className="text-[12.5px] text-muted">
                      {r.valid_from ? `From ${formatDate(r.valid_from)}` : ""}{r.valid_to ? ` until ${formatDate(r.valid_to)}` : r.valid_from ? ", no end date" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Bank accounts" className="border-t border-line">
            {banks.length === 0 ? <EmptyLine>No bank accounts yet.</EmptyLine> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {banks.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] text-ink">{b.bank_name || "Bank"}{b.branch && <span className="text-muted">· {b.branch}</span>}{b.primary && <Badge tone="accent">Primary</Badge>}</span>
                      <span className="block text-[12.5px] text-muted"><span className="font-mono">{b.account_number}</span> · <span className="font-mono">{b.ifsc}</span>{b.account_name ? ` · ${b.account_name}` : ""}</span>
                    </span>
                    {b.purpose && <span className="text-[12.5px] text-muted">{b.purpose}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Signatory" className="border-t border-line">
            {!hasSig ? <EmptyLine>No signatory yet.</EmptyLine> : (
              <KeyValue columns={3} items={[
                { label: "Name", value: sig?.name }, { label: "Designation", value: sig?.designation }, { label: "PAN", value: mono(sig?.pan) },
                { label: "Email", value: sig?.email }, { label: "Phone", value: sig?.phone },
              ]} />
            )}
          </Section>
          <div className="border-t border-line empty:hidden"><CustomFields entity="legal_entity" mode="view" values={e.custom} /></div>
        </>
      )}
    </Modal>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13.5px] text-muted">{children}</p>;
}
