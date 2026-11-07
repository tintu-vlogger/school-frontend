"use client";

/*
 * One custom service's list page, built from its form: my requests for everyone, all
 * records for the people who handle it, with filters from the form's choice fields,
 * saved views, column choice and CSV / Excel export.
 * ?new=1 opens the request form, ?view=<uuid> a record's details.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bookmark, Columns3, Download, Eye, Inbox, Plus, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { downloadFrom } from "@/components/workplace/files";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FilterBar, Menu, Modal, ModalCancel, Tabs, TextInput, Toggle, useToast,
  type Column, type FilterDef, type FilterValues,
} from "@/components/ui-kit";
import { RecordModal, SubmitModal } from "@/components/custom_forms/record-modals";
import { displayValue } from "@/components/custom_forms/form-renderer";
import { serviceIcon } from "@/components/custom_forms/icons";
import type { FormField, Page, RecordRow, ServiceDefinition } from "@/components/custom_forms/types";

type View = { uuid: string; name: string; filters: { q?: string; values?: FilterValues; scope?: string }; columns: string[]; shared: boolean; mine: boolean };
const SECTION: Record<string, string> = { home: "Home", people: "People", time: "Time", pay: "Payroll", talent: "Talent", engage: "Engage" };
const FILTER_TYPES = new Set(["single_choice", "boolean", "multi_choice"]);

export default function ServiceRecordsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const { code } = useParams<{ code: string }>();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [svc, setSvc] = useState<ServiceDefinition | null>(null);
  const [missing, setMissing] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [rows, setRows] = useState<Page<RecordRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [views, setViews] = useState<View[]>([]);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v === null) sp.delete(k); else sp.set(k, v); }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    api.get<ServiceDefinition>(`/custom-forms/services/${code}/definition`)
      .then((d) => { setSvc(d); if (d.can_handle) setScope("all"); }).catch(() => setMissing(true));
    api.get<View[]>(`/custom-forms/services/${code}/views`).then(setViews).catch(() => {});
  }, [code]);

  const fields = useMemo(() => (svc?.definition.fields ?? []).filter((f) => f.type !== "section"), [svc]);
  const filterFields = useMemo(() => fields.filter((f) => FILTER_TYPES.has(f.type)).slice(0, 4), [fields]);
  const defaultCols = useMemo(() => {
    const s = fields.filter((f) => f.summary).map((f) => f.key);
    return s.length ? s : fields.filter((f) => !["table", "file", "textarea"].includes(f.type)).slice(0, 3).map((f) => f.key);
  }, [fields]);
  const shownCols = columns ?? defaultCols;

  const query = useCallback((extra: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ scope, ...extra });
    if (q) sp.set("q", q);
    if (filters.status?.length) sp.set("status", filters.status.join(","));
    for (const f of filterFields) if (filters[`f_${f.key}`]?.[0]) sp.set(`f_${f.key}`, filters[`f_${f.key}`][0]);
    return sp;
  }, [scope, q, filters, filterFields]);

  useEffect(() => {
    if (!svc) return;
    setLoading(true);
    api.get<Page<RecordRow>>(`/custom-forms/services/${code}/records?${query({ page: String(page), size: String(size) })}`)
      .then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size })).finally(() => setLoading(false));
  }, [svc, code, query, page, size, nonce]);

  const refresh = () => setNonce((n) => n + 1);
  const closeView = useCallback(() => setParams({ view: null }), [setParams]);

  async function exportAs(fmt: "csv" | "xlsx") {
    try { await downloadFrom(`/custom-forms/services/${code}/export?${query({ format: fmt })}`, `${code}.${fmt}`); toast.success("Download started"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't export"); }
  }
  function applyView(v: View) {
    setQ(v.filters.q ?? ""); setFilters(v.filters.values ?? {}); setColumns(v.columns.length ? v.columns : null);
    if (v.filters.scope === "mine" || (v.filters.scope === "all" && svc?.can_handle)) setScope(v.filters.scope as "mine" | "all");
    setPage(1);
  }

  if (missing) return <div><PageHeader eyebrow="Services" title="Service not found" description="It may have been switched off, or you may not have access to it." /></div>;
  const Icon = serviceIcon(svc?.icon);

  const statusOptions = (svc?.statuses ?? []).filter((s) => s.key !== "draft" || scope === "mine").map((s) => ({ value: s.key, label: s.label }));
  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", multiple: true, options: [{ value: "open", label: "All open" }, ...statusOptions] },
    ...filterFields.map((f) => ({ key: `f_${f.key}`, label: f.label, options: f.type === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : (f.options ?? []).map((o) => ({ value: o, label: o })) })),
  ];
  const fieldCols: Column<RecordRow>[] = shownCols.map((k) => fields.find((f) => f.key === k)).filter(Boolean).map((f) => {
    const ff = f as FormField;
    return { key: ff.key, header: ff.label, hideBelow: "md" as const, align: (ff.type === "currency" || ff.type === "number" || ff.type === "decimal") ? "right" as const : undefined,
      cell: (r: RecordRow) => <span className="line-clamp-1 text-ink/90">{displayValue(ff, r.values[ff.key], r.labels) || <span className="text-faint">—</span>}</span> };
  });

  return (
    <div>
      <PageHeader eyebrow={svc ? `Services · ${SECTION[svc.nav_section] ?? ""}` : "Services"} title={svc?.name ?? "…"} description={svc?.description ?? undefined}
        actions={svc && <>
          {svc.can_design && <Link href="/dashboard/settings/services"><Button icon={Settings2}>Set up</Button></Link>}
          {svc.can_submit && <Button variant="primary" icon={Plus} onClick={() => setParams({ new: "1" })}>New request</Button>}
        </>} />
      {svc?.can_handle && (
        <Tabs value={scope} onChange={(s) => { setScope(s); setPage(1); }} className="mb-5" items={[
          { value: "all", label: "All records" }, { value: "mine", label: "My requests" },
        ]} />
      )}
      <FilterBar search={q} searchPlaceholder="Search by number, title or name" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={filterDefs} values={filters} onChange={(f) => { setFilters(f); setPage(1); }}
        actions={<div className="flex items-center gap-1.5">
          <Menu label="Saved views" trigger={<Button size="sm" icon={Bookmark}>Views</Button>} items={[
            ...views.map((v) => ({ label: v.shared && !v.mine ? `${v.name} (shared)` : v.name, icon: Eye, onSelect: () => applyView(v) })),
            ...(views.length ? ["separator" as const] : []),
            { label: "Save current view…", icon: Plus, onSelect: () => setSaving(true) },
          ]} />
          <Button size="sm" icon={Columns3} onClick={() => setPicking(true)}>Columns</Button>
          <Menu label="Export" trigger={<Button size="sm" icon={Download}>Export</Button>} items={[
            { label: "Excel (.xlsx)", onSelect: () => exportAs("xlsx") }, { label: "CSV", onSelect: () => exportAs("csv") },
          ]} />
        </div>} />
      <DataTable rows={rows?.items ?? []} rowKey={(r) => r.uuid} loading={loading}
        columns={[
          { key: "ref", header: "Number", cell: (r) => <span><span className="flex items-center gap-2 whitespace-nowrap text-ink"><Icon size={15} strokeWidth={1.4} className="text-faint" />{r.reference_no ?? "Draft"}</span></span> },
          ...(scope === "all" ? [{ key: "who", header: "Requested by", cell: (r: RecordRow) => <span className="text-ink/90">{r.requester_name}</span> }] : []),
          ...fieldCols,
          { key: "date", header: "Sent", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDate(r.submitted_at ?? r.created_at)}</span> },
          { key: "status", header: "Status", cell: (r) => <Badge tone={r.status_tone} dot>{r.status_label}</Badge> },
        ]}
        onRowClick={(r) => setParams({ view: r.uuid })}
        pagination={{ page, size, total: rows?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Inbox}
        emptyTitle={q || Object.values(filters).some((v) => v.length) ? "Nothing matches" : scope === "mine" ? "No requests yet" : "No records yet"}
        emptyHint={svc?.can_submit ? "Use New request to fill in the form." : undefined}
        emptyAction={svc?.can_submit && <Button variant="primary" icon={Plus} onClick={() => setParams({ new: "1" })}>New request</Button>} />

      {svc && params.get("new") === "1" && <SubmitModal code={code} open onClose={() => setParams({ new: null })}
        onSaved={(r) => { setParams({ new: null, view: r.uuid }); refresh(); }} />}
      <RecordModal uuid={params.get("view")} onClose={closeView} onChanged={refresh} />
      {saving && <SaveViewModal code={code} views={views} canShare={!!svc?.can_handle}
        current={{ q, values: filters, scope }} columns={columns ?? []} onClose={() => setSaving(false)}
        onChanged={() => api.get<View[]>(`/custom-forms/services/${code}/views`).then(setViews).catch(() => {})} />}
      {picking && <ColumnsModal fields={fields} value={shownCols} onClose={() => setPicking(false)} onSave={(c) => { setColumns(c); setPicking(false); }} />}
    </div>
  );
}

function SaveViewModal({ code, views, canShare, current, columns, onClose, onChanged }: {
  code: string; views: View[]; canShare: boolean; current: View["filters"]; columns: string[]; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim()) { setError("Give the view a name"); return; }
    setBusy(true);
    try { await api.post(`/custom-forms/services/${code}/views`, { name: name.trim(), filters: current, columns, shared }); toast.success("View saved"); onChanged(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  }
  async function remove(v: View) {
    try { await api.delete(`/custom-forms/views/${v.uuid}`); toast.success("View removed"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }
  const mine = views.filter((v) => v.mine);
  return (
    <Modal open onClose={onClose} size="md" busy={busy} title="Save this view" description="Keeps the current search, filters and columns."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={busy}>Save view</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required error={error}><TextInput autoFocusInModal value={name} maxLength={100} onValueChange={(x) => { setName(x); setError(""); }} placeholder="e.g. Open this month" /></Field>
        {canShare && <Toggle checked={shared} onChange={setShared} label="Share with everyone who uses this service" />}
        {mine.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Your views</p>
            <div className="divide-y divide-line rounded-lg border border-line">
              {mine.map((v) => (
                <div key={v.uuid} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                  <span className="flex-1 text-ink">{v.name}</span>{v.shared && <Badge tone="neutral">Shared</Badge>}
                  <button type="button" onClick={() => remove(v)} className="text-muted hover:text-rose-600" aria-label={`Remove ${v.name}`}><Trash2 size={15} strokeWidth={1.4} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ColumnsModal({ fields, value, onClose, onSave }: { fields: FormField[]; value: string[]; onClose: () => void; onSave: (c: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(value);
  const options = fields.filter((f) => !["table", "file"].includes(f.type));
  return (
    <Modal open onClose={onClose} size="sm" title="Columns" description="Pick the form fields to show in the list."
      footer={<><ModalCancel /><Button variant="primary" onClick={() => onSave(sel)}>Show</Button></>}>
      <div className="space-y-2">
        {options.map((f) => (
          <Checkbox key={f.key} label={f.label} checked={sel.includes(f.key)}
            onChange={(c) => setSel(c ? options.filter((o) => sel.includes(o.key) || o.key === f.key).map((o) => o.key) : sel.filter((x) => x !== f.key))} />
        ))}
      </div>
    </Modal>
  );
}
