/*
 * Shapes returned by /custom-forms (custom services: no-code forms).
 * A form definition is { fields: FormField[] }; see backend modules/custom_forms/fields.py.
 */
import type { BadgeTone } from "@/components/ui-kit";

export type FieldType =
  | "text" | "textarea" | "number" | "decimal" | "currency" | "date" | "datetime" | "time" | "boolean"
  | "single_choice" | "multi_choice" | "master" | "employee" | "department" | "location" | "file"
  | "email" | "phone" | "url" | "formula" | "section" | "table";

export type Access = "hidden" | "view" | "edit";

export type FormField = {
  key: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  width?: "half" | "full";
  options?: string[];
  display?: "dropdown" | "radio";
  master?: string;
  multiple?: boolean;
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  decimals?: number;
  formula?: string;
  result?: "number" | "currency" | "text" | "date" | "boolean";
  show_if?: string;
  permissions?: Record<string, Access>;
  columns?: FormField[];
  min_rows?: number;
  max_rows?: number;
  accept?: "any" | "images" | "documents";
  max_files?: number;
  summary?: boolean;
  /** Set by the API for the signed-in person. */
  access?: Access;
};

export type Definition = { fields: FormField[] };
export type Values = Record<string, unknown>;
export type Labels = Record<string, string>;

export type Status = { key: string; label: string; tone: BadgeTone; closed: boolean; system?: boolean };

export type FileRef = { uuid: string; name: string; size?: number; content_type?: string; url?: string | null; download_url?: string | null };

export type ServiceDefinition = {
  uuid: string; code: string; name: string; description: string | null; icon: string; nav_section: string;
  needs_approval: boolean; allow_drafts: boolean; version: number; definition: Definition; defaults: Values;
  labels: Labels; statuses: Status[]; work_statuses: Status[]; can_submit: boolean; can_handle: boolean;
  can_design: boolean; active: boolean;
};

export type RecordRow = {
  uuid: string; reference_no: string | null; title: string | null; status: string; status_label: string;
  status_tone: BadgeTone; closed: boolean; service: { code: string; name: string; icon: string };
  requester_name: string | null; requester_employee_id: number | null; version: number; values: Values;
  labels: Labels; created_at: string; submitted_at: string | null; updated_at: string; closed_at: string | null;
  mine: boolean;
};

export type Activity = {
  uuid: string; kind: "comment" | "status" | "edit" | "system"; author_name: string | null; body: string | null;
  attachments: FileRef[]; data: { from?: string; to?: string; from_label?: string; to_label?: string; fields?: string[]; via?: string };
  mine: boolean; created_at: string;
};

export type RecordDetail = RecordRow & {
  files: Record<string, FileRef[]>;
  definition: Definition;
  version_is_current: boolean;
  service: RecordRow["service"] & { uuid: string; needs_approval: boolean; allow_drafts: boolean };
  can_edit: boolean; can_submit: boolean; can_delete: boolean; can_cancel: boolean; can_change_status: boolean;
  can_comment: boolean; is_handler: boolean; statuses: Status[]; activity: Activity[];
  approval: null | {
    uuid: string; status: string; reference_no: string | null; result_note: string | null;
    tasks: { step_name: string; approver_name: string | null; status: string; comment: string | null; decided_by_name: string | null; decided_at: string | null; created_at: string }[];
  };
};

export type ServiceBrief = {
  uuid: string; code: string; name: string; description: string | null; icon: string; nav_section: string;
  active: boolean; archived: boolean; needs_approval: boolean; template_key: string | null; version: number;
  records: number; pending: number; updated_at: string;
};

export type ServiceFull = ServiceBrief & {
  allow_drafts: boolean; allow_cancel: boolean;
  submit_access: { everyone: boolean; roles?: string[]; team_ids?: number[]; department_ids?: number[]; location_ids?: number[] };
  manager_roles: string[]; manager_employee_ids: number[]; managers: { value: number; label: string }[];
  statuses: Status[]; all_statuses: Status[];
  notify: { managers_on_submit?: boolean; requester_on_status?: boolean; requester_on_comment?: boolean };
  title_field: string | null; definition: Definition; request_type: string; flows: number;
  series: null | { uuid: string; prefix: string; pattern: string; reset: string; active: boolean; next: string | null };
  created_by_name: string | null; created_at: string; archived_by_name: string | null;
};

export type Meta = {
  field_types: { value: FieldType; label: string }[];
  field_groups: { label: string; types: FieldType[] }[];
  table_column_types: FieldType[];
  unique_types: FieldType[];
  formula_results: { value: string; label: string }[];
  requester_variables: { name: string; label: string }[];
  icons: string[];
  nav_sections: { value: string; label: string }[];
  tones: string[];
  roles: { value: string; label: string }[];
  templates: { key: string; name: string; description: string; icon: string; needs_approval: boolean; fields: number; installed: boolean }[];
  can_design: boolean;
  handles_all: boolean;
};

export type NavService = { code: string; name: string; icon: string; nav_section: string; can_submit: boolean; can_handle: boolean };

export type Page<T> = { items: T[]; total: number; page: number; size: number };
