import type { BadgeTone } from "@/components/ui-kit";

export type EntityColumn = { key: string; label: string; required: boolean; type: string; help: string; example: string };
export type Mode = "add" | "update" | "upsert";

export type DataEntity = {
  key: string;
  label: string;
  description: string;
  note: string;
  columns: EntityColumn[];
  match_keys: { value: string; label: string }[];
  modes: Mode[];
  can_import: boolean;
  can_export: boolean;
};

export type EntitiesResponse = {
  entities: DataEntity[];
  modes: { value: Mode; label: string }[];
  max_rows: number;
  max_mb: number;
};

export type JobStatus = "uploaded" | "validated" | "queued" | "running" | "done" | "failed";

export type DataJob = {
  uuid: string;
  kind: "import" | "export";
  entity: string;
  entity_label: string;
  mode: Mode;
  mode_label: string;
  match_key: string | null;
  file_name: string | null;
  status: JobStatus;
  total: number;
  processed: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  message: string | null;
  created_by_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_count: number;
  progress: number;
  export_uuid?: string | null;
};

export type PreviewRow = { row: number; action?: "add" | "update" | "error"; values: Record<string, unknown>; errors?: string[] };
export type JobError = { row: number; column: string | null; message: string };

export type FullJob = DataJob & {
  headers: string[];
  mapping: Record<string, string>;
  options: { would_add?: number; would_update?: number; rows_with_errors?: number };
  preview: PreviewRow[];
  errors: JobError[];
  entity_def: DataEntity;
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export const JOB_STATUS: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  uploaded: { label: "Not finished", tone: "neutral" },
  validated: { label: "Checked", tone: "info" },
  queued: { label: "Waiting", tone: "accent" },
  running: { label: "Running", tone: "accent" },
  done: { label: "Done", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
};

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
