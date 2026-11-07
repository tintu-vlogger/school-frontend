"use client";

/*
 * Recycle bin (company setup): every deleted, archived or switched-off record across the app
 * (departments, lists, custom fields, files, templates, leave types, salary components, assets,
 * announcements …). Filter by kind, person and date; open one to see its details and what still
 * uses it; restore (checks that what it depends on is back first) or remove it for good after
 * the retention period where the law allows. ?view=<kind>:<uuid> opens one.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArchiveRestore, Lock, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, Field, FilterBar, KeyValue, Modal, ModalCancel, NumberInput, Toggle, useConfirm,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { errMsg } from "@/components/payroll/common";

type Item = { kind: string; kind_label: string; group: string; uuid: string; title: string; subtitle: string | null; state: string;
  deleted_at: string | null; deleted_by: string | null; purgeable: boolean; keep_reason: string | null; purge_after: string | null; can_purge_now: boolean };
type Detail = Item & { fields: { field: string; label: string; value: unknown }[]; problems: string[]; references: { label: string; count: number | string }[];
  history: { action: string; by: string | null; at: string | null }[] };
type Settings = { retention_days: number; auto_purge: boolean; min_retention_days: number };
type ListOut = { items: Item[]; total: number; facets: { kinds: { kind: string; label: string; group: string; count: number }[]; people: string[]; due: number };
  settings: Settings; can_purge: boolean };

const ACTION: Record<string, string> = { created: "Added", updated: "Changed", deleted: "Removed", "recycle_bin.restored": "Restored from the bin" };

export default function RecycleBinPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<FilterValues>({});
  const [range, setRange] = useState({ from: "", to: "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListOut | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const view = params.get("view");
  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), size: "25" });
    if (filters.kind?.length) qs.set("kind", filters.kind.join(","));
    if (filters.who?.length) qs.set("who", filters.who[0]);
    if (filters.purge?.length) qs.set("purge", filters.purge[0]);
    if (range.from) qs.set("start", range.from);
    if (range.to) qs.set("end", range.to);
    if (q) qs.set("q", q);
    api.get<ListOut>(`/recycle-bin/items?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, range, q, page, toast]);
  useEffect(() => { load(); }, [load]);

  async function restoreMany(rows: Item[], clear: () => void) {
    try {
      const r = await api.post<{ restored: unknown[]; failed: { detail: string }[] }>("/recycle-bin/restore", { items: rows.map((x) => ({ kind: x.kind, uuid: x.uuid })) });
      if (r.failed.length) toast.error(`${r.restored.length} restored, ${r.failed.length} could not be`, { description: r.failed[0].detail });
      else toast.success(`${r.restored.length} restored`);
      clear(); load();
    } catch (e) { toast.error(errMsg(e)); }
  }

  const columns: Column<Item>[] = [
    { key: "t", header: "Record", cell: (i) => <div className="min-w-0"><p className="truncate text-ink">{i.title}</p><p className="truncate text-[12.5px] text-faint">{i.kind_label}{i.subtitle ? ` · ${i.subtitle}` : ""}</p></div> },
    { key: "g", header: "Area", hideBelow: "lg", cell: (i) => <span className="text-muted">{i.group}</span> },
    { key: "s", header: "State", hideBelow: "md", cell: (i) => <Badge tone={i.state === "Switched off" ? "neutral" : "warn"}>{i.state}</Badge> },
    { key: "by", header: "Removed by", hideBelow: "md", cell: (i) => <span className="text-muted">{i.deleted_by ?? "—"}</span> },
    { key: "at", header: "When", cell: (i) => <span className="text-muted">{i.deleted_at ? formatDate(i.deleted_at) : "—"}</span> },
    { key: "p", header: "Remove for good", hideBelow: "sm", cell: (i) => i.purgeable
      ? <span className={i.can_purge_now ? "text-ink" : "text-muted"}>{i.can_purge_now ? "Allowed now" : i.purge_after ? `From ${formatDate(i.purge_after)}` : "—"}</span>
      : <span className="inline-flex items-center gap-1 text-faint" title={i.keep_reason ?? ""}><Lock size={13} strokeWidth={1.4} />Kept</span> },
  ];
  const kinds = data?.facets.kinds ?? [];
  return (
    <div>
      <PageHeader eyebrow="Company setup" title="Recycle bin" description={`Deleted and switched-off records. Restore them, or remove them for good after ${data?.settings.retention_days ?? 90} days where the law allows.`}
        actions={data?.can_purge && <Button variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>Bin settings</Button>} />
      <FilterBar searchPlaceholder="Search the bin" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "kind", label: "Kind", multiple: true, options: kinds.map((k) => ({ value: k.kind, label: `${k.label} (${k.count})` })) },
          { key: "who", label: "Removed by", options: (data?.facets.people ?? []).map((p) => ({ value: p, label: p })) },
          { key: "purge", label: "Removal", options: [{ value: "due", label: "Can be removed now" }, { value: "kept", label: "Kept for good" }] },
        ]}
        actions={<div className="w-64"><DateRangeInput value={range} onChange={(r) => { setRange(r); setPage(1); }} placeholder="Removed between" clearable /></div>} />
      <DataTable rows={data?.items ?? []} rowKey={(i) => `${i.kind}:${i.uuid}`} columns={columns} loading={!data}
        onRowClick={(i) => router.replace(`/dashboard/settings/recycle-bin?view=${i.kind}:${i.uuid}`, { scroll: false })}
        selectable bulkActions={[{ label: "Restore", icon: ArchiveRestore, onSelect: (rows, clear) => restoreMany(rows, clear) }]}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }} emptyIcon={Trash2} emptyTitle="The recycle bin is empty"
        emptyHint="Records you delete, archive or switch off anywhere in the app show up here." />
      <DetailModal id={view} canPurge={!!data?.can_purge} onClose={() => router.replace("/dashboard/settings/recycle-bin", { scroll: false })} onChanged={load} confirm={confirm} />
      {data && <SettingsModal open={settingsOpen} value={data.settings} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); load(); }} />}
    </div>
  );
}

function DetailModal({ id, canPurge, onClose, onChanged, confirm }: { id: string | null; canPurge: boolean; onClose: () => void; onChanged: () => void; confirm: ReturnType<typeof useConfirm> }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, uuid] = (id ?? ":").split(":");
  useEffect(() => { if (id) { setD(null); api.get<Detail>(`/recycle-bin/items/${kind}/${uuid}`).then(setD).catch((e) => { toast.error(errMsg(e)); onClose(); }); } }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(path: "restore" | "purge") {
    if (path === "purge" && !(await confirm({ title: "Remove for good?", message: `“${d?.title}” will be deleted permanently. A copy stays in the audit log.`, confirmLabel: "Remove for good", tone: "danger" }))) return;
    setBusy(true);
    try { await api.post(`/recycle-bin/items/${kind}/${uuid}/${path}`); toast.success(path === "restore" ? "Restored" : "Removed for good"); onChanged(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const fmt = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <Modal open={!!id} onClose={onClose} size="lg" busy={busy} title={d?.title ?? "Record"} description={d ? `${d.kind_label} · ${d.group}` : undefined}
      headerActions={d && <Badge tone="warn">{d.state}</Badge>}
      footerStart={d && canPurge && d.purgeable && <Button variant="ghost" icon={Trash2} disabled={!d.can_purge_now || d.references.length > 0} onClick={() => act("purge")}>Remove for good</Button>}
      footer={<><ModalCancel>Close</ModalCancel>{d && <Button variant="primary" icon={ArchiveRestore} loading={busy} disabled={d.problems.length > 0} onClick={() => act("restore")}>Restore</Button>}</>}>
      {!d ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="space-y-5">
          <KeyValue columns={3} items={[
            { label: "Removed by", value: d.deleted_by ?? "—" },
            { label: "When", value: d.deleted_at ? formatDateTime(d.deleted_at) : "—" },
            { label: "Remove for good", value: d.purgeable ? (d.can_purge_now ? "Allowed now" : d.purge_after ? `From ${formatDate(d.purge_after)}` : "—") : "Never" },
          ]} />
          {d.problems.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">
            <p className="mb-1 flex items-center gap-1.5 text-amber-900"><AlertTriangle size={14} strokeWidth={1.4} />It cannot be restored yet</p>{d.problems.map((p, i) => <p key={i}>{p}</p>)}</div>}
          {!d.purgeable && d.keep_reason && <p className="flex items-center gap-1.5 text-[13px] text-muted"><Lock size={13} strokeWidth={1.4} />Kept for good: {d.keep_reason}.</p>}
          {d.references.length > 0 && <p className="text-[13px] text-muted">Still used by {d.references.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(", ")}, so it can only be restored.</p>}
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2.5 text-[13.5px] text-muted">Details</p>
            <dl className="divide-y divide-line">{d.fields.map((f) => (
              <div key={f.field} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2 text-[13.5px]"><dt className="text-muted">{f.label}</dt><dd className="break-words text-ink">{fmt(f.value)}</dd></div>))}</dl>
          </div>
          {d.history.length > 0 && <div>
            <p className="mb-2 text-[13.5px] text-muted">History</p>
            <ul className="space-y-1 text-[13px]">{d.history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span className="text-ink">{ACTION[h.action] ?? h.action.replace(/[._]/g, " ")}{h.by ? <span className="text-muted"> · {h.by}</span> : null}</span><span className="text-faint">{h.at ? formatDateTime(h.at) : ""}</span></li>)}</ul>
          </div>}
        </div>)}
    </Modal>
  );
}

function SettingsModal({ open, value, onClose, onSaved }: { open: boolean; value: Settings; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  async function save() {
    try { await api.put("/recycle-bin/settings", { retention_days: v.retention_days, auto_purge: v.auto_purge }); toast.success("Saved"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Bin settings" footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Keep deleted records for (days)" hint={`At least ${value.min_retention_days} days. Payroll, attendance, leave and employee records are never removed.`}>
          <NumberInput value={v.retention_days} min={value.min_retention_days} onChange={(x) => setV({ ...v, retention_days: x ?? 90 })} />
        </Field>
        <Toggle checked={v.auto_purge} onChange={(x) => setV({ ...v, auto_purge: x })} label="Remove them on their own after that"
          description="Only records nothing else uses. Each removal is written to the audit log." />
      </div>
    </Modal>
  );
}
