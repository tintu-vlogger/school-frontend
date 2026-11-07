"use client";

/* "Start an exit" for HR or a manager: person, kind of exit, reason, dates and notice. */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import {
  Button, DateInput, Field, FormGrid, FormSection, MasterSelect, Modal, ModalCancel, NumberInput, Select, TextInput, Toggle,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { errMsg, reasonParentFor, type ExitDetail, type ExitMeta } from "./types";

export function StartExitModal({ open, onClose, meta, onCreated }: {
  open: boolean; onClose: () => void; meta: ExitMeta | null; onCreated: (x: ExitDetail) => void;
}) {
  const toast = useToast();
  const [employee, setEmployee] = useState<number | null>(null);
  const [type, setType] = useState<string>("resignation");
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [parent, setParent] = useState<number | null>(null);
  const [resigned, setResigned] = useState(todayISO());
  const [lastDay, setLastDay] = useState("");
  const [notice, setNotice] = useState("serve");
  const [replacement, setReplacement] = useState(false);
  const [avgPay, setAvgPay] = useState<number | null>(null);
  const [layoffDays, setLayoffDays] = useState<number | null>(null);
  const [permission, setPermission] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmployee(null); setType("resignation"); setReasonId(null); setReasonText(""); setResigned(todayISO()); setLastDay("");
    setNotice("serve"); setReplacement(false); setAvgPay(null); setLayoffDays(null); setPermission("");
  }, [open]);
  useEffect(() => { setReasonId(null); reasonParentFor(type).then(setParent); }, [type]);

  const typeOptions = Object.entries(meta?.types ?? {}).map(([value, label]) => ({ value, label }));
  const noticeOptions = Object.entries(meta?.notice_actions ?? {}).map(([value, label]) => ({ value, label }));
  const hasNotice = meta?.type_rules?.[type]?.notice ?? true;
  const comp = type === "retrenchment" || type === "layoff";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) { toast.error("Pick the employee."); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        employee_id: employee, exit_type: type, reason_id: reasonId, reason_text: reasonText || null,
        resignation_date: resigned || null, last_working_day: lastDay || null, notice_action: hasNotice ? notice : null,
        replacement_needed: replacement,
      };
      if (comp) body.compensation = { average_monthly_pay: avgPay ?? undefined, layoff_days: layoffDays ?? undefined, permission_reference: permission || undefined };
      const x = await api.post<ExitDetail>("/exits", body);
      toast.success(x.status === "requested" ? "Exit raised and sent for approval" : "Exit started");
      onCreated(x);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start an exit" size="lg" busy={busy}
      description="Clearances, the exit interview and the settlement deadline are set up once it is accepted."
      footer={<><ModalCancel /><Button type="submit" form="start-exit" variant="primary" loading={busy}>Start exit</Button></>}>
      <form id="start-exit" onSubmit={submit}>
        <FormSection title="Who and why">
          <FormGrid columns={2}>
            <Field label="Employee" required>
              <Select<number> value={employee} onChange={(v) => setEmployee(v)} loadOptions={loadEmployees} placeholder="Search people" />
            </Field>
            <Field label="Kind of exit" required>
              <Select value={type} onChange={(v) => v && setType(v)} options={typeOptions} />
            </Field>
            <Field label="Reason">
              <MasterSelect type="exit_reason" parentId={parent} value={reasonId} onChange={(v) => setReasonId(v)} clearable />
            </Field>
            <Field label="Details" hint="Optional, in your words">
              <TextInput value={reasonText} onValueChange={setReasonText} />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Dates and notice">
          <FormGrid columns={2}>
            <Field label={type === "resignation" ? "Resignation date" : type === "death" ? "Date of death" : "Notice date"} required>
              <DateInput value={resigned} onChange={setResigned} />
            </Field>
            <Field label="Last working day" hint="Leave empty to use the notice period">
              <DateInput value={lastDay} onChange={setLastDay} min={resigned || undefined} clearable />
            </Field>
            {hasNotice && (
              <Field label="If the notice falls short">
                <Select value={notice} onChange={(v) => v && setNotice(v)} options={noticeOptions} />
              </Field>
            )}
            <div className="flex items-end pb-1">
              <Toggle checked={replacement} onChange={setReplacement} label="Replacement needed" description="Reminds HR to raise a hiring request" />
            </div>
          </FormGrid>
        </FormSection>
        {comp && (
          <FormSection title={type === "retrenchment" ? "Retrenchment compensation" : "Lay-off compensation"}
            description={type === "retrenchment"
              ? "15 days' average pay for every completed year, plus 15 days' wages to the re-skilling fund."
              : "A share of basic and DA for each laid-off day."}>
            <FormGrid columns={2}>
              <Field label="Average monthly pay" hint="Leave empty to use the salary on record">
                <NumberInput value={avgPay} onChange={setAvgPay} min={0} suffix="₹" />
              </Field>
              {type === "layoff" ? (
                <Field label="Days laid off"><NumberInput value={layoffDays} onChange={setLayoffDays} min={0} /></Field>
              ) : (
                <Field label="Government permission reference" hint="Needed at 300 or more workers">
                  <TextInput value={permission} onValueChange={setPermission} />
                </Field>
              )}
            </FormGrid>
          </FormSection>
        )}
      </form>
    </Modal>
  );
}
