"use client";

/*
 * PayslipModal: one payslip with earnings, deductions, employer contributions, the tax
 * worksheet for the month and statutory details. Used by HR (run review) and employees.
 *   <PayslipModal uuid={uuid} open onClose={...} admin onChanged={...} />
 */
import { useEffect, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Button, KeyValue, Modal, Skeleton, Tabs } from "@/components/ui-kit";
import { Row, StatusPill, downloadWithAuth, errMsg, inr, monthLabel } from "./common";

type Line = { code: string; name: string; name_hi?: string | null; kind: string; amount: string; note?: string | null; show?: boolean };
export type PayslipDetail = {
  uuid: string; employee_name: string; employee_code: string | null; status: string; payable_days: string; lop_days: string;
  days_in_period: string; gross: string; deductions: string; net: string; employer_cost: string; period_start: string;
  lines: Line[]; warnings: { code: string; level: string; message: string }[]; hold_reason: string | null;
  arrears: { code: string; name?: string; amount: string; period: string }[]; payment_status: string; published: boolean;
  statutory: Record<string, any>; wage_rule: Record<string, any>; snapshot: Record<string, any>;
  tax: { tds?: string; regular?: string; one_time?: string; deducted_so_far?: string; worksheet?: Record<string, any> };
  run: { uuid: string; title: string; status: string } | null;
};

