"use client";

/*
 * Attendance requests from an employee: correction (missed or wrong punch), work from
 * home, on duty, permission hours and overtime pre-approval. Each goes for approval
 * through the approval flow; the form shows the limits and what is used this month.
 */
import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatMonth } from "@/lib/datetime";
import {
  Button, Checkbox, DateInput, Field, FormGrid, MasterSelect, Modal, ModalCancel, NumberInput, RadioCards, Textarea,
  TimeInput, TextInput,
} from "@/components/ui-kit";
import { REQUEST_KINDS, errorText } from "./shared";

export type RequestKind = "regularisation" | "wfh" | "on_duty" | "permission" | "overtime";

type Options = {
  month: string;
  used: { regularisation?: number; wfh_days?: number; permission_count?: number; permission_minutes?: number };
  regularisation: { monthly_limit: number; window_days: number };
  wfh: { weekly_limit: number; monthly_limit: number };
  permission: { monthly_count: number; monthly_minutes: number; max_minutes_per_request: number };
  on_duty: { monthly_limit: number };
  overtime_request: { max_hours_per_day: number; consent_text: string };
};

const DESCRIPTIONS: Record<RequestKind, string> = {
  regularisation: "Fix a missed or wrong punch. Your manager approves it.",
  wfh: "Work from home for a day, half a day or a few days.",
  on_duty: "Working away from the office: client visit, field work or training.",
  permission: "A short time off within your shift, in hours.",
  overtime: "Ask before working overtime. Overtime is voluntary and paid at twice your ordinary rate.",
};

const HALF_OPTIONS = [
  { value: "full_day", label: "Full day" },
  { value: "first_half", label: "First half" },
  { value: "second_half", label: "Second half" },
];

