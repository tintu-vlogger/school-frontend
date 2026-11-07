"use client";

/*
 * Add or edit an email schedule for a report: how often, when (company local time),
 * which file type and who gets it.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, Sun } from "lucide-react";
import { Button, Field, FormGrid, Modal, ModalCancel, MultiSelect, RadioCards, Select, TextInput, Toggle, useToast } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { WEEKDAYS, errMsg, hourLabel, lookupPeople, resolvePeople, type Report, type ReportsMeta, type Schedule } from "./types";

type Form = {
  report_uuid: string | null;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  weekday: number;
  day_of_month: number;
  hour: number;
  format: string;
  recipient_employee_ids: number[];
  emails: string;
  active: boolean;
};

const FREQ_ICONS = { daily: Sun, weekly: CalendarDays, monthly: CalendarRange };

export function ScheduleModal({ open, onClose, onSaved, meta, schedule, report, reports }: {
  open: boolean; onClose: () => void; onSaved: (s: Schedule) => void; meta: ReportsMeta;
  /** Editing this schedule. */
  schedule?: Schedule | null;
  /** New schedule for this report (from the viewer). */
  report?: Pick<Report, "uuid" | "name"> | null;
  /** Reports to choose from (Schedules tab). */
  reports?: Report[];
}) {
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [known, setKnown] = useState<{ value: number; label: string; description?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setError(null);
    if (schedule) {
      setF({
        report_uuid: schedule.report_uuid, name: schedule.name, frequency: schedule.frequency, weekday: schedule.weekday ?? 0,
        day_of_month: schedule.day_of_month ?? 1, hour: schedule.hour, format: schedule.format,
        recipient_employee_ids: schedule.recipient_employee_ids, emails: schedule.recipient_emails.join(", "), active: schedule.active,
      });
      setKnown(schedule.recipients.map((r) => ({ value: r.id, label: r.name, description: r.email ?? undefined })));
      resolvePeople(schedule.recipient_employee_ids).then((p) => p.length && setKnown(p)).catch(() => {});
    } else {
      setF({
        report_uuid: report?.uuid ?? null, name: report ? report.name : "", frequency: "weekly", weekday: 0, day_of_month: 1, hour: 9,
        format: "xlsx", recipient_employee_ids: [], emails: "", active: true,
      });
      setKnown([]);
    }
  }, [open, schedule, report]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => (x ? { ...x, [k]: v } : x)); setDirty(true); };
  const reportOptions = useMemo(() => (reports ?? []).map((r) => ({ value: r.uuid, label: r.name, description: r.source_label })), [reports]);

  async function save() {
    if (!f) return;
    if (!f.report_uuid) { setError("Choose a report."); return; }
    if (!f.name.trim()) { setError("Give the schedule a name."); return; }
    const emails = f.emails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!f.recipient_employee_ids.length && !emails.length) { setError("Add at least one person to send it to."); return; }
    setError(null);
    setSaving(true);
    const body = {
      report_uuid: f.report_uuid, name: f.name.trim(), frequency: f.frequency, weekday: f.frequency === "weekly" ? f.weekday : null,
      day_of_month: f.frequency === "monthly" ? f.day_of_month : null, hour: f.hour, format: f.format,
      recipient_employee_ids: f.recipient_employee_ids, recipient_emails: emails, active: f.active,
    };
    try {
      const s = schedule ? await api.put<Schedule>(`/reports/schedules/${schedule.uuid}`, body) : await api.post<Schedule>("/reports/schedules", body);
      toast.success(schedule ? "Schedule saved" : "Schedule added");
      onSaved(s);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const showReportPicker = !schedule && !report;

  return (
    <Modal open={open} onClose={onClose} title={schedule ? "Edit schedule" : "Schedule report"} size="lg" busy={saving} dirty={dirty}
      description={schedule ? schedule.report_name : report?.name ?? "Email a report on a regular basis"}
      footerStart={error && <p className="text-[13px] text-rose-600">{error}</p>}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>{schedule ? "Save" : "Add schedule"}</Button></>}>
      {f && (
        <div className="space-y-6">
          <FormGrid>
            {showReportPicker && (
              <Field label="Report" required className="sm:col-span-2">
                <Select value={f.report_uuid} options={reportOptions} placeholder="Choose a report"
                  onChange={(v, o) => { set("report_uuid", v); if (!f.name && o) set("name", o.label); }} />
              </Field>
            )}
            <Field label="Name" required className="sm:col-span-2">
              <TextInput value={f.name} onValueChange={(v) => set("name", v)} placeholder="e.g. Monday headcount" autoFocusInModal />
            </Field>
          </FormGrid>
          <Field label="How often">
            <RadioCards columns={3} value={f.frequency} onChange={(v) => set("frequency", v as Form["frequency"])}
              options={meta.frequencies.map((o) => ({ value: o.value, label: o.label, icon: FREQ_ICONS[o.value as Form["frequency"]] }))} />
          </Field>
          <FormGrid columns={3}>
            {f.frequency === "weekly" && (
              <Field label="Day">
                <Select<number> value={f.weekday} onChange={(v) => v !== null && set("weekday", v)} options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
              </Field>
            )}
            {f.frequency === "monthly" && (
              <Field label="Day of the month" hint="1 to 28, so it runs every month">
                <Select<number> value={f.day_of_month} onChange={(v) => v !== null && set("day_of_month", v)}
                  options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
              </Field>
            )}
            <Field label="Time" hint="Company local time">
              <Select<number> value={f.hour} onChange={(v) => v !== null && set("hour", v)}
                options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: hourLabel(h) }))} />
            </Field>
            <Field label="File type">
              <Select value={f.format} onChange={(v) => v && set("format", v)} options={meta.formats} />
            </Field>
          </FormGrid>
          <div className="space-y-5 border-t border-line pt-5">
            <Field label="Send to people" hint="They get it by email, limited to the data they can see">
              <MultiSelect<number> value={f.recipient_employee_ids} onChange={(v) => set("recipient_employee_ids", v)}
                loadOptions={lookupPeople} selectedOptions={known} placeholder="Search people" />
            </Field>
            <Field label="Other email addresses" hint="Separate with commas">
              <TextInput value={f.emails} onValueChange={(v) => set("emails", v)} placeholder="finance@example.com, auditor@example.com" />
            </Field>
            <Toggle checked={f.active} onChange={(v) => set("active", v)} label="Active" description="Paused schedules don't send anything." />
          </div>
        </div>
      )}
    </Modal>
  );
}
