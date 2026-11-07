"use client";

/*
 * Job details modal: summary, counts per stage, publish / hold / close, share links,
 * job-site posting and a link to the pipeline board.
 *   <JobModal uuid onClose onEdit={(job) => ...} onChanged />
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Columns3, Copy, ExternalLink, Pause, Pencil, Play, Send, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Badge, Button, KeyValue, Modal, Skeleton, formatDisplayDate, useConfirm } from "@/components/ui-kit";
import { useHiringMeta } from "./common";
import { JOB_TONE, errText, expRange, range, safeHtml, type Job } from "./types";

export function JobModal({ uuid, onClose, onEdit, onChanged }: {
  uuid: string | null; onClose: () => void; onEdit: (j: Job) => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useHiringMeta();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!uuid) { setJob(null); return; }
    api.get<Job>(`/recruitment/jobs/${uuid}`).then(setJob).catch((e) => toast.error(errText(e)));
  }, [uuid, toast]);

  async function act(action: string) {
    if (!job) return;
    if (action === "close" && !(await confirm({ title: "Close this job?", message: "It comes off the careers page. Candidates stay in the pipeline.", confirmLabel: "Close job" }))) return;
    setBusy(action);
    try { setJob(await api.post<Job>(`/recruitment/jobs/${job.uuid}/status`, { action })); onChanged?.(); toast.success("Done"); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }
  async function post(board: string) {
    if (!job) return;
    setBusy(board);
    try {
      const r = await api.post<{ status: string; message?: string; share?: string }>(`/recruitment/jobs/${job.uuid}/postings`, { board });
      toast.success(r.message ?? "Posted");
      if (r.share) window.open(r.share, "_blank", "noopener");
      setJob(await api.get<Job>(`/recruitment/jobs/${job.uuid}`));
    } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={job?.title ?? "Job"}
      description={job ? [job.code, job.department, job.location, job.work_mode_label].filter(Boolean).join(" · ") : undefined}
      headerActions={job && <Badge tone={JOB_TONE[job.status ?? ""] ?? "neutral"}>{job.status_label}{job.published ? " · on careers page" : ""}</Badge>}
      footerStart={job && job.status !== "closed" && job.status !== "filled" ? <Button variant="ghost" icon={XCircle} loading={busy === "close"} onClick={() => act("close")}>Close job</Button> : undefined}
      footer={job && <>
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(job)}>Edit</Button>
        {job.status === "open" && <Button variant="secondary" icon={Pause} loading={busy === "hold"} onClick={() => act("hold")}>Put on hold</Button>}
        {(job.status === "closed" || job.status === "filled") && <Button variant="secondary" loading={busy === "reopen"} onClick={() => act("reopen")}>Reopen</Button>}
        {!job.published && job.status !== "closed" && job.status !== "filled" && <Button variant="secondary" icon={Play} loading={busy === "publish"} onClick={() => act("publish")}>Publish</Button>}
        <Link href={`/dashboard/recruitment/pipeline?job=${job.uuid}`}><Button variant="primary" icon={Columns3}>Open pipeline</Button></Link>
      </>}>
      {!job ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["In the running", job.counts?.active ?? 0], ["Applied", job.counts?.total ?? 0], ["Hired", `${job.counts?.hired ?? 0} of ${job.openings}`], ["Not moving ahead", job.counts?.rejected ?? 0]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl border border-line px-3 py-2.5"><p className="text-[12px] text-muted">{l}</p><p className="tabular text-[20px] font-light text-ink">{v}</p></div>
            ))}
          </div>
          {!!job.stages?.length && (
            <div className="flex flex-wrap gap-2">
              {job.stages.map((s) => <span key={s.key} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-muted">{s.label} <span className="tabular text-ink">{job.counts?.by_stage[s.key] ?? 0}</span></span>)}
            </div>
          )}
          <KeyValue items={[
            { label: "Experience", value: expRange(job.min_experience, job.max_experience) },
            { label: "Annual CTC", value: `${range(job.salary_min, job.salary_max)}${job.show_salary ? " (shown)" : " (hidden)"}` },
            { label: "Hiring manager", value: job.hiring_manager }, { label: "Team", value: job.team?.map((t) => `${t.name} (${t.role})`).join(", ") },
            { label: "Required skills", value: job.skills.join(", ") }, { label: "Good to have", value: job.nice_skills.join(", ") },
            { label: "Published", value: job.published_at ? formatDisplayDate(job.published_at.slice(0, 10)) : null },
            { label: "Closes", value: job.closes_on ? formatDisplayDate(job.closes_on) : null },
            { label: "Hiring request", value: job.requisition_number }, { label: "Employment type", value: job.employment_type },
          ]} />
          {job.share && (
            <div>
              <p className="mb-2 text-[13px] text-muted">Share</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(job.share!.url)}>Copy careers link</Button>
                <a href={job.share.url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={ExternalLink}>View page</Button></a>
                <a href={job.share.linkedin} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">LinkedIn</Button></a>
                <a href={job.share.whatsapp} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">WhatsApp</Button></a>
                <a href={job.share.x} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">X</Button></a>
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-[13px] text-muted">Job sites</p>
            <div className="divide-y divide-line rounded-xl border border-line">
              {Object.entries(meta?.boards ?? {}).map(([key, label]) => {
                const p = job.postings?.[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div><p className="text-[14px] text-ink">{label}</p>
                      <p className="text-[12.5px] text-faint">{p ? `${p.message ?? p.status} · ${formatDateTime(p.at)}` : "Not posted"}</p></div>
                    <div className="flex items-center gap-2">
                      {p && <Badge tone={p.status === "posted" || p.status === "in_feed" ? "good" : p.status === "failed" ? "bad" : "info"}>{p.status.replace("_", " ")}</Badge>}
                      <Button size="sm" variant="secondary" icon={Send} loading={busy === key} onClick={() => post(key)} disabled={!job.published}>{p ? "Post again" : "Post"}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {!job.published && <p className="mt-2 text-[12.5px] text-faint">Publish on the careers page before posting to job sites.</p>}
          </div>
          {job.description && (
            <div><p className="mb-2 text-[13px] text-muted">Description</p>
              <div className="prose-sm max-w-none text-[14px] text-ink [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: safeHtml(job.description) }} /></div>
          )}
        </div>
      )}
    </Modal>
  );
}
