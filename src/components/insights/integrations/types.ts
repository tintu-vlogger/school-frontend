import type { BadgeTone } from "@/components/ui-kit";

export type IntegrationStatus = "not_set_up" | "saved" | "connected" | "error" | "off";

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "toggle";
  secret: boolean;
  required: boolean;
  options: { value: string; label: string }[] | null;
  help: string;
  placeholder: string;
};

export type Integration = {
  kind: string;
  label: string;
  group: string;
  description: string;
  fields: IntegrationField[];
  enabled: boolean;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  secret_hints: Record<string, string>;
  last_tested_at: string | null;
  last_message: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
};

export type McpTool = { name: string; description: string };

export type IntegrationsResponse = {
  integrations: Integration[];
  mcp: { path: string; sse_path: string; tools: McpTool[] };
};

export type AccessToken = {
  uuid: string;
  name: string;
  prefix: string;
  scopes: string[];
  state: "active" | "revoked" | "expired";
  owner_name: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

export type TokensResponse = { tokens: AccessToken[]; can_connect: boolean; tools: McpTool[] };

export const STATUS: Record<IntegrationStatus, { label: string; tone: BadgeTone }> = {
  connected: { label: "Connected", tone: "good" },
  saved: { label: "Saved", tone: "info" },
  error: { label: "Needs attention", tone: "bad" },
  off: { label: "Off", tone: "neutral" },
  not_set_up: { label: "Not set up", tone: "neutral" },
};

export const GROUP_ORDER = ["AI", "Messages", "Finance", "Sign-in", "Hiring"];
