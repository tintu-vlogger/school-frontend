/*
 * Org chart data (GET /organization/org-chart) turned into trees for export and print.
 *
 *   peopleTree(nodes, { rootId, open })   reporting lines (only expanded branches when `open` is given)
 *   deptTree(departments)                 departments with heads and head count
 */
import type { ChartNode } from "./chart-export";

export type OrgPerson = {
  id: number; uuid: string; name: string; preferred_name: string | null; photo: string | null; code: string | null;
  designation: string | null; department_id: number | null; department: string | null; location: string | null;
  manager_id: number | null; reports: number; status: string;
};
export type OrgDept = { id: number; uuid: string; name: string; code: string | null; parent_id: number | null; head: { uuid: string; name: string; photo: string | null } | null; count: number };
export type OrgData = { nodes: OrgPerson[]; departments: OrgDept[] };

const STAGE: Record<string, string> = { probation: "On probation", notice: "On notice", pre_joining: "Joining soon" };

export function peopleTree(nodes: OrgPerson[], opts: { rootId?: number | null; open?: Set<number> | null; depth?: number | null } = {}): ChartNode[] {
  const kids = new Map<number | null, OrgPerson[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const m = n.manager_id !== null && ids.has(n.manager_id) ? n.manager_id : null;
    kids.set(m, [...(kids.get(m) ?? []), n]);
  }
  for (const list of kids.values()) list.sort((a, b) => (b.reports > 0 ? 1 : 0) - (a.reports > 0 ? 1 : 0) || a.name.localeCompare(b.name));
  const build = (n: OrgPerson, level: number): ChartNode => {
    const showKids = (!opts.open || opts.open.has(n.id)) && (opts.depth == null || level < opts.depth);
    return {
      id: n.id, title: n.name, subtitle: n.designation, meta: [n.department, n.location].filter(Boolean).join(" · "),
      badge: STAGE[n.status] ?? null, children: showKids ? (kids.get(n.id) ?? []).map((k) => build(k, level + 1)) : [],
    };
  };
  if (opts.rootId != null) {
    const r = nodes.find((n) => n.id === opts.rootId);
    return r ? [build(r, 1)] : [];
  }
  return (kids.get(null) ?? []).map((r) => build(r, 1));
}

export function deptTree(departments: OrgDept[]): ChartNode[] {
  const ids = new Set(departments.map((d) => d.id));
  const kids = new Map<number | null, OrgDept[]>();
  for (const d of departments) { const p = d.parent_id && ids.has(d.parent_id) ? d.parent_id : null; kids.set(p, [...(kids.get(p) ?? []), d]); }
  const build = (d: OrgDept): ChartNode => ({
    id: d.id, title: d.name, subtitle: d.head ? `Head: ${d.head.name}` : "No head",
    meta: `${d.count} ${d.count === 1 ? "person" : "people"}${d.code ? ` · ${d.code}` : ""}`, children: (kids.get(d.id) ?? []).map(build),
  });
  return (kids.get(null) ?? []).map(build);
}

export const countNodes = (roots: ChartNode[]): number => roots.reduce((s, r) => s + 1 + countNodes(r.children), 0);
