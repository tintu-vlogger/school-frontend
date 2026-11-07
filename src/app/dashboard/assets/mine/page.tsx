"use client";

/*
 * My assets: what the signed-in employee holds, confirming receipt of newly handed
 * over assets, past returns (with any recovery) and asking for a new asset.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Laptop, PackagePlus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, Paper, PaperHeader, PageHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton, useConfirm } from "@/components/ui-kit";
import { RequestAssetModal, assignmentBadge, type Assignment } from "@/components/assets/asset-modals";
import { CONDITION_LABEL, RECOVERY_STATUS, REQUEST_STATUS } from "@/components/workplace/asset-status";
import { money } from "@/components/workplace/pickers";

type Mine = Assignment & { asset: { uuid: string; asset_tag: string; name: string; brand: string | null; model: string | null; serial_number: string | null; category_name: string | null } };
type Req = { uuid: string; category_name: string | null; details: string | null; needed_by: string | null; status: string; created_at: string };

export default function MyAssetsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{ items: Mine[]; requests: Req[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [askKey, setAskKey] = useState(0);
  const load = useCallback(() => {
    api.get<{ items: Mine[]; requests: Req[] }>("/assets/me").then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your assets"));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function confirmReceipt(x: Mine) {
    const ok = await confirm({ title: `Confirm you received ${x.asset.name}?`, message: "You are responsible for it until you return it. Loss or damage may be recovered from your final settlement.", confirmLabel: "I received it" });
    if (!ok) return;
    try { await api.post(`/assets/assignments/${x.uuid}/acknowledge`); toast.success("Thanks, receipt confirmed"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't confirm"); }
  }

  const current = data?.items.filter((x) => x.status !== "returned") ?? [];
  const past = data?.items.filter((x) => x.status === "returned") ?? [];

  return (
    <div>
      <PageHeader eyebrow="Home" title="My assets" description="Company property you hold, and requests for new items."
        actions={<Button variant="primary" icon={PackagePlus} onClick={() => { setAskKey((k) => k + 1); setAsking(true); }}>Ask for an asset</Button>} />
      {!data ? <Paper className="p-6"><Skeleton className="h-16 w-full" /></Paper> : (
        <div className="space-y-6">
          {current.length === 0 ? (
            <Paper><EmptyState icon={Laptop} title="You don't hold any company assets" hint="When IT or admin hands you something, it shows up here for you to confirm." /></Paper>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {current.map((x) => (
                <Paper key={x.uuid} className="flex flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft/60 text-primary"><Laptop size={18} strokeWidth={1.4} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] text-ink">{x.asset.name}</p>
                      <p className="text-[12.5px] text-faint"><span className="font-mono">{x.asset.asset_tag}</span>{x.asset.category_name ? ` · ${x.asset.category_name}` : ""}</p>
                    </div>
                    {assignmentBadge(x.status)}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-[13px]">
                    <div><dt className="text-faint">Since</dt><dd className="text-ink">{formatDate(x.assigned_on)}</dd></div>
                    <div><dt className="text-faint">Serial</dt><dd className="truncate font-mono text-ink">{x.asset.serial_number ?? "—"}</dd></div>
                    {x.expected_return_on && <div><dt className="text-faint">Return by</dt><dd className="text-ink">{formatDate(x.expected_return_on)}</dd></div>}
                    {x.condition_out && <div><dt className="text-faint">Condition</dt><dd className="text-ink">{CONDITION_LABEL[x.condition_out]}</dd></div>}
                  </dl>
                  {x.notes && <p className="text-[12.5px] text-muted">{x.notes}</p>}
                  {x.status === "pending_ack"
                    ? <Button variant="primary" icon={CheckCircle2} onClick={() => confirmReceipt(x)}>Confirm I received it</Button>
                    : <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700"><CheckCircle2 size={14} strokeWidth={1.4} /> You confirmed receipt</p>}
                </Paper>
              ))}
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Paper>
              <PaperHeader title="My requests" />
              {data.requests.length ? (
                <ul className="divide-y divide-line">{data.requests.map((r) => (
                  <li key={r.uuid} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0"><p className="text-[14px] text-ink">{r.category_name ?? "Asset"}</p>
                      <p className="truncate text-[12.5px] text-muted">{r.details}</p>
                      <p className="text-[12px] text-faint">Asked {formatDate(r.created_at)}{r.needed_by ? ` · needed by ${formatDate(r.needed_by)}` : ""}</p></div>
                    <Badge tone={REQUEST_STATUS[r.status]?.tone}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Badge>
                  </li>))}</ul>
              ) : <p className="px-5 py-5 text-[13.5px] text-muted">No requests yet.</p>}
            </Paper>
            <Paper>
              <PaperHeader title="Returned" />
              {past.length ? (
                <ul className="divide-y divide-line">{past.map((x) => (
                  <li key={x.uuid} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0"><p className="truncate text-[14px] text-ink">{x.asset.name}</p>
                      <p className="text-[12px] text-faint">{formatDate(x.assigned_on)} – {x.returned_on ? formatDate(x.returned_on) : ""} · {CONDITION_LABEL[x.condition_in ?? ""] ?? ""}</p></div>
                    {x.recovery_amount && <Badge tone={RECOVERY_STATUS[x.recovery_status]?.tone}>{money(x.recovery_amount)} · {RECOVERY_STATUS[x.recovery_status]?.label}</Badge>}
                  </li>))}</ul>
              ) : <p className="px-5 py-5 text-[13.5px] text-muted">Nothing returned yet.</p>}
            </Paper>
          </div>
        </div>
      )}
      <RequestAssetModal key={askKey} open={asking} onClose={() => setAsking(false)} onDone={() => { setAsking(false); load(); }} />
    </div>
  );
}
