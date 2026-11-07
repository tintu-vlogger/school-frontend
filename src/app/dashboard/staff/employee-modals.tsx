"use client";

/*
 * Employee modals used by the directory and the profile page.
 *
 *   <EmployeeFormModal open employeeId={null | uuid} onClose onSaved={(uuid) => ...} />
 *     Add (employeeId null) or edit an employee. Loads the record when editing, guards
 *     unsaved changes, saves the details and then the work arrangement.
 *
 *   <EmployeeDetailModal employeeId={uuid | null} onClose onEdit={(uuid) => ...} onChanged />
 *     Read-only summary opened from a row click, with Edit, status toggle and a link to the
 *     full profile.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Ban, CheckCircle2, Mail, Pencil, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatStaffName } from "@/lib/names";
import { formatDate } from "@/lib/datetime";
import { CustomFields, hasCustomFields, useCustomFieldLayout } from "@/components/custom-fields";
import {
  Avatar, Badge, Button, KeyValue, Modal, ModalCancel, Skeleton, SkeletonText, Tabs, useConfirm,
} from "@/components/ui-kit";
import {
  DAYS, EMPLOYEE_FORM_ID, backgroundOf, EMPTY_EMPLOYEE, EmployeeForm, ROLE_OPTIONS, employeePayload, employeeToValues, timingFromWeek, weekFromTiming,
  type EmployeeRecord, type EmployeeValues,
} from "./employee-form";

function useEmployee(uuid: string | null) {
  const [state, setState] = useState<{ uuid: string; emp: EmployeeRecord | null; missing?: boolean; v: number } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<EmployeeRecord>(`/employees/${uuid}`)
      .then((emp) => { if (live) setState({ uuid, emp, v: version }); })
      .catch(() => { if (live) setState({ uuid, emp: null, missing: true, v: version }); });
    return () => { live = false; };
  }, [uuid, version]);
  // While closing (uuid null) keep showing the last record so the exit animation has content.
  const current = state && (uuid === null || state.uuid === uuid) ? state : null;
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { emp: current?.emp ?? null, missing: !!current?.missing, loading: !!uuid && (!current || current.v !== version), reload };
}

/* ── Add / edit ────────────────────────────────────────────────────────── */

