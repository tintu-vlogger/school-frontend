"use client";

/*
 * Asset modals: add/edit form, details (history, maintenance, actions), assign, return,
 * maintenance entry and asset request. All centered Modals from the UI kit.
 */
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Pencil, Wrench, Archive, PackageX, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, FormSection, KeyValue, MasterSelect, Modal, ModalCancel, NumberInput, Section,
  Select, Skeleton, TextInput, Textarea, Timeline, type TimelineItem,
} from "@/components/ui-kit";
import { loadEmployees, money } from "@/components/workplace/pickers";
import { CustomFields, useCustomFieldDraft, type CustomValues } from "@/components/custom-fields";
import {
  ASSET_STATUS, ASSIGNMENT_STATUS, CONDITION_LABEL, CONDITION_OPTIONS, MAINTENANCE_KIND, RECOVERY_STATUS,
} from "@/components/workplace/asset-status";

export type Assignment = {
  uuid: string; employee_id: number; employee_name: string | null; status: string; assigned_on: string;
  expected_return_on: string | null; assigned_by_name: string | null; condition_out: string | null; notes: string | null;
  acknowledged_at: string | null; returned_on: string | null; condition_in: string | null; return_notes: string | null;
  received_by_name: string | null; recovery_amount: string | null; recovery_reason: string | null; recovery_status: string;
};
export type Asset = {
  uuid: string; asset_tag: string; name: string; category_id: number | null; category_name: string | null;
  brand: string | null; model: string | null; serial_number: string | null; purchase_date: string | null;
  purchase_value: string | null; vendor: string | null; invoice_no: string | null; warranty_until: string | null;
  location_id: number | null; location_name: string | null; location_note: string | null; condition: string;
  status: string; notes: string | null; retired_on: string | null; custom?: CustomValues;
  assigned_to: { employee_id: number; name: string | null; assignment_uuid: string; since: string; acknowledged: boolean } | null;
  history?: Assignment[];
  maintenance?: { uuid: string; kind: string; performed_on: string; vendor: string | null; cost: string | null;
    description: string | null; status: string; next_due_on: string | null; created_by_name: string | null }[];
};

const errText = (e: unknown) => (e instanceof Error ? e.message : undefined);
const STROKE = 1.4;

/* ── Add / edit ────────────────────────────────────────────────────── */

