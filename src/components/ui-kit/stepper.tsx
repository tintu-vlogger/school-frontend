"use client";

/*
 * Stepper: progress header for multi-step forms (wizards in a modal).
 *   <Stepper steps={[{ label: "Details" }, { label: "Job", description: "Role and team" }, { label: "Review" }]}
 *            current={step} onStepClick={(i) => i < step && setStep(i)} />
 * `current` is zero-based. Completed steps show a check; with onStepClick they become buttons
 * (only steps before `current` are clickable). orientation: "horizontal" (default) | "vertical".
 */
import { Check } from "lucide-react";
import { cx } from "./internal";

export type StepItem = { label: string; description?: string };

export type StepperProps = {
  steps: StepItem[];
  current: number;
  onStepClick?: (index: number) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function Stepper({ steps, current, onStepClick, orientation = "horizontal", className }: StepperProps) {
  const vertical = orientation === "vertical";
  return (
    <ol className={cx(vertical ? "flex flex-col" : "flex items-start", className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = !!onStepClick && done;
        const marker = (
          <span className={cx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12.5px] tabular transition-colors",
            done && "border-primary bg-primary text-white",
            active && "border-primary bg-primary-soft text-primary",
            !done && !active && "border-line-strong bg-surface text-faint",
          )}>
            {done ? <Check size={14} strokeWidth={1.8} /> : i + 1}
          </span>
        );
        const text = (
          <span className={cx("min-w-0", vertical ? "pt-1" : "mt-2 block text-center")}>
            <span className={cx("block text-[13.5px] leading-5", active ? "text-ink" : done ? "text-ink/80" : "text-muted")}>{s.label}</span>
            {s.description && <span className="block text-[12px] leading-4 text-faint">{s.description}</span>}
          </span>
        );
        const inner = (
          <span className={cx(vertical ? "flex gap-3" : "flex flex-col items-center")}>{marker}{text}</span>
        );
        return (
          <li key={i} aria-current={active ? "step" : undefined}
            className={cx("relative", vertical ? "pb-6 last:pb-0" : "flex-1")}>
            {i < steps.length - 1 && (
              <span aria-hidden className={cx(
                "absolute",
                vertical ? "left-[13.5px] top-8 bottom-1 w-px" : "left-[calc(50%+20px)] right-[calc(-50%+20px)] top-[13.5px] h-px",
                done ? "bg-primary/60" : "bg-line",
              )} />
            )}
            {clickable
              ? <button type="button" onClick={() => onStepClick?.(i)} className={cx("rounded-lg hover:opacity-80", !vertical && "w-full")}>{inner}</button>
              : inner}
          </li>
        );
      })}
    </ol>
  );
}
