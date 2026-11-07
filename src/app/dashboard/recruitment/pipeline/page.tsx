"use client";

/*
 * Pipeline board for one job (?job=<uuid>): drag candidates between stages.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Columns3, Info, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell/page";
import { EmptyState } from "@/components/shell/page";
import { Button, Select, type SelectOption } from "@/components/ui-kit";
import { PipelineBoard } from "@/components/recruitment/board";
import { CandidateModal } from "@/components/recruitment/candidate-modal";
import { CandidateFormModal } from "@/components/recruitment/candidate-form";
import { JobModal } from "@/components/recruitment/job-detail";
import type { Job, Page } from "@/components/recruitment/types";

function Pipeline() {
  const router = useRouter();
  const params = useSearchParams();
  const jobUuid = params.get("job");
  const [jobs, setJobs] = useState<SelectOption<string>[]>([]);
  const [title, setTitle] = useState<string>("Pipeline");
  const [open, setOpen] = useState<{ app: string; cand: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [info, setInfo] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    api.get<Page<Job>>("/recruitment/jobs?size=200&status=open,on_hold,draft,filled").then((r) => {
      setJobs(r.items.map((j) => ({ value: j.uuid, label: j.title, description: j.status_label })));
      if (!jobUuid && r.items[0]) router.replace(`/dashboard/recruitment/pipeline?job=${r.items[0].uuid}`);
    }).catch(() => {});
  }, [jobUuid, router]);

  return (
    <div>
      <PageHeader eyebrow={<Link href="/dashboard/recruitment" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={12} strokeWidth={1.4} />Hiring</Link>}
        title={title} description="Drag a candidate to move them to the next stage."
        actions={<>
          <div className="w-64"><Select value={jobUuid} onChange={(v) => v && router.push(`/dashboard/recruitment/pipeline?job=${v}`)} options={jobs} aria-label="Job" /></div>
          {jobUuid && <Button variant="ghost" icon={Info} onClick={() => setInfo(true)}>Job details</Button>}
          {jobUuid && <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add candidate</Button>}
        </>} />
      {jobUuid ? (
        <PipelineBoard jobUuid={jobUuid} reloadKey={nonce} onLoaded={(b) => setTitle(b.job.title)}
          onOpen={(c) => setOpen({ app: c.uuid, cand: c.candidate_uuid })} />
      ) : <EmptyState icon={Columns3} title="No jobs yet" hint="Create a job opening first." />}
      <CandidateModal applicationUuid={open?.app} candidateUuid={open?.cand} onClose={() => setOpen(null)} onChanged={() => setNonce((n) => n + 1)} />
      <CandidateFormModal open={adding} jobUuid={jobUuid} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNonce((n) => n + 1); }} />
      <JobModal uuid={info ? jobUuid : null} onClose={() => setInfo(false)} onEdit={() => router.push("/dashboard/recruitment")} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}

export default function PipelinePage() {
  return <Suspense><Pipeline /></Suspense>;
}
