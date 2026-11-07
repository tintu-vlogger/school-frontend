"use client";

/*
 * Dues & reminders: who owes what, with ageing of overdue amounts, instalment-wise dues,
 * and reminders to families (portal notification and email) one by one or in bulk.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Download, HandCoins, PartyPopper, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, FilterBar, Select, StatCard, StatGrid, useConfirm, type Column, type FilterValues } from "@/components/ui-kit";
import { type Money, downloadFile, errMsg, money, n, useFeeMeta, useFetch, useSectionOptions } from "@/components/fees/shared";

type DueRow = {
  student_id: number; student_uuid: string; name: string; admission_no: string; phone: string | null; section_label: string | null;
  due: Money; overdue: Money; invoices: number; oldest_due_date: string | null; days_overdue: number; bucket: string; instalments: string[];
};
type Dues = { items: DueRow[]; total: number; page: number; size: number; totals: { due: Money; overdue: Money; defaulters: number }; ageing: Record<string, Money> };
type InstRow = { instalment: string; due_date: string; billed: Money; collected: Money; outstanding: Money; invoices: number; unpaid: number };

const BUCKETS: Record<string, string> = { "0_30": "1–30 days", "31_60": "31–60 days", "61_90": "61–90 days", "90_plus": "Over 90 days" };

export default function DuesPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAccess();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const sections = useSectionOptions();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ view: ["overdue"] });
  const [section, setSection] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const p = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) p.set("q", q);
  if (filters.view?.[0] === "overdue") p.set("overdue_only", "true");
  if (filters.bucket?.[0]) p.set("bucket", filters.bucket[0]);
  if (section) p.set("section_id", String(section));
  const { data, loading } = useFetch<Dues>(`/fees/dues?${p}`, (e) => toast.error(errMsg(e)));
  const { data: inst } = useFetch<{ rows: InstRow[] }>("/fees/reports/instalments");
  const canRemind = can("fees.collect", "fees.manage");

  async function remind(ids: number[] | null, label: string) {
    if (!(await confirm({ title: `Send reminders to ${label}?`, message: "Families get a notification in the parent portal and an email where we have one.", confirmLabel: "Send reminders" }))) return;
    try {
      const r = await api.post<{ learners: number; recipients: number }>("/fees/dues/remind", ids ? { student_ids: ids } : { overdue_only: true, section_id: section });
      toast.success(`Reminders sent for ${r.learners} ${term("students").toLowerCase()}`, { description: `${r.recipients} messages` });
    } catch (e) { toast.error("Couldn't send reminders", { description: errMsg(e) }); }
  }

  const columns: Column<DueRow>[] = [
    { key: "name", header: term("student"), cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.name}</p><p className="truncate text-[12.5px] text-muted">{[r.admission_no, r.section_label].filter(Boolean).join(" · ")}</p></div> },
    { key: "inst", header: "Instalments", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 text-[13px] text-muted">{r.instalments.join(", ")}</span> },
    { key: "oldest", header: "Oldest due", hideBelow: "md", cell: (r) => <span className="text-muted">{r.oldest_due_date ? formatDate(r.oldest_due_date) : "—"}</span> },
    { key: "age", header: "Overdue for", cell: (r) => n(r.overdue) > 0 ? <Badge tone={r.days_overdue > 60 ? "bad" : "warn"}>{r.days_overdue} days</Badge> : <span className="text-faint">Not yet due</span> },
    { key: "due", header: "Due", align: "right", cell: (r) => <div className="text-right"><p className="tabular text-ink">{money(r.due, cur)}</p>{n(r.overdue) > 0 && n(r.overdue) !== n(r.due) && <p className="text-[12px] text-rose-700">{money(r.overdue, cur)} overdue</p>}</div> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Fees" title="Dues & reminders" description="Who still owes fees, how long it has been overdue, and reminders to families."
        actions={<>
          <Button icon={Download} onClick={() => downloadFile(`/fees/dues?${p}&format=csv`, "dues.csv").catch((e) => toast.error(errMsg(e)))}>Export CSV</Button>
          {canRemind && <Button variant="primary" icon={BellRing} onClick={() => remind(null, section ? "every overdue family in this section" : "every overdue family")}>Remind all overdue</Button>}
        </>} />
      <StatGrid className="mb-5">
        {Object.entries(BUCKETS).map(([k, label]) => (
          <StatCard key={k} label={`Overdue ${label.toLowerCase()}`} value={money(data?.ageing?.[k] ?? 0, cur)} onClick={() => { setFilters({ view: ["overdue"], bucket: [k] }); setPage(1); }} />
        ))}
      </StatGrid>
      <FilterBar searchPlaceholder="Search by name, admission no. or phone" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "view", label: "Show", options: [{ value: "overdue", label: "Overdue only" }, { value: "all", label: "All dues" }] },
          { key: "bucket", label: "Ageing", options: Object.entries(BUCKETS).map(([value, label]) => ({ value, label })) },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="w-56"><Select<number> value={section} onChange={(v) => { setSection(v); setPage(1); }} options={sections} clearable placeholder={`All ${term("sections").toLowerCase()}`} /></div>} />
      {data && <p className="mb-2 text-[13px] text-muted">{data.totals.defaulters} defaulters · {money(data.totals.overdue, cur)} overdue · {money(data.totals.due, cur)} due in total</p>}
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.student_id} columns={columns} loading={loading}
        rowActions={(r) => [
          ...(canRemind ? [{ label: "Send reminder", icon: Send, onSelect: () => remind([r.student_id], r.name) }] : []),
          ...(can("fees.collect") ? [{ label: "Collect fees", icon: HandCoins, onSelect: () => router.push(`/dashboard/fees/collect?student=${r.student_uuid}`) }] : []),
        ]}
        selectable={canRemind}
        bulkActions={canRemind ? [{ label: "Send reminders", icon: Send, onSelect: (rows, clear) => { remind(rows.map((r) => r.student_id), `${rows.length} families`).then(clear); } }] : undefined}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={PartyPopper} emptyTitle={q || section ? "No dues match" : "No dues"} emptyHint="Everyone is paid up for what has been billed." />

      <Paper className="mt-6">
        <PaperHeader title="Dues by instalment" action={<Link href="/dashboard/fees/reports" className="text-[13px] text-primary">More reports</Link>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead><tr className="border-b border-line text-left text-[12px] text-faint">
              <th className="px-5 py-2 font-normal">Instalment</th><th className="py-2 font-normal">Due</th><th className="py-2 text-right font-normal">Billed</th>
              <th className="py-2 text-right font-normal">Collected</th><th className="py-2 text-right font-normal">Outstanding</th><th className="px-5 py-2 text-right font-normal">Unpaid</th>
            </tr></thead>
            <tbody>
              {(inst?.rows ?? []).map((r) => (
                <tr key={r.instalment} className="border-b border-line/70">
                  <td className="px-5 py-2.5 text-ink">{r.instalment}</td><td className="py-2.5 text-muted">{formatDate(r.due_date)}</td>
                  <td className="py-2.5 text-right tabular">{money(r.billed, cur)}</td><td className="py-2.5 text-right tabular">{money(r.collected, cur)}</td>
                  <td className="py-2.5 text-right tabular text-ink">{money(r.outstanding, cur)}</td><td className="px-5 py-2.5 text-right tabular text-muted">{r.unpaid} of {r.invoices}</td>
                </tr>
              ))}
              {inst && inst.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">No instalments billed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Paper>
    </div>
  );
}
