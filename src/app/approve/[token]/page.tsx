"use client";

/*
 * Approve or reject a request from the link in an approval email. The link works once,
 * expires, and is recorded in the audit log. Data: /workflow/email-actions/{token}.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Clock, X, XCircle } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { Button, Field, Skeleton, Textarea } from "@/components/ui-kit";

type Info = {
  action: "approve" | "reject"; state: "valid" | "used" | "decided" | "expired"; company_name: string | null;
  approver_name: string | null; title: string; reference_no: string | null; requester_name: string | null;
  request_type_label: string; step_name: string; summary: string[]; created_at: string; expires_at: string;
  outcome: string | null; comment_required: boolean;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail || "Something went wrong. Open the request in the app instead.");
  return body as T;
}

export default function EmailApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ decision: string; status: string } | null>(null);

  useEffect(() => {
    call<Info>(`/workflow/email-actions/${encodeURIComponent(token)}`).then(setInfo)
      .catch(() => setError("This link is not valid. It may have been copied incompletely."));
  }, [token]);

  async function confirm() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ decision: string; status: string }>(`/workflow/email-actions/${encodeURIComponent(token)}`,
        { method: "POST", body: JSON.stringify({ comment: comment.trim() || null }) });
      setDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the decision");
    } finally {
      setBusy(false);
    }
  }

  const approve = info?.action === "approve";
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="mb-4 text-center text-[13px] uppercase tracking-[0.08em] text-faint">{info?.company_name ?? "Approval"}</p>
      <div className="rounded-2xl border border-line bg-surface p-6">
        {!info && !error && <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-20" /></div>}
        {!info && error && <Message icon={AlertCircle} tone="bad" title="Link not valid" text={error} />}
        {info && done && (
          <Message icon={done.decision === "approve" ? CheckCircle2 : XCircle} tone={done.decision === "approve" ? "good" : "bad"}
            title={done.decision === "approve" ? "Approved" : "Rejected"}
            text={done.status === "pending" ? "Thank you. The request now goes to the next approver." : "Thank you. The requester has been told."} />
        )}
        {info && !done && info.state !== "valid" && (
          <Message icon={info.state === "expired" ? Clock : AlertCircle} tone="neutral"
            title={info.state === "expired" ? "This link has expired" : info.state === "used" ? "This link was already used" : "Already decided"}
            text={info.state === "decided" ? `This request was already ${info.outcome ?? "decided"}. Nothing more to do.`
              : "Open the request in the app to see where it stands."} />
        )}
        {info && !done && info.state === "valid" && (
          <div className="space-y-5">
            <div>
              <p className="text-[13px] text-muted">{info.request_type_label}{info.reference_no ? ` · ${info.reference_no}` : ""}</p>
              <h1 className="mt-1 text-[21px] font-light text-ink">{info.title}</h1>
              <p className="mt-1 text-[13.5px] text-muted">Asked by {info.requester_name ?? "someone"} on {formatDateTime(info.created_at)}</p>
            </div>
            {info.summary.filter(Boolean).length > 0 && (
              <ul className="space-y-1 rounded-xl bg-sunken/60 px-4 py-3 text-[14px] text-ink">
                {info.summary.filter(Boolean).map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
            <Field label={approve ? "Comment (optional)" : "Why is it rejected?"} required={!approve}>
              <Textarea value={comment} onValueChange={setComment} rows={3} autoGrow
                placeholder={approve ? "Anything the requester should know" : "The requester will see this"} />
            </Field>
            {error && <p className="text-[13px] text-rose-600">{error}</p>}
            <Button variant={approve ? "primary" : "danger"} icon={approve ? Check : X} loading={busy}
              disabled={!approve && !comment.trim()} onClick={confirm} className="w-full justify-center">
              {approve ? "Approve" : "Reject"} as {info.approver_name}
            </Button>
            <p className="text-center text-[12px] text-faint">This link works once and expires {formatDateTime(info.expires_at)}.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Message({ icon: Icon, tone, title, text }: { icon: typeof Check; tone: "good" | "bad" | "neutral"; title: string; text: string }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-muted";
  return (
    <div className="py-4 text-center">
      <Icon size={36} strokeWidth={1.2} className={`mx-auto ${color}`} />
      <p className="mt-3 text-[18px] font-light text-ink">{title}</p>
      <p className="mt-1 text-[14px] text-muted">{text}</p>
    </div>
  );
}