export function AssetFormModal({ target, open, onClose, onSaved }: {
  target: Asset | null; open: boolean; onClose: () => void; onSaved: (a: Asset) => void;
}) {
  const toast = useToast();
  const initial = {
    asset_tag: target?.asset_tag ?? "", name: target?.name ?? "", category_id: target?.category_id ?? null,
    brand: target?.brand ?? "", model: target?.model ?? "", serial_number: target?.serial_number ?? "",
    purchase_date: target?.purchase_date ?? "", purchase_value: target?.purchase_value ? Number(target.purchase_value) : null,
    vendor: target?.vendor ?? "", invoice_no: target?.invoice_no ?? "", warranty_until: target?.warranty_until ?? "",
    location_id: target?.location_id ?? null, location_note: target?.location_note ?? "",
    condition: target?.condition ?? "good", notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const cf = useCustomFieldDraft("asset", target?.custom);
  const [locations, setLocations] = useState<{ value: number; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));
  useEffect(() => { api.getCached<{ value: number; label: string }[]>("/helpdesk/locations", 60).then(setLocations).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the asset a name"); return; }
    if (!cf.check()) return;
    setSaving(true);
    const body = {
      ...v, custom: cf.values, asset_tag: v.asset_tag.trim() || null, purchase_date: v.purchase_date || null, warranty_until: v.warranty_until || null,
      purchase_value: v.purchase_value === null ? null : v.purchase_value.toFixed(2),
    };
    try {
      const saved = target ? await api.put<Asset>(`/assets/${target.uuid}`, body) : await api.post<Asset>("/assets", body);
      toast.success(target ? "Asset updated" : `Asset ${saved.asset_tag} added`);
      onSaved(saved);
    } catch (err) {
      toast.error("Couldn't save the asset", { description: errText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty}
      title={target ? `Edit ${target.asset_tag}` : "New asset"}
      description={target ? undefined : "Leave the tag empty to number it automatically."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="asset-form" loading={saving}>{target ? "Save changes" : "Add asset"}</Button></>}>
      <form id="asset-form" onSubmit={submit} noValidate className="space-y-6">
        <FormSection title="What it is">
          <FormGrid>
            <Field label="Name" required error={error} className="sm:col-span-2">
              <TextInput value={v.name} onValueChange={(x) => { set("name", x); setError(""); }} placeholder="e.g. Dell Latitude 5440" />
            </Field>
            <Field label="Category"><MasterSelect type="asset_category" value={v.category_id} onChange={(x) => set("category_id", x)} clearable /></Field>
            <Field label="Asset tag" aside="Optional"><TextInput value={v.asset_tag} onValueChange={(x) => set("asset_tag", x.toUpperCase())} className="font-mono" placeholder="Automatic" /></Field>
            <Field label="Brand"><TextInput value={v.brand} onValueChange={(x) => set("brand", x)} /></Field>
            <Field label="Model"><TextInput value={v.model} onValueChange={(x) => set("model", x)} /></Field>
            <Field label="Serial number"><TextInput value={v.serial_number} onValueChange={(x) => set("serial_number", x)} className="font-mono" /></Field>
            <Field label="Condition"><Select value={v.condition} onChange={(x) => set("condition", x || "good")} options={CONDITION_OPTIONS.filter((o) => o.value !== "lost")} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Purchase and warranty">
          <FormGrid>
            <Field label="Purchase date"><DateInput value={v.purchase_date} onChange={(x) => set("purchase_date", x)} clearable /></Field>
            <Field label="Value (₹)"><NumberInput value={v.purchase_value} onChange={(x) => set("purchase_value", x)} min={0} step={100} /></Field>
            <Field label="Vendor"><TextInput value={v.vendor} onValueChange={(x) => set("vendor", x)} /></Field>
            <Field label="Invoice number"><TextInput value={v.invoice_no} onValueChange={(x) => set("invoice_no", x)} /></Field>
            <Field label="Warranty until"><DateInput value={v.warranty_until} onChange={(x) => set("warranty_until", x)} clearable /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Where it is">
          <FormGrid>
            <Field label="Location">
              <Select value={v.location_id} onChange={(x) => set("location_id", x)} options={locations} clearable placeholder={locations.length ? "Pick a location" : "No locations set up"} />
            </Field>
            <Field label="Place details" aside="Optional"><TextInput value={v.location_note} onValueChange={(x) => set("location_note", x)} placeholder="e.g. IT store, 3rd floor" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
          </FormGrid>
        </FormSection>
        <CustomFields entity="asset" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
    </Modal>
  );
}

/* ── Assign ────────────────────────────────────────────────────────── */

export function AssignModal({ asset, open, onClose, onDone, request }: {
  asset: Asset | null; open: boolean; onClose: () => void; onDone: () => void;
  request?: { uuid: string; employee_id: number; employee_name: string | null } | null;
}) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(request?.employee_id ?? null);
  const [on, setOn] = useState("");
  const [back, setBack] = useState("");
  const [condition, setCondition] = useState<string>(asset?.condition ?? "good");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset || !emp) { toast.error("Pick the employee"); return; }
    setSaving(true);
    try {
      await api.post(`/assets/${asset.uuid}/assign`, {
        employee_id: emp, assigned_on: on || null, expected_return_on: back || null, condition, notes: notes || null,
        request_uuid: request?.uuid ?? null,
      });
      toast.success(`${asset.asset_tag} handed over`, { description: "The employee is asked to confirm they received it." });
      onDone();
    } catch (err) { toast.error("Couldn't hand it over", { description: errText(err) }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open && !!asset} onClose={onClose} size="md" busy={saving}
      title={asset ? `Hand over ${asset.name}` : "Hand over"} description={asset?.asset_tag}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="assign-form" loading={saving} icon={ArrowUpFromLine}>Hand over</Button></>}>
      <form id="assign-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Employee" required className="sm:col-span-2">
            <Select value={emp} onChange={setEmp} loadOptions={loadEmployees} disabled={!!request}
              selectedOption={request ? { value: request.employee_id, label: request.employee_name || "Employee" } : null} placeholder="Search people" />
          </Field>
          <Field label="Handed over on"><DateInput value={on} onChange={setOn} placeholder="Today" clearable /></Field>
          <Field label="Return by" aside="Optional"><DateInput value={back} onChange={setBack} clearable /></Field>
          <Field label="Condition"><Select value={condition} onChange={(x) => setCondition(x || "good")} options={CONDITION_OPTIONS.filter((o) => o.value !== "lost")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onValueChange={setNotes} rows={2} placeholder="Charger, bag, accessories…" /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Return ────────────────────────────────────────────────────────── */

export function ReturnModal({ asset, open, onClose, onDone }: { asset: Asset | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [on, setOn] = useState("");
  const [condition, setCondition] = useState("good");
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const bad = condition === "damaged" || condition === "lost";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset?.assigned_to) return;
    if (amount && !reason.trim()) { toast.error("Say why the amount is recovered"); return; }
    setSaving(true);
    try {
      await api.post(`/assets/assignments/${asset.assigned_to.assignment_uuid}/return`, {
        returned_on: on || null, condition, notes: notes || null, next_status: nextStatus,
        recovery_amount: amount ? amount.toFixed(2) : null, recovery_reason: reason || null,
      });
      toast.success(`${asset.asset_tag} taken back`, amount ? { description: `${money(amount)} will be recovered in final settlement.` } : undefined);
      onDone();
    } catch (err) { toast.error("Couldn't record the return", { description: errText(err) }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open && !!asset?.assigned_to} onClose={onClose} size="md" busy={saving}
      title={asset ? `Take back ${asset.name}` : "Take back"} description={asset?.assigned_to ? `From ${asset.assigned_to.name}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="return-form" loading={saving} icon={ArrowDownToLine}>Record return</Button></>}>
      <form id="return-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Returned on"><DateInput value={on} onChange={setOn} placeholder="Today" clearable /></Field>
          <Field label="Condition"><Select value={condition} onChange={(x) => setCondition(x || "good")} options={CONDITION_OPTIONS} /></Field>
          <Field label="Then the asset is" className="sm:col-span-2" hint="Left empty, it follows the condition: available, in repair when damaged, lost when lost.">
            <Select value={nextStatus} onChange={setNextStatus} clearable placeholder="Decide from the condition"
              options={["available", "in_repair", "lost", "retired"].map((s) => ({ value: s, label: ASSET_STATUS[s].label }))} />
          </Field>
          {bad && (
            <>
              <Field label="Recover from the employee (₹)" hint="Deducted in final settlement unless waived.">
                <NumberInput value={amount} onChange={setAmount} min={0} step={100} />
              </Field>
              <Field label="Reason" required={!!amount}><TextInput value={reason} onValueChange={setReason} placeholder="e.g. Cracked screen" /></Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Maintenance ───────────────────────────────────────────────────── */

export function MaintenanceModal({ asset, open, onClose, onDone }: { asset: Asset | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ kind: "repair", performed_on: "", vendor: "", cost: null as number | null, description: "", status: "done", next_due_on: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;
    if (!v.performed_on) { toast.error("Pick the date"); return; }
    setSaving(true);
    try {
      await api.post(`/assets/${asset.uuid}/maintenance`, { ...v, cost: v.cost === null ? null : v.cost.toFixed(2), next_due_on: v.next_due_on || null });
      toast.success("Maintenance recorded");
      onDone();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open && !!asset} onClose={onClose} size="md" busy={saving} title="Log maintenance" description={asset ? `${asset.asset_tag} · ${asset.name}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="maint-form" loading={saving}>Save</Button></>}>
      <form id="maint-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x || "repair" })} options={Object.entries(MAINTENANCE_KIND).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Status"><Select value={v.status} onChange={(x) => setV({ ...v, status: x || "done" })}
            options={[{ value: "scheduled", label: "Scheduled" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }]} /></Field>
          <Field label="Date" required><DateInput value={v.performed_on} onChange={(x) => setV({ ...v, performed_on: x })} /></Field>
          <Field label="Cost (₹)"><NumberInput value={v.cost} onChange={(x) => setV({ ...v, cost: x })} min={0} /></Field>
          <Field label="Done by"><TextInput value={v.vendor} onValueChange={(x) => setV({ ...v, vendor: x })} placeholder="Vendor or service centre" /></Field>
          <Field label="Next due" aside="Optional"><DateInput value={v.next_due_on} onChange={(x) => setV({ ...v, next_due_on: x })} clearable /></Field>
          <Field label="What was done" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────── */

export function AssetDetailModal({ uuid, open, onClose, onEdit, onChanged }: {
  uuid: string | null; open: boolean; onClose: () => void; onEdit: (a: Asset) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [nonce, setNonce] = useState(0);
  const [modal, setModal] = useState<"assign" | "return" | "maint" | null>(null);
  const [modalKey, setModalKey] = useState(0);

  useEffect(() => {
    if (!uuid || !open) return;
    let live = true;
    api.get<Asset>(`/assets/${uuid}`).then((a) => { if (live) setAsset(a); }).catch((e) => toast.error(errText(e) || "Couldn't load the asset"));
    return () => { live = false; };
  }, [uuid, open, nonce, toast]);
  const a = asset && asset.uuid === uuid ? asset : null;
  const refresh = () => { setNonce((n) => n + 1); onChanged(); };
  const openModal = (m: "assign" | "return" | "maint") => { setModalKey((k) => k + 1); setModal(m); };

  async function setStatus(status: string) {
    if (!a) return;
    try { await api.post(`/assets/${a.uuid}/status`, { status }); toast.success(`Marked ${ASSET_STATUS[status].label.toLowerCase()}`); refresh(); }
    catch (err) { toast.error("Couldn't change the status", { description: errText(err) }); }
  }
  async function recovery(x: Assignment, status: string) {
    try { await api.post(`/assets/assignments/${x.uuid}/recovery`, { status }); toast.success(status === "waived" ? "Recovery waived" : "Marked recovered"); refresh(); }
    catch (err) { toast.error("Couldn't update", { description: errText(err) }); }
  }

  const timeline: TimelineItem[] = (a?.history ?? []).flatMap((x) => {
    const items: TimelineItem[] = [];
    if (x.returned_on) items.push({
      id: `${x.uuid}-r`, icon: ArrowDownToLine, tone: x.condition_in === "lost" || x.condition_in === "damaged" ? "bad" : "neutral",
      title: `Returned by ${x.employee_name ?? "employee"} · ${CONDITION_LABEL[x.condition_in ?? ""] ?? ""}`, time: formatDate(x.returned_on),
      description: <span className="flex flex-wrap items-center gap-2">
        {x.return_notes}
        {x.recovery_amount && <><Badge tone={RECOVERY_STATUS[x.recovery_status]?.tone}>{money(x.recovery_amount)} · {RECOVERY_STATUS[x.recovery_status]?.label}</Badge>
          {x.recovery_status === "pending" && <><button className="text-[12.5px] text-primary hover:underline" onClick={() => recovery(x, "recovered")}>Mark recovered</button>
            <button className="text-[12.5px] text-muted hover:underline" onClick={() => recovery(x, "waived")}>Waive</button></>}</>}
      </span>,
    });
    items.push({
      id: x.uuid, icon: ArrowUpFromLine, tone: "accent", title: `Handed to ${x.employee_name ?? "employee"}`, time: formatDate(x.assigned_on),
      description: <>{x.acknowledged_at ? `Confirmed ${formatDateTime(x.acknowledged_at)}` : x.status === "pending_ack" ? "Waiting for the employee to confirm" : ""}{x.notes ? ` · ${x.notes}` : ""}</>,
    });
    return items;
  });

  const st = a ? ASSET_STATUS[a.status] : null;
  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title={a ? a.name : "Asset"}
        description={a ? <span className="font-mono">{a.asset_tag}</span> : undefined}
        headerActions={a && <Button size="sm" icon={Pencil} onClick={() => onEdit(a)}>Edit</Button>}
        footerStart={a && !a.assigned_to && a.status !== "retired" && (
          <div className="flex gap-2">
            {a.status !== "in_repair" && <Button size="sm" variant="ghost" icon={Wrench} onClick={() => setStatus("in_repair")}>Send for repair</Button>}
            {a.status !== "available" && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setStatus("available")}>Mark available</Button>}
            {a.status !== "lost" && <Button size="sm" variant="ghost" icon={PackageX} onClick={() => setStatus("lost")}>Lost</Button>}
            <Button size="sm" variant="ghost" icon={Archive} onClick={() => setStatus("retired")}>Retire</Button>
          </div>
        )}
        footer={a && <div className="flex gap-2">
          <Button icon={Wrench} onClick={() => openModal("maint")}>Log maintenance</Button>
          {a.assigned_to ? <Button variant="primary" icon={ArrowDownToLine} onClick={() => openModal("return")}>Take back</Button>
            : a.status === "available" && <Button variant="primary" icon={ArrowUpFromLine} onClick={() => openModal("assign")}>Hand over</Button>}
        </div>}>
        {!a ? <div className="space-y-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-24 w-full" /></div> : (
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            <div>
              <Section title="Details">
                <KeyValue columns={3} items={[
                  { label: "Category", value: a.category_name }, { label: "Brand", value: a.brand }, { label: "Model", value: a.model },
                  { label: "Serial number", value: a.serial_number && <span className="font-mono text-[13px]">{a.serial_number}</span> },
                  { label: "Purchased", value: a.purchase_date && formatDate(a.purchase_date) }, { label: "Value", value: a.purchase_value && money(a.purchase_value) },
                  { label: "Vendor", value: a.vendor }, { label: "Invoice", value: a.invoice_no },
                  { label: "Warranty until", value: a.warranty_until && formatDate(a.warranty_until) },
                  { label: "Location", value: [a.location_name, a.location_note].filter(Boolean).join(" · ") },
                  { label: "Notes", value: a.notes, span: 2 },
                ]} />
              </Section>
              <div className="border-t border-line empty:hidden"><CustomFields entity="asset" mode="view" values={a.custom} /></div>
              <Section title="History" className="border-t border-line">
                {timeline.length ? <Timeline items={timeline} /> : <p className="text-[13.5px] text-muted">Never handed over yet.</p>}
              </Section>
              <Section title="Maintenance" className="border-t border-line">
                {a.maintenance?.length ? (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {a.maintenance.map((m) => (
                      <li key={m.uuid} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-ink">{MAINTENANCE_KIND[m.kind]} · {formatDate(m.performed_on)}</p>
                          <p className="text-[12.5px] text-muted">{[m.description, m.vendor].filter(Boolean).join(" · ")}</p>
                          {m.next_due_on && <p className="text-[12px] text-faint">Next due {formatDate(m.next_due_on)}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone={m.status === "done" ? "good" : m.status === "in_progress" ? "warn" : "info"}>{m.status === "in_progress" ? "In progress" : m.status === "done" ? "Done" : "Scheduled"}</Badge>
                          {m.cost && Number(m.cost) > 0 && <span className="tabular text-[12.5px] text-muted">{money(m.cost)}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13.5px] text-muted">No maintenance recorded.</p>}
              </Section>
            </div>
            <aside className="space-y-4">
              <div className="rounded-xl border border-line p-4">
                <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {st && <Badge tone={st.tone} dot>{st.label}</Badge>}
                  <Badge>{CONDITION_LABEL[a.condition] ?? a.condition}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="text-[12px] uppercase tracking-[0.06em] text-faint">With</p>
                {a.assigned_to ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-[14.5px] text-ink">{a.assigned_to.name}</p>
                    <p className="text-[12.5px] text-muted">Since {formatDate(a.assigned_to.since)}</p>
                    {a.assigned_to.acknowledged
                      ? <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700"><CheckCircle2 size={14} strokeWidth={STROKE} /> Receipt confirmed</p>
                      : <p className="text-[12.5px] text-amber-700">Waiting for the employee to confirm</p>}
                  </div>
                ) : <p className="mt-2 text-[13.5px] text-muted">Not handed over</p>}
              </div>
            </aside>
          </div>
        )}
      </Modal>
      <AssignModal key={`a${modalKey}`} asset={a} open={modal === "assign"} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      <ReturnModal key={`r${modalKey}`} asset={a} open={modal === "return"} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      <MaintenanceModal key={`m${modalKey}`} asset={a} open={modal === "maint"} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
    </>
  );
}

/* ── Employee: ask for an asset ────────────────────────────────────── */

export function RequestAssetModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [cat, setCat] = useState<number | null>(null);
  const [details, setDetails] = useState("");
  const [needed, setNeeded] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cat) { toast.error("Pick what you need"); return; }
    if (!details.trim()) { toast.error("Say why you need it"); return; }
    setSaving(true);
    try {
      await api.post("/assets/requests", { category_id: cat, details, needed_by: needed || null });
      toast.success("Request sent", { description: "You'll be told when it's approved." });
      onDone();
    } catch (err) { toast.error("Couldn't send the request", { description: errText(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={!!(cat || details)} title="Ask for an asset"
      description="Your manager and HR approve the request; then IT or admin hands it over."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="asset-req" loading={saving}>Send request</Button></>}>
      <form id="asset-req" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="What do you need" required className="sm:col-span-2"><MasterSelect type="asset_category" value={cat} onChange={setCat} allowCreate={false} /></Field>
          <Field label="Why" required className="sm:col-span-2"><Textarea value={details} onValueChange={setDetails} rows={3} placeholder="e.g. A second monitor for design work" /></Field>
          <Field label="Needed by" aside="Optional"><DateInput value={needed} onChange={setNeeded} clearable /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

export const assetStatusBadge = (s: string) => <Badge tone={ASSET_STATUS[s]?.tone ?? "neutral"} dot>{ASSET_STATUS[s]?.label ?? s}</Badge>;
export const assignmentBadge = (s: string) => <Badge tone={ASSIGNMENT_STATUS[s]?.tone ?? "neutral"}>{ASSIGNMENT_STATUS[s]?.label ?? s}</Badge>;
