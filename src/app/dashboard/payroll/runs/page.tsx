"use client";

/*
 * Pay runs: every monthly and off-cycle run with its status and totals. "New pay run"
 * (?new=1) opens a modal: the month and pay group for a regular run, or the kind and the
 * people for an off-cycle run (bonus, arrears, final settlement, correction).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayCircle, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, MultiSelect, RadioCards, Select, TextInput,
  type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { RunStatus, errMsg, fyOptions, inr, loadPayrollEmployees, type Page } from "@/components/payroll/common";

type Run = { uuid: string; number: string | null; kind: string; kind_label: string; title: string; period_start: string;
  pay_date: string | null; status: string; totals: Record<string, any>; pay_group_name: string | null; created_at: string };

export default function PayRunsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Run> | null>(null);
  const [loading, setLoading] = useState(true);
  const newOpen = params.get("new") === "1";

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), size: "25" });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (filters.kind?.length) qs.set("kind", filters.kind.join(","));
    if (filters.fy?.[0]) qs.set("fy", filters.fy[0]);
    api.get<Page<Run>>(`/payroll/runs?${qs}`).then(setData).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false));
  }, [page, filters, toast]);
  useEffect(() => { load(); }, [load]);

  const columns: Column<Run>[] = [
    { key: "title", header: "Pay run", cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink">{r.title}</p>
        <p className="truncate text-[12.5px] text-faint">{[r.number, r.kind !== "regular" ? r.kind_label : r.pay_group_name].filter(Boolean).join(" · ")}</p></div>) },
    { key: "pay", header: "Pay date", hideBelow: "md", cell: (r) => <span className="text-muted">{r.pay_date ? formatDate(r.pay_date) : "—"}</span> },
    { key: "emp", header: "People", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{r.totals?.employees ?? "—"}</span> },
    { key: "gross", header: "Gross", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{r.totals?.gross ? inr(r.totals.gross) : "—"}</span> },
    { key: "net", header: "Net pay", align: "right", cell: (r) => <span className="tabular text-ink">{r.totals?.net ? inr(r.totals.net) : "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <RunStatus status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Pay runs" description="Monthly payroll and extra runs for bonus, arrears, settlements and corrections."
        actions={<Button variant="primary" icon={Plus} onClick={() => router.replace("/dashboard/payroll/runs?new=1")}>New pay run</Button>} />
      <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }} filters={[
        { key: "fy", label: "Year", options: fyOptions() },
        { key: "kind", label: "Kind", multiple: true, options: [{ value: "regular", label: "Monthly" }, { value: "bonus", label: "Bonus" }, { value: "arrears", label: "Arrears" }, { value: "settlement", label: "Final settlement" }, { value: "correction", label: "Correction" }] },
        { key: "status", label: "Status", multiple: true, options: [{ value: "inputs", label: "Collecting inputs" }, { value: "review", label: "In review" }, { value: "pending_approval", label: "Waiting for approval" }, { value: "approved", label: "Approved" }, { value: "locked", label: "Locked" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }] },
      ]} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        onRowClick={(r) => router.push(`/dashboard/payroll/runs/${r.uuid}`)}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={PlayCircle} emptyTitle="No pay runs yet" emptyHint="Open this month's period to collect inputs and calculate pay."
        emptyAction={<Button variant="primary" onClick={() => router.replace("/dashboard/payroll/runs?new=1")}>New pay run</Button>} />
      <NewRunModal open={newOpen} onClose={() => router.replace("/dashboard/payroll/runs")}
        onCreated={(r) => router.push(`/dashboard/payroll/runs/${r.uuid}`)} />
    </div>
  );
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function NewRunModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: Run) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState("regular");
  const [month, setMonth] = useState(thisMonth());
  const [group, setGroup] = useState<string | null>(null);
  const [groups, setGroups] = useState<SelectOption<string>[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [peopleOpts, setPeopleOpts] = useState<SelectOption<string>[]>([]);
  const [title, setTitle] = useState("");
  const [payDate, setPayDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<{ uuid: string; name: string; is_default: boolean }[]>("/payroll/pay-groups").then((g) => {
      setGroups(g.map((x) => ({ value: x.uuid, label: x.name })));
      setGroup(g.find((x) => x.is_default)?.uuid ?? g[0]?.uuid ?? null);
    }).catch(() => {});
  }, [open]);

  async function create() {
    setBusy(true);
    try {
      const r = await api.post<Run>("/payroll/runs", {
        month: `${month.slice(0, 7)}-01`, kind, pay_group_uuid: group, title: title || undefined, pay_date: payDate || undefined,
        employee_uuids: kind === "regular" ? undefined : people,
      });
      toast.success("Pay run opened");
      onCreated(r);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="New pay run" busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={create} disabled={kind !== "regular" && !people.length}>Open pay run</Button></>}>
      <div className="space-y-5">
        <RadioCards value={kind} onChange={setKind} columns={2} options={[
          { value: "regular", label: "Monthly payroll", description: "Everyone in the pay group" },
          { value: "bonus", label: "Bonus", description: "Bonus or incentive outside the month" },
          { value: "arrears", label: "Arrears", description: "Back-dated revisions" },
          { value: "correction", label: "Correction", description: "Fix a locked month" },
        ]} />
        <FormGrid>
          <Field label="Month" required hint="Any day in the month"><DateInput value={month} onChange={setMonth} /></Field>
          <Field label="Pay group"><Select value={group} onChange={setGroup} options={groups} /></Field>
        </FormGrid>
        {kind !== "regular" && (
          <>
            <Field label="People" required>
              <MultiSelect value={people} onChange={(v, o) => { setPeople(v); setPeopleOpts(o); }} loadOptions={loadPayrollEmployees} selectedOptions={peopleOpts} placeholder="Search employees" />
            </Field>
            <FormGrid>
              <Field label="Title"><TextInput value={title} onValueChange={setTitle} placeholder="e.g. Diwali bonus" /></Field>
              <Field label="Pay date"><DateInput value={payDate} onChange={setPayDate} /></Field>
            </FormGrid>
          </>
        )}
      </div>
    </Modal>
  );
}
