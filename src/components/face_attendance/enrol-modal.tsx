"use client";

/*
 * Face enrolment in a modal: step 1 the consent notice (DPDP Act, 2023) and agreement,
 * step 2 the camera takes 4 samples after a liveness challenge, step 3 they are saved.
 * Only the templates (numbers) are sent; no picture is uploaded.
 *
 *   <EnrolModal who="self" path="/face-attendance/me/enrol" consent={...} onClose onDone />
 *   <EnrolModal who="hr" personName="Priya Sharma" path={`/face-attendance/enrolments/${uuid}`} ... />
 */
import { useMemo, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Button, Checkbox, Modal, ModalCancel, Stepper } from "@/components/ui-kit";
import { errorText } from "@/components/attendance/shared";
import { FaceCapture } from "./face-capture";
import { FACE_MODEL, type CheckResult, type LivenessLevel, type LivenessRules } from "./face-engine";

const S = 1.4;
const SAMPLES = 4;

export type ConsentInfo = { text: string; version: number; level: LivenessLevel; rules: LivenessRules };

export function EnrolModal({ who, personName, path, consent, onClose, onDone }: {
  who: "self" | "hr"; personName?: string; path: string; consent: ConsentInfo; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rules = useMemo(() => consent.rules, [consent.rules]);

  async function onResult(r: CheckResult) {
    if (!r.ok) { if (r.reason !== "cancelled") setFailed(r.message); return; }
    setSaving(true);
    try {
      await api.post(path, { samples: r.descriptors, model: FACE_MODEL, consent: true, consent_version: consent.version, liveness: r.liveness });
      toast.success(who === "self" ? "Face sign-in is set up" : `Face enrolled for ${personName ?? "the employee"}`,
        { description: "The face samples were turned into templates; no photo was kept." });
      onDone();
    } catch (e) {
      setFailed(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" busy={saving}
      title={who === "self" ? "Set up face sign-in" : `Enrol face: ${personName ?? ""}`}
      description="Face attendance needs consent first. Only face templates are stored, encrypted."
      footer={step === 0 ? (
        <><ModalCancel /><Button variant="primary" disabled={!agreed} onClick={() => setStep(1)}>{who === "self" ? "I agree, continue" : "Consent given, continue"}</Button></>
      ) : (
        <><Button variant="ghost" onClick={() => { setStep(0); setFailed(null); }}>Back</Button>
          {failed && <Button variant="primary" icon={RotateCcw} onClick={() => { setFailed(null); setRun((n) => n + 1); }}>Try again</Button>}</>
      )}>
      <Stepper steps={[{ label: "Consent" }, { label: "Face samples" }]} current={step} className="mb-5" />
      {step === 0 && (
        <div className="space-y-4">
          <div className="max-h-[46vh] overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-canvas px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            {consent.text}
          </div>
          <Checkbox checked={agreed} onChange={setAgreed}
            label={who === "self" ? "I have read this notice and I agree to the use of my face for attendance." : "The employee has read this notice (or had it read to them) and agreed, in person."}
            description={who === "hr" ? "Their agreement is recorded with your name and the time. They can withdraw it at any time." : "You can withdraw this later in My attendance."} />
          <p className="inline-flex items-center gap-2 text-[12.5px] text-muted"><ShieldCheck size={14} strokeWidth={S} />Notice version {consent.version}</p>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <FaceCapture level={consent.level} rules={rules} samples={SAMPLES} runKey={run} paused={!!failed || saving} onResult={onResult} />
          {failed ? <p className="text-center text-[13.5px] text-rose-700">{failed}</p>
            : <p className="text-center text-[13px] text-muted">{saving ? "Saving…" : `Follow the prompts. ${SAMPLES} samples are taken in a few seconds. Use good light, no cap or dark glasses.`}</p>}
        </div>
      )}
    </Modal>
  );
}
