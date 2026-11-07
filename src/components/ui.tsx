"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  ReactNode,
  KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Check, AlertTriangle, Info } from "lucide-react";

/* ───────────────────────────────────────────
   SearchableSelect – replaces all <select>
   ─────────────────────────────────────────── */
export interface SelectOption {
  value: string | number;
  label: string;
  /** Optional photo (or initials fallback) shown before the label, e.g. for staff. */
  avatar?: { src?: string | null; name: string };
  description?: string;
  group?: string;
  searchTerms?: string;
  disabled?: boolean;
}

/** Round photo with an initials fallback; used wherever a person is listed. */
export function Avatar({ src, name, size = 28, className = "" }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s*/i, "").split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className={`shrink-0 rounded-full object-cover ring-1 ring-black/5 ${className}`} />;
  }
  return (
    <span style={style} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${className}`} aria-hidden>
      {initials}
    </span>
  );
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | number | null;
  onChange: (value: string | number) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
  error?: string;
  onSearch?: (query: string) => void;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = true,
  className = "",
  disabled = false,
  error,
  onSearch,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // Debounced remote search
  useEffect(() => {
    if (!onSearchRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchRef.current?.(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = onSearch
    ? options  // parent handles filtering via API
    : query
    ? options.filter((o) => {
        const q = query.toLowerCase();
        return (
          o.label.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q)) ||
          (o.group && o.group.toLowerCase().includes(q)) ||
          (o.searchTerms && o.searchTerms.toLowerCase().includes(q))
        );
      })
    : options;

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = ref.current && ref.current.contains(target);
      const insideMenu = menuRef.current && menuRef.current.contains(target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Position the portalled menu under the trigger. Recomputed on open,
  // scroll, and resize so it tracks its anchor.
  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Ensure the menu never overflows the right edge — if the trigger sits
    // too far right for our 200px minimum-width panel, right-align the
    // menu to the trigger instead of left-aligning.
    const estMenuWidth = Math.max(r.width, 200);
    const margin = 8;
    let left = r.left;
    if (typeof window !== "undefined") {
      const maxLeft = window.innerWidth - estMenuWidth - margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);
    }
    setMenuPos({ top: r.bottom + 4, left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return; }
    computePos();
    const onWin = () => computePos();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, computePos]);

  useEffect(() => {
    if (open && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, searchable]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-option]");
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIdx, open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[highlightIdx] && !filtered[highlightIdx].disabled) {
            onChange(filtered[highlightIdx].value);
            setOpen(false);
            setQuery("");
          }
          break;
        case "Escape":
          setOpen(false);
          setQuery("");
          break;
      }
    },
    [open, filtered, highlightIdx, onChange]
  );

  const menuBody = (
    <div
      ref={menuRef}
      className="fixed z-[1000] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
      // The menu's width grows to fit its content but is never narrower than
      // the trigger (so short-label triggers like "All" still get a
      // comfortably sized panel). A minWidth floor keeps the longest options
      // legible regardless of trigger width.
      style={
        menuPos
          ? { top: menuPos.top, left: menuPos.left, minWidth: Math.max(menuPos.width, 200) }
          : { top: -9999, left: -9999 }
      }
    >
      {(onSearch || (searchable && options.length > 5)) && (
        <div className="border-b border-gray-100 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">
            No options found
          </div>
        ) : (
          filtered.map((option, idx) => {
            const isSelected = String(option.value) === String(value);
            const isHighlighted = idx === highlightIdx;
            return (
              <button
                key={`${idx}-${String(option.value ?? "")}`}
                type="button"
                data-option
                disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  option.disabled
                    ? "cursor-not-allowed text-gray-300"
                    : isHighlighted
                    ? "bg-primary/5 text-gray-900"
                    : "text-gray-700 hover:bg-gray-50"
                } ${isSelected ? "font-medium text-primary" : ""}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {option.avatar && <Avatar src={option.avatar.src} name={option.avatar.name} size={28} />}
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{option.label}</span>
                    {option.group && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{option.group}</span>
                    )}
                  </div>
                  {option.description && (
                    <div className="mt-0.5 text-xs text-gray-400">
                      {option.description}
                    </div>
                  )}
                  </div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition-all duration-200 ${
          error
            ? "border-error ring-2 ring-error/20"
            : open
            ? "border-primary ring-2 ring-primary/20"
            : "border-gray-200 hover:border-gray-300"
        } ${disabled ? "cursor-not-allowed bg-gray-50 opacity-60" : "cursor-pointer"}`}
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected?.avatar && <Avatar src={selected.avatar.src} name={selected.avatar.name} size={22} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && typeof window !== "undefined" && createPortal(menuBody, document.body)}

      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}

/* ───────────────────────────────────────────
   MultiSelect – for selecting multiple items
   ─────────────────────────────────────────── */
interface MultiSelectProps {
  options: SelectOption[];
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const selectedOptions = options.filter((o) =>
    value.includes(o.value)
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(val: string | number) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        className={`flex w-full min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-sm transition-all duration-200 cursor-pointer ${
          open
            ? "border-primary ring-2 ring-primary/20"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {selectedOptions.length > 0 ? (
          selectedOptions.map((o) => (
            <span
              key={`chip-${String(o.value ?? "")}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {o.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.value);
                }}
                className="hover:text-primary-dark"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {options.length > 5 && (
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary focus:bg-white"
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.map((option, idx) => {
              const checked = value.includes(option.value);
              return (
                <button
                  key={`${idx}-${String(option.value ?? "")}`}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                    checked ? "text-primary font-medium" : "text-gray-700"
                  }`}
                >
                  <div
                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? "border-primary bg-primary text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────
   Toast / Alert – replaces alert() / confirm()
   ─────────────────────────────────────────── */
interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({
  message,
  type = "info",
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const styles = {
    success: "bg-success/10 border-success/30 text-success",
    error: "bg-error/10 border-error/30 text-error",
    warning: "bg-warning/10 border-warning/30 text-warning",
    info: "bg-primary/10 border-primary/30 text-primary",
  };

  const icons = {
    success: <Check className="h-4.5 w-4.5" />,
    error: <X className="h-4.5 w-4.5" />,
    warning: <AlertTriangle className="h-4.5 w-4.5" />,
    info: <Info className="h-4.5 w-4.5" />,
  };

  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300">
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm bg-white ${styles[type]}`}
      >
        {icons[type]}
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   ConfirmDialog – replaces confirm()
   ─────────────────────────────────────────── */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const btnStyles = {
    danger: "bg-error hover:bg-red-600 text-white",
    warning: "bg-warning hover:bg-amber-600 text-white",
    primary: "bg-primary hover:bg-primary-dark text-white",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-colors ${btnStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   Modal – generic modal wrapper
   ─────────────────────────────────────────── */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
