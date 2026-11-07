"use client";

/*
 * Employee self-service for face attendance:
 *   <MyFaceModal onClose />            set up face sign-in (with consent) or withdraw consent
 *   <FaceClockModal direction selfieRequired onClose onDone />
 *                                       clock in/out on the web or phone with a selfie that
 *                                       must match the person's enrolled face
 */
import { useEffect, useState } from "react";
import { RotateCcw, ScanFace, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Badge, Button, KeyValue, Modal, ModalCancel, Skeleton, useConfirm } from "@/components/ui-kit";
import { errorText } from "@/components/attendance/shared";
import { FaceCapture } from "./face-capture";
import { EnrolModal } from "./enrol-modal";
import type { CheckResult, LivenessLevel, LivenessRules } from "./face-engine";

const S = 1.4;

export type MyFace = {
  enabled: boolean; allow_self_enrol: boolean; enrolled: boolean;
  enrolment: { uuid: string; samples: number; consent_by: string; consent_at: string; consent_version: number; captured_by_name: string | null } | null;
  consent_text: string; consent_version: number; liveness: LivenessLevel; liveness_rules: LivenessRules;
  self_clock_required: boolean; unenrolled_blocked: boolean;
};

export function MyFaceModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [me, setMe] = useState<MyFace | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const load = () => api.get<MyFace>("/face-attendance/me").then(setMe).catch((e) => { toast.error(errorText(e)); onClose(); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function withdraw() {
    if (!(await confirm({
      title: "Withdraw consent?", tone: "danger", confirmLabel: "Withdraw and delete",
      message: "Your face templates and any face check photos are deleted now. You can punch with your employee ID and PIN, and set up face sign-in again later.",
    }))) return;
    try {
      await api.post("/face-attendance/me/withdraw");
      toast.success("Consent withdrawn", { description: "Your face data has been deleted." });
      load();
    } catch (e) { toast.error(errorText(e)); }
  }

  if (enrolling && me) {
    return <EnrolModal who="self" path="/face-attendance/me/enrol"
      consent={{ text: me.consent_text, version: me.consent_version, level: me.liveness, rules: me.liveness_rules }}
      onClose={() => setEnrolling(false)} onDone={() => { setEnrolling(false); load(); }} />;
  }

  return (
    <Modal open onClose={onClose} size="md" title="Face sign-in" description="Punch at the office kiosk, or clock in here, by looking at the camera."
      footer={me?.enrolled ? <><Button variant="danger" icon={ShieldOff} onClick={withdraw}>Withdraw consent</Button><Button onClick={onClose}>Close</Button></>
        : <><ModalCancel /><Button variant="primary" icon={ScanFace} disabled={!me?.enabled || !me?.allow_self_enrol} onClick={() => setEnrolling(true)}>Set up face sign-in</Button></>}>
      {!me ? <Skeleton className="h-32 w-full rounded-xl" /> : !me.enabled ? (
        <p className="text-[14px] text-muted">Face attendance is not switched on for your company.</p>
      ) : me.enrolled && me.enrolment ? (
        <div className="space-y-4">
          <Badge tone="good" dot>Set up</Badge>
          <KeyValue items={[
            { label: "Consent given", value: formatDateTime(me.enrolment.consent_at) },
            { label: "Given", value: me.enrolment.consent_by === "self" ? "By you" : `With HR (${me.enrolment.captured_by_name ?? "HR"})` },
            { label: "Samples", value: `${me.enrolment.samples} face templates, encrypted` },
            { label: "Web clock-in", value: me.self_clock_required ? "Selfie match needed" : "No face check needed" },
          ]} />
          <p className="text-[13px] text-muted">Your face photos were never stored, only templates (numbers) that cannot be turned back into a picture. Withdraw at any time; they are deleted at once.</p>
        </div>
      ) : (
        <div className="space-y-3 text-[14px] text-muted">
          <p>Set up once: read the consent notice, agree, and look at the camera for a few seconds.</p>
          <p>It is your choice. Without it, use your employee ID and PIN at the kiosk.</p>
          {!me.allow_self_enrol && <p className="text-amber-700">Your company sets this up with HR. Ask HR.</p>}
          {me.unenrolled_blocked && <p className="text-amber-700">Web clock-in here needs a face check, so set it up or use the office kiosk.</p>}
        </div>
      )}
    </Modal>
  );
}

type Pos = { latitude: number | null; longitude: number | null; accuracy: number | null };

export function FaceClockModal({ direction, selfieRequired, getPosition, onClose, onDone }: {
  direction: "in" | "out"; selfieRequired: boolean; getPosition: () => Promise<Pos>;
  onClose: () => void; onDone: <T>(today: T) => void;
}) {
  const toast = useToast();
  const [me, setMe] = useState<MyFace | null>(null);
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const load = () => api.get<MyFace>("/face-attendance/me").then(setMe).catch((e) => { toast.error(errorText(e)); onClose(); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onResult(r: CheckResult) {
    if (!r.ok) { if (r.reason !== "cancelled") setFailed(r.message); return; }
    setSaving(true);
    try {
      const pos = await getPosition();
      const out = await api.post<{ today: unknown }>("/face-attendance/me/clock", {
        direction, descriptor: r.descriptors[0], liveness: r.liveness, snapshot: r.snapshot,
        selfie: selfieRequired ? r.snapshot : null, ...pos,
      });
      toast.success(direction === "in" ? "Clocked in" : "Clocked out", { description: "Face matched." });
      onDone(out.today);
    } catch (e) {
      setFailed(errorText(e, "Couldn't record the punch"));
    } finally {
      setSaving(false);
    }
  }

  if (enrolling && me) {
    return <EnrolModal who="self" path="/face-attendance/me/enrol"
      consent={{ text: me.consent_text, version: me.consent_version, level: me.liveness, rules: me.liveness_rules }}
      onClose={() => setEnrolling(false)} onDone={() => { setEnrolling(false); load(); }} />;
  }

  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={direction === "in" ? "Clock in with your face" : "Clock out with your face"}
      description="Your company asks for a selfie that matches your enrolled face."
      footer={<><ModalCancel />{failed && <Button variant="primary" icon={RotateCcw} onClick={() => { setFailed(null); setRun((n) => n + 1); }}>Try again</Button>}</>}>
      {!me ? <Skeleton className="aspect-[4/3] w-full rounded-2xl" /> : !me.enrolled ? (
        <div className="space-y-3 text-[14px] text-muted">
          <p>Set up face sign-in first. It takes a few seconds and needs your consent.</p>
          <Button variant="primary" icon={ScanFace} disabled={!me.allow_self_enrol} onClick={() => setEnrolling(true)}>Set up face sign-in</Button>
          {!me.allow_self_enrol && <p className="text-amber-700">Ask HR to set it up, or punch at the office kiosk.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <FaceCapture level={me.liveness} rules={me.liveness_rules} samples={1} runKey={run} paused={!!failed || saving} onResult={onResult} />
          {failed ? <p className="text-center text-[13.5px] text-rose-700">{failed}</p>
            : <p className="inline-flex w-full items-center justify-center gap-1.5 text-center text-[13px] text-muted"><ScanFace size={14} strokeWidth={S} />{saving ? "Checking…" : "Hold the phone at eye level in good light."}</p>}
        </div>
      )}
    </Modal>
  );
}
