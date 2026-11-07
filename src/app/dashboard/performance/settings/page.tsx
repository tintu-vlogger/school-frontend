"use client";

/*
 * Performance settings (administrators): goals and periods, rating scales, KRAs,
 * competencies, review templates, review rules, nine-box labels and letter wording.
 * The open tab is kept in the address (?tab=).
 */
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookMarked, ClipboardList, FileText, Grid3x3, Ruler, ShieldAlert, Sparkles, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Button, Field, FormGrid, NumberInput, Skeleton, Tabs, TextInput, Textarea, Toggle } from "@/components/ui-kit";
import { forgetPerfSettings, usePerfMe } from "@/components/performance/shared";
import type { PerfSettings } from "@/components/performance/types";
import { GoalsTab } from "./goals-tab";
import { CompetenciesTab, KrasTab, ScalesTab, TemplatesTab } from "./library-tabs";

type Tab = "goals" | "scales" | "kras" | "competencies" | "templates" | "reviews" | "ninebox" | "letters";
const TABS: { value: Tab; label: string; icon: typeof Target }[] = [
  { value: "goals", label: "Goals", icon: Target },
  { value: "scales", label: "Rating scales", icon: Ruler },
  { value: "kras", label: "KRAs", icon: BookMarked },
  { value: "competencies", label: "Competencies", icon: Sparkles },
  { value: "templates", label: "Review templates", icon: ClipboardList },
  { value: "reviews", label: "Review rules", icon: ShieldAlert },
  { value: "ninebox", label: "Nine-box", icon: Grid3x3 },
  { value: "letters", label: "Letters", icon: FileText },
];

export default function PerformanceSettingsPage() {
  return <Suspense fallback={null}><Settings /></Suspense>;
}

function Settings() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { me } = usePerfMe();
  const [settings, setSettings] = useState<PerfSettings | null>(null);
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "goals") as Tab;
  useEffect(() => { api.get<PerfSettings>("/performance/settings").then(setSettings).catch(() => {}); }, []);

  if (me && !me.is_admin) {
    return (
      <div>
        <PageHeader eyebrow="Settings" title="Performance settings" />
        <Paper><EmptyState icon={ShieldAlert} title="Only performance administrators can change these settings" /></Paper>
      </div>
    );
  }
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Performance settings"
        description="How goals, reviews, calibration and letters work for your company." />
      <Tabs value={tab} onChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })} items={TABS} className="mb-6" />
      {!settings ? <Skeleton className="h-80 rounded-2xl" /> : <>
        {tab === "goals" && <GoalsTab settings={settings} onSaved={setSettings} />}
        {tab === "scales" && <ScalesTab />}
        {tab === "kras" && <KrasTab />}
        {tab === "competencies" && <CompetenciesTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "reviews" && <ReviewRules settings={settings} onSaved={setSettings} />}
        {tab === "ninebox" && <NineBoxLabels settings={settings} onSaved={setSettings} />}
        {tab === "letters" && <Letters settings={settings} onSaved={setSettings} />}
      </>}
    </div>
  );
}

function useSaveSettings(onSaved: (s: PerfSettings) => void) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function save(body: Partial<PerfSettings>, ok = "Settings saved") {
    setSaving(true);
    try {
      const r = await api.put<PerfSettings>("/performance/settings", body);
      forgetPerfSettings();
      onSaved(r);
      toast.success(ok);
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }
  return { saving, save };
}

