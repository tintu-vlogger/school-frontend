"use client";

/*
 * Camera view with the face check: opens the front camera, runs the check from
 * face-engine (one face, liveness challenge, templates) and reports the result.
 *
 *   <FaceCapture level="standard" rules={rules} samples={4} runKey={n} onResult={(r) => ...} />
 *
 * Change `runKey` to run the check again. `paused` stops it without closing the camera.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ScanFace, TriangleAlert } from "lucide-react";
import { openCamera, runCheck, type CheckResult, type LivenessLevel, type LivenessRules, type Status } from "./face-engine";

const S = 1.4;

export function FaceCapture({ level, rules, samples = 1, runKey = 0, paused = false, onResult, className = "", big = false }: {
  level: LivenessLevel; rules: LivenessRules; samples?: number; runKey?: number; paused?: boolean;
  onResult: (r: CheckResult) => void; className?: string; big?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ text: "Starting the camera…" });
  const resultRef = useRef(onResult);
  useEffect(() => { resultRef.current = onResult; });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    openCamera().then((s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        v.onloadeddata = () => setReady(true);
        v.play().catch(() => {});
      }
    }).catch(() => setCamErr("Allow the camera in your browser to use the face check."));
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    if (!ready || paused || !videoRef.current) return;
    const signal = { cancelled: false };
    runCheck(videoRef.current, { level, rules: JSON.parse(rulesKey) as LivenessRules, samples, signal, onStatus: setStatus }).then((r) => {
      if (!signal.cancelled) resultRef.current(r);
    });
    return () => { signal.cancelled = true; };
  }, [ready, paused, runKey, level, rulesKey, samples]);

  const tone = status.tone === "good" ? "text-emerald-300" : status.tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-stone-900 aspect-[4/3] ${className}`}>
      <video ref={videoRef} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
      {/* face guide */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={`h-[64%] w-[46%] rounded-[50%] border-2 ${status.tone === "good" ? "border-emerald-400" : "border-white/60"} transition-colors`} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-center">
        {camErr ? (
          <p className="inline-flex items-center gap-2 text-[14px] text-amber-200"><TriangleAlert size={16} strokeWidth={S} />{camErr}</p>
        ) : paused ? (
          <p className="inline-flex items-center gap-2 text-[15px] text-white/80"><ScanFace size={17} strokeWidth={S} />Paused</p>
        ) : (
          <>
            <p className={`inline-flex items-center gap-2 font-light ${big ? "text-[22px]" : "text-[16px]"} ${tone}`}>
              {status.tone === "good" ? <CheckCircle2 size={18} strokeWidth={S} /> : !ready ? <Camera size={17} strokeWidth={S} /> : <ScanFace size={18} strokeWidth={S} />}
              {ready ? status.text : "Starting the camera…"}
            </p>
            {status.hint && <p className="mt-0.5 text-[13px] text-white/70">{status.hint}</p>}
            {typeof status.progress === "number" && (
              <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round(status.progress * 100)}%` }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
