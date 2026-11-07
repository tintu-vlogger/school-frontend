"use client";

/*
 * Audit log: every change in the company account with the fields that changed (old → new),
 * plus events such as sign-ins. Filters: record type, person, date range and search.
 * Times are shown in the viewer's timezone.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatRelative, formatTime, viewerTimeZone } from "@/lib/datetime";
import { SearchableSelect } from "@/components/ui";
import { Chip, EmptyState, PageHeader, Paper } from "@/components/shell/page";

type Change = { old: unknown; new: unknown };
type Entry = {
  id: number;
  created_at: string;
  actor_type: string;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_uuid: string | null;
  entity_label: string | null;
  changes: Record<string, Change> | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  request_id: string | null;
};
type Filters = { entity_types: { value: string; count: number }[]; actors: { value: string; label: string; type: string }[] };

const SIZE = 25;

const ENTITY_LABEL: Record<string, string> = {
  employees: "Employee", employee: "Employee", employee_settings: "Employee settings", companies: "Company",
  departments: "Department", department: "Department", designations: "Designation", designation: "Designation",
  roster_entries: "Roster", roster: "Roster", roles: "Role", master_types: "Master list", master_values: "Master value",
  custom_field_defs: "Custom field", number_series: "Number series", workflow_definitions: "Approval flow",
  workflow_instances: "Request", workflow_tasks: "Approval task", platform_users: "Platform user", event: "Event",
};

const FIELD_LABEL: Record<string, string> = {
  first_name: "First name", last_name: "Last name", email: "Email", phone: "Phone", role: "Role", active: "Active",
  designation_id: "Designation", department_id: "Department", reporting_manager_id: "Reporting manager",
  employee_code: "Employee ID", timezone: "Timezone", password: "Password", profile_image_url: "Photo",
  company_name: "Company name", department_name: "Name", designation_name: "Name", head_employee_id: "Head",
};

const entityName = (t: string) => ENTITY_LABEL[t] ?? t.replace(/_/g, " ").replace(/s$/, "").replace(/^\w/, (c) => c.toUpperCase());
const fieldName = (f: string) => FIELD_LABEL[f] ?? f.replace(/_id$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function actionText(e: Entry): { text: string; tone: "good" | "accent" | "bad" | "neutral" } {
  if (e.action === "created") return { text: "Added", tone: "good" };
  if (e.action === "updated") return { text: "Changed", tone: "accent" };
  if (e.action === "deleted") return { text: "Removed", tone: "bad" };
  const map: Record<string, string> = {
    "auth.signed_in": "Signed in", "auth.platform_signed_in": "Support signed in",
  };
  return { text: map[e.action] ?? e.action.split(".").pop()!.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), tone: "neutral" };
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function actorLabel(e: Entry) {
  if (e.actor_name) return e.actor_name;
  return { owner: "Company owner", system: "System", platform: "Platform support", anonymous: "Someone" }[e.actor_type] ?? e.actor_type;
}

const inputCls = "h-9 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-primary";

export default function AuditLogPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({ entity_types: [], actors: [] });
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    api.get<Filters>("/audit/filters").then(setFilters).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), size: String(SIZE), tz: viewerTimeZone() });
    if (entity) params.set("entity_type", entity);
    if (actor) params.set("actor", actor);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    if (qDebounced.trim()) params.set("q", qDebounced.trim());
    try {
      const data = await api.get<{ items: Entry[]; total: number }>(`/audit/?${params}`);
      setEntries(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load the audit log");
      setEntries([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, entity, actor, from, to, qDebounced]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / SIZE));
  const anyFilter = entity || actor || from || to || q;
  const reset = () => { setEntity(""); setActor(""); setFrom(""); setTo(""); setQ(""); setPage(1); };

  const entityOptions = [{ value: "", label: "All records" }, ...filters.entity_types.map((t) => ({ value: t.value, label: entityName(t.value), description: `${t.count} entries` }))];
  const actorOptions = [{ value: "", label: "Everyone" }, ...filters.actors.map((a) => ({ value: a.value, label: a.label, description: a.type === "employee" ? "Employee" : a.type === "owner" ? "Company owner" : a.type }))];

  // group rows by calendar day in the viewer's timezone
  let lastDay = "";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Audit log"
        description="Every change in your company account: who made it, when, and exactly what changed. Entries can't be edited or removed." />

      <Paper className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} strokeWidth={1.4} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search records, people or actions"
              className={`${inputCls} w-full pl-9`} />
          </div>
          <div className="w-52"><SearchableSelect options={entityOptions} value={entity} onChange={(v) => { setEntity(String(v)); setPage(1); }} placeholder="All records" /></div>
          <div className="w-52"><SearchableSelect options={actorOptions} value={actor} onChange={(v) => { setActor(String(v)); setPage(1); }} placeholder="Everyone" /></div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCls} aria-label="From date" />
            <span className="text-[13px] text-faint">to</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCls} aria-label="To date" />
          </div>
          {anyFilter && (
            <button onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] text-muted hover:text-ink">
              <X size={14} strokeWidth={1.4} /> Clear
            </button>
          )}
        </div>
      </Paper>

      <Paper className="overflow-hidden">
        {entries === null ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-3 w-16 animate-pulse rounded bg-sunken" />
                <div className="h-3 w-40 animate-pulse rounded bg-sunken" />
                <div className="h-3 flex-1 animate-pulse rounded bg-sunken" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState icon={History} title="Nothing recorded for these filters" hint="Try a wider date range or clear the filters." />
        ) : (
          <ul>
            {entries.map((e) => {
              const day = formatDate(e.created_at);
              const header = day !== lastDay ? day : null;
              lastDay = day;
              const act = actionText(e);
              const fields = Object.entries(e.changes ?? {});
              const expandable = fields.length > 0 || (e.details && Object.keys(e.details).length > 0);
              const isOpen = open === e.id;
              return (
                <Fragment key={e.id}>
                  {header && (
                    <li className="sticky top-0 z-[1] border-b border-line bg-sunken/80 px-5 py-1.5 text-[12px] uppercase tracking-[0.06em] text-faint backdrop-blur">
                      {header}
                    </li>
                  )}
                  <li className="border-b border-line last:border-0">
                    <button type="button" disabled={!expandable} onClick={() => setOpen(isOpen ? null : e.id)}
                      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-sunken/60 disabled:cursor-default">
                      <span className="w-16 shrink-0 text-[13px] tabular-nums text-muted" title={formatDateTime(e.created_at)}>{formatTime(e.created_at)}</span>
                      <span className="w-40 shrink-0 truncate text-[13.5px] text-ink">{actorLabel(e)}</span>
                      <Chip tone={act.tone}>{act.text}</Chip>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                        <span className="text-muted">{entityName(e.entity_type)}</span>
                        {e.entity_label && <> · {e.entity_label}</>}
                        {e.action === "updated" && fields.length > 0 && (
                          <span className="text-faint"> — {fields.slice(0, 3).map(([f]) => fieldName(f)).join(", ")}{fields.length > 3 ? ` +${fields.length - 3}` : ""}</span>
                        )}
                      </span>
                      <span className="hidden shrink-0 text-[12px] text-faint md:inline">{formatRelative(e.created_at)}</span>
                      {expandable ? <ChevronDown size={16} strokeWidth={1.4} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`} /> : <span className="w-4" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-line bg-canvas/60 px-5 py-4">
                        {fields.length > 0 && (
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-faint">
                                <th className="w-48 pb-2 font-normal">Field</th>
                                <th className="pb-2 font-normal">Before</th>
                                <th className="w-6 pb-2" />
                                <th className="pb-2 font-normal">After</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/70">
                              {fields.map(([f, c]) => (
                                <tr key={f}>
                                  <td className="py-2 pr-4 text-muted">{fieldName(f)}</td>
                                  <td className="break-all py-2 pr-2 text-rose-700/80">{show(c.old)}</td>
                                  <td className="py-2 text-faint"><ArrowRight size={13} strokeWidth={1.4} /></td>
                                  <td className="break-all py-2 pl-2 text-emerald-700">{show(c.new)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {e.details && Object.keys(e.details).length > 0 && (
                          <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-[13px]">
                            {Object.entries(e.details).map(([k, v]) => (
                              <Fragment key={k}><dt className="text-muted">{fieldName(k)}</dt><dd className="text-ink">{show(v)}</dd></Fragment>
                            ))}
                          </dl>
                        )}
                        <p className="mt-3 text-[12px] text-faint">
                          {formatDateTime(e.created_at)}{e.ip_address ? ` · from ${e.ip_address}` : ""}{e.request_id ? ` · ref ${e.request_id.slice(0, 8)}` : ""}
                        </p>
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}

        {total > SIZE && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[13px] text-muted">{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="rounded-lg p-2 text-muted hover:bg-sunken disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft size={16} strokeWidth={1.4} />
              </button>
              <span className="px-2 text-[13px] text-ink">{page} / {pages}</span>
              <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} className="rounded-lg p-2 text-muted hover:bg-sunken disabled:opacity-40" aria-label="Next page">
                <ChevronRight size={16} strokeWidth={1.4} />
              </button>
            </div>
          </div>
        )}
      </Paper>
    </div>
  );
}
