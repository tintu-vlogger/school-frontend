"use client";

/*
 * Refer a friend: open jobs with the referral bonus, a refer form (with CV), and the
 * referrals you made. HR sees everyone's referrals and moves bonuses to payroll.
 */
import { useCallback, useEffect, useState } from "react";
import { Gift, MapPin, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { Paper, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FileDrop, FormGrid, Modal, ModalCancel, NumberInput, Tabs, Textarea, TextInput,
  formatDisplayDate, type Column,
} from "@/components/ui-kit";
import { uploadFile } from "@/components/workplace/files";
import { useHiringMeta } from "@/components/recruitment/common";
import { REF_BONUS_TONE, errText, expRange, money, type Job, type Page, type Referral } from "@/components/recruitment/types";

export default function ReferralsPage() {
  const toast = useToast();
  const meta = useHiringMeta();
  const [tab, setTab] = useState<"jobs" | "mine" | "all">("jobs");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [refs, setRefs] = useState<Page<Referral> | null>(null);
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [refer, setRefer] = useState<Job | null>(null);
  const [pay, setPay] = useState<Referral | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<{ items: Job[] }>("/recruitment/referrals/jobs").then((r) => setJobs(r.items)).catch(() => setJobs([])); }, []);
  useEffect(() => {
    if (tab === "jobs") return;
    api.get<Page<Referral>>(`/recruitment/referrals?scope=${tab}&page=${page}&size=25`).then(setRefs).catch((e) => toast.error(errText(e)));
  }, [tab, page, nonce, toast]);

  async function setStatus(r: Referral, status: string, payment_ref?: string) {
    try { await api.post(`/recruitment/referrals/${r.uuid}/status`, { status, payment_ref }); toast.success("Updated"); setPay(null); refresh(); }
    catch (e) { toast.error(errText(e)); }
  }
  const columns: Column<Referral>[] = [
    { key: "c", header: "Candidate", cell: (r) => <div><p className="text-ink">{r.candidate_name}</p><p className="text-[12.5px] text-faint">{r.job_title}</p></div> },
    ...(tab === "all" ? [{ key: "by", header: "Referred by", cell: (r: Referral) => <span className="text-muted">{r.referrer_name}</span> }] : []),
    { key: "st", header: "Stage", cell: (r) => <span className="text-muted">{r.stage ?? "—"}</span> },
    { key: "b", header: "Bonus", align: "right", cell: (r) => <span className="tabular">{money(r.bonus_amount)}</span> },
    { key: "bs", header: "Bonus status", cell: (r) => <div><Badge tone={REF_BONUS_TONE[r.bonus_status] ?? "neutral"}>{r.bonus_status_label}</Badge>
      {r.eligible_on && r.bonus_status === "pending" && <p className="mt-0.5 text-[12px] text-faint">due {formatDisplayDate(r.eligible_on)}</p>}</div> },
    { key: "d", header: "Referred", cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>, hideBelow: "md" },
  ];
  return (
    <div>
      <PageHeader title="Refer a friend" description="Know someone great? Refer them. If they join and stay through the qualifying period, you get the referral bonus."
        actions={<Tabs variant="pill" value={tab} onChange={(v) => { setTab(v); setPage(1); }}
          items={[{ value: "jobs", label: "Open jobs" }, { value: "mine", label: "My referrals" }, ...(meta?.is_admin ? [{ value: "all" as const, label: "All referrals" }] : [])]} />} />
      {tab === "jobs" && meta && !meta.employee_id && <p className="mb-4 text-[13px] text-faint">Referrals are made by employees from their own sign-in.</p>}
      {tab === "jobs" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs?.map((j) => (
            <Paper key={j.uuid} className="flex flex-col p-5">
              <p className="text-[16px] text-ink">{j.title}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted"><MapPin size={13} strokeWidth={1.4} />{[j.location, j.work_mode_label ?? j.work_mode, j.department].filter(Boolean).join(" · ")}</p>
              {j.summary && <p className="mt-3 text-[13.5px] text-muted">{j.summary}</p>}
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="inline-flex items-center gap-1.5 text-[13.5px] text-emerald-700"><Gift size={15} strokeWidth={1.4} />{money(j.referral_bonus)}</span>
                <Button size="sm" variant="primary" icon={Send} onClick={() => setRefer(j)} disabled={!meta?.employee_id}>Refer</Button>
              </div>
              <p className="mt-2 text-[12px] text-faint">{expRange(j.min_experience, j.max_experience)}</p>
            </Paper>
          ))}
          {jobs && !jobs.length && <p className="text-[14px] text-faint">No open jobs right now.</p>}
        </div>
      ) : (
        <DataTable rows={refs?.items ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!refs}
          rowActions={tab === "all" ? (r) => [
            ...(r.bonus_status === "eligible" ? [{ label: "Approve for payroll", onSelect: () => setStatus(r, "approved") }] : []),
            ...(r.bonus_status === "approved" ? [{ label: "Mark paid", onSelect: () => setPay(r) }] : []),
            ...(["pending", "eligible", "in_process"].includes(r.bonus_status) ? [{ label: "Not eligible", onSelect: () => setStatus(r, "not_eligible") }] : []),
          ] : undefined}
          emptyIcon={Gift} emptyTitle="No referrals yet" emptyHint="Pick an open job and refer someone you know."
          pagination={refs ? { page: refs.page, size: refs.size, total: refs.total, onPageChange: setPage } : undefined} />
      )}
      <ReferModal job={refer} onClose={() => setRefer(null)} onDone={() => { setRefer(null); setTab("mine"); refresh(); }} />
      <PaidModal r={pay} onClose={() => setPay(null)} onSubmit={(ref) => pay && setStatus(pay, "paid", ref)} />
    </div>
  );
}