export function EmployeeFormModal({ open, employeeId, onClose, onSaved }: {
  open: boolean;
  employeeId: string | null;
  onClose: () => void;
  onSaved?: (uuid: string) => void;
}) {
  const toast = useToast();
  const mode = employeeId ? "edit" : "create";
  const { emp, missing } = useEmployee(open ? employeeId : null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initial: EmployeeValues | null = mode === "create" ? EMPTY_EMPLOYEE : emp ? employeeToValues(emp) : null;

  async function save(v: EmployeeValues) {
    setSaving(true);
    try {
      let uuid = employeeId;
      if (mode === "create") {
        const created = await api.post<{ uuid: string }>("/employees/", employeePayload(v, "create"));
        uuid = created?.uuid ?? null;
        // The work arrangement is saved separately; the employee already exists if this fails.
        if (uuid) await api.put(`/employees/${uuid}/work-arrangement`, { config: { timing: timingFromWeek(v.week) } }).catch(() => {});
        toast.success("Employee added", { description: `${v.first_name} ${v.last_name} can now sign in with ${v.email.trim()}.` });
      } else {
        await api.put(`/employees/${employeeId}`, employeePayload(v, "edit"));
        await api.put(`/employees/${employeeId}/work-arrangement`, { config: { timing: timingFromWeek(v.week) } });
        toast.success("Changes saved");
      }
      setDirty(false);
      onClose();
      if (uuid) onSaved?.(uuid);
    } catch (e: unknown) {
      toast.error(mode === "create" ? "Couldn't add the employee" : "Couldn't save the changes", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  const name = emp ? formatStaffName(emp) : "";
  return (
    <Modal
      open={open}
      onClose={() => { setDirty(false); onClose(); }}
      size="lg"
      title={mode === "create" ? "Add employee" : name ? `Edit ${name}` : "Edit employee"}
      description={mode === "create" ? "Their details, job and usual working hours. You can add more later." : "Changes are recorded in the audit log."}
      dirty={dirty}
      busy={saving}
      footer={<>
        <ModalCancel />
        <Button variant="primary" type="submit" form={EMPLOYEE_FORM_ID} loading={saving} disabled={!initial}>
          {mode === "create" ? "Add employee" : "Save changes"}
        </Button>
      </>}
    >
      {missing ? (
        <p className="py-10 text-center text-[14px] text-muted">This employee couldn&apos;t be found. They may have been removed.</p>
      ) : initial ? (
        <EmployeeForm key={employeeId ?? "new"} mode={mode} initial={initial} record={emp} onSubmit={save} onDirtyChange={setDirty} />
      ) : (
        <div className="space-y-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-4"><Skeleton className="h-4 w-36" /><div className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div></div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function EmployeeDetailModal({ employeeId, onClose, onEdit, onChanged, canManage }: {
  employeeId: string | null;
  onClose: () => void;
  onEdit: (uuid: string) => void;
  onChanged?: () => void;
  canManage: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { emp, missing, loading, reload } = useEmployee(employeeId);
  const [tab, setTab] = useState("overview");
  const { layout } = useCustomFieldLayout("employee");
  const extra = hasCustomFields(layout);

  async function toggleActive() {
    if (!emp) return;
    const go = async () => {
      await api.put(`/employees/${emp.uuid}`, { active: !emp.active });
      toast.success(emp.active ? "Marked inactive" : "Marked active");
      reload();
      onChanged?.();
    };
    if (emp.active) {
      await confirm({
        title: `Mark ${formatStaffName(emp)} inactive?`,
        message: "They can no longer sign in. Their records stay, and you can reactivate them at any time.",
        confirmLabel: "Mark inactive", tone: "danger",
        onConfirm: () => go().catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't change the status"); throw e; }),
      });
    } else {
      await go().catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't change the status"));
    }
  }

  const name = emp ? formatStaffName(emp) : "";
  const prof = backgroundOf(emp);
  const week = weekFromTiming(emp?.config?.timing);
  const role = ROLE_OPTIONS.find((r) => r.value === emp?.role)?.label ?? "Employee";

  return (
    <Modal
      open={!!employeeId}
      onClose={onClose}
      size="lg"
      title={emp ? name : loading ? <Skeleton className="h-5 w-48" /> : "Employee"}
      description={emp ? [emp.designation_name, emp.department_name].filter(Boolean).join(" · ") || "No designation yet" : undefined}
      leading={emp ? <Avatar name={name} src={emp.profile_image_url} size={44} /> : <Skeleton className="h-11 w-11 rounded-full" />}
      headerActions={emp && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(emp.uuid)}>Edit</Button>}
      footerStart={emp && <Link href={`/dashboard/staff/${emp.uuid}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-primary hover:text-primary-dark">Open full profile <ArrowUpRight size={14} strokeWidth={1.4} /></Link>}
      footer={emp && canManage && (
        <Button variant={emp.active ? "secondary" : "primary"} icon={emp.active ? Ban : CheckCircle2} onClick={toggleActive}>
          {emp.active ? "Mark inactive" : "Mark active"}
        </Button>
      )}
    >
      {missing ? (
        <p className="py-10 text-center text-[14px] text-muted">This employee couldn&apos;t be found.</p>
      ) : !emp ? (
        <div className="space-y-6"><SkeletonText lines={3} /><SkeletonText lines={4} /></div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge tone={emp.active ? "good" : "neutral"} dot>{emp.active ? "Active" : "Inactive"}</Badge>
            <Badge tone="accent">{role}</Badge>
            {emp.employee_code && <Badge>{emp.employee_code}</Badge>}
            <span className="ml-auto flex items-center gap-1">
              {emp.email && <a href={`mailto:${emp.email}`} title={emp.email} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"><Mail size={16} strokeWidth={1.4} /></a>}
              {emp.phone && <a href={`tel:${emp.phone}`} title={emp.phone} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"><Phone size={16} strokeWidth={1.4} /></a>}
            </span>
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-6" items={[{ value: "overview", label: "Overview" }, ...(extra ? [{ value: "more", label: "More details" }] : []), { value: "work", label: "Work arrangement" }]} />
          {tab === "overview" ? (
            <KeyValue items={[
              { label: "Work email", value: emp.email },
              { label: "Mobile", value: emp.phone },
              { label: "Designation", value: emp.designation_name },
              { label: "Department", value: emp.department_name },
              { label: "Reporting manager", value: emp.reporting_manager_name },
              { label: "Timezone", value: emp.timezone ? emp.timezone.replace(/_/g, " ") : "Same as company" },
              { label: "Access", value: emp.role === "admin" ? "HR admin (full access)" : role },
              { label: "Employee code", value: emp.employee_code },
              { label: "Highest qualification", value: prof.qualification },
              { label: "Experience before joining", value: prof.experience != null ? `${prof.experience} ${prof.experience === 1 ? "year" : "years"}` : null },
              { label: "Added on", value: emp.created_at ? formatDate(emp.created_at) : null },
            ]} />
          ) : tab === "more" ? (
            <CustomFields entity="employee" mode="view" layout={layout} values={emp.custom} />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {DAYS.map((d) => (
                <li key={d} className="flex justify-between px-4 py-3 text-[14px]">
                  <span className="text-ink">{d}</span>
                  {week[d].working
                    ? <span className="tabular text-muted">{time12(week[d].start)} – {time12(week[d].end)}</span>
                    : <span className="text-faint">Weekly off</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
