"use client";

/*
 * Share a report with roles and with named people. They see it under "Shared with me",
 * always limited to the data they are allowed to see.
 */
import { useEffect, useState } from "react";
import { Button, Field, Modal, ModalCancel, MultiSelect, Skeleton, useToast } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { errMsg, lookupPeople, resolvePeople, type Option, type Report } from "./types";

type PersonOpt = { value: number; label: string; description?: string };

export function ShareModal({ report, open, onClose, onSaved }: {
  report: Report | null; open: boolean; onClose: () => void; onSaved: (r: Report) => void;
}) {
  const toast = useToast();
  const [roles, setRoles] = useState<Option[] | null>(null);
  const [chosenRoles, setChosenRoles] = useState<string[]>([]);
  const [people, setPeople] = useState<number[]>([]);
  const [known, setKnown] = useState<PersonOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open || !report) return;
    setChosenRoles(report.shared_roles ?? []);
    setPeople(report.shared_employee_ids ?? []);
    setDirty(false);
    api.get<{ roles: Option[] }>("/reports/share-options").then((r) => setRoles(r.roles)).catch((e) => toast.error(errMsg(e)));
    resolvePeople(report.shared_employee_ids ?? []).then(setKnown).catch(() => {});
  }, [open, report, toast]);

  async function save() {
    if (!report) return;
    setSaving(true);
    try {
      const r = await api.post<Report>(`/reports/${report.uuid}/share`, { shared_roles: chosenRoles, shared_employee_ids: people });
      toast.success(chosenRoles.length || people.length ? "Sharing updated" : "No longer shared");
      onSaved(r);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share report" description={report?.name} size="md" busy={saving} dirty={dirty}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-5">
        <p className="text-[13.5px] text-muted">People see this report under &quot;Shared with me&quot;. Each person only sees the data they are allowed to see.</p>
        <Field label="Roles" hint="Everyone with these roles">
          {roles ? (
            <MultiSelect value={chosenRoles} onChange={(v) => { setChosenRoles(v); setDirty(true); }} options={roles} placeholder="Choose roles" />
          ) : <Skeleton className="h-10 w-full rounded-lg" />}
        </Field>
        <Field label="People">
          <MultiSelect<number> value={people} onChange={(v) => { setPeople(v); setDirty(true); }} loadOptions={lookupPeople}
            selectedOptions={known} placeholder="Search people" />
        </Field>
      </div>
    </Modal>
  );
}
