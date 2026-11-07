/* Shapes returned by /automation (rules, run log, webhooks). */
import type { SelectOption } from "@/components/ui-kit";

export type Action = {
  type: "notify" | "email" | "task" | "update_field" | "workflow" | "webhook";
  to?: string[];
  addresses?: string[];
  title?: string | null;
  body?: string | null;
  link?: string | null;
  subject?: string | null;
  description?: string | null;
  assignee?: string;
  due_in_days?: number | null;
  priority?: string;
  field?: string;
  value?: string | number | null;
  formula?: string | null;
  note?: string | null;
  webhook_uuid?: string;
};

export type Rule = {
  uuid: string; name: string; description: string | null; entity: string; entity_label: string;
  trigger: string; trigger_label: string; fields: string[]; request_type: string | null; date_field: string | null;
  offset_days: number; repeat_yearly: boolean; condition: string | null; actions: Action[]; active: boolean;
  run_count: number; last_run_at: string | null; created_by_name: string | null; created_at: string; summary: string;
};

export type RuleDraft = {
  name: string; description: string; entity: string; trigger: string; fields: string[]; request_type: string | null;
  date_field: string | null; offset_days: number; repeat_yearly: boolean; condition: string; actions: Action[]; active: boolean;
};

export type EntityMeta = {
  key: string; label: string; triggers: string[]; fields: SelectOption[]; date_fields: SelectOption[];
  condition_fields: { name: string; label: string }[];
};

export type Meta = {
  entities: EntityMeta[];
  triggers: SelectOption[];
  action_types: SelectOption[];
  audiences: SelectOption[];
  roles: SelectOption[];
  update_fields: (SelectOption & { kind: string })[];
  work_modes: SelectOption[];
  request_types: SelectOption[];
  webhooks: (SelectOption & { active: boolean })[];
  priorities: SelectOption[];
};

export type ActionResult = { type: string; ok: boolean; detail: string };

export type Run = {
  uuid: string; rule_name: string | null; trigger: string; trigger_label: string; entity: string; record_id: number | null;
  record_label: string | null; matched: boolean; status: "done" | "partial" | "failed" | "skipped"; results: ActionResult[];
  error: string | null; created_at: string;
};

export type Webhook = {
  uuid: string; name: string; url: string; headers: Record<string, string>; active: boolean; secret: string | null;
  secret_hint: string; created_at: string; deliveries?: { sent: number; queued: number; failed: number };
};

export type Delivery = {
  uuid: string; webhook_name: string | null; event: string; status: "queued" | "sent" | "failed"; attempts: number;
  response_status: number | null; response_body: string | null; error: string | null; next_attempt_at: string | null;
  sent_at: string | null; created_at: string; payload: Record<string, unknown>;
};

export type Preview = {
  matched: boolean; status: string; results: ActionResult[]; error: string | null; record_label: string;
  values: { record?: Record<string, unknown>; employee?: Record<string, unknown> };
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export const RUN_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { done: "good", partial: "warn", failed: "bad", skipped: "neutral" };
export const RUN_LABEL: Record<string, string> = { done: "Done", partial: "Partly done", failed: "Failed", skipped: "Condition not met" };
export const DELIVERY_TONE: Record<string, "good" | "warn" | "bad"> = { sent: "good", queued: "warn", failed: "bad" };
export const DELIVERY_LABEL: Record<string, string> = { sent: "Delivered", queued: "Will retry", failed: "Failed" };

export function emptyDraft(): RuleDraft {
  return {
    name: "", description: "", entity: "employee", trigger: "created", fields: [], request_type: null, date_field: null,
    offset_days: 0, repeat_yearly: false, condition: "", active: true,
    actions: [{ type: "notify", to: ["employee"], title: "", body: "" }],
  };
}

export function draftFrom(r: Rule): RuleDraft {
  return {
    name: r.name, description: r.description ?? "", entity: r.entity, trigger: r.trigger, fields: r.fields ?? [],
    request_type: r.request_type, date_field: r.date_field, offset_days: r.offset_days, repeat_yearly: r.repeat_yearly,
    condition: r.condition ?? "", actions: r.actions.map((a) => ({ ...a })), active: r.active,
  };
}

export function newAction(type: Action["type"]): Action {
  switch (type) {
    case "notify": return { type, to: ["employee"], title: "", body: "" };
    case "email": return { type, to: ["employee"], addresses: [], subject: "", body: "" };
    case "task": return { type, title: "", description: "", assignee: "manager", due_in_days: 3, priority: "medium" };
    case "update_field": return { type, field: "work_mode", value: null, formula: null };
    case "workflow": return { type, title: "", note: "" };
    case "webhook": return { type, webhook_uuid: "" };
  }
}
