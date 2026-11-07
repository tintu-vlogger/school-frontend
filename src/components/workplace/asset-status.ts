/* Labels and badge tones for assets (register, my assets, reports). */
import type { BadgeTone } from "@/components/ui-kit";

export const ASSET_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  available: { label: "Available", tone: "good" },
  assigned: { label: "Assigned", tone: "accent" },
  in_repair: { label: "In repair", tone: "warn" },
  lost: { label: "Lost", tone: "bad" },
  retired: { label: "Retired", tone: "neutral" },
};

export const CONDITION_LABEL: Record<string, string> = {
  new: "New", good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged", lost: "Lost",
};

export const CONDITION_OPTIONS = Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }));

export const ASSIGNMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_ack: { label: "Waiting for confirmation", tone: "warn" },
  active: { label: "With employee", tone: "accent" },
  returned: { label: "Returned", tone: "neutral" },
};

export const RECOVERY_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  none: { label: "None", tone: "neutral" },
  pending: { label: "To recover", tone: "warn" },
  recovered: { label: "Recovered", tone: "good" },
  waived: { label: "Waived", tone: "neutral" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for approval", tone: "warn" },
  approved: { label: "Approved", tone: "info" },
  rejected: { label: "Rejected", tone: "bad" },
  fulfilled: { label: "Handed over", tone: "good" },
  cancelled: { label: "Withdrawn", tone: "neutral" },
};

export const MAINTENANCE_KIND: Record<string, string> = { repair: "Repair", service: "Service", upgrade: "Upgrade", inspection: "Inspection" };
