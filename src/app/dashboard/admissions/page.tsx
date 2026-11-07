"use client";

/*
 * Admissions dashboard: enquiries by stage, applications by status, seats filled per program,
 * conversion, follow-ups due and upcoming tests and interviews.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ExternalLink, FilePlus2, FileStack, Percent, Settings2, UserSearch, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Button, Select, Skeleton, StatCard, StatGrid } from "@/components/ui-kit";
import { companyAddress } from "@/components/workplace/files";
import { STAGE_TONE, StageBadge, StatusBadge, useAdmissionsMeta, type Application, type Enquiry, type Offering } from "@/components/admissions/shared";

type Dash = {
  session_id: number | null;
  stages: { key: string; label: string; count: number }[];
  statuses: { key: string; label: string; count: number }[];
  by_source: { label: string; count: number }[];
  offerings: Offering[];
  totals: { enquiries: number; open_enquiries: number; applications: number; enrolled: number; offered: number; accepted: number;
    enquiry_conversion: number; application_conversion: number; follow_ups_due: number };
  follow_ups: Enquiry[];
  upcoming: Application[];
};

const BAR: Record<string, string> = { info: "bg-sky-400", accent: "bg-primary/70", warn: "bg-amber-400", good: "bg-emerald-500", neutral: "bg-line-strong", bad: "bg-rose-400" };

export default function AdmissionsDashboard() {
  const toast = useToast();
  const { term } = useInstitution();
  const { can } = useAccess();
  const meta = useAdmissionsMeta();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [data, setData] = useState<Dash | null>(null);
  const session = sessionId ?? meta?.default_session_id ?? null;

  useEffect(() => {
    if (!meta) return;
    let live = true;
    api.get<Dash>(`/admissions/dashboard${session ? `?session_id=${session}` : ""}`).then((d) => { if (live) setData(d); })
      .catch((e) => toast.error("Couldn't load admissions", { description: e.message }));
    return () => { live = false; };
  }, [meta, session, toast]);

  const slug = typeof window !== "undefined" ? companyAddress() : null;
  const applyUrl = typeof window !== "undefined" ? `${window.location.origin}/apply` : "/apply";
  const t = data?.totals;
  const maxStage = Math.max(1, ...(data?.stages.map((s) => s.count) ?? [1]));
  const funnel = data?.statuses.filter((s) => s.count > 0 && s.key !== "draft") ?? [];
  const maxStatus = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <div>
      <PageHeader eyebrow={term("students")} title="Admissions" description="Enquiries, applications and seats at a glance."
        actions={<>
          <Select value={session} onChange={setSessionId} options={(meta?.sessions ?? []).map((s) => ({ value: s.id, label: s.name }))} className="w-40" aria-label={term("session")} />
          {slug && <a href={applyUrl} target="_blank" rel="noreferrer"><Button icon={ExternalLink}>Online form</Button></a>}
          {can("admissions.settings.manage") && <Link href="/dashboard/admissions/settings"><Button icon={Settings2}>Settings</Button></Link>}
          {can("admissions.manage") && <Link href="/dashboard/admissions/enquiries?new=1"><Button variant="primary" icon={FilePlus2}>New enquiry</Button></Link>}
        </>} />

      <StatGrid className="mb-6">
        <StatCard label="Open enquiries" value={t?.open_enquiries ?? "—"} icon={UserSearch} hint={t ? `${t.follow_ups_due} follow-ups due` : undefined} />
        <StatCard label="Applications" value={t?.applications ?? "—"} icon={FileStack} hint={t ? `${t.offered} offered · ${t.accepted} accepted` : undefined} />
        <StatCard label="Enrolled" value={t?.enrolled ?? "—"} icon={Users} hint={t ? `${t.application_conversion}% of applications` : undefined} />
        <StatCard label="Enquiry conversion" value={t ? `${t.enquiry_conversion}%` : "—"} icon={Percent} hint={t ? `of ${t.enquiries} enquiries` : undefined} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Paper>
          <PaperHeader title="Enquiry pipeline" action={<Link href="/dashboard/admissions/enquiries" className="inline-flex items-center gap-1 text-[13px] text-primary">Open board <ArrowRight size={14} strokeWidth={1.4} /></Link>} />
          <div className="space-y-3 p-5">
            {!data ? <Skeleton className="h-40 w-full" /> : data.stages.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[13px] text-muted">{s.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div className={`h-full rounded-full ${BAR[STAGE_TONE[s.key] ?? "neutral"]}`} style={{ width: `${(s.count / maxStage) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-[13px] tabular text-ink">{s.count}</span>
              </div>
            ))}
            {data && data.by_source.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Where enquiries come from</p>
                <div className="flex flex-wrap gap-2">
                  {data.by_source.map((s) => <span key={s.label} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] text-ink">{s.label} <span className="tabular text-muted">{s.count}</span></span>)}
                </div>
              </div>
            )}
          </div>
        </Paper>

        <Paper>
          <PaperHeader title="Applications by status" action={<Link href="/dashboard/admissions/applications" className="inline-flex items-center gap-1 text-[13px] text-primary">All applications <ArrowRight size={14} strokeWidth={1.4} /></Link>} />
          <div className="space-y-3 p-5">
            {!data ? <Skeleton className="h-40 w-full" /> : funnel.length === 0 ? <p className="py-8 text-center text-[13.5px] text-muted">No applications yet. Share the online form or add one at the office.</p>
              : funnel.map((s) => (
                <Link key={s.key} href={`/dashboard/admissions/applications?status=${s.key}`} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-[13px] text-muted">{s.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary/60" style={{ width: `${(s.count / maxStatus) * 100}%` }} /></div>
                  <span className="w-8 text-right text-[13px] tabular text-ink">{s.count}</span>
                </Link>
              ))}
          </div>
        </Paper>

        <Paper className="lg:col-span-2">
          <PaperHeader title="Seats by program" />
          {!data ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : data.offerings.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-muted">
              No {term("programs").toLowerCase()} are open for admission in this {term("session").toLowerCase()}.
              {can("admissions.settings.manage") && <> <Link href="/dashboard/admissions/settings" className="text-primary">Open them in settings</Link>.</>}
            </div>
          ) : (
            <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {data.offerings.map((o) => {
                const filled = o.enrolled + o.accepted + o.offered;
                const pct = o.seats ? Math.min(100, (filled / o.seats) * 100) : 0;
                return (
                  <div key={o.uuid} className="bg-surface p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[14.5px] text-ink">{o.program_name}</p>
                      <p className="text-[12.5px] tabular text-muted">{filled} / {o.seats}</p>
                    </div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full bg-emerald-500" style={{ width: `${o.seats ? (o.enrolled / o.seats) * 100 : 0}%` }} />
                      <div className="h-full bg-emerald-300" style={{ width: `${o.seats ? (o.accepted / o.seats) * 100 : 0}%` }} />
                      <div className="h-full bg-primary/50" style={{ width: `${o.seats ? (o.offered / o.seats) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-2 text-[12.5px] text-muted">{o.enrolled} enrolled · {o.accepted} accepted · {o.offered} offered · {o.in_progress - o.offered - o.accepted} in review{pct >= 100 ? " · full" : ""}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Paper>

        <Paper>
          <PaperHeader title="Follow-ups due" />
          {!data ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : data.follow_ups.length === 0 ? <p className="px-5 py-8 text-center text-[13.5px] text-muted">No follow-ups due. Nice.</p> : (
            <ul className="divide-y divide-line">
              {data.follow_ups.map((e) => (
                <li key={e.uuid}><Link href={`/dashboard/admissions/enquiries?view=${e.uuid}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{e.child_name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{e.program_name ?? "—"} · {e.counsellor_name ?? "Unassigned"}</span></span>
                  <StageBadge stage={e.stage} />
                  <span className="w-24 text-right text-[12.5px] text-rose-700">{e.next_follow_up ? formatDate(e.next_follow_up) : ""}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Paper>

        <Paper>
          <PaperHeader title="Tests and interviews" />
          {!data ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : data.upcoming.length === 0 ? <p className="px-5 py-8 text-center text-[13.5px] text-muted">Nothing scheduled.</p> : (
            <ul className="divide-y divide-line">
              {data.upcoming.map((a) => (
                <li key={a.uuid}><Link href={`/dashboard/admissions/applications?view=${a.uuid}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                  <CalendarClock size={16} strokeWidth={1.4} className="text-faint" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{a.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{a.program_name}</span></span>
                  <StatusBadge status={a.status} />
                  <span className="hidden w-36 text-right text-[12.5px] text-muted sm:block">{formatDateTime((a.status === "interview" ? a.interview_at : a.test_at) ?? a.test_at ?? "")}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Paper>
      </div>
    </div>
  );
}
