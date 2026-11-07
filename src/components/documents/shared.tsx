"use client";

/*
 * Shared pieces for files, policies, letters and templates:
 * response types, status badges, the audience picker, a PDF/HTML frame and a signature pad.
 */
import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, MultiSelect, RadioCards, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import { loadEmployees, employeeOptionsFor } from "@/components/workplace/pickers";
import { fileHref, type FileRef } from "@/components/workplace/files";

export type Audience = { all: boolean; department_ids?: number[]; roles?: string[]; employee_ids?: number[] };
export type Folder = {
  uuid: string; id: number; name: string; area: "company" | "department" | "hr" | "personal"; area_label: string;
  description: string | null; department_id: number | null; department_name: string | null; is_system: boolean; file_count: number;
};
export type DocFile = {
  uuid: string; title: string; description: string | null; version: number; folder_uuid: string; folder_name: string; area: string;
  employee_id: number | null; employee_name: string | null; audience: Audience; visible_to_employee: boolean; allow_download: boolean;
  expires_on: string | null; source: string; tags: string[]; uploaded_by_name: string | null; archived: boolean;
  created_at: string; updated_at: string; file: FileRef | null;
  versions?: { version: number; note: string | null; created_by_name: string | null; created_at: string; file: FileRef | null }[];
  can_edit?: boolean;
};
export type PolicyVersion = {
  uuid: string; version: number; change_note: string | null; effective_from: string; ack_due_on: string | null;
  published_at: string; published_by_name: string | null; body_html: string | null; file: FileRef | null;
};
export type Stats = { assigned: number; acknowledged: number; pending: number; overdue: number };
export type Policy = {
  uuid: string; title: string; category_id: number | null; category_name: string | null; description: string | null;
  audience: Audience; requires_ack: boolean; ack_due_days: number; reminder_every_days: number; is_posh: boolean;
  review_on: string | null; owner_name: string | null; active: boolean; current_version: PolicyVersion | null;
  stats: Stats | null; versions?: PolicyVersion[];
  my_status?: "pending" | "overdue" | "acknowledged" | "not_needed"; due_on?: string | null; acknowledged_at?: string | null;
};
export type Signer = {
  uuid: string; position: number; name: string; email: string; label: string | null; status: string;
  signed_at: string | null; declined_at: string | null; decline_reason: string | null; is_me: boolean;
};
export type Esign = {
  uuid: string; status: string; provider: string; signing_order: boolean; expires_at: string | null; completed_at: string | null;
  message: string | null; signed_file: FileRef | null; signers: Signer[];
};
export type Letter = {
  uuid: string; reference_no: string | null; title: string; letter_type: string; letter_type_label: string | null;
  employee_id: number | null; employee_name: string | null; status: string; template_name: string | null;
  generated_by_name: string | null; created_at: string; file: FileRef | null; values?: Record<string, string>; esign?: Esign | null;
};
export type ExtraField = { key: string; label: string; type: string; required?: boolean };
export type TemplateSigner = { kind: string; employee_id?: number; label?: string | null };
export type Template = {
  id: number; uuid: string; name: string; letter_type: string; letter_type_label: string | null; description: string | null;
  subject: string | null; header_id: number | null; footer_id: number | null; page_size: string; orientation: string;
  margin_top: number; margin_right: number; margin_bottom: number; margin_left: number; font_family: string; font_size: number;
  extra_fields: ExtraField[]; self_service: boolean; esign_required: boolean; signers: TemplateSigner[]; signing_order: boolean;
  is_default: boolean; active: boolean; version: number; updated_at: string; body_html?: string; fields_used?: string[];
};
export type Letterhead = { id: number; uuid: string; kind: "header" | "footer"; name: string; html: string; height_mm: number; is_default: boolean; active: boolean };
export type MergeGroup = { group: string; label: string; fields: { key: string; label: string; sample: string }[] };
export type LettersMeta = {
  letter_types: { value: string; label: string }[]; page_sizes: string[]; fonts: string[]; merge_fields: MergeGroup[];
  providers: { key: string; label: string; ready: boolean }[];
};

export const LETTER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  issued: { label: "Issued", tone: "good" }, out_for_signature: { label: "Out for signature", tone: "warn" },
  signed: { label: "Signed", tone: "accent" }, declined: { label: "Declined", tone: "bad" }, cancelled: { label: "Withdrawn", tone: "neutral" },
};
export const SIGNER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  waiting: { label: "Waiting for turn", tone: "neutral" }, pending: { label: "To sign", tone: "warn" }, signed: { label: "Signed", tone: "good" },
  declined: { label: "Declined", tone: "bad" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
export const ACK_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "To acknowledge", tone: "warn" }, overdue: { label: "Overdue", tone: "bad" },
  acknowledged: { label: "Acknowledged", tone: "good" }, not_needed: { label: "For reading", tone: "neutral" },
};
export const REQUEST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for approval", tone: "warn" }, approved: { label: "Ready", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" }, cancelled: { label: "Withdrawn", tone: "neutral" },
};
export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: BadgeTone }>; value: string }) {
  const s = map[value];
  return <Badge tone={s?.tone ?? "neutral"} dot>{s?.label ?? value}</Badge>;
}

