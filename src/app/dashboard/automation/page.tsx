"use client";

/*
 * Automation: "when this happens, do that" rules, their run log and webhooks.
 * Add and edit open the rule editor modal (with a test panel); rows switch on and off inline.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Copy, History, Lock, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useAllowed } from "@/components/workflow/use-allowed";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatRelative } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, FilterBar, Tabs, Toggle, useConfirm, type Column, type FilterValues, type TabItem,
} from "@/components/ui-kit";
import { RuleEditor } from "@/components/automation/rule-editor";
import { RunLog } from "@/components/automation/run-log";
import { WebhooksTab } from "@/components/automation/webhooks";
import type { Meta, Page, Rule } from "@/components/automation/types";

type Tab = "rules" | "runs" | "webhooks";
const SIZE = 25;

export default function AutomationPage() {
  const access = useAllowed("/automation/meta");
  if (access.ready && !access.allowed) {
    return (
      <div>
        <PageHeader eyebrow="Settings" title="Automation" />
        <Paper><EmptyState icon={Lock} title="You don't have access to automation" hint="Ask HR to give you the “Set up automation rules and webhooks” permission." /></Paper>
      </div>
    );
  }
  return <AutomationScreen />;
}

function AutomationScreen() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("rules");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Rule> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<Meta>("/automation/meta").then(setMeta).catch(() => {}); }, [nonce]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (q) p.set("q", q);
    if (filters.entity?.length) p.set("entity", filters.entity.join(","));
    if (filters.trigger?.length) p.set("trigger", filters.trigger.join(","));
    if (filters.active?.[0]) p.set("active", filters.active[0]);
    api.get<Page<Rule>>(`/automation/rules?${p}`)
      .then((r) => { if (live) setData(r); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load rules"))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [q, filters, page, nonce, toast]);

  async function setActive(r: Rule, active: boolean) {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.uuid === r.uuid ? { ...x, active } : x)) });
    try {
      await api.post(`/automation/rules/${r.uuid}/active`, { active });
      toast.success(active ? `${r.name} is on` : `${r.name} is off`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the rule"); refresh(); }
  }
  async function remove(r: Rule) {
    if (!(await confirm({ title: `Remove “${r.name}”?`, message: "It stops running. Its run log is kept.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.post(`/automation/rules/${r.uuid}/archive`); toast.success("Rule removed"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove the rule"); }
  }
  async function duplicate(r: Rule) {
    try {
      const out = await api.post<Rule>("/automation/rules", { ...r, name: `${r.name} (copy)`.slice(0, 150), active: false });
      toast.success("Copy made (switched off)");
      refresh();
      setEditing(out); setEditorOpen(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't copy the rule"); }
  }
  async function runDateRules() {
    try {
      const out = await api.post<{ ran: number }>("/automation/run-date-rules");
      toast.success(out.ran ? `${out.ran} date ${out.ran === 1 ? "rule" : "rules"} ran` : "Nothing was due today");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't run date rules"); }
  }

  const open = (r: Rule | null) => { setEditing(r); setEditorOpen(true); };
  const columns: Column<Rule>[] = [
    {
      key: "on", header: "", width: "64px", cell: (r) => (
        <span onClick={(e) => e.stopPropagation()}><Toggle size="sm" checked={r.active} onChange={(v) => setActive(r, v)} aria-label={r.active ? "Switch off" : "Switch on"} /></span>
      ),
    },
    {
      key: "name", header: "Rule", sortable: true, sortValue: (r) => r.name, cell: (r) => (
        <div className="min-w-0">
          <p className={r.active ? "truncate text-ink" : "truncate text-muted"}>{r.name}</p>
          <p className="truncate text-[12.5px] text-faint">{r.entity_label}: {r.summary}{r.condition ? " · with a condition" : ""}</p>
        </div>
      ),
    },
    {
      key: "actions", header: "Does", hideBelow: "md", cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.actions.map((a, i) => <Badge key={i}>{meta?.action_types.find((t) => t.value === a.type)?.label ?? a.type}</Badge>)}
        </div>
      ),
    },
    { key: "runs", header: "Runs", hideBelow: "lg", align: "right", sortable: true, sortValue: (r) => r.run_count, cell: (r) => <span className="text-muted">{r.run_count}</span> },
    { key: "last", header: "Last run", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.last_run_at ? formatRelative(r.last_run_at) : "Never"}</span> },
  ];

  const tabs: TabItem<Tab>[] = [
    { value: "rules", label: "Rules", icon: Zap, count: data?.total },
    { value: "runs", label: "Run log", icon: History },
    { value: "webhooks", label: "Webhooks" },
  ];
  const filtered = !!q || Object.values(filters).some((v) => v?.length);

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Automation"
        description="Rules that act on their own: send a reminder, email someone, create a task, change a field, start an approval or call another system."
        actions={tab === "rules" && <>
          <Button icon={CalendarClock} onClick={runDateRules}>Run date rules now</Button>
          <Button variant="primary" icon={Plus} onClick={() => open(null)}>New rule</Button>
        </>} />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />

      {tab === "rules" && (
        <>
          <FilterBar searchPlaceholder="Search rules" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters}
            onChange={(v) => { setFilters(v); setPage(1); }}
            filters={[
              { key: "entity", label: "Record type", multiple: true, options: (meta?.entities ?? []).map((e) => ({ value: e.key, label: e.label })) },
              { key: "trigger", label: "Runs when", multiple: true, options: meta?.triggers ?? [] },
              { key: "active", label: "Status", options: [{ value: "true", label: "On" }, { value: "false", label: "Off" }] },
            ]} />
          <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={open}
            rowActions={(r) => [
              { label: "Edit", icon: Pencil, onSelect: () => open(r) },
              { label: "Make a copy", icon: Copy, onSelect: () => duplicate(r) },
              "separator" as const,
              { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(r) },
            ]}
            pagination={{ page, size: SIZE, total: data?.total ?? 0, onPageChange: setPage }}
            emptyIcon={Zap} emptyTitle={filtered ? "No rules match" : "No rules yet"}
            emptyHint={filtered ? "Try another search or clear the filters." : "For example: remind the manager a week before probation ends."}
            emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => open(null)}>New rule</Button>} />
        </>
      )}
      {tab === "runs" && <RunLog rules={data?.items ?? []} nonce={nonce} />}
      {tab === "webhooks" && <WebhooksTab onChanged={refresh} />}

      <RuleEditor open={editorOpen} rule={editing} meta={meta} onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); refresh(); }} />
    </div>
  );
}
