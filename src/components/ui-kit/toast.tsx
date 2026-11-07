"use client";

/*
 * Toasts. Use the existing hook; this file only draws them.
 *
 *   const toast = useToast();            // from "@/lib/toast-context" (re-exported by the kit)
 *   toast.success("Employee added");
 *   toast.error("Couldn't save", { description: err.message });
 *   toast.info("Imported 12 rows", { action: { label: "Undo", onClick: undo }, duration: 8000 });
 *
 * Bottom-right stack (max 3), paper card with a small tone icon, auto-dismiss (paused on hover).
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Portal, cx, floatingPanel, ICON_STROKE } from "./internal";

export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastOptions = { description?: string; duration?: number; action?: { label: string; onClick: () => void } };
export type ToastItem = ToastOptions & { id: number; message: string; type: ToastTone };

const icon = {
  success: <CheckCircle2 size={17} strokeWidth={ICON_STROKE} className="text-emerald-600" />,
  error: <XCircle size={17} strokeWidth={ICON_STROKE} className="text-rose-600" />,
  warning: <AlertTriangle size={17} strokeWidth={ICON_STROKE} className="text-amber-600" />,
  info: <Info size={17} strokeWidth={ICON_STROKE} className="text-primary" />,
};

function ToastCard({ t, onClose }: { t: ToastItem; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (hover) return;
    const timer = setTimeout(() => close.current(), t.duration ?? (t.type === "error" ? 6000 : 4000));
    return () => clearTimeout(timer);
  }, [hover, t.duration, t.type]);
  return (
    <div
      role={t.type === "error" ? "alert" : "status"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cx(floatingPanel, "pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 px-4 py-3")}
    >
      <span className="mt-[1px] shrink-0">{icon[t.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-normal leading-5 text-ink">{t.message}</p>
        {t.description && <p className="mt-0.5 text-[13px] leading-5 text-muted">{t.description}</p>}
        {t.action && (
          <button type="button" onClick={() => { t.action?.onClick(); onClose(); }} className="mt-1.5 text-[13px] text-primary hover:text-primary-dark">
            {t.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={onClose} className="-mr-1 shrink-0 rounded-md p-0.5 text-faint transition-colors hover:text-ink">
        <X size={15} strokeWidth={ICON_STROKE} />
      </button>
    </div>
  );
}

export function ToastViewport({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  const reduce = useReducedMotion();
  return (
    <Portal>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ToastCard t={t} onClose={() => onClose(t.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