export function RequestModal({ kind, date, onClose, onSent }: {
  kind: RequestKind | null; date?: string | null; onClose: () => void; onSent: () => void;
}) {
  const toast = useToast();
  const [opts, setOpts] = useState<Options | null>(null);
  const [v, setV] = useState({
    date: date || "", end_date: "", duration: "full_day", in_time: "", out_time: "", out_next_day: false,
    mode: "add", from_time: "", to_time: "", reason: "", place: "", consent: false,
  });
  const [hours, setHours] = useState<number | null>(2);
  const [category, setCategory] = useState<number | null>(null);
  const [reasonCode, setReasonCode] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));

  useEffect(() => {
    if (!kind) return;
    api.get<Options>(`/attendance/me/request-options${v.date ? `?on=${v.date}` : ""}`).then(setOpts).catch(() => {});
  }, [kind, v.date]);

  const hint = useMemo(() => {
    if (!opts || !kind) return null;
    const month = formatMonth(`${opts.month}-01`);
    if (kind === "regularisation") {
      const lim = opts.regularisation.monthly_limit;
      return `${lim ? `${opts.used.regularisation ?? 0} of ${lim} corrections used in ${month}. ` : ""}Ask within ${opts.regularisation.window_days} days of the date.`;
    }
    if (kind === "wfh") {
      const w = opts.wfh;
      return `Up to ${w.weekly_limit || "any"} days a week and ${w.monthly_limit || "any"} a month · ${opts.used.wfh_days ?? 0} used in ${month}.`;
    }
    if (kind === "permission") {
      const p = opts.permission;
      return `${opts.used.permission_count ?? 0} of ${p.monthly_count || "any"} used (${opts.used.permission_minutes ?? 0} of ${p.monthly_minutes || "any"} minutes) in ${month}. Up to ${p.max_minutes_per_request} minutes at a time.`;
    }
    if (kind === "overtime") return `Up to ${opts.overtime_request.max_hours_per_day} hours a day.`;
    return null;
  }, [opts, kind]);

  async function send() {
    if (!kind) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { date: v.date, reason: v.reason || null };
      if (kind === "regularisation") Object.assign(body, {
        in_time: v.in_time || null, out_time: v.out_time || null, out_next_day: v.out_next_day, mode: v.mode,
        reason_code: reasonCode ? String(reasonCode) : null,
      });
      if (kind === "wfh" || kind === "on_duty") Object.assign(body, {
        end_date: v.duration === "full_day" && v.end_date ? v.end_date : null, duration: v.duration,
        category_id: category, place: kind === "on_duty" ? v.place || null : undefined,
      });
      if (kind === "permission") Object.assign(body, { from_time: v.from_time, to_time: v.to_time });
      if (kind === "overtime") Object.assign(body, { hours, consent: v.consent });
      const r = await api.post<{ reference_no: string; workflow_status: string }>(`/attendance/me/requests/${kind}`, body);
      toast.success(r.workflow_status === "approved" ? "Approved" : "Sent for approval", { description: r.reference_no });
      onSent();
    } catch (e) {
      toast.error(errorText(e, "Couldn't send the request"));
    } finally {
      setSaving(false);
    }
  }

  const ready = !!v.date && (kind !== "permission" || (!!v.from_time && !!v.to_time))
    && (kind !== "regularisation" || !!(v.in_time || v.out_time)) && (kind !== "overtime" || (v.consent && !!hours));

  return (
    <Modal open={!!kind} onClose={onClose} size="md" busy={saving} dirty={!!v.reason}
      title={kind ? REQUEST_KINDS[kind] : ""} description={kind ? DESCRIPTIONS[kind] : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} disabled={!ready} onClick={send}>Send request</Button></>}>
      {kind && (
        <div className="space-y-5">
          {hint && <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-[13px] text-muted">{hint}</p>}
          <FormGrid>
            <Field label={kind === "wfh" || kind === "on_duty" ? "From" : "Date"} required>
              <DateInput value={v.date} onChange={set("date")} />
            </Field>
            {(kind === "wfh" || kind === "on_duty") && v.duration === "full_day" ? (
              <Field label="To" hint="Leave empty for one day"><DateInput value={v.end_date} onChange={set("end_date")} min={v.date} clearable /></Field>
            ) : <div />}
          </FormGrid>

          {kind === "regularisation" && (
            <>
              <RadioCards columns={2} value={v.mode} onChange={set("mode")} options={[
                { value: "add", label: "Missed punch", description: "Add the punch that is missing" },
                { value: "replace", label: "Wrong punch", description: "Replace the recorded time" },
              ]} />
              <FormGrid>
                <Field label="Check-in"><TimeInput value={v.in_time} onChange={set("in_time")} /></Field>
                <Field label="Check-out"><TimeInput value={v.out_time} onChange={set("out_time")} /></Field>
              </FormGrid>
              <Checkbox checked={v.out_next_day} onChange={set("out_next_day")} label="Check-out was the next day (night shift)" />
              <Field label="Reason type"><MasterSelect type="regularisation_reason" value={reasonCode} onChange={(x) => setReasonCode(x)} clearable /></Field>
            </>
          )}

          {(kind === "wfh" || kind === "on_duty") && (
            <>
              <RadioCards columns={3} value={v.duration} onChange={set("duration")} options={HALF_OPTIONS} />
              <Field label={kind === "wfh" ? "Category" : "Type"} required={kind === "wfh"}>
                <MasterSelect type={kind === "wfh" ? "wfh_category" : "on_duty_type"} value={category} onChange={(x) => setCategory(x)} clearable />
              </Field>
              {kind === "on_duty" && (
                <Field label="Place"><TextInput value={v.place} onValueChange={set("place")} placeholder="e.g. Client office, Whitefield" /></Field>
              )}
            </>
          )}

          {kind === "permission" && (
            <FormGrid>
              <Field label="From" required><TimeInput value={v.from_time} onChange={set("from_time")} /></Field>
              <Field label="To" required><TimeInput value={v.to_time} onChange={set("to_time")} /></Field>
            </FormGrid>
          )}

          {kind === "overtime" && (
            <>
              <Field label="Hours" required><NumberInput value={hours} onChange={setHours} min={0.5} max={12} step={0.5} suffix="h" /></Field>
              <div className="rounded-xl border border-line px-4 py-3">
                <Checkbox checked={v.consent} onChange={set("consent")} label="I agree to work this overtime"
                  description={opts?.overtime_request.consent_text} />
              </div>
            </>
          )}

          <Field label="Reason" required={kind !== "permission"}>
            <Textarea value={v.reason} onValueChange={set("reason")} rows={2} autoGrow />
          </Field>
        </div>
      )}
    </Modal>
  );
}