function ReferModal({ job, onClose, onDone }: { job: Job | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "", current_company: "", current_title: "", linkedin_url: "", note: "" });
  const [exp, setExp] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (job) { setF({ first_name: "", last_name: "", email: "", phone: "", current_company: "", current_title: "", linkedin_url: "", note: "" }); setExp(null); setFiles([]); } }, [job]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  async function send() {
    if (!job) return;
    setBusy(true);
    try {
      const ref = files[0] ? await uploadFile(files[0]) : null;
      await api.post("/recruitment/referrals", { job_uuid: job.uuid, ...f, total_experience: exp, resume_uuid: ref?.uuid ?? null });
      toast.success("Thanks! HR will take it from here.");
      onDone();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} size="lg" busy={busy} title={`Refer someone for ${job?.title ?? ""}`}
      description="Let them know you are referring them. Their details are used only for this hiring."
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={busy} onClick={send}>Refer</Button></>}>
      <div className="space-y-4">
        <FormGrid>
          <Field label="First name" required><TextInput value={f.first_name} onValueChange={set("first_name")} data-autofocus /></Field>
          <Field label="Last name"><TextInput value={f.last_name} onValueChange={set("last_name")} /></Field>
          <Field label="Email" required><TextInput type="email" value={f.email} onValueChange={set("email")} /></Field>
          <Field label="Phone"><TextInput value={f.phone} onValueChange={set("phone")} /></Field>
          <Field label="Current company"><TextInput value={f.current_company} onValueChange={set("current_company")} /></Field>
          <Field label="Current role"><TextInput value={f.current_title} onValueChange={set("current_title")} /></Field>
          <Field label="Experience"><NumberInput value={exp} onChange={setExp} min={0} step={0.5} suffix="yrs" /></Field>
          <Field label="LinkedIn"><TextInput value={f.linkedin_url} onValueChange={set("linkedin_url")} /></Field>
        </FormGrid>
        <Field label="CV"><FileDrop value={files} onChange={setFiles} accept=".pdf,.doc,.docx" maxSizeMb={5} /></Field>
        <Field label="How do you know them?"><Textarea value={f.note} onValueChange={set("note")} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function PaidModal({ r, onClose, onSubmit }: { r: Referral | null; onClose: () => void; onSubmit: (ref: string) => void }) {
  const [ref, setRef] = useState("");
  useEffect(() => { setRef(""); }, [r]);
  return (
    <Modal open={!!r} onClose={onClose} size="sm" title="Mark bonus paid"
      footer={<><ModalCancel /><Button variant="primary" onClick={() => onSubmit(ref)}>Mark paid</Button></>}>
      <Field label="Payment reference" hint="Pay run or transfer reference"><TextInput value={ref} onValueChange={setRef} data-autofocus /></Field>
    </Modal>
  );
}
