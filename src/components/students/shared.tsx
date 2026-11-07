"use client";

/*
 * Shared pieces for the students screens.
 *   <NewLogins logins={res.new_logins} fileName="grade-5-a-sign-ins.csv" />   // shown once, copy + CSV
 *   <StatusBadge status={s.status} />
 *   photoDataUrl(file) -> small square JPEG data URL for a student photo
 */
import { useState } from "react";
import { Check, Copy, Download, KeyRound } from "lucide-react";
import { Badge, Button, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import { csvLine, downloadText } from "@/components/academics/shared";

export type StudentBrief = {
  id: number; uuid: string; admission_no: string; name: string; first_name: string; last_name: string | null;
  photo_url: string | null; gender: string | null; status: string; section_id: number | null;
  section_label: string | null; program_name: string | null; roll_no: string | null;
};
export type StudentRow = StudentBrief & {
  email: string | null; phone: string | null; date_of_birth: string | null; admission_date: string | null;
  house_id: number | null; house_name: string | null; guardian_name: string | null; guardian_phone: string | null;
  blood_group: string | null; created_at: string;
};
export type PortalAccount = {
  id: number; uuid: string; kind: "parent" | "student"; login: string; active: boolean; must_change_password: boolean;
  last_login_at: string | null;
};
export type GuardianLink = {
  link_id: number; guardian_id: number; guardian_uuid: string; name: string; first_name: string; last_name: string | null;
  email: string | null; phone: string | null; alt_phone: string | null; occupation: string | null; relation: string;
  is_primary: boolean; can_pickup: boolean; receives_notifications: boolean; portal_account?: PortalAccount | null;
};
export type EnrollmentRow = {
  id: number; uuid: string; session_id: number; session_name: string | null; program_id: number; program_name: string | null;
  section_id: number | null; section_label: string | null; roll_no: string | null; status: string; term_no: number | null;
  enrolled_on: string | null;
};
export type StudentFull = StudentRow & {
  middle_name: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null;
  country: string | null; nationality: string | null; religion: string | null; category: string | null;
  mother_tongue: string | null; student_reg_id: string | null; previous_institution: string | null;
  medical_notes: string | null; allergies: string | null; left_on: string | null; leaving_reason: string | null;
  national_id: string | null; custom: Record<string, unknown>; is_boarder: boolean; uses_transport: boolean;
  fee_category: string | null; guardians: GuardianLink[]; enrollments: EnrollmentRow[];
  portal_account: PortalAccount | null; class_teacher_name: string | null; house_color: string | null;
  session_name: string | null;
};
export type NewLogin = { kind: "parent" | "student"; name: string; login: string; password: string; student?: string; admission_no?: string };
export type StudentDoc = {
  id: number; uuid: string; title: string; doc_type: string | null; file_url: string; download_url: string | null;
  file_name: string | null; file_size: number | null; verified: boolean; expires_on: string | null;
  uploaded_by: string | null; created_at: string;
};

export const STATUS_OPTIONS: SelectOption[] = [
  { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "left", label: "Left" },
  { value: "transferred", label: "Transferred" }, { value: "alumni", label: "Alumni" }, { value: "graduated", label: "Graduated" },
];
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "good", suspended: "warn", left: "neutral", transferred: "info", alumni: "accent", graduated: "accent",
};
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{label}</Badge>;
}

export const GENDERS: SelectOption[] = [
  { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" },
];
export const BLOOD_GROUPS: SelectOption[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ value: b, label: b }));
export const RELATIONS: SelectOption[] = [
  { value: "father", label: "Father" }, { value: "mother", label: "Mother" }, { value: "guardian", label: "Guardian" },
  { value: "grandparent", label: "Grandparent" }, { value: "sibling", label: "Sibling" }, { value: "uncle_aunt", label: "Uncle or aunt" },
  { value: "other", label: "Other" },
];
export const relationLabel = (r: string) => RELATIONS.find((o) => o.value === r)?.label ?? r;
export const genderLabel = (g: string | null) => (g ? GENDERS.find((o) => o.value === g)?.label ?? g : null);

/** Read an image file and return a centred square JPEG data URL (default 320px). */
export function photoDataUrl(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Pick an image file.")); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Couldn't read that image.")); return; }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} title={label}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }).catch(() => {}); }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink">
      {done ? <Check size={14} strokeWidth={1.4} className="text-emerald-600" /> : <Copy size={14} strokeWidth={1.4} />}
    </button>
  );
}

export function loginsCsv(logins: NewLogin[]) {
  return [csvLine(["Type", "Name", "Student", "Admission no", "Sign-in", "Password"]),
    ...logins.map((l) => csvLine([l.kind === "parent" ? "Parent" : "Student", l.name, l.student ?? "", l.admission_no ?? "", l.login, l.password]))].join("\n");
}

/** New sign-ins with their one-time passwords: copy buttons and a CSV download. */
export function NewLogins({ logins, fileName = "portal-sign-ins.csv", guardianWord = "Parent", studentWord = "Student" }: {
  logins: NewLogin[]; fileName?: string; guardianWord?: string; studentWord?: string;
}) {
  if (!logins.length) {
    return <p className="text-[13.5px] text-muted">No new sign-ins were needed: everyone already has one, or has no email or phone on record.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[13.5px] text-amber-800">
        <span className="flex items-center gap-2"><KeyRound size={15} strokeWidth={1.4} />These passwords are shown only once. Copy or download them now.</span>
        <Button size="sm" icon={Download} onClick={() => downloadText(fileName, loginsCsv(logins))}>Download CSV</Button>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {logins.map((l, i) => (
          <div key={`${l.login}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13.5px]">
            <div className="min-w-[160px] flex-1">
              <p className="text-ink">{l.name}</p>
              <p className="text-[12.5px] text-muted">{l.kind === "parent" ? guardianWord : studentWord}{l.student && l.kind === "parent" ? ` of ${l.student}` : ""}</p>
            </div>
            <span className="flex items-center gap-1 font-mono text-[12.5px] text-ink/80">{l.login}<CopyButton text={l.login} label="Copy sign-in" /></span>
            <span className="flex items-center gap-1 font-mono text-[12.5px] text-ink">{l.password}<CopyButton text={l.password} label="Copy password" /></span>
            <CopyButton text={`Sign-in: ${l.login}\nPassword: ${l.password}`} label="Copy both" />
          </div>
        ))}
      </div>
    </div>
  );
}
