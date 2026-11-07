"use client";

/*
 * My applications: internal jobs and gigs the signed-in person applied for, where each one
 * stands (waiting for their manager, applied, shortlisted, selected, moved) and withdraw.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Search, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, Skeleton, formatDisplayDate, useConfirm } from "@/components/ui-kit";
import { PostingDetail } from "@/components/positions/marketplace-modals";
import { MatchPill, StatusBadge } from "@/components/positions/shared";
import type { Application } from "@/components/positions/types";

const STEPS = [
  { key: "applied", label: "Applied" }, { key: "manager", label: "Manager agreed" }, { key: "shortlisted", label: "Shortlisted" },
  { key: "selected", label: "Selected" }, { key: "done", label: "Moved" },
];
const REACHED: Record<string, number> = { manager_review: 0, submitted: 1, shortlisted: 2, selected: 3, moved: 4, assigned: 4 };
const ACTIVE = ["manager_review", "submitted", "shortlisted", "selected"];

export default function MyApplicationsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Application[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => { api.get<{ items: Application[] }>("/internal-jobs/applications/mine").then((r) => setRows(r.items)).catch((e) => toast.error(e.message)); }, [nonce, toast]);

  async function withdraw(a: Application) {
    if (!(await confirm({ title: "Withdraw this application?", message: "You can apply again while the posting is open.", confirmLabel: "Withdraw" }))) return;
    try { await api.post(`/internal-jobs/applications/${a.uuid}/withdraw`); toast.success("Withdrawn"); setNonce((n) => n + 1); }
    catch (e) { toast.error((e as Error).message); }
  }

  const open = (rows ?? []).filter((a) => ACTIVE.includes(a.status));
  const closed = (rows ?? []).filter((a) => !ACTIVE.includes(a.status));
  return (
    <div>
      <PageHeader title="My applications" description="Internal jobs and gigs you applied for."
        actions={<Link href="/dashboard/internal-jobs"><Button icon={Search}>Browse internal jobs</Button></Link>} />
      {!rows ? <Skeleton className="h-48 rounded-2xl" /> : !rows.length ? (
        <Paper><EmptyState icon={ClipboardList} title="You haven't applied for anything yet" hint="Open Internal jobs to see roles and gigs inside the company." /></Paper>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">In progress</p>
              {open.map((a) => {
                const reached = REACHED[a.status] ?? 0;
                const steps = a.posting?.kind === "gig" ? STEPS.map((s) => s.key === "done" ? { ...s, label: "Started" } : s) : STEPS;
                return (
                  <Paper key={a.uuid} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button type="button" className="text-left" onClick={() => a.posting && setViewing(a.posting.uuid)}>
                        <p className="text-[15.5px] text-ink hover:underline">{a.posting?.title}</p>
                        <p className="text-[12.5px] text-faint">{a.posting?.kind_label} · applied {formatDate(a.created_at)}</p>
                      </button>
                      <div className="flex items-center gap-2"><MatchPill score={a.match_score} /><StatusBadge status={a.status} label={a.status_label} /></div>
                    </div>
                    <ol className="mt-5 grid grid-cols-5 gap-2">
                      {steps.map((s, i) => {
                        const done = i <= reached && !(i === 1 && a.status === "manager_review");
                        const current = i === reached;
                        return (
                          <li key={s.key} className="min-w-0">
                            <div className={`h-1 rounded-full ${done && !(current && a.status === "manager_review") ? "bg-primary/70" : current ? "bg-amber-400" : "bg-sunken"}`} />
                            <p className={`mt-1.5 truncate text-[12px] ${done ? "text-ink" : "text-faint"}`}>{s.label}</p>
                          </li>
                        );
                      })}
                    </ol>
                    {a.status === "manager_review" && <p className="mt-3 text-[13px] text-amber-700">Waiting for {a.manager?.name ?? "your manager"} to agree.</p>}
                    {a.manager_note && <p className="mt-2 text-[13px] text-muted">Your manager: {a.manager_note}</p>}
                    <div className="mt-4 flex justify-end"><Button size="sm" variant="ghost" icon={Undo2} onClick={() => withdraw(a)}>Withdraw</Button></div>
                  </Paper>
                );
              })}
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <p className="mb-3 text-[13px] text-muted">Finished</p>
              <Paper>
                <ul className="divide-y divide-line">
                  {closed.map((a) => (
                    <li key={a.uuid} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-ink">{a.posting?.title}</p>
                        <p className="text-[12.5px] text-faint">{a.posting?.kind_label} · {a.decision_note || a.manager_note || `applied ${formatDate(a.created_at)}`}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(a.status === "moved" || a.status === "assigned") && a.effective_date && <Badge tone="good"><CheckCircle2 size={12} strokeWidth={1.4} />From {formatDisplayDate(a.effective_date)}</Badge>}
                        <StatusBadge status={a.status} label={a.status_label} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Paper>
            </div>
          )}
        </div>
      )}
      <PostingDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={() => setNonce((n) => n + 1)} onEdit={() => {}} />
    </div>
  );
}
