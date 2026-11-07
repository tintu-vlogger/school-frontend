"use client";

/*
 * Services & forms (admin): the company's custom services. Add one from a template or a
 * blank form, then build its form, set who may use and handle it, its approval and statuses.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Copy, ExternalLink, LayoutTemplate, Pencil, Plus, Settings2, Shapes } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, TextInput, useConfirm, useToast, type FilterValues,
} from "@/components/ui-kit";
import { NewServiceModal, ServiceEditor } from "@/components/custom_forms/designer";
import { serviceIcon } from "@/components/custom_forms/icons";
import type { Meta, ServiceBrief } from "@/components/custom_forms/types";

const SECTION: Record<string, string> = { home: "Home", people: "People", time: "Time", pay: "Payroll", talent: "Talent", engage: "Engage" };

export default function ServicesSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<ServiceBrief[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [editing, setEditing] = useState<{ code: string; tab: "form" | "settings" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState<ServiceBrief | null>(null);

  const load = useCallback(() => {
    api.get<ServiceBrief[]>("/custom-forms/services?include_archived=true").then(setRows).catch(() => { setRows([]); setDenied(true); });
    api.get<Meta>("/custom-forms/meta").then(setMeta).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const closeEditor = useCallback(() => setEditing(null), []);

  async function archive(s: ServiceBrief) {
    if (!s.archived && !(await confirm({ title: `Archive ${s.name}?`, message: "It leaves the menu and no new requests can be made. Its records are kept and can still be seen and reported on.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.post(`/custom-forms/services/${s.code}/${s.archived ? "restore" : "archive"}`); toast.success(s.archived ? "Restored" : "Archived"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change it"); }
  }

  if (denied) return <div><PageHeader eyebrow="Settings" title="Services & forms" description="You don't have access to set up services." /></div>;

  const list = (rows ?? []).filter((s) => {
    if (q && !`${s.name} ${s.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    const st = filters.state?.[0];
    if (st === "active" && (!s.active || s.archived)) return false;
    if (st === "off" && (s.active || s.archived)) return false;
    if (st === "archived" && !s.archived) return false;
    if (!st && s.archived) return false;
    return true;
  });

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Services & forms"
        description="Make your own request forms without code: training, ID cards, visitor passes and anything else. Each one gets its own menu entry, list, approval and reports."
        actions={<>
          <Link href="/dashboard/services"><Button icon={ExternalLink}>Open services</Button></Link>
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)} disabled={!meta}>New service</Button>
        </>} />
      <FilterBar searchPlaceholder="Search services" onSearchChange={setQ}
        filters={[{ key: "state", label: "Showing", options: [{ value: "active", label: "In use" }, { value: "off", label: "Switched off" }, { value: "archived", label: "Archived" }] }]}
        values={filters} onChange={setFilters} />
      <DataTable rows={list} rowKey={(s) => s.uuid} loading={rows === null}
        columns={[
          { key: "name", header: "Service", sortable: true, sortValue: (s) => s.name, cell: (s) => {
            const I = serviceIcon(s.icon);
            return (
              <span className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><I size={16} strokeWidth={1.4} /></span>
                <span className="min-w-0"><span className="block truncate text-ink">{s.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{s.description ?? "—"}</span></span>
              </span>
            );
          } },
          { key: "menu", header: "Menu", cell: (s) => <span className="text-muted">{SECTION[s.nav_section] ?? s.nav_section}</span>, hideBelow: "md" },
          { key: "approval", header: "Approval", cell: (s) => <span className="text-muted">{s.needs_approval ? "Yes" : "No"}</span>, hideBelow: "lg" },
          { key: "version", header: "Form", cell: (s) => <span className="text-muted">v{s.version}</span>, hideBelow: "lg" },
          { key: "records", header: "Records", align: "right", sortable: true, sortValue: (s) => s.records, cell: (s) => <span>{s.records}{s.pending ? <span className="ml-1 text-[12px] text-amber-700">({s.pending} waiting)</span> : null}</span> },
          { key: "updated", header: "Changed", cell: (s) => <span className="text-muted">{formatDate(s.updated_at)}</span>, hideBelow: "lg" },
          { key: "state", header: "", align: "right", cell: (s) => <Badge tone={s.archived ? "neutral" : s.active ? "good" : "neutral"}>{s.archived ? "Archived" : s.active ? "In use" : "Off"}</Badge> },
        ]}
        onRowClick={(s) => setEditing({ code: s.code, tab: "form" })}
        rowActions={(s) => [
          { label: "Edit form", icon: Pencil, onSelect: () => setEditing({ code: s.code, tab: "form" }) },
          { label: "Settings", icon: Settings2, onSelect: () => setEditing({ code: s.code, tab: "settings" }) },
          { label: "Open list", icon: ExternalLink, onSelect: () => { window.location.href = `/dashboard/services/${s.code}`; } },
          { label: "Make a copy", icon: Copy, onSelect: () => setCopying(s) },
          "separator",
          { label: s.archived ? "Restore" : "Archive", icon: s.archived ? ArchiveRestore : Archive, danger: !s.archived, onSelect: () => archive(s) },
        ]}
        emptyIcon={Shapes}
        emptyTitle={q || filters.state?.length ? "No services match" : "No services yet"}
        emptyHint="Add a ready-made one such as Training request or Visitor pass, or build your own form."
        emptyAction={<Button variant="primary" icon={LayoutTemplate} onClick={() => setAdding(true)} disabled={!meta}>Add from a template</Button>}
      />
      {meta && adding && <NewServiceModal meta={meta} open onClose={() => setAdding(false)} onCreated={(code) => { setAdding(false); load(); setEditing({ code, tab: "form" }); }} />}
      {meta && editing && <ServiceEditor key={editing.code} code={editing.code} meta={meta} initialTab={editing.tab} onClose={closeEditor} onSaved={load} />}
      {copying && <CopyModal svc={copying} onClose={() => setCopying(null)} onDone={(code) => { setCopying(null); load(); setEditing({ code, tab: "settings" }); }} />}
    </div>
  );
}

function CopyModal({ svc, onClose, onDone }: { svc: ServiceBrief; onClose: () => void; onDone: (code: string) => void }) {
  const [name, setName] = useState(`${svc.name} copy`.slice(0, 50));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    try { const s = await api.post<ServiceBrief>(`/custom-forms/services/${svc.code}/copy`, { name }); onDone(s.code); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't copy"); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={busy} title={`Copy ${svc.name}`} description="The form and settings are copied; records are not."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={busy}>Make copy</Button></>}>
      <Field label="Name of the copy" required error={error}><TextInput autoFocusInModal value={name} maxLength={50} onValueChange={(x) => { setName(x); setError(""); }} /></Field>
    </Modal>
  );
}
