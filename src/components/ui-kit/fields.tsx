"use client";

/*
 * Form fields. Wrap any control in <Field> to get a label, hint, error and wiring
 * (id, aria-invalid, aria-describedby) for free:
 *
 *   <Field label="Work email" required hint="Used to sign in" error={errors.email}>
 *     <TextInput type="email" value={v.email} onValueChange={(x) => set("email", x)} />
 *   </Field>
 *
 * Controls (all controlled):
 *   TextInput     native <input> props + onValueChange(string), leading icon, trailing node
 *   Textarea      native <textarea> props + onValueChange(string), autoGrow
 *   NumberInput   value: number | null, onChange(number | null), min/max/step, suffix
 *   TimeInput     value "HH:MM", onChange(string)
 *   Toggle        checked, onChange(boolean), label?, description?
 *   Checkbox      checked, onChange(boolean), label?, description?, indeterminate?
 *   RadioCards    options [{ value, label, description?, icon? }], value, onChange, columns
 * Date pickers live in date.tsx, Select/MultiSelect in select.tsx, FileDrop in file-drop.tsx.
 * FormGrid lays fields out in 1/2/3 columns; FormSection groups them under a heading.
 */
import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useRef,
  type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cx, inputBase, inputBorder, focusWithinBorder, ICON_STROKE } from "./internal";
import type { IconType } from "./button";

/* ── Field ─────────────────────────────────────────────────────────────── */

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** For custom controls: the id / invalid / describedby supplied by the surrounding Field. */
export function useField(own?: { id?: string; invalid?: boolean }) {
  const ctx = useContext(FieldContext);
  const fallback = useId();
  return {
    id: own?.id ?? ctx?.id ?? fallback,
    invalid: own?.invalid ?? ctx?.invalid ?? false,
    describedBy: ctx?.describedBy,
  };
}

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Shown at the right of the label, e.g. "Optional" or a help link. */
  aside?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, required, aside, htmlFor, className, children }: FieldProps) {
  const auto = useId();
  const id = htmlFor ?? `f${auto}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cx("min-w-0", className)}>
        {(label || aside) && (
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            {label && (
              <label htmlFor={id} className="text-[13px] text-muted">
                {label}{required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}
              </label>
            )}
            {aside && <span className="text-[12px] text-faint">{aside}</span>}
          </div>
        )}
        {children}
        {error ? (
          <p id={errorId} className="mt-1.5 text-[12.5px] text-rose-600">{error}</p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-[12.5px] text-faint">{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FormGrid({ columns = 2, children, className }: { columns?: 1 | 2 | 3; children: ReactNode; className?: string }) {
  return <div className={cx("grid gap-x-5 gap-y-5", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

/** A titled block of fields; stack several inside a modal body. */
export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border-b border-line py-6 first:pt-0 last:border-0 last:pb-0", className)}>
      <div className="mb-4">
        <h3 className="text-[15px] font-normal text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/* ── TextInput / Textarea ──────────────────────────────────────────────── */

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  onValueChange?: (value: string) => void;
  leading?: IconType;
  trailing?: ReactNode;
  invalid?: boolean;
  /** Sets data-autofocus so a Modal focuses it on open. */
  autoFocusInModal?: boolean;
};

export function TextInput({ onValueChange, onChange, leading: Leading, trailing, invalid, className, id, autoFocusInModal, ...rest }: TextInputProps) {
  const f = useField({ id, invalid });
  const input = (
    <input
      id={f.id}
      aria-invalid={f.invalid || undefined}
      aria-describedby={f.describedBy}
      data-autofocus={autoFocusInModal ? "" : undefined}
      onChange={(e) => { onChange?.(e); onValueChange?.(e.target.value); }}
      className={cx(inputBase, "h-10", Leading || trailing ? "border-0 bg-transparent px-0 focus:ring-0" : cx("px-3", inputBorder(f.invalid)), !Leading && !trailing && className)}
      {...rest}
    />
  );
  if (!Leading && !trailing) return input;
  return (
    <div className={cx("flex h-10 items-center gap-2 rounded-lg border bg-surface px-3 transition-colors", focusWithinBorder(f.invalid), rest.disabled && "bg-sunken", className)}>
      {Leading && <Leading size={16} strokeWidth={ICON_STROKE} className="shrink-0 text-faint" />}
      {input}
      {trailing && <span className="shrink-0 text-[13px] text-faint">{trailing}</span>}
    </div>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  onValueChange?: (value: string) => void;
  invalid?: boolean;
  /** Grow with the content up to maxRows. */
  autoGrow?: boolean;
  maxRows?: number;
};

export function Textarea({ onValueChange, onChange, invalid, className, id, rows = 3, autoGrow, maxRows = 12, value, ...rest }: TextareaProps) {
  const f = useField({ id, invalid });
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!autoGrow || !el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight + 2, line * maxRows + 20)}px`;
  }, [value, autoGrow, maxRows]);
  return (
    <textarea
      ref={ref}
      id={f.id}
      rows={rows}
      value={value}
      aria-invalid={f.invalid || undefined}
      aria-describedby={f.describedBy}
      onChange={(e) => { onChange?.(e); onValueChange?.(e.target.value); }}
      className={cx(inputBase, inputBorder(f.invalid), "block resize-y px-3 py-2.5 leading-[22px]", autoGrow && "resize-none", className)}
      {...rest}
    />
  );
}

/* ── NumberInput ───────────────────────────────────────────────────────── */

export type NumberInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
};

