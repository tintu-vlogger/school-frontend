"use client";

/*
 * Select and MultiSelect: searchable, keyboard-friendly comboboxes.
 *
 * Static options:
 *   <Select value={deptId} onChange={(v) => setDeptId(v)} options={[{ value: 1, label: "Finance" }]} clearable />
 *
 * Async search (called with the typed text, debounced; "" when the menu opens):
 *   <Select value={managerId} onChange={(v, opt) => ...}
 *     loadOptions={async (q) => (await api.get<Emp[]>(`/employees/?search=${encodeURIComponent(q)}`)).map((e) => ({ value: e.id, label: name(e), description: e.email }))}
 *     selectedOption={initialManager}   // label for a value that isn't loaded yet
 *   />
 *
 *   <MultiSelect value={ids} onChange={(ids) => setIds(ids)} options={...} />   // chips
 *
 * Keyboard: type to filter, ArrowUp/Down to move, Enter to pick, Escape to close,
 * Backspace on an empty search removes the last chip (MultiSelect). The menu is portaled
 * so it is never clipped. Works inside <Field> (label, error, aria wiring).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import {
  Portal, cx, floatingPanel, focusWithinBorder, useAnchorPosition, useDebounced, useEscape, useLayer, useOutsideClick, ICON_STROKE,
} from "./internal";
import { useField } from "./fields";
import { Chip } from "./badge";

export type SelectValue = string | number;
export type SelectOption<V extends SelectValue = string> = {
  value: V;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type CommonProps<V extends SelectValue> = {
  options?: SelectOption<V>[];
  loadOptions?: (query: string) => Promise<SelectOption<V>[]>;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  emptyText?: string;
  debounceMs?: number;
  /** Offer "Add “typed text”" when nothing matches exactly; resolve with the new option (or null to cancel). */
  onCreate?: (text: string) => Promise<SelectOption<V> | null>;
  "aria-label"?: string;
};

export type SelectProps<V extends SelectValue = string> = CommonProps<V> & {
  value: V | null;
  onChange: (value: V | null, option: SelectOption<V> | null) => void;
  clearable?: boolean;
  /** The option for the current value when it may not be in `options` yet (async). */
  selectedOption?: SelectOption<V> | null;
};

export type MultiSelectProps<V extends SelectValue = string> = CommonProps<V> & {
  value: V[];
  onChange: (value: V[], options: SelectOption<V>[]) => void;
  selectedOptions?: SelectOption<V>[];
  max?: number;
};

/* ── shared engine ─────────────────────────────────────────────────────── */

