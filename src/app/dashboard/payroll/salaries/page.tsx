"use client";

/*
 * Employee salaries: everyone with their current CTC, structure and warnings. A row opens
 * the salary details (current split, revisions, payroll settings); assign and revise open
 * in modals. ?filter=missing lists people without a salary; ?view=<employee uuid> deep-links.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Pencil, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, DataTable, FilterBar, type Column, type FilterValues } from "@/components/ui-kit";
import { can, errMsg, inr, usePayrollAccess, type Page } from "@/components/payroll/common";
import { AssignSalaryModal, SalaryDetailModal } from "@/components/payroll/salary-modals";

type Row = { employee_uuid: string; name: string; employee_code: string | null; active: boolean; designation: string | null;
  annual_ctc: string | null; monthly_gross: string | null; effective_from: string | null; structure_name: string | null;
  warnings: { code: string; message: string }[]; upcoming: boolean };

export default function SalariesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = usePayrollAccess();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>(params.get("filter") ? { filter: [params.get("filter")!] } : {});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [assign, setAssign] = useState<Row | null>(null);
  const viewing = params.get("view");
  const setViewing = (u: string | null) => router.replace(`/dashboard/payroll/salaries${u ? `?view=${u}` : ""}`, { scroll: false });

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), size: "25" });
    if (q) qs.set("q", q);
    if (filters.filter?.[0]) qs.set("filter", filters.filter[0]);
    api.get<Page<Row>>(`/payroll/salaries?${qs}`).then(setData).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false));
  }, [page, q, filters, toast]);
  useEffect(() => { load(); }, [load]);
  const canEdit = can(access, "payroll.salaries.manage");

  const columns: Column<Row>[] = [
    { key: "who", header: "Employee", cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar name={r.name} size={30} />
        <span className="min-w-0"><span className="block truncate text-ink">{r.name}{!r.active && <span className="text-faint"> · inactive</span>}</span>
          <span className="block truncate text-[12.5px] text-faint">{[r.employee_code, r.designation].filter(Boolean).join(" · ")}</span></span></span>) },
    { key: "structure", header: "Structure", hideBelow: "md", cell: (r) => <span className="text-muted">{r.structure_name ?? (r.annual_ctc ? "Typed in" : "—")}</span> },
    { key: "ctc", header: "Annual CTC", align: "right", sortable: true, sortValue: (r) => Number(r.annual_ctc ?? 0), cell: (r) => r.annual_ctc ? <span className="tabular text-ink">{inr(r.annual_ctc)}</span> : <Badge tone="warn">No salary</Badge> },
    { key: "gross", header: "Monthly gross", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{inr(r.monthly_gross)}</span> },
    { key: "from", header: "Since", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.effective_from ? formatDate(r.effective_from) : "—"}{r.upcoming && <Badge tone="info" className="ml-2">Revision ahead</Badge>}</span> },
    { key: "warn", header: "", cell: (r) => r.warnings.filter((w) => w.code !== "arrears").length ? <span title={r.warnings.map((w) => w.message).join("\n")}><AlertTriangle size={16} strokeWidth={1.4} className="text-amber-600" /></span> : null },
  ];

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Employee salaries" description="Assign and revise salaries. Back-dated revisions add arrears to the next pay run automatically." />
      <FilterBar searchPlaceholder="Search by name or employee ID" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "filter", label: "Salary", options: [{ value: "assigned", label: "Has a salary" }, { value: "missing", label: "No salary yet" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.employee_uuid} columns={columns} loading={loading} onRowClick={(r) => setViewing(r.employee_uuid)}
        rowActions={(r) => canEdit ? [{ label: r.annual_ctc ? "Revise salary" : "Assign salary", icon: r.annual_ctc ? TrendingUp : Pencil, onSelect: () => setAssign(r) }] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Users} emptyTitle="No one here" emptyHint="Add employees first, then assign their salaries." />
      <SalaryDetailModal employeeUuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={load} canEdit={canEdit} />
      {assign && <AssignSalaryModal employeeUuid={assign.employee_uuid} name={assign.name} open onClose={() => setAssign(null)}
        current={assign.annual_ctc ? { annual_ctc: assign.annual_ctc, structure_name: assign.structure_name } as never : null} onSaved={() => { setAssign(null); load(); }} />}
    </div>
  );
}