export function NumberInput({ value, onChange, min, max, step = 1, suffix, placeholder, disabled, invalid, id, className }: NumberInputProps) {
  const f = useField({ id, invalid });
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const bump = (d: number) => onChange(clamp(Number(((value ?? 0) + d).toFixed(6))));
  const btn = "flex h-full w-9 items-center justify-center text-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40";
  return (
    <div className={cx("flex h-10 items-stretch overflow-hidden rounded-lg border bg-surface transition-colors", focusWithinBorder(f.invalid), disabled && "bg-sunken", className)}>
      <input
        id={f.id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={f.invalid || undefined}
        aria-describedby={f.describedBy}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.-]/g, "");
          if (raw === "" || raw === "-") return onChange(null);
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
        onBlur={() => { if (value !== null) onChange(clamp(value)); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); bump(step); }
          if (e.key === "ArrowDown") { e.preventDefault(); bump(-step); }
        }}
        className="kit-bare tabular min-w-0 flex-1 bg-transparent px-3 text-[14px] font-light text-ink placeholder:text-faint focus:outline-none"
      />
      {suffix && <span className="flex items-center pr-2 text-[13px] text-faint">{suffix}</span>}
      <div className="flex border-l border-line">
        <button type="button" tabIndex={-1} aria-label="Decrease" disabled={disabled || (min !== undefined && (value ?? 0) <= min)} onClick={() => bump(-step)} className={btn}><Minus size={14} strokeWidth={ICON_STROKE} /></button>
        <button type="button" tabIndex={-1} aria-label="Increase" disabled={disabled || (max !== undefined && (value ?? 0) >= max)} onClick={() => bump(step)} className={cx(btn, "border-l border-line")}><Plus size={14} strokeWidth={ICON_STROKE} /></button>
      </div>
    </div>
  );
}

/* ── TimeInput ─────────────────────────────────────────────────────────── */

export type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/** Native time input (24h value "HH:MM"), styled to match. */
export function TimeInput({ value, onChange, min, max, step, disabled, invalid, id, className, ...aria }: TimeInputProps) {
  const f = useField({ id, invalid });
  return (
    <input
      type="time"
      id={f.id}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={aria["aria-label"]}
      aria-invalid={f.invalid || undefined}
      aria-describedby={f.describedBy}
      onChange={(e) => onChange(e.target.value)}
      className={cx(inputBase, inputBorder(f.invalid), "tabular h-10 px-3 [&::-webkit-calendar-picker-indicator]:opacity-40", className)}
    />
  );
}

/* ── Toggle / Checkbox ─────────────────────────────────────────────────── */

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  className?: string;
  "aria-label"?: string;
};

export function Toggle({ checked, onChange, label, description, disabled, size = "md", id, className, ...aria }: ToggleProps) {
  const f = useField({ id });
  const sm = size === "sm";
  const sw = (
    <button
      type="button"
      role="switch"
      id={f.id}
      aria-checked={checked}
      aria-label={aria["aria-label"] ?? (typeof label === "string" ? label : undefined)}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        sm ? "h-[18px] w-8" : "h-[22px] w-10",
        checked ? "bg-primary" : "bg-line-strong",
      )}
    >
      <span className={cx(
        "absolute rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.18)] transition-transform duration-150",
        sm ? "left-[2px] h-[14px] w-[14px]" : "left-[3px] h-4 w-4",
        checked && (sm ? "translate-x-[14px]" : "translate-x-[18px]"),
      )} />
    </button>
  );
  if (!label && !description) return sw;
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <label htmlFor={f.id} className="min-w-0 cursor-pointer">
        {label && <span className="block text-[14px] text-ink">{label}</span>}
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </label>
      <span className="pt-0.5">{sw}</span>
    </div>
  );
}

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

export function Checkbox({ checked, onChange, label, description, indeterminate, disabled, id, className, ...aria }: CheckboxProps) {
  const f = useField({ id });
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  const on = checked || indeterminate;
  const box = (
    <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
      <input
        ref={ref}
        type="checkbox"
        id={f.id}
        checked={checked}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {on && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          {indeterminate ? <Minus size={12} strokeWidth={2} /> : <Check size={12} strokeWidth={2} />}
        </span>
      )}
    </span>
  );
  if (!label && !description) return box;
  return (
    <label htmlFor={f.id} className={cx("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="pt-[2px]">{box}</span>
      <span className="min-w-0">
        {label && <span className="block text-[14px] text-ink">{label}</span>}
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

/* ── RadioCards ────────────────────────────────────────────────────────── */

export type RadioCardOption<T extends string = string> = { value: T; label: ReactNode; description?: ReactNode; icon?: IconType; disabled?: boolean };

export type RadioCardsProps<T extends string = string> = {
  options: RadioCardOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3 | 4;
  name?: string;
  className?: string;
};

export function RadioCards<T extends string = string>({ options, value, onChange, columns = 2, name, className }: RadioCardsProps<T>) {
  const auto = useId();
  const group = name ?? auto;
  const f = useField();
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" aria-describedby={f.describedBy} className={cx("grid gap-2.5", cols, className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <label key={o.value}
            className={cx(
              "relative flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-primary/15",
              active ? "border-primary/60 bg-primary-soft/40" : "border-line hover:border-line-strong",
              o.disabled && "cursor-not-allowed opacity-50",
            )}>
            <input type="radio" name={group} value={o.value} checked={active} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
            {Icon && (
              <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-surface text-primary" : "bg-sunken text-muted")}>
                <Icon size={16} strokeWidth={ICON_STROKE} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-ink">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-[12.5px] leading-[18px] text-muted">{o.description}</span>}
            </span>
            <span className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-line-strong")}>
              {active && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
          </label>
        );
      })}
    </div>
  );
}