function useCombobox<V extends SelectValue>(p: CommonProps<V>, extraKnown: SelectOption<V>[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<{ q: string; items: SelectOption<V>[]; error?: boolean } | null>(null);
  const [known, setKnown] = useState<SelectOption<V>[]>([]);
  const debounced = useDebounced(query, p.debounceMs ?? 250);
  const loader = useRef(p.loadOptions);
  useEffect(() => { loader.current = p.loadOptions; });
  const isAsync = !!p.loadOptions;

  useEffect(() => {
    if (!open || !loader.current) return;
    let live = true;
    loader.current(debounced)
      .then((items) => {
        if (!live) return;
        setResults({ q: debounced, items });
        setKnown((k) => [...k.filter((o) => !items.some((n) => n.value === o.value)), ...items].slice(-300));
      })
      .catch(() => { if (live) setResults({ q: debounced, items: [], error: true }); });
    return () => { live = false; };
  }, [open, debounced]);

  const loading = isAsync && open && (!results || results.q !== debounced || query !== debounced);

  const list = useMemo(() => {
    if (isAsync) return results?.items ?? [];
    const q = query.trim().toLowerCase();
    const all = p.options ?? [];
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
  }, [isAsync, results, query, p.options]);

  const find = (v: V) =>
    p.options?.find((o) => o.value === v) ?? extraKnown.find((o) => o.value === v) ?? known.find((o) => o.value === v) ?? null;

  const remember = (o: SelectOption<V>) => setKnown((k) => [...k.filter((x) => x.value !== o.value), o]);

  const [creating, setCreating] = useState(false);
  const typed = query.trim();
  const createText = p.onCreate && typed && !loading && !list.some((o) => o.label.toLowerCase() === typed.toLowerCase()) ? typed : null;
  const total = list.length + (createText ? 1 : 0);
  async function create(after: (o: SelectOption<V>) => void) {
    if (!createText || !p.onCreate || creating) return;
    setCreating(true);
    try {
      const o = await p.onCreate(createText);
      if (o) { remember(o); after(o); }
    } finally { setCreating(false); }
  }

  return { open, setOpen, query, setQuery, active, setActive, list, loading, error: !!results?.error, find, remember, createText, creating, total, create };
}

function OptionsPanel<V extends SelectValue>({
  open, anchor, panel, list, active, setActive, isSelected, onPick, loading, error, emptyText, query, async: isAsync, id,
  createText, creating, onCreate,
}: {
  createText?: string | null; creating?: boolean; onCreate?: () => void;
  open: boolean; anchor: React.RefObject<HTMLDivElement | null>; panel: React.RefObject<HTMLDivElement | null>;
  list: SelectOption<V>[]; active: number; setActive: (i: number) => void; isSelected: (v: V) => boolean;
  onPick: (o: SelectOption<V>) => void; loading: boolean; error: boolean; emptyText?: string; query: string; async: boolean; id: string;
}) {
  const reduce = useReducedMotion();
  const style = useAnchorPosition(anchor, open, { matchWidth: true, maxHeight: 300, minWidth: 220 });
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, panel]);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            style={style}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={(e) => e.preventDefault()}
            className={cx(floatingPanel, "hr-scroll overflow-y-auto p-1")}
          >
            <ul role="listbox" id={id}>
              {list.map((o, i) => {
                const sel = isSelected(o.value);
                return (
                  <li
                    key={String(o.value)}
                    id={`${id}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={sel}
                    aria-disabled={o.disabled || undefined}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => !o.disabled && onPick(o)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px]",
                      i === active && "bg-sunken",
                      o.disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {o.icon && <span className="shrink-0 text-muted">{o.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate", sel ? "text-primary" : "text-ink")}>{o.label}</span>
                      {o.description && <span className="block truncate text-[12px] text-faint">{o.description}</span>}
                    </span>
                    {sel && <Check size={15} strokeWidth={1.6} className="shrink-0 text-primary" />}
                  </li>
                );
              })}
              {createText && (
                <li
                  id={`${id}-${list.length}`}
                  data-index={list.length}
                  role="option"
                  aria-selected={false}
                  onMouseMove={() => active !== list.length && setActive(list.length)}
                  onClick={onCreate}
                  className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-primary", active === list.length && "bg-primary-soft/60", list.length > 0 && "mt-1")}
                >
                  {creating ? <Loader2 size={15} strokeWidth={ICON_STROKE} className="shrink-0 animate-spin" /> : <Plus size={15} strokeWidth={ICON_STROKE} className="shrink-0" />}
                  <span className="truncate">Add “{createText}”</span>
                </li>
              )}
            </ul>
            {list.length === 0 && !createText && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-faint">
                {loading ? <><Loader2 size={14} strokeWidth={ICON_STROKE} className="animate-spin" /> Searching…</>
                  : error ? "Couldn't load options"
                  : emptyText ?? (query ? `Nothing matches “${query}”` : isAsync ? "Type to search" : "No options")}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function navKeys<V extends SelectValue>(
  e: KeyboardEvent<HTMLInputElement>,
  s: {
    open: boolean; setOpen: (b: boolean) => void; active: number; setActive: (i: number) => void; list: SelectOption<V>[];
    total: number; createText: string | null; create: (after: (o: SelectOption<V>) => void) => void;
  },
  pick: (o: SelectOption<V>) => void,
) {
  const n = s.total;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!s.open) { s.setOpen(true); s.setActive(0); }
    else if (n) s.setActive((s.active + 1) % n);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (s.open && n) s.setActive((s.active - 1 + n) % n);
  } else if (e.key === "Enter") {
    if (!s.open) { e.preventDefault(); s.setOpen(true); return; }
    e.preventDefault();
    if (s.createText && s.active === s.list.length) { s.create(pick); return; }
    const o = s.list[s.active];
    if (o && !o.disabled) pick(o);
  } else if (e.key === "Tab") {
    s.setOpen(false);
  }
}

/* ── Select ────────────────────────────────────────────────────────────── */

export function Select<V extends SelectValue = string>(props: SelectProps<V>) {
  const { value, onChange, clearable, selectedOption, placeholder = "Select…", disabled, className, id, invalid } = props;
  const f = useField({ id, invalid });
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const extra = useMemo(() => (selectedOption ? [selectedOption] : []), [selectedOption]);
  const s = useCombobox(props, extra);
  const isTop = useLayer(s.open);
  const close = () => { s.setOpen(false); s.setQuery(""); };
  useEscape(s.open, isTop, close);
  useOutsideClick(s.open, [anchor, panel], close);

  const current = value === null || value === undefined ? null : s.find(value);
  const currentLabel = current?.label ?? (value !== null && value !== undefined ? (props.loadOptions ? "…" : String(value)) : "");

  function pick(o: SelectOption<V>) {
    s.remember(o);
    onChange(o.value, o);
    close();
  }

  const listId = `${f.id}-list`;
  return (
    <>
      <div
        ref={anchor}
        onMouseDown={(e) => {
          if (disabled) return;
          if (e.target !== input.current) e.preventDefault();
          input.current?.focus();
          if (s.open) close(); else { s.setOpen(true); s.setActive(Math.max(0, s.list.findIndex((o) => o.value === value))); }
        }}
        className={cx(
          "relative flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-surface pl-3 pr-2 transition-colors",
          focusWithinBorder(f.invalid, s.open), disabled && "cursor-not-allowed bg-sunken opacity-70", className,
        )}
      >
        {s.open && <Search size={15} strokeWidth={ICON_STROKE} className="shrink-0 text-faint" />}
        {!s.open && current?.icon && <span className="shrink-0 text-muted">{current.icon}</span>}
        <div className="relative min-w-0 flex-1">
          <input
            ref={input}
            id={f.id}
            role="combobox"
            aria-expanded={s.open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={s.open && s.list[s.active] ? `${listId}-${s.active}` : undefined}
            aria-invalid={f.invalid || undefined}
            aria-describedby={f.describedBy}
            aria-label={props["aria-label"]}
            autoComplete="off"
            disabled={disabled}
            value={s.query}
            placeholder={currentLabel ? "" : placeholder}
            onChange={(e) => { s.setQuery(e.target.value); s.setActive(0); if (!s.open) s.setOpen(true); }}
            onKeyDown={(e) => navKeys(e, s, pick)}
            onBlur={() => { if (s.open) close(); }}
            className="kit-bare w-full cursor-[inherit] bg-transparent text-[14px] font-light text-ink placeholder:text-faint focus:outline-none"
          />
          {!s.query && currentLabel && (
            <span className={cx("pointer-events-none absolute inset-0 flex items-center truncate text-[14px]", s.open ? "text-faint" : "text-ink")}>{currentLabel}</span>
          )}
        </div>
        {s.loading && <Loader2 size={14} strokeWidth={ICON_STROKE} className="shrink-0 animate-spin text-faint" />}
        {clearable && current && !disabled && (
          <button type="button" tabIndex={-1} aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(null, null); close(); }}
            className="shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink">
            <X size={14} strokeWidth={ICON_STROKE} />
          </button>
        )}
        <ChevronDown size={16} strokeWidth={ICON_STROKE} className={cx("shrink-0 text-faint transition-transform duration-150", s.open && "rotate-180")} />
      </div>
      <OptionsPanel open={s.open} anchor={anchor} panel={panel} list={s.list} active={s.active} setActive={s.setActive}
        isSelected={(v) => v === value} onPick={pick} loading={s.loading} error={s.error} emptyText={props.emptyText}
        query={s.query} async={!!props.loadOptions} id={listId}
        createText={s.createText} creating={s.creating} onCreate={() => s.create(pick)} />
    </>
  );
}

/* ── MultiSelect ───────────────────────────────────────────────────────── */

export function MultiSelect<V extends SelectValue = string>(props: MultiSelectProps<V>) {
  const { value, onChange, selectedOptions, placeholder = "Select…", disabled, className, id, invalid, max } = props;
  const f = useField({ id, invalid });
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = useCombobox(props, selectedOptions ?? []);
  const isTop = useLayer(s.open);
  const close = () => { s.setOpen(false); s.setQuery(""); };
  useEscape(s.open, isTop, close);
  useOutsideClick(s.open, [anchor, panel], close);

  const chosen = value.map((v) => s.find(v) ?? { value: v, label: props.loadOptions ? "…" : String(v) });
  const emit = (vals: V[]) => onChange(vals, vals.map((v) => s.find(v) ?? { value: v, label: String(v) }));

  function pick(o: SelectOption<V>) {
    s.remember(o);
    if (value.includes(o.value)) emit(value.filter((v) => v !== o.value));
    else if (!max || value.length < max) emit([...value, o.value]);
    s.setQuery("");
  }

  const listId = `${f.id}-list`;
  return (
    <>
      <div
        ref={anchor}
        onMouseDown={(e) => {
          if (disabled) return;
          if (e.target !== input.current) e.preventDefault();
          input.current?.focus();
          if (!s.open) { s.setOpen(true); s.setActive(0); }
        }}
        className={cx(
          "relative flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border bg-surface py-[6px] pl-2 pr-2 transition-colors",
          focusWithinBorder(f.invalid, s.open), disabled && "cursor-not-allowed bg-sunken opacity-70", className,
        )}
      >
        {chosen.map((o) => (
          <Chip key={String(o.value)} onRemove={disabled ? undefined : () => emit(value.filter((v) => v !== o.value))}>{o.label}</Chip>
        ))}
        <input
          ref={input}
          id={f.id}
          role="combobox"
          aria-expanded={s.open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={s.open && s.list[s.active] ? `${listId}-${s.active}` : undefined}
          aria-invalid={f.invalid || undefined}
          aria-describedby={f.describedBy}
          aria-label={props["aria-label"]}
          autoComplete="off"
          disabled={disabled}
          value={s.query}
          placeholder={chosen.length ? "" : placeholder}
          onChange={(e) => { s.setQuery(e.target.value); s.setActive(0); if (!s.open) s.setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !s.query && value.length) { emit(value.slice(0, -1)); return; }
            navKeys(e, s, pick);
          }}
          onBlur={() => { if (s.open) close(); }}
          className="kit-bare h-7 min-w-[80px] flex-1 bg-transparent px-1 text-[14px] font-light text-ink placeholder:text-faint focus:outline-none"
        />
        {s.loading && <Loader2 size={14} strokeWidth={ICON_STROKE} className="shrink-0 animate-spin text-faint" />}
        <ChevronDown size={16} strokeWidth={ICON_STROKE} className={cx("shrink-0 text-faint transition-transform duration-150", s.open && "rotate-180")} />
      </div>
      <OptionsPanel open={s.open} anchor={anchor} panel={panel} list={s.list} active={s.active} setActive={s.setActive}
        isSelected={(v) => value.includes(v)} onPick={pick} loading={s.loading} error={s.error} emptyText={props.emptyText}
        query={s.query} async={!!props.loadOptions} id={listId}
        createText={s.createText} creating={s.creating} onCreate={() => s.create(pick)} />
    </>
  );
}
