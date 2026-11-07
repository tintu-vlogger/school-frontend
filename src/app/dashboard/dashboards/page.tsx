"use client";

/*
 * Dashboards: ready-made and own dashboards of charts on a 12-column grid. Owners can
 * arrange (drag, resize), add and edit widgets, copy, rename, share and delete.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, LayoutDashboard, LayoutGrid, Pencil, Plus, RefreshCw, Share2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { Badge, Button, Menu, Select, Skeleton, useConfirm, useToast, type MenuItem } from "@/components/ui-kit";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { DashboardGrid, boxHeight, pack } from "@/components/insights/dashboards/grid";
import { WidgetEditor } from "@/components/insights/dashboards/widget-editor";
import { DashboardForm, ShareModal } from "@/components/insights/dashboards/dialogs";
import { contentKey, hintFor, type DashMeta, type Dashboard, type DashboardBrief, type Widget } from "@/components/insights/dashboards/types";

export default function DashboardsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState<DashboardBrief[] | null>(null);
  const [meta, setMeta] = useState<DashMeta | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Widget[]>([]);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<{ initial: DashboardBrief | null } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editor, setEditor] = useState<{ widget: Widget | null } | null>(null);

  const wanted = params.get("d");
  const current = useMemo(() => {
    if (!list?.length) return null;
    return list.find((d) => d.uuid === wanted) ?? list[0];
  }, [list, wanted]);

  const loadList = useCallback(async () => {
    try {
      const rows = await api.get<DashboardBrief[]>("/dashboards/");
      setList([...rows].sort((a, b) => Number(b.is_standard) - Number(a.is_standard)));
    } catch (e) {
      setList([]);
      toast.error("Couldn't load dashboards", { description: e instanceof Error ? e.message : undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadList();
    api.getCached<DashMeta>("/dashboards/meta", 300).then(setMeta).catch(() => {});
  }, [loadList]);

  const uuid = current?.uuid ?? null;
  useEffect(() => {
    if (!uuid) { setDash(null); return; }
    let live = true;
    setLoading(true);
    setEditing(false);
    api.get<Dashboard>(`/dashboards/${uuid}`)
      .then((d) => { if (live) setDash(d); })
      .catch((e) => { if (live) { setDash(null); toast.error("Couldn't open the dashboard", { description: e instanceof Error ? e.message : undefined }); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  const go = (id: string) => router.replace(`/dashboard/dashboards?d=${id}`, { scroll: false });

  const savedKeys = useMemo(() => new Map((dash?.widgets ?? []).map((w) => [w.id, contentKey(w)])), [dash]);
  const widgets = editing ? draft : dash?.widgets ?? [];
  const changed = editing && JSON.stringify(draft) !== JSON.stringify(dash?.widgets ?? []);

  function afterSaved(d: Dashboard) {
    setDash(d);
    const brief = { ...d, widget_count: d.widgets.length };
    setList((l) => (l ? (l.some((x) => x.uuid === d.uuid) ? l.map((x) => (x.uuid === d.uuid ? brief : x)) : [...l, brief]) : [brief]));
  }

  function startEdit() {
    if (!dash) return;
    setDraft(dash.widgets);
    setEditing(true);
  }

  async function cancelEdit() {
    if (changed && !(await confirm({ title: "Discard your changes?", message: "The layout and widget changes you made will be lost.", confirmLabel: "Discard", tone: "danger" }))) return;
    setEditing(false);
  }

  async function saveLayout() {
    if (!dash) return;
    setSaving(true);
    try {
      const d = await api.put<Dashboard>(`/dashboards/${dash.uuid}`, { name: dash.name, widgets: draft });
      afterSaved(d);
      setEditing(false);
      toast.success("Dashboard saved");
    } catch (e) {
      toast.error("Couldn't save the dashboard", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!dash) return;
    try {
      const d = await api.post<Dashboard>(`/dashboards/${dash.uuid}/clone`);
      afterSaved(d);
      go(d.uuid);
      toast.success("Copied", { description: "This copy is yours to change." });
    } catch (e) {
      toast.error("Couldn't copy the dashboard", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function remove() {
    if (!dash) return;
    const ok = await confirm({
      title: `Delete “${dash.name}”?`, message: "The dashboard is removed for everyone it is shared with. Reports behind it are kept.",
      confirmLabel: "Delete", tone: "danger", onConfirm: () => api.delete(`/dashboards/${dash.uuid}`),
    });
    if (!ok) return;
    toast.success("Dashboard deleted");
    setList((l) => l?.filter((x) => x.uuid !== dash.uuid) ?? null);
    router.replace("/dashboard/dashboards", { scroll: false });
  }

  const onEditWidget = useCallback((w: Widget) => setEditor({ widget: w }), []);
  const onRemoveWidget = useCallback((w: Widget) => setDraft((d) => pack(d.filter((x) => x.id !== w.id))), []);
  const onOpenReport = useCallback((id: string) => router.push(`/dashboard/reports?report=${id}`), [router]);

  function saveWidget(w: Widget) {
    setDraft((d) => {
      const exists = d.some((x) => x.id === w.id);
      return pack(exists ? d.map((x) => (x.id === w.id ? w : x)) : [...d, w]);
    });
    setEditor(null);
  }

  const options = (list ?? []).map((d) => ({ value: d.uuid, label: d.name, description: `${hintFor(d)}${d.widget_count ? ` · ${d.widget_count} widgets` : ""}` }));

  const more: MenuItem[] = [];
  if (dash) {
    more.push({ label: "Refresh all", icon: RefreshCw, onSelect: () => setTick((t) => t + 1) });
    more.push({ label: dash.is_standard ? "Copy to change" : "Make a copy", icon: Copy, onSelect: copy });
    if (dash.can_edit && !dash.is_standard) more.push({ label: "Rename", icon: Pencil, onSelect: () => setForm({ initial: dash }) });
    if (dash.can_share) more.push({ label: "Share", icon: Share2, onSelect: () => setSharing(true) });
    if (dash.can_edit && !dash.is_standard) more.push("separator", { label: "Delete", icon: Trash2, danger: true, onSelect: remove });
  }

  const actions = editing ? (
    <>
      <Button icon={Plus} onClick={() => setEditor({ widget: null })}>Add widget</Button>
      <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Cancel</Button>
      <Button variant="primary" onClick={saveLayout} loading={saving} disabled={!changed}>Save</Button>
    </>
  ) : (
    <>
      {meta?.can_build !== false && <Button icon={Plus} onClick={() => setForm({ initial: null })}>New dashboard</Button>}
      {dash?.can_edit && <Button icon={LayoutGrid} onClick={startEdit} className="hidden md:inline-flex">Edit layout</Button>}
      {dash && <Menu items={more} label="Dashboard actions" />}
    </>
  );

  return (
    <div>
      <PageHeader title="Dashboards" description="Charts and numbers that update on their own." actions={actions} />

      {list === null ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[180px] rounded-2xl" />)}</div>
        </div>
      ) : !list.length ? (
        <Paper>
          {meta?.can_build ? (
            <EmptyState icon={LayoutDashboard} title="No dashboards yet" hint="Make one and fill it with charts from your data."
              action={<Button variant="primary" icon={Plus} onClick={() => setForm({ initial: null })}>New dashboard</Button>} />
          ) : (
            <EmptyState icon={LayoutDashboard} title="No dashboards shared with you" hint="When HR shares a dashboard with you, it shows up here." />
          )}
        </Paper>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Select className="w-full sm:w-80" value={current?.uuid ?? null} onChange={(v) => v && go(v)} options={options}
              disabled={editing} aria-label="Dashboard" />
            {current && <Badge tone={current.is_standard ? "accent" : "neutral"}>{hintFor(current)}</Badge>}
            {dash && (
              <p className="min-w-0 flex-1 truncate text-[13px] text-faint">
                {dash.description}
                {!dash.is_standard && dash.owner_name ? `${dash.description ? " · " : ""}By ${dash.owner_name}, updated ${formatRelative(dash.updated_at)}` : ""}
              </p>
            )}
            {editing && <p className="w-full text-[12.5px] text-muted">Drag a widget by its title to move it, and pull its bottom-right corner to resize.</p>}
          </div>

          {loading || !dash ? (
            <div className="grid grid-cols-12 gap-3">
              {[3, 3, 3, 3, 6, 6].map((w, i) => (
                <div key={i} style={{ gridColumn: `span ${w}`, height: boxHeight(i < 4 ? 2 : 4) }}><Skeleton className="h-full rounded-2xl" /></div>
              ))}
            </div>
          ) : !widgets.length ? (
            <Paper>
              <EmptyState icon={LayoutGrid} title="This dashboard is empty"
                hint={dash.can_edit ? "Add a chart, a number or a table to get started." : "Nothing has been added here yet."}
                action={dash.can_edit ? (
                  <Button variant="primary" icon={Plus} onClick={() => { if (!editing) startEdit(); setEditor({ widget: null }); }}>Add widget</Button>
                ) : undefined} />
            </Paper>
          ) : (
            <DashboardGrid widgets={widgets} dashUuid={dash.uuid} savedKeys={savedKeys} editing={editing} tick={tick}
              onChange={setDraft} onEdit={onEditWidget} onRemove={onRemoveWidget} onOpenReport={onOpenReport} />
          )}
        </>
      )}

      <DashboardForm open={!!form} initial={form?.initial ?? null} onClose={() => setForm(null)}
        onSaved={(d) => { const isNew = !form?.initial; setForm(null); afterSaved(d); if (isNew) go(d.uuid); }} />
      <ShareModal open={sharing} dashboard={dash} onClose={() => setSharing(false)} onSaved={(d) => { setSharing(false); afterSaved(d); }} />
      <WidgetEditor open={!!editor} widget={editor?.widget ?? null} existing={draft} meta={meta}
        onClose={() => setEditor(null)} onSave={saveWidget} />
    </div>
  );
}
