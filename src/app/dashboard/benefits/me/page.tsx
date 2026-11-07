"use client";

/*
 * My benefits: the cover I have (sum insured, who is covered, what I pay) and, while a
 * joining or renewal window is open, choosing a tier and family members or opting out of
 * optional cover. Family members come from my profile.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, HeartPulse, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, Checkbox, Field, Modal, ModalCancel, RadioCards, Skeleton, Textarea } from "@/components/ui-kit";
import { errMsg, inr } from "@/components/payroll/common";
import type { Plan, Tier } from "@/components/benefits/plan-modal";

type Family = { id: number; name: string; relation: string | null; relation_kind: string; date_of_birth: string | null };
type MyPlan = { plan: Plan; eligible: boolean; reason: string | null; sum_insured: string;
  window: { open: boolean; kind: string | null; closes_on: string | null; days_left: number | null };
  enrolment: { uuid: string; tier: string; tier_label: string; status: string; status_label: string; dependents: { family_member_id: number; name: string; relation: string }[];
    sum_insured: string; annual_premium: string; employer_share: string; employee_share: string; monthly_deduction: string; start_date: string; end_date: string | null } | null;
  tiers: (Tier & { employer_share: string; employee_share: string; monthly: string })[] };
type Mine = { plans: MyPlan[]; family: Family[] };

export default function MyBenefitsPage() {
  const toast = useToast();
  const router = useRouter();
  const [d, setD] = useState<Mine | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  const [choosing, setChoosing] = useState<MyPlan | null>(null);
  const load = useCallback(() => {
    api.get<Mine>("/benefits/me").then(setD).catch((e) => { if (/employee/i.test(errMsg(e))) setNotEmployee(true); else toast.error(errMsg(e)); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  if (notEmployee) return <div><PageHeader title="My benefits" /><Paper><EmptyState icon={ShieldCheck} title="My benefits is for employees" hint="Sign in with an employee login to see your cover." action={<Button onClick={() => router.push("/dashboard/benefits")}>Benefits and insurance</Button>} /></Paper></div>;
  return (
    <div>
      <PageHeader title="My benefits" description="Your insurance cover, who it covers and what you pay." />
      {!d ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div> : !d.plans.length ? (
        <Paper><EmptyState icon={ShieldCheck} title="No benefit plans for you yet" hint="Your company's insurance plans appear here once HR sets them up." /></Paper>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.plans.map((p) => {
            const e = p.enrolment;
            const enrolled = e?.status === "enrolled";
            return (
              <Paper key={p.plan.uuid} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary"><HeartPulse size={18} strokeWidth={1.4} /></span>
                    <div><p className="text-[15px] text-ink">{p.plan.name}</p><p className="text-[12.5px] text-faint">{p.plan.insurer ?? p.plan.kind_label}{p.plan.policy_number ? ` · ${p.plan.policy_number}` : ""}</p></div></div>
                  <Badge tone={enrolled ? "good" : e?.status === "waived" ? "warn" : "neutral"} dot>{enrolled ? "Covered" : e?.status === "waived" ? "Opted out" : "Not enrolled"}</Badge>
                </div>
                {p.plan.description && <p className="mt-3 text-[13.5px] text-muted">{p.plan.description}</p>}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-sunken/60 p-4">
                  <div><p className="text-[12px] text-muted">Sum insured</p><p className="tabular text-[18px] font-light text-ink">{inr(enrolled ? e!.sum_insured : p.sum_insured)}</p></div>
                  <div><p className="text-[12px] text-muted">You pay</p><p className="tabular text-[18px] font-light text-ink">{enrolled ? (Number(e!.monthly_deduction) ? `${inr(e!.monthly_deduction)} / month` : "Nothing") : "—"}</p>
                    {enrolled && Number(e!.employer_share) > 0 && <p className="text-[12px] text-faint">Company pays {inr(e!.employer_share)} a year</p>}</div>
                </div>
                {enrolled && (
                  <div className="mt-4 space-y-1.5 text-[13.5px]">
                    <p className="flex items-center gap-2 text-ink/85"><Users size={15} strokeWidth={1.4} className="text-muted" />{e!.tier_label}: you{e!.dependents.length ? `, ${e!.dependents.map((x) => `${x.name} (${x.relation})`).join(", ")}` : ""}</p>
                    <p className="text-faint">Covered from {formatDate(e!.start_date)}{e!.end_date ? ` to ${formatDate(e!.end_date)}` : ` to ${formatDate(p.plan.policy_end)}`}</p>
                    {p.plan.tpa && <p className="text-faint">Claims through {p.plan.tpa}{p.plan.contact_phone ? ` · ${p.plan.contact_phone}` : ""}</p>}
                  </div>
                )}
                <div className="mt-auto pt-4">
                  {p.window.open ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                      <p className="flex items-center gap-2 text-[13px] text-amber-700"><CalendarClock size={15} strokeWidth={1.4} />{p.window.kind === "joining" ? "Joining" : "Renewal"} window closes {formatDate(p.window.closes_on!)}{p.window.days_left !== null ? ` (${p.window.days_left} days)` : ""}</p>
                      <Button size="sm" variant="primary" onClick={() => setChoosing(p)}>{enrolled ? "Change cover" : "Choose cover"}</Button>
                    </div>
                  ) : !enrolled && <p className="border-t border-line pt-4 text-[12.5px] text-faint">You can enrol when you join or at renewal{p.plan.renewal_window_from ? ` (${formatDate(p.plan.renewal_window_from)} to ${formatDate(p.plan.renewal_window_to!)})` : ""}.</p>}
                </div>
              </Paper>
            );
          })}
        </div>
      )}
      {choosing && d && <ChooseModal p={choosing} family={d.family} onClose={() => setChoosing(null)} onSaved={(x) => { setD(x); setChoosing(null); }} />}
    </div>
  );
}

function ChooseModal({ p, family, onClose, onSaved }: { p: MyPlan; family: Family[]; onClose: () => void; onSaved: (d: Mine) => void }) {
  const toast = useToast();
  const [tier, setTier] = useState(p.enrolment?.status === "enrolled" ? p.enrolment.tier : p.tiers[0]?.code ?? "");
  const [deps, setDeps] = useState<number[]>(p.enrolment?.status === "enrolled" ? p.enrolment.dependents.map((x) => x.family_member_id) : []);
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const t = p.tiers.find((x) => x.code === tier);
  const allowed = (f: Family) => t && ((f.relation_kind === "spouse" && t.spouse) || (f.relation_kind === "child" && t.children > 0) || (f.relation_kind === "parent" && t.parents > 0));
  async function save() {
    setBusy(true);
    try {
      onSaved(waive ? await api.post<Mine>("/benefits/me/waive", { plan_uuid: p.plan.uuid, reason })
        : await api.post<Mine>("/benefits/me/enrol", { plan_uuid: p.plan.uuid, tier, dependent_ids: deps.filter((id) => { const f = family.find((x) => x.id === id); return f && allowed(f); }) }));
      toast.success(waive ? "You have opted out" : "Your cover is saved");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" title={p.plan.name} busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={waive ? !reason.trim() : !tier} onClick={save}>{waive ? "Opt out" : "Save cover"}</Button></>}>
      <div className="space-y-5">
        {!waive && (<>
          <Field label="Who is covered">
            <RadioCards value={tier} onChange={setTier} options={p.tiers.map((x) => ({ value: x.code, label: x.label,
              description: p.plan.age_bands.length && x.parents ? "Priced by each parent's age" : Number(x.monthly) ? `You pay ${inr(x.monthly)} a month` : "Paid by the company" }))} />
          </Field>
          {t && (t.spouse || t.children > 0 || t.parents > 0) && (
            <Field label="Family members" hint={!family.length ? "Add family members in your profile first." : undefined}>
              <div className="space-y-2">{family.filter(allowed).map((f) => (
                <Checkbox key={f.id} checked={deps.includes(f.id)} onChange={(v) => setDeps(v ? [...deps, f.id] : deps.filter((x) => x !== f.id))}
                  label={f.name} description={`${f.relation ?? ""}${f.date_of_birth ? ` · born ${formatDate(f.date_of_birth)}` : ""}`} />))}</div>
            </Field>
          )}
        </>)}
        {!p.plan.mandatory && <Checkbox checked={waive} onChange={setWaive} label="I don't want this cover" description="You can join again at the next renewal." />}
        {waive && <Field label="Why" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>}
      </div>
    </Modal>
  );
}