export function PayslipModal({ uuid, open, onClose, admin, onChanged }: { uuid: string | null; open: boolean; onClose: () => void; admin?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<PayslipDetail | null>(null);
  const [tab, setTab] = useState("pay");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !uuid) return;
    setP(null);
    setTab("pay");
    api.get<PayslipDetail>(`/payroll/payslips/${uuid}`).then(setP).catch((e) => toast.error(errMsg(e)));
  }, [uuid, open, toast]);

  async function holdOrRelease() {
    if (!p) return;
    setBusy(true);
    try {
      const next = await api.post<PayslipDetail>(`/payroll/payslips/${p.uuid}/${p.status === "held" ? "release" : "hold"}`, { reason: p.status === "held" ? "Released" : "Held by HR" });
      setP(next);
      toast.success(p.status === "held" ? "Salary released" : "Salary on hold");
      onChanged?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  const earn = p?.lines.filter((l) => l.kind === "earning" || l.kind === "reimbursement") ?? [];
  const ded = p?.lines.filter((l) => l.kind === "deduction") ?? [];
  const emp = p?.lines.filter((l) => l.kind === "employer") ?? [];
  const ws = p?.tax?.worksheet;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={p ? `${p.employee_name}` : "Payslip"}
      description={p ? `${monthLabel(p.period_start)} · ${p.employee_code ?? ""}` : undefined}
      headerActions={p && <StatusPill status={p.status} />}
      footer={p && (
        <>
          {admin && p.run && !["paid"].includes(p.payment_status) && (
            <Button variant="secondary" icon={p.status === "held" ? Play : Pause} loading={busy} onClick={holdOrRelease}>
              {p.status === "held" ? "Release salary" : "Hold salary"}
            </Button>
          )}
          <Button variant="primary" icon={Download} onClick={() => downloadWithAuth(`/payroll/payslips/${p.uuid}/pdf`, "payslip.pdf").catch((e) => toast.error(errMsg(e)))}>
            Download PDF
          </Button>
        </>
      )}>
      {!p ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-4">
            <Stat label="Gross" value={inr(p.gross)} />
            <Stat label="Deductions" value={inr(p.deductions)} />
            <Stat label="Net pay" value={inr(p.net)} accent />
            <Stat label="Paid days" value={`${Number(p.payable_days)} / ${Number(p.days_in_period)}`} />
          </div>
          {p.hold_reason && <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13.5px] text-amber-800">On hold: {p.hold_reason}</p>}
          {p.warnings.filter((w) => w.level !== "info").map((w) => (
            <p key={w.code} className={`rounded-lg border px-3 py-2 text-[13.5px] ${w.level === "block" ? "border-rose-200 bg-rose-50/70 text-rose-800" : "border-amber-200 bg-amber-50/70 text-amber-800"}`}>{w.message}</p>
          ))}
          <Tabs value={tab} onChange={setTab} items={[{ value: "pay", label: "Pay" }, { value: "tax", label: "Tax" }, { value: "statutory", label: "PF, ESI and PT" }]} />
          {tab === "pay" && (
            <div className="grid gap-6 sm:grid-cols-2">
              <LineList title="Earnings" lines={earn} total={p.gross} />
              <LineList title="Deductions" lines={ded} total={p.deductions} empty="No deductions" />
              {emp.length > 0 && <LineList title="Employer contributions" lines={emp} total={String(emp.reduce((a, l) => a + Number(l.amount), 0))} />}
              {p.arrears.length > 0 && (
                <div>
                  <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Arrears</p>
                  {p.arrears.map((a, i) => <Row key={i} label={a.name ?? a.code} sub={monthLabel(a.period)} value={inr(a.amount)} />)}
                </div>
              )}
            </div>
          )}
          {tab === "tax" && (ws ? (
            <div className="space-y-4">
              <KeyValue columns={3} items={[
                { label: "Regime", value: ws.regime === "new" ? "New (default)" : "Old" },
                { label: "Projected taxable income", value: inr(ws.taxable_income) },
                { label: "Tax for the year", value: inr(ws.annual_tax) },
                { label: "Deducted before", value: inr(p.tax.deducted_so_far) },
                { label: "This month", value: inr(p.tax.tds) },
                { label: "One-time part", value: inr(p.tax.one_time) },
              ]} />
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Exemptions</p>
                  {(ws.exemptions ?? []).map((x: any) => <Row key={x.key} label={x.label} value={inr(x.amount)} />)}
                </div>
                <div>
                  <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Deductions</p>
                  {(ws.deductions ?? []).length ? ws.deductions.map((x: any) => <Row key={x.key} label={x.label} value={inr(x.amount)} />)
                    : <p className="py-2 text-[13.5px] text-muted">None in this regime</p>}
                </div>
              </div>
              {ws.no_pan_rate_applied && <Badge tone="warn">Higher rate without PAN</Badge>}
            </div>
          ) : <p className="text-[13.5px] text-muted">No tax worked out on this payslip.</p>)}
          {tab === "statutory" && (
            <KeyValue columns={3} items={[
              { label: "Wages (Code on Wages)", value: inr(p.statutory.wages) },
              { label: "50% rule add-back", value: inr(p.statutory.wage_add_back) },
              { label: "PF wages", value: inr(p.statutory.pf?.pf_wage) },
              { label: "EPF / EPS / EDLI wages", value: p.statutory.pf ? `${inr(p.statutory.pf.epf_wage)} / ${inr(p.statutory.pf.eps_wage)} / ${inr(p.statutory.pf.edli_wage)}` : "—" },
              { label: "ESI", value: p.statutory.esi?.covered ? `Covered · wages ${inr(p.statutory.esi.wage)}` : "Not covered" },
              { label: "Professional Tax", value: p.statutory.pt?.state ? `${p.statutory.pt.state} · ${inr(p.statutory.pt.amount)}` : "Not applicable" },
              { label: "LWF", value: p.statutory.lwf?.state ? `${p.statutory.lwf.state} · ${inr(p.statutory.lwf.employee)}` : "—" },
              { label: "Gratuity provision", value: inr(p.statutory.gratuity_provision) },
              { label: "Bank", value: p.snapshot.bank ? `${p.snapshot.bank.name ?? ""} ••${p.snapshot.bank.last4}` : "No bank account" },
            ]} />
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`tabular text-[19px] font-light ${accent ? "text-primary" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function LineList({ title, lines, total, empty }: { title: string; lines: Line[]; total: string; empty?: string }) {
  return (
    <div>
      <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">{title}</p>
      <div className="divide-y divide-line">
        {lines.length ? lines.map((l, i) => <Row key={`${l.code}${i}`} label={l.name} sub={l.note || l.name_hi || undefined} value={inr(l.amount)} />)
          : <p className="py-2 text-[13.5px] text-muted">{empty ?? "None"}</p>}
        <Row label="Total" value={inr(total)} strong />
      </div>
    </div>
  );
}
