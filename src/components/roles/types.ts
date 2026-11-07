/*
 * Shapes returned by the roles API (/roles/...) and small helpers shared by the
 * Roles & access page.
 */

export type Permission = { key: string; label: string; scopable: boolean };
export type PermissionGroup = { key: string; label: string; hint: string; permissions: Permission[] };
export type Option = { key: string; label: string };
export type SensitiveField = { key: string; label: string; hint: string };
export type FieldLevel = "hidden" | "masked" | "full";

export type Catalog = {
  groups: PermissionGroup[];
  scopes: Option[];
  fields: SensitiveField[];
  field_levels: Option[];
  total: number;
};

export type Role = {
  id: number;
  uuid: string;
  role_name: string;
  display_name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  locked: boolean;
  customised: boolean;
  scopes: Record<string, string>;
  field_access: Record<string, FieldLevel>;
  permission_count: number;
  total_permissions: number;
  member_count: number;
  updated_at: string | null;
};

export type RoleRef = { id: number; display_name: string; role_name: string; is_system: boolean };

export type Person = {
  id: number;
  uuid: string;
  name: string;
  email: string | null;
  employee_code: string | null;
  profile_image_url: string | null;
  designation: string | null;
  department: string | null;
  base_role: string | null;
  is_owner: boolean;
  roles: RoleRef[];
};

export type PeoplePage = { items: Person[]; total: number; page: number; size: number };

export type BulkResult = { changed: number; skipped: { id: number; reason: string }[] };

export function errorText(e: unknown, fallback = "Something went wrong. Please try again.") {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** The API answers 403 with "Permission denied: ..." or "Admin access required". */
export function isForbidden(e: unknown) {
  return e instanceof Error && /permission denied|access required|not allowed|forbidden/i.test(e.message);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
