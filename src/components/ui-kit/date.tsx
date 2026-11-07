"use client";

/*
 * Date pickers with a popover calendar (weeks start Monday). Values are plain
 * "YYYY-MM-DD" strings ("" when empty), so they go straight to and from the API.
 *
 *   <DateInput value={dob} onChange={setDob} max={today} clearable />
 *   <DateRangeInput value={{ from, to }} onChange={({ from, to }) => ...} />
 *
 * Keyboard: Enter/ArrowDown opens; in the calendar arrows move by day/week,
 * PageUp/PageDown by month, Enter picks, Escape closes. Display format: "7 Nov 2026".
 * Calendar is exported for inline use.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Portal, cx, floatingPanel, focusWithinBorder, useAnchorPosition, useEscape, useLayer, useOutsideClick, ICON_STROKE } from "./internal";
import { useField } from "./fields";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseISODate(s?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function formatDisplayDate(s?: string | null) {
  const d = parseISODate(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : "";
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
};

/* ── Calendar ──────────────────────────────────────────────────────────── */

export type CalendarProps = {
  /** Highlighted single date. */
  value?: string;
  /** Range highlight (used by DateRangeInput). */
  range?: { from: string; to: string };
  onPick: (iso: string) => void;
  min?: string;
  max?: string;
  /** Month to show first (any date in it). */
  initialMonth?: string;
  autoFocus?: boolean;
};

