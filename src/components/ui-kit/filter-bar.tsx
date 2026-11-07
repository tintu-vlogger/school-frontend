"use client";

/*
 * FilterBar: debounced search plus filter chips, above a DataTable.
 *
 *   const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
 *   <FilterBar
 *     searchPlaceholder="Search by name or email"
 *     onSearchChange={setQuery}                         // called after `debounceMs` (300) of quiet
 *     filters={[
 *       { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
 *       { key: "dept", label: "Department", multiple: true, options: depts },
 *     ]}
 *     values={filters} onChange={setFilters}
 *     actions={<Button ...>Export</Button>}            // right side
 *   />
 *
 * Unset filters show as dashed "+ Label" chips; set ones show "Label: Value" with a clear (x).
 * Single-choice filters close on pick; multiple ones stay open with checkboxes.
 */
import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Search, X } from "lucide-react";
import { Portal, cx, floatingPanel, useAnchorPosition, useEscape, useLayer, useOutsideClick, ICON_STROKE } from "./internal";

export type FilterOption = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: FilterOption[]; multiple?: boolean };
export type FilterValues = Record<string, string[]>;

export type FilterBarProps = {
  search?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  debounceMs?: number;
  filters?: FilterDef[];
  values?: FilterValues;
  onChange?: (values: FilterValues) => void;
  actions?: ReactNode;
  className?: string;
};

export function FilterBar({
  search = "", onSearchChange, searchPlaceholder = "Search", debounceMs = 300, filters = [], values = {}, onChange, actions, className,
}: FilterBarProps) {
  const [text, setText] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = (v: string, now = false) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    if (now) onSearchChange?.(v);
    else timer.current = setTimeout(() => onSearchChange?.(v), debounceMs);
  };
  const anySet = filters.some((f) => values[f.key]?.length);

  return (
    <div className={cx("mb-4 flex flex-wrap items-center gap-2", className)}>
      {onSearchChange && (
        <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/10 hover:border-line-strong sm:w-72">
          <Search size={15} strokeWidth={ICON_STROKE} className="shrink-0 text-faint" />
          <input
            type="search"
            value={text}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => emit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") emit(text, true); if (e.key === "Escape" && text) { e.stopPropagation(); emit("", true); } }}
            className="kit-bare min-w-0 flex-1 bg-transparent text-[14px] font-light text-ink placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => emit("", true)} className="shrink-0 rounded p-0.5 text-faint hover:text-ink">
              <X size={14} strokeWidth={ICON_STROKE} />
            </button>
          )}
        </div>
      )}
      {filters.map((f) => (
        <FilterChip key={f.key} def={f} value={values[f.key] ?? []} onChange={(v) => onChange?.({ ...values, [f.key]: v })} />
      ))}
      {anySet && (
        <button type="button" onClick={() => onChange?.(Object.fromEntries(filters.map((f) => [f.key, []])))}
          className="h-9 px-2 text-[13px] text-muted transition-colors hover:text-ink">
          Clear filters
        </button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function FilterChip({ def, value, onChange }: { def: FilterDef; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const isTop = useLayer(open);
  const style = useAnchorPosition(anchor, open, { minWidth: 200, maxHeight: 320 });
  useEscape(open, isTop, () => setOpen(false));
  useOutsideClick(open, [anchor, panel], () => setOpen(false));

  const labels = value.map((v) => def.options.find((o) => o.value === v)?.label ?? v);
  const set = value.length > 0;

  function pick(v: string) {
    if (def.multiple) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else { onChange(value[0] === v ? [] : [v]); setOpen(false); }
  }

  return (
    <>
      <div ref={anchor} className={cx(
        "inline-flex h-9 items-center rounded-lg border text-[13.5px] transition-colors",
        set ? "border-primary/30 bg-primary-soft/50 text-ink" : "border-dashed border-line-strong text-muted hover:border-faint hover:text-ink",
      )}>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className={cx("inline-flex h-full items-center gap-1.5", set ? "pl-3 pr-1.5" : "px-3")}>
          {!set && <Plus size={14} strokeWidth={ICON_STROKE} />}
          <span className={set ? "text-muted" : ""}>{def.label}</span>
          {set && <><span className="text-faint">:</span><span className="max-w-[160px] truncate text-primary">{labels[0]}{labels.length > 1 && ` +${labels.length - 1}`}</span></>}
        </button>
        {set && (
          <button type="button" aria-label={`Clear ${def.label}`} onClick={() => onChange([])} className="mr-1 rounded p-1 text-faint hover:text-ink">
            <X size={13} strokeWidth={ICON_STROKE} />
          </button>
        )}
      </div>
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div ref={panel} role="listbox" aria-multiselectable={def.multiple || undefined} style={style}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={cx(floatingPanel, "hr-scroll overflow-y-auto p-1")}>
              <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-faint">{def.label}</p>
              {def.options.map((o) => {
                const on = value.includes(o.value);
                return (
                  <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => pick(o.value)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink outline-none transition-colors hover:bg-sunken focus:bg-sunken">
                    {def.multiple ? (
                      <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-white" : "border-line-strong")}>
                        {on && <Check size={11} strokeWidth={2} />}
                      </span>
                    ) : null}
                    <span className="flex-1 truncate">{o.label}</span>
                    {!def.multiple && on && <Check size={14} strokeWidth={1.6} className="text-primary" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
