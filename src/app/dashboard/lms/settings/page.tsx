"use client";

/* Teaching and learning settings: video provider for live classes (built-in Jitsi room or the
 * institution's own Jitsi server, or Zoom / Meet / Teams links), reminders and defaults. */
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import { Button, Field, FormGrid, FormSection, NumberInput, RadioCards, Select, Skeleton, TextInput, Toggle } from "@/components/ui-kit";
import { PROVIDERS } from "@/components/lms/lib";

type Settings = {
  video_provider: string; jitsi_domain: string; jitsi_room_prefix: string; reminder_minutes: number; join_early_minutes: number;
  parents_can_join: boolean; homework_allow_late: boolean; homework_notify_parents: boolean; homework_default_due_hour: number;
  quiz_default_time_limit: number; quiz_show_answers: string;
};

export default function LmsSettingsPage() {
  const toast = useToast();
  const canEdit = useAccess().can("lms.settings.manage");
  const [saved, setSaved] = useState<Settings | null>(null);
  const [v, setV] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<Settings>("/lms/settings").then((s) => { setSaved(s); setV(s); }).catch((e) => toast.error(e.message));
  }, [toast]);
  const set = <K extends keyof Settings>(k: K, x: Settings[K]) => setV((s) => (s ? { ...s, [k]: x } : s));
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  async function save() {
    if (!v) return;
    setSaving(true);
    try { const s = await api.put<Settings>("/lms/settings", v); setSaved(s); setV(s); toast.success("Settings saved"); }
    catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Settings" title="Teaching & learning" description="Live class video, reminders and defaults for homework and quizzes."
        actions={canEdit ? <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!dirty}>Save changes</Button> : undefined} />
      {!v ? <Skeleton className="h-96 w-full rounded-2xl" /> : (
        <Paper className="px-6 py-6">
          <fieldset disabled={!canEdit}>
            <FormSection title="Live classes" description="The provider new classes use. Teachers can still pick another for each class.">
              <RadioCards columns={3} value={v.video_provider} onChange={(x) => set("video_provider", x)} options={PROVIDERS.map((p) => ({ value: p.value, label: p.label,
                description: p.value === "jitsi" ? "Free video rooms inside Campusly" : "Teachers paste their meeting link" }))} />
              <FormGrid className="mt-5">
                <Field label="Video server" hint="meet.jit.si is free. Enter your own Jitsi server to host rooms yourself.">
                  <TextInput value={v.jitsi_domain} onValueChange={(x) => set("jitsi_domain", x)} placeholder="meet.jit.si" />
                </Field>
                <Field label="Room name prefix" hint="Rooms are named prefix + a long random code.">
                  <TextInput value={v.jitsi_room_prefix} onValueChange={(x) => set("jitsi_room_prefix", x)} maxLength={20} />
                </Field>
                <Field label="“Starting soon” reminder"><NumberInput value={v.reminder_minutes} onChange={(x) => set("reminder_minutes", x ?? 15)} min={0} max={240} suffix="min before" /></Field>
                <Field label="Learners can join early"><NumberInput value={v.join_early_minutes} onChange={(x) => set("join_early_minutes", x ?? 10)} min={0} max={120} suffix="min" /></Field>
              </FormGrid>
              <Toggle className="mt-4" checked={v.parents_can_join} onChange={(x) => set("parents_can_join", x)} label="Parents can join live classes" description="Useful for young learners who need help." />
            </FormSection>
            <FormSection title="Homework">
              <div className="space-y-4">
                <Toggle checked={v.homework_allow_late} onChange={(x) => set("homework_allow_late", x)} label="Accept late work by default" />
                <Toggle checked={v.homework_notify_parents} onChange={(x) => set("homework_notify_parents", x)} label="Tell parents about new homework" />
                <Field label="Default due time" className="max-w-xs"><NumberInput value={v.homework_default_due_hour} onChange={(x) => set("homework_default_due_hour", x ?? 9)} min={0} max={23} suffix=":00" /></Field>
              </div>
            </FormSection>
            <FormSection title="Quizzes">
              <FormGrid>
                <Field label="Default time limit"><NumberInput value={v.quiz_default_time_limit} onChange={(x) => set("quiz_default_time_limit", x ?? 0)} min={0} max={240} suffix="min" /></Field>
                <Field label="Show answers"><Select value={v.quiz_show_answers} onChange={(x) => x && set("quiz_show_answers", x)} options={[
                  { value: "after_submit", label: "Right after submitting" }, { value: "after_close", label: "After the quiz closes" }, { value: "never", label: "Never" }]} /></Field>
              </FormGrid>
            </FormSection>
          </fieldset>
        </Paper>
      )}
    </div>
  );
}