export function Calendar({ value, range, onPick, min, max, initialMonth, autoFocus }: CalendarProps) {
  const start = parseISODate(initialMonth || value || range?.from) ?? new Date();
  const [focus, setFocus] = useState<Date>(start);
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const today = toISODate(new Date());
  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus());
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const out = (iso: string) => (min && iso < min) || (max && iso > max);

  const rFrom = range?.from || "";
  const rTo = range?.to || (rFrom && hover && hover > rFrom ? hover : "");

  function move(d: Date) {
    setFocus(d);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-iso="${toISODate(d)}"]`)?.focus());
  }
  function onKey(e: KeyboardEvent) {
    const map: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1), PageDown: () => addMonths(focus, 1),
    };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]()); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const iso = toISODate(focus);
      if (!out(iso)) onPick(iso);
    }
  }

  const navBtn = "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink";
  return (
    <div className="w-[272px] select-none p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" className={navBtn} onClick={() => setFocus(addMonths(focus, -1))}><ChevronLeft size={16} strokeWidth={ICON_STROKE} /></button>
        <span className="text-[14px] text-ink">{MONTHS[focus.getMonth()]} <span className="text-muted">{focus.getFullYear()}</span></span>
        <button type="button" aria-label="Next month" className={navBtn} onClick={() => setFocus(addMonths(focus, 1))}><ChevronRight size={16} strokeWidth={ICON_STROKE} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11.5px] text-faint">
        {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>
      <div ref={grid} role="grid" className="grid grid-cols-7 gap-y-0.5" onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {cells.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === focus.getMonth();
          const selected = iso === value || iso === rFrom || iso === rTo;
          const between = rFrom && rTo && iso > rFrom && iso < rTo;
          const isFocus = iso === toISODate(focus);
          const disabled = !!out(iso);
          return (
            <div key={iso} className={cx("flex justify-center", between && "bg-primary-soft/70", iso === rFrom && rTo && "rounded-l-lg bg-primary-soft/70", iso === rTo && rFrom && "rounded-r-lg bg-primary-soft/70")}>
              <button
                type="button"
                data-iso={iso}
                tabIndex={isFocus ? 0 : -1}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={formatDisplayDate(iso)}
                onClick={() => { setFocus(d); onPick(iso); }}
                onMouseEnter={() => setHover(iso)}
                className={cx(
                  "kit-bare relative flex h-8 w-8 items-center justify-center rounded-lg text-[13px] tabular outline-none transition-colors",
                  selected ? "bg-primary text-white" : inMonth ? "text-ink hover:bg-sunken" : "text-faint/70 hover:bg-sunken",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  isFocus && !selected && "ring-1 ring-primary/40",
                )}
              >
                {d.getDate()}
                {iso === today && !selected && <span className="absolute bottom-1 h-[3px] w-[3px] rounded-full bg-primary" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── shared trigger + popover ──────────────────────────────────────────── */

function usePopover() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const isTop = useLayer(open);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) anchor.current?.querySelector<HTMLElement>("button")?.focus();
  };
  useEscape(open, isTop, () => close());
  useOutsideClick(open, [anchor, panel], () => close(false));
  return { open, setOpen, anchor, panel, close };
}

function Popover({ open, anchor, panel, onTab, children }: { open: boolean; anchor: React.RefObject<HTMLDivElement | null>; panel: React.RefObject<HTMLDivElement | null>; onTab: () => void; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const style = useAnchorPosition(anchor, open, { maxHeight: 400 });
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div ref={panel} style={style} className={cx(floatingPanel, "overflow-hidden")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); onTab(); } }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function Trigger({ id, label, placeholder, open, onOpen, onClear, disabled, invalid, describedBy, className }: {
  id: string; label: string; placeholder: string; open: boolean; onOpen: () => void; onClear?: () => void;
  disabled?: boolean; invalid?: boolean; describedBy?: string; className?: string;
}) {
  return (
    <div className={cx("flex h-10 items-center rounded-lg border bg-surface transition-colors", focusWithinBorder(invalid, open), disabled && "bg-sunken opacity-70", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); onOpen(); } }}
        className="kit-bare flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left text-[14px] focus:outline-none disabled:cursor-not-allowed"
      >
        <CalendarDays size={16} strokeWidth={ICON_STROKE} className="shrink-0 text-faint" />
        <span className={cx("truncate tabular", label ? "text-ink" : "text-faint")}>{label || placeholder}</span>
      </button>
      {onClear && label && !disabled && (
        <button type="button" aria-label="Clear date" onClick={onClear} className="mr-2 shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink">
          <X size={14} strokeWidth={ICON_STROKE} />
        </button>
      )}
    </div>
  );
}

/* ── DateInput ─────────────────────────────────────────────────────────── */

export type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
};

export function DateInput({ value, onChange, min, max, placeholder = "Pick a date", clearable, disabled, invalid, id, className }: DateInputProps) {
  const f = useField({ id, invalid });
  const { open, setOpen, anchor, panel, close } = usePopover();
  return (
    <>
      <div ref={anchor}>
        <Trigger id={f.id} label={formatDisplayDate(value)} placeholder={placeholder} open={open} onOpen={() => setOpen(!open)}
          onClear={clearable ? () => onChange("") : undefined} disabled={disabled} invalid={f.invalid} describedBy={f.describedBy} className={className} />
      </div>
      <Popover open={open} anchor={anchor} panel={panel} onTab={() => close()}>
        <Calendar value={value} min={min} max={max} autoFocus onPick={(iso) => { onChange(iso); close(); }} />
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12.5px]">
          <button type="button" className="text-primary hover:text-primary-dark" onClick={() => { onChange(toISODate(new Date())); close(); }}>Today</button>
          {clearable && value && <button type="button" className="text-muted hover:text-ink" onClick={() => { onChange(""); close(); }}>Clear</button>}
        </div>
      </Popover>
    </>
  );
}

/* ── DateRangeInput ────────────────────────────────────────────────────── */

export type DateRange = { from: string; to: string };

export type DateRangeInputProps = {
  value: DateRange;
  onChange: (value: DateRange) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
};

export function DateRangeInput({ value, onChange, min, max, placeholder = "Pick dates", clearable = true, disabled, invalid, id, className }: DateRangeInputProps) {
  const f = useField({ id, invalid });
  const { open, setOpen, anchor, panel, close } = usePopover();
  const [draft, setDraft] = useState<DateRange | null>(null);
  const shown = draft ?? value;
  const label = value.from ? `${formatDisplayDate(value.from)} – ${value.to ? formatDisplayDate(value.to) : "…"}` : "";

  function pick(iso: string) {
    if (!draft || draft.to || !draft.from) { setDraft({ from: iso, to: "" }); return; }
    const r = iso < draft.from ? { from: iso, to: draft.from } : { from: draft.from, to: iso };
    setDraft(null);
    onChange(r);
    close();
  }

  function preset(days: number) {
    const to = new Date();
    const from = addDays(to, -(days - 1));
    onChange({ from: toISODate(from), to: toISODate(to) });
    setDraft(null);
    close();
  }

  return (
    <>
      <div ref={anchor}>
        <Trigger id={f.id} label={label} placeholder={placeholder} open={open}
          onOpen={() => { setDraft({ from: "", to: "" }); setOpen(!open); }}
          onClear={clearable ? () => onChange({ from: "", to: "" }) : undefined}
          disabled={disabled} invalid={f.invalid} describedBy={f.describedBy} className={className} />
      </div>
      <Popover open={open} anchor={anchor} panel={panel} onTab={() => close()}>
        <div className="flex">
          <div className="hidden w-[132px] flex-col gap-0.5 border-r border-line p-2 text-[13px] sm:flex">
            {[["Last 7 days", 7], ["Last 30 days", 30], ["Last 90 days", 90]].map(([l, d]) => (
              <button key={l} type="button" onClick={() => preset(d as number)} className="rounded-md px-2.5 py-1.5 text-left text-muted hover:bg-sunken hover:text-ink">{l}</button>
            ))}
          </div>
          <div>
            <Calendar range={shown.from ? shown : value} min={min} max={max} autoFocus initialMonth={value.from || undefined} onPick={pick} />
            <p className="border-t border-line px-3 py-2 text-[12px] text-faint">{draft?.from ? "Now pick the end date" : "Pick the start date"}</p>
          </div>
        </div>
      </Popover>
    </>
  );
}
