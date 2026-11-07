"use client";

/*
 * Communication settings: office hours, who may message, default and emergency channels,
 * class diary. <CommsSettingsModal open onClose />
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { Button, Field, FormGrid, FormSection, Modal, ModalCancel, Skeleton, TimeInput, Toggle } from "@/components/ui-kit";
import { errText } from "./shared";

type Settings = {
  office_hours: { enabled: boolean; start: string; end: string; days: number[] };
  parents_can_message: boolean; students_can_message: boolean; office_inbox: boolean; subject_teachers: boolean;
  default_channels: string[]; emergency_channels: string[]; diary_enabled: boolean;
  channels: Record<string, { ready: boolean; label: string; hint?: string | null }>;
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CommsSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [s, setS] = useState<Settings | null>(null);
  const [init, setInit] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<Settings>("/comms/settings").then((r) => { setS(r); setInit(JSON.stringify(r)); }).catch((e) => toast.error(errText(e)));
  }, [open, toast]);
  const set = (p: Partial<Settings>) => setS((x) => (x ? { ...x, ...p } : x));
  const oh = s?.office_hours;
  const chan = (key: "default_channels" | "emergency_channels", c: string, on: boolean) =>
    s && set({ [key]: on ? [...new Set([...s[key], c])] : s[key].filter((x) => x !== c) } as Partial<Settings>);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const { channels: _c, ...rest } = s; void _c;
      await api.put("/comms/settings", rest);
      toast.success("Settings saved");
      onClose();
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Communication settings" dirty={!!s && JSON.stringify(s) !== init} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      {!s || !oh ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-6">
          <FormSection title="Office hours" description={`${term("guardians")} see a note when they write outside these hours.`}><div className="space-y-4">
            <Toggle checked={oh.enabled} onChange={(v) => set({ office_hours: { ...oh, enabled: v } })} label="Show office hours" />
            {oh.enabled && (
              <>
                <FormGrid>
                  <Field label="From"><TimeInput value={oh.start} onChange={(v) => set({ office_hours: { ...oh, start: v } })} /></Field>
                  <Field label="To"><TimeInput value={oh.end} onChange={(v) => set({ office_hours: { ...oh, end: v } })} /></Field>
                </FormGrid>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = oh.days.includes(i + 1);
                    return (
                      <button key={d} type="button" onClick={() => set({ office_hours: { ...oh, days: on ? oh.days.filter((x) => x !== i + 1) : [...oh.days, i + 1].sort() } })}
                        className={`h-8 w-11 rounded-lg border text-[13px] ${on ? "border-primary/40 bg-primary-soft/60 text-primary" : "border-line text-muted"}`}>{d}</button>
                    );
                  })}
                </div>
              </>
            )}
          </div></FormSection>
          <FormSection title="Messages"><div className="space-y-4">
            <Toggle checked={s.parents_can_message} onChange={(v) => set({ parents_can_message: v })} label={`${term("guardians")} can message staff`} />
            <Toggle checked={s.students_can_message} onChange={(v) => set({ students_can_message: v })} label={`${term("students")} can message staff`} description={`${term("students")} can never message each other.`} />
            <Toggle checked={s.subject_teachers} onChange={(v) => set({ subject_teachers: v })} label={`Subject ${term("teachers").toLowerCase()} can be messaged`} description={`Off: only the class ${term("teacher").toLowerCase()}.`} />
            <Toggle checked={s.office_inbox} onChange={(v) => set({ office_inbox: v })} label="Office inbox" description="Families can write to the office." />
          </div></FormSection>
          <FormSection title="Notice channels"><div className="space-y-4">
            {(["default_channels", "emergency_channels"] as const).map((k) => (
              <div key={k}>
                <p className="mb-2 text-[13px] text-muted">{k === "default_channels" ? "Ticked by default on new notices" : "Always used for emergency notices"}</p>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(s.channels).filter(([c]) => c !== "in_app").map(([c, info]) => (
                    <Toggle key={c} size="sm" checked={s[k].includes(c)} onChange={(v) => chan(k, c, v)} label={info.label} disabled={!info.ready} />
                  ))}
                </div>
              </div>
            ))}
          </div></FormSection>
          <FormSection title="Class diary"><div className="space-y-4">
            <Toggle checked={s.diary_enabled} onChange={(v) => set({ diary_enabled: v })} label={`Show the daily diary to ${term("guardians").toLowerCase()}`} />
          </div></FormSection>
        </div>
      )}
    </Modal>
  );
}