const ROLE_OPTIONS: SelectOption<string>[] = [
  { value: "employee", label: "Employees" }, { value: "manager", label: "Managers" }, { value: "hr", label: "HR" }, { value: "admin", label: "HR admins" },
];

async function loadDepartments(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.getCached<{ id: number; department_name: string; active: boolean }[]>("/departments/", 60);
  const t = q.trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((d) => d.active && (!t || d.department_name.toLowerCase().includes(t)))
    .map((d) => ({ value: d.id, label: d.department_name }));
}
export { loadDepartments };

export function audienceLabel(a?: Audience | null): string {
  if (!a || a.all || (!a.department_ids?.length && !a.roles?.length && !a.employee_ids?.length)) return "Everyone";
  const parts = [];
  if (a.department_ids?.length) parts.push(`${a.department_ids.length} department${a.department_ids.length > 1 ? "s" : ""}`);
  if (a.roles?.length) parts.push(a.roles.map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r).join(", "));
  if (a.employee_ids?.length) parts.push(`${a.employee_ids.length} ${a.employee_ids.length > 1 ? "people" : "person"}`);
  return parts.join(" · ");
}

/** Everyone, or chosen departments / roles / people. */
export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const limited = !value.all;
  const [known, setKnown] = useState<{ depts: SelectOption<number>[]; people: SelectOption<number>[] }>({ depts: [], people: [] });
  useEffect(() => {
    let live = true;
    (async () => {
      const depts = value.department_ids?.length ? (await loadDepartments("")).filter((d) => value.department_ids!.includes(d.value)) : [];
      const people = value.employee_ids?.length ? await employeeOptionsFor(value.employee_ids) : [];
      if (live) setKnown({ depts, people });
    })().catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-3">
      <RadioCards columns={2} value={limited ? "some" : "all"}
        onChange={(v) => onChange(v === "all" ? { all: true } : { all: false, department_ids: [], roles: [], employee_ids: [] })}
        options={[{ value: "all", label: "Everyone", description: "All active employees" }, { value: "some", label: "Chosen people", description: "By department, role or name" }]} />
      {limited && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MultiSelect<number> value={value.department_ids ?? []} onChange={(v) => onChange({ ...value, department_ids: v })}
            loadOptions={loadDepartments} selectedOptions={known.depts} placeholder="Departments" />
          <MultiSelect<string> value={value.roles ?? []} onChange={(v) => onChange({ ...value, roles: v })} options={ROLE_OPTIONS} placeholder="Roles" />
          <MultiSelect<number> value={value.employee_ids ?? []} onChange={(v) => onChange({ ...value, employee_ids: v })}
            loadOptions={loadEmployees} selectedOptions={known.people} placeholder="People" />
        </div>
      )}
    </div>
  );
}

/** A file shown inline: PDFs and images in a frame, other types as a link. */
export function FilePreview({ file, height = 520 }: { file: FileRef | null | undefined; height?: number }) {
  if (!file?.url) return <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-[13.5px] text-muted">No file</p>;
  const href = fileHref(file.url);
  if (file.content_type?.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={href} alt={file.name} className="max-h-[520px] w-full rounded-xl border border-line object-contain" />;
  }
  if (file.content_type === "application/pdf" || file.content_type?.startsWith("text/")) {
    return <iframe title={file.name} src={href} className="w-full rounded-xl border border-line bg-sunken" style={{ height }} />;
  }
  return (
    <div className="rounded-xl border border-line p-6 text-center text-[13.5px] text-muted">
      This file can&apos;t be shown here. <a href={fileHref(file.download_url || file.url)} className="text-primary hover:underline">Download it</a>.
    </div>
  );
}

/** Sandboxed frame for HTML (policy text, letter previews). `scale` fits an A4 sheet into narrow panes. */
export function HtmlFrame({ html, height = 560, title = "Preview" }: { html: string; height?: number; title?: string }) {
  return <iframe title={title} sandbox="" srcDoc={html} className="w-full rounded-xl border border-line bg-[#eceae6]" style={{ height }} />;
}

/** Simple signature pad: draw with mouse, pen or finger; gives a PNG data URL (null when empty). */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2430";
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div>
      <canvas ref={canvas} className="h-36 w-full touch-none rounded-xl border border-line bg-surface"
        onPointerDown={(e) => { drawing.current = true; const [x, y] = pos(e); const ctx = canvas.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = canvas.current!.getContext("2d")!; ctx.lineTo(x, y); ctx.stroke(); drawn.current = true; }}
        onPointerUp={() => { drawing.current = false; if (drawn.current) onChange(canvas.current!.toDataURL("image/png")); }}
        onPointerLeave={() => { if (drawing.current) { drawing.current = false; if (drawn.current) onChange(canvas.current!.toDataURL("image/png")); } }} />
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-faint">
        <span>Sign inside the box</span>
        <Button size="sm" variant="ghost" icon={Eraser} type="button" onClick={() => {
          const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); drawn.current = false; onChange(null);
        }}>Clear</Button>
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, tone = "bg-primary" }: { value: number; total: number; tone?: string }) {
  const pct = total ? Math.round((100 * value) / total) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-[60px] overflow-hidden rounded-full bg-sunken"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="tabular w-9 shrink-0 text-right text-[12px] text-muted">{pct}%</span>
    </div>
  );
}

export function errText(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}