function ReviewRules({ settings, onSaved }: { settings: PerfSettings; onSaved: (s: PerfSettings) => void }) {
  const [r, setR] = useState(settings.reviews);
  const [fb, setFb] = useState(settings.feedback);
  const { saving, save } = useSaveSettings(onSaved);
  return (
    <Paper>
      <PaperHeader title="Reminders, escalation and visibility" action={<Button variant="primary" size="sm" loading={saving} onClick={() => save({ reviews: r, feedback: fb })}>Save</Button>} />
      <div className="space-y-6 p-5">
        <FormGrid columns={3}>
          <Field label="Wait between reminders" hint="The same person is never reminded more often"><NumberInput value={r.reminder_min_hours} onChange={(v) => setR({ ...r, reminder_min_hours: v ?? 1 })} min={1} max={72} suffix="hours" /></Field>
          <Field label="Most reminders a day"><NumberInput value={r.reminder_max_per_day} onChange={(v) => setR({ ...r, reminder_max_per_day: v ?? 2 })} min={1} max={5} /></Field>
          <Field label="Escalate after" hint="Days past the deadline before the reviewer's manager is told"><NumberInput value={r.escalate_after_days} onChange={(v) => setR({ ...r, escalate_after_days: v ?? 3 })} min={1} max={30} suffix="days" /></Field>
        </FormGrid>
        <Toggle checked={r.hide_self_review_from_manager} onChange={(v) => setR({ ...r, hide_self_review_from_manager: v })} label="Hide self reviews from managers until results are published" />
        <Toggle checked={r.allow_response} onChange={(v) => setR({ ...r, allow_response: v })} label="Let employees respond to their results" description="Agree or disagree, with a comment that goes to their manager" />
        <Toggle checked={fb.default_visibility === "manager"} onChange={(v) => setFb({ ...fb, default_visibility: v ? "manager" : "private" })} label="Share feedback with the receiver's manager by default" />
      </div>
    </Paper>
  );
}

const BOX_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3];
const BOX_TINT: Record<number, string> = {
  1: "bg-rose-50/70", 2: "bg-amber-50/60", 3: "bg-sky-50/60", 4: "bg-amber-50/60", 5: "bg-sky-50/60", 6: "bg-emerald-50/60",
  7: "bg-sky-50/60", 8: "bg-emerald-50/60", 9: "bg-primary-soft/70",
};

function NineBoxLabels({ settings, onSaved }: { settings: PerfSettings; onSaved: (s: PerfSettings) => void }) {
  const [labels, setLabels] = useState(settings.nine_box.labels);
  const { saving, save } = useSaveSettings(onSaved);
  return (
    <Paper>
      <PaperHeader title="Nine-box names" action={<Button variant="primary" size="sm" loading={saving} onClick={() => save({ nine_box: { labels } }, "Names saved")}>Save</Button>} />
      <div className="p-5">
        <p className="mb-4 text-[13px] text-muted">Performance runs left to right, potential bottom to top. Use your own words for each box.</p>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div className="flex items-center"><span className="-rotate-90 whitespace-nowrap text-[12px] uppercase tracking-[0.08em] text-faint">Potential →</span></div>
          <div>
            <div className="grid grid-cols-3 gap-2">
              {BOX_ORDER.map((b) => (
                <div key={b} className={`rounded-xl border border-line p-3 ${BOX_TINT[b]}`}>
                  <p className="mb-1.5 text-[11.5px] text-faint">Box {b}</p>
                  <TextInput value={labels[String(b)] ?? ""} onValueChange={(v) => setLabels({ ...labels, [String(b)]: v })} aria-label={`Box ${b} name`} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[12px] uppercase tracking-[0.08em] text-faint">Performance →</p>
          </div>
        </div>
      </div>
    </Paper>
  );
}

const REVIEW_FIELDS = ["employee_name", "cycle_name", "period", "final_rating", "rating_label", "manager_comment", "company_name"];
const INCREMENT_FIELDS = ["employee_name", "cycle_name", "current_ctc", "new_ctc", "increment_pct", "increment_amount", "effective_date", "promotion_line", "new_designation", "company_name"];

function Letters({ settings, onSaved }: { settings: PerfSettings; onSaved: (s: PerfSettings) => void }) {
  const [l, setL] = useState(settings.letters);
  const { saving, save } = useSaveSettings(onSaved);
  const hints = (f: string[]) => <span className="flex flex-wrap gap-1">{f.map((x) => <code key={x} className="rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-muted">{`{${x}}`}</code>)}</span>;
  return (
    <Paper>
      <PaperHeader title="Letter wording" action={<Button variant="primary" size="sm" loading={saving} onClick={() => save({ letters: l }, "Letters saved")}>Save</Button>} />
      <div className="space-y-6 p-5">
        <Field label="Review result letter" hint={hints(REVIEW_FIELDS)}>
          <Textarea value={l.review_template} onValueChange={(v) => setL({ ...l, review_template: v })} rows={9} autoGrow />
        </Field>
        <Field label="Salary revision letter" hint={<>Used when a pay review has no wording of its own. {hints(INCREMENT_FIELDS)}</>}>
          <Textarea value={l.increment_template} onValueChange={(v) => setL({ ...l, increment_template: v })} rows={9} autoGrow />
        </Field>
      </div>
    </Paper>
  );
}
