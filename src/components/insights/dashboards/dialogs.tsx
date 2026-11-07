"use client";

/* Small modals for the dashboards page: name a dashboard, and share it. */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Modal, ModalCancel, MultiSelect, TextInput, Textarea, useToast, type SelectOption } from "@/components/ui-kit";
import type { Dashboard, DashboardBrief } from "./types";

export function DashboardForm({ open, initial, onClose, onSaved }: {
  open: boolean;
  initial: DashboardBrief | null;
  onClose: () => void;
  onSaved: (d: Dashboard) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setError(null);
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Give the dashboard a name."); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null };
      const d = initial
        ? await api.put<Dashboard>(`/dashboards/${initial.uuid}`, body)
        : await api.post<Dashboard>("/dashboards/", { ...body, icon: "layout", widgets: [] });
      toast.success(initial ? "Dashboard renamed" : "Dashboard created");
      onSaved(d);
    } catch (err) {
      toast.error(initial ? "Couldn't rename the dashboard" : "Couldn't create the dashboard", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  const dirty = name !== (initial?.name ?? "") || description !== (initial?.description ?? "");
  return (
    <Modal open={open} onClose={onClose} busy={busy} dirty={dirty} title={initial ? "Rename dashboard" : "New dashboard"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="dash-form" loading={busy}>{initial ? "Save" : "Create"}</Button></>}>
      <form id="dash-form" onSubmit={submit} className="space-y-5">
        <Field label="Name" required error={error ?? undefined}>
          <TextInput value={name} onValueChange={setName} placeholder="e.g. Sales team" autoFocusInModal maxLength={120} />
        </Field>
        <Field label="Description" aside="Optional">
          <Textarea value={description} onValueChange={setDescription} rows={2} placeholder="What this dashboard is for" />
        </Field>
      </form>
    </Modal>
  );
}

type Lookup = { value: number; label: string; hint: string };
const toOpt = (r: Lookup): SelectOption<number> => ({ value: r.value, label: r.label, description: r.hint });

export function ShareModal({ open, dashboard, onClose, onSaved }: {
  open: boolean;
  dashboard: DashboardBrief | null;
  onClose: () => void;
  onSaved: (d: Dashboard) => void;
}) {
  const toast = useToast();
  const [roleOpts, setRoleOpts] = useState<SelectOption[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [people, setPeople] = useState<number[]>([]);
  const [known, setKnown] = useState<SelectOption<number>[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open || !dashboard) return;
    setRoles(dashboard.shared_roles);
    setPeople(dashboard.shared_employee_ids);
    setDirty(false);
    api.getCached<{ roles: SelectOption[] }>("/reports/share-options", 300).then((r) => setRoleOpts(r.roles)).catch(() => {});
    if (dashboard.shared_employee_ids.length) {
      api.get<Lookup[]>(`/employees/lookup?ids=${dashboard.shared_employee_ids.join(",")}`).then((r) => setKnown(r.map(toOpt))).catch(() => {});
    } else setKnown([]);
  }, [open, dashboard]);

  async function save() {
    if (!dashboard) return;
    setBusy(true);
    try {
      const d = await api.put<Dashboard>(`/dashboards/${dashboard.uuid}`, { name: dashboard.name, shared_roles: roles, shared_employee_ids: people });
      toast.success(roles.length || people.length ? "Sharing updated" : "Dashboard is private now");
      onSaved(d);
    } catch (err) {
      toast.error("Couldn't update sharing", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} dirty={dirty} title="Share dashboard"
      description={dashboard ? `People you share “${dashboard.name}” with see its widgets, limited to the data they are allowed to see.` : undefined}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-5">
        <Field label="Roles" hint="Everyone with these roles.">
          <MultiSelect value={roles} onChange={(v) => { setRoles(v); setDirty(true); }} options={roleOpts} placeholder="Choose roles" />
        </Field>
        <Field label="People">
          <MultiSelect value={people} onChange={(v) => { setPeople(v); setDirty(true); }} selectedOptions={known} placeholder="Search people"
            loadOptions={async (q) => (await api.get<Lookup[]>(`/employees/lookup?q=${encodeURIComponent(q)}`)).map(toOpt)} />
        </Field>
      </div>
    </Modal>
  );
}
