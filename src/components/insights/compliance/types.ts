import type { BadgeTone } from "@/components/ui-kit";

export type ComplianceStatus = "done" | "pending" | "late" | "not_applicable";

export type ComplianceItem = {
  key: string;
  kind: string;
  label: string;
  legal_entity_id: number | null;
  legal_entity: string | null;
  state: string | null;
  state_name: string | null;
  period: string | null;
  due_date: string;
  status: ComplianceStatus;
  days_left: number;
  amount?: string | number | null;
  reference?: string | null;
  done_on?: string | null;
  notes?: string | null;
  source: "payroll" | "compliance";
  markable?: boolean;
  guidance: string;
  action?: string | null;
};

export type RiskPerson = { uuid: string; name: string; code: string | null; detail: string };

export type RiskAlert = {
  key: string;
  title: string;
  severity: "high" | "medium" | "low";
  count: number;
  people: RiskPerson[];
  guidance: string;
  link: string;
};

export type LawNotice = {
  id: string;
  key: string;
  date: string;
  title: string;
  body: string;
  tags: string[];
  read: boolean;
  source: string;
};

export type ComplianceDashboard = {
  today: string;
  summary: { late: number; due_soon: number; pending: number; done: number; risks: number };
  items: ComplianceItem[];
  alerts: RiskAlert[];
  notices: LawNotice[];
  filters: { entities: { value: number; label: string }[]; states: { value: string; label: string }[] };
  has_payroll: boolean;
};

export const STATUS_META: Record<ComplianceStatus, { label: string; tone: BadgeTone }> = {
  late: { label: "Late", tone: "bad" },
  pending: { label: "Pending", tone: "warn" },
  done: { label: "Done", tone: "good" },
  not_applicable: { label: "Not needed", tone: "neutral" },
};

/** "in 5 days", "Due today", "3 days late". */
export function dueText(item: Pick<ComplianceItem, "days_left" | "status">): string {
  if (item.status === "done" || item.status === "not_applicable") return "";
  const d = item.days_left;
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  if (d > 0) return `in ${d} days`;
  return d === -1 ? "1 day late" : `${-d} days late`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹ amount, or null when there is nothing worth showing. */
export function formatAmount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return inr.format(n);
}

export function itemWhere(item: Pick<ComplianceItem, "legal_entity" | "state_name" | "state">): string {
  return [item.legal_entity, item.state_name || item.state].filter(Boolean).join(" · ") || "All entities";
}
