"use client";

/*
 * Employee self service: ask HR to change sensitive details (name, date of birth, IDs,
 * a new salary account). Uses the employee.profile_change approval flow; nothing
 * changes until the request is approved.
 *
 *   <SensitiveChangeModal open profile={p} onClose onSent />
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Button, DateInput, Field, FormGrid, FormSection, MasterSelect, Modal, ModalCancel, Select, TextInput, Textarea, Toggle } from "@/components/ui-kit";
import type { Profile } from "./types";

type Values = {
  first_name: string; middle_name: string; last_name: string; phone: string; date_of_birth: string; gender_id: number | null;
  marital_status_id: number | null; father_name: string; spouse_name: string; pan: string; aadhaar: string; uan: string;
  passport_number: string; passport_expiry: string;
};
const LABELS: Record<keyof Values, string> = {
  first_name: "First name", middle_name: "Middle name", last_name: "Last name", phone: "Mobile number", date_of_birth: "Date of birth",
  gender_id: "Gender", marital_status_id: "Marital status", father_name: "Father's name", spouse_name: "Spouse's name", pan: "PAN",
  aadhaar: "Aadhaar", uan: "UAN", passport_number: "Passport number", passport_expiry: "Passport expiry",
};

export function SensitiveChangeModal({ open, profile: p, onClose, onSent }: { open: boolean; profile: Profile; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const initial: Values = {
    first_name: p.first_name, middle_name: p.middle_name ?? "", last_name: p.last_name, phone: p.phone ?? "", date_of_birth: p.date_of_birth ?? "",
    gender_id: p.gender_id, marital_status_id: p.marital_status_id, father_name: p.father_name ?? "", spouse_name: p.spouse_name ?? "",
    pan: p.pan ?? "", aadhaar: "", uan: p.uan ?? "", passport_number: p.passport_number ?? "", passport_expiry: p.passport_expiry ?? "",
  };
  const [v, setV] = useState<Values>(initial);
  const [bankOn, setBankOn] = useState(false);
  const [bank, setBank] = useState({ bank_id: null as number | null, account_holder: `${p.first_name} ${p.last_name}`, account_number: "", ifsc: "", branch: "", account_type: "savings" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Values>(k: K, x: Values[K]) => setV((s) => ({ ...s, [k]: x }));
  const changes: Record<string, unknown> = Object.fromEntries((Object.keys(v) as (keyof Values)[])
    .filter((k) => (k === "aadhaar" ? !!v.aadhaar.trim() : v[k] !== initial[k]))
    .map((k) => [k, typeof v[k] === "string" ? ((v[k] as string).replace(k === "aadhaar" ? /\s/g : /^$/, "") || null) : v[k]]));
  if (bankOn && bank.account_number && bank.ifsc) changes.bank_account = { ...bank, ifsc: bank.ifsc.toUpperCase() };
  const count = Object.keys(changes).length;

  async function send() {
    setSaving(true);
    try {
      const r = await api.post<{ reference_no: string; status: string }>("/me/profile-change", { changes, reason: reason || null });
      toast.success(r.status === "approved" ? "Your details were updated" : "Request sent to HR", {
        description: r.reference_no || undefined,
        action: r.status === "approved" ? undefined : { label: "Track it", onClick: () => router.push("/dashboard/inbox?tab=mine") },
      });
      onSent();
    } catch (e) { toast.error("Couldn't send the request", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} dirty={count > 0 || !!reason}
      title="Request a change" description="HR checks these changes before they are applied. Attach proof under Documents if HR asks for it."
      footerStart={count > 0 ? <span className="text-[13px] text-muted">{count} {count === 1 ? "change" : "changes"}: {Object.keys(changes).map((k) => k === "bank_account" ? "new bank account" : LABELS[k as keyof Values]).join(", ")}</span> : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} disabled={!count} onClick={send}>Send request</Button></>}>
      <FormSection title="Name and personal details">
        <FormGrid columns={3}>
          <Field label="First name"><TextInput value={v.first_name} onValueChange={(x) => set("first_name", x)} /></Field>
          <Field label="Middle name"><TextInput value={v.middle_name} onValueChange={(x) => set("middle_name", x)} /></Field>
          <Field label="Last name"><TextInput value={v.last_name} onValueChange={(x) => set("last_name", x)} /></Field>
          <Field label="Date of birth"><DateInput value={v.date_of_birth} onChange={(x) => set("date_of_birth", x)} /></Field>
          <Field label="Gender"><MasterSelect type="gender" value={v.gender_id} onChange={(x) => set("gender_id", x)} allowCreate={false} /></Field>
          <Field label="Marital status"><MasterSelect type="marital_status" value={v.marital_status_id} onChange={(x) => set("marital_status_id", x)} allowCreate={false} /></Field>
          <Field label="Father's name"><TextInput value={v.father_name} onValueChange={(x) => set("father_name", x)} /></Field>
          <Field label="Spouse's name"><TextInput value={v.spouse_name} onValueChange={(x) => set("spouse_name", x)} /></Field>
          <Field label="Mobile number"><TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Government IDs">
        <FormGrid columns={3}>
          <Field label="PAN"><TextInput value={v.pan} onValueChange={(x) => set("pan", x.toUpperCase())} maxLength={10} className="font-mono" /></Field>
          <Field label="Aadhaar" hint={p.aadhaar_masked ? `On record: ${p.aadhaar_masked}` : undefined}><TextInput value={v.aadhaar} onValueChange={(x) => set("aadhaar", x.replace(/[^\d ]/g, "").slice(0, 14))} placeholder="Only to replace it" inputMode="numeric" className="font-mono" /></Field>
          <Field label="UAN"><TextInput value={v.uan} onValueChange={(x) => set("uan", x.replace(/\D/g, "").slice(0, 12))} className="font-mono" /></Field>
          <Field label="Passport number"><TextInput value={v.passport_number} onValueChange={(x) => set("passport_number", x.toUpperCase())} className="font-mono" /></Field>
          <Field label="Passport expiry"><DateInput value={v.passport_expiry} onChange={(x) => set("passport_expiry", x)} clearable /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Salary account">
        <Toggle checked={bankOn} onChange={setBankOn} label="Pay my salary into a new account" className="mb-4" />
        {bankOn && (
          <FormGrid columns={3}>
            <Field label="Bank"><MasterSelect type="bank" value={bank.bank_id} onChange={(x) => setBank({ ...bank, bank_id: x })} allowCreate={false} /></Field>
            <Field label="Account holder"><TextInput value={bank.account_holder} onValueChange={(x) => setBank({ ...bank, account_holder: x })} /></Field>
            <Field label="Account number"><TextInput value={bank.account_number} onValueChange={(x) => setBank({ ...bank, account_number: x.replace(/\s/g, "") })} className="font-mono" /></Field>
            <Field label="IFSC"><TextInput value={bank.ifsc} onValueChange={(x) => setBank({ ...bank, ifsc: x.toUpperCase() })} maxLength={11} className="font-mono" /></Field>
            <Field label="Branch"><TextInput value={bank.branch} onValueChange={(x) => setBank({ ...bank, branch: x })} /></Field>
            <Field label="Account type"><Select value={bank.account_type} onChange={(x) => setBank({ ...bank, account_type: x ?? "savings" })} options={[{ value: "savings", label: "Savings" }, { value: "salary", label: "Salary" }]} /></Field>
          </FormGrid>
        )}
      </FormSection>
      <Field label="Reason" hint="e.g. Name changed after marriage">
        <Textarea value={reason} onValueChange={setReason} rows={2} autoGrow />
      </Field>
    </Modal>
  );
}
