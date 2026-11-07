"use client";

/*
 * Kit internals shared by the floating components (Modal, menus, Select, date pickers):
 * - Portal: renders into document.body, carrying the tenant app's font/theme classes.
 * - useLayer: a stack of open layers so Escape / Tab only act on the topmost one.
 * - useFocusTrap: keeps Tab inside a dialog and restores focus when it closes.
 * - useScrollLock, useAnchorPosition, useOutsideClick, useDebounced.
 * Not exported from the barrel; use the public components instead.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode, type RefObject,
} from "react";
import { createPortal } from "react-dom";

export { clsx as cx } from "clsx";

const noopSubscribe = () => () => {};
/** True once running in the browser (false during server render and hydration). */
export function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Portal to document.body. The wrapper copies the class list of the closest `.hr-app`
 *  so portaled content keeps the app font, weight and colours. */
export function Portal({ children }: { children: ReactNode }) {
  const client = useIsClient();
  if (!client) return null;
  const appClass = document.querySelector(".hr-app")?.className ?? "";
  return createPortal(<div className={appClass} data-kit-portal="">{children}</div>, document.body);
}

/* ── Layer stack ───────────────────────────────────────────────────────── */
const layers: number[] = [];
let layerSeq = 0;

/** Register an open layer. Returns `isTop()` which is true while this is the topmost layer. */
export function useLayer(active: boolean) {
  const id = useRef(0);
  useEffect(() => {
    if (!active) return;
    const mine = ++layerSeq;
    id.current = mine;
    layers.push(mine);
    return () => {
      const i = layers.indexOf(mine);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
  return useCallback(() => id.current !== 0 && layers[layers.length - 1] === id.current, []);
}

/** Call `onEscape` when Escape is pressed and this layer is on top. */
export function useEscape(active: boolean, isTop: () => boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  useEffect(() => { cb.current = onEscape; });
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTop()) { e.stopPropagation(); cb.current(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [active, isTop]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Trap Tab inside `ref` while active and on top; focus `[data-autofocus]` (or the
 *  container) on open; restore the previously focused element on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, isTop: () => boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root) return;
      const auto = root.querySelector<HTMLElement>("[data-autofocus]");
      (auto || root).focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !isTop()) return;
      const root = ref.current;
      if (!root) return;
      const els = focusables(root);
      if (!els.length) { e.preventDefault(); root.focus(); return; }
      const first = els[0], last = els[els.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      else if (!root.contains(cur)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, isTop, ref]);
}

let locks = 0;
/** Prevent the page behind an open dialog from scrolling. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector<HTMLElement>("main");
    if (locks++ === 0) {
      document.body.style.overflow = "hidden";
      if (main) main.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0) {
        document.body.style.overflow = "";
        if (main) main.style.overflow = "";
      }
    };
  }, [active]);
}

/** Close a floating panel when the pointer goes down outside both the anchor and the panel. */
export function useOutsideClick(active: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void) {
  const cb = useRef(onOutside);
  useEffect(() => { cb.current = onOutside; });
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      cb.current();
    };
    document.addEventListener("pointerdown", h, true);
    return () => document.removeEventListener("pointerdown", h, true);
    // refs are stable objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

export type Placement = "bottom-start" | "bottom-end";

/** Fixed-position style for a floating panel under (or, if no room, above) an anchor.
 *  Recomputed on scroll and resize so panels never get clipped by overflow containers. */
export function useAnchorPosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  { placement = "bottom-start", offset = 6, matchWidth = false, maxHeight = 320, minWidth = 0 }:
    { placement?: Placement; offset?: number; matchWidth?: boolean; maxHeight?: number; minWidth?: number } = {},
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const below = vh - r.bottom - offset - 8;
      const above = r.top - offset - 8;
      const flip = below < Math.min(maxHeight, 220) && above > below;
      const s: CSSProperties = { position: "fixed", zIndex: 80, maxHeight: Math.max(120, Math.min(maxHeight, flip ? above : below)) };
      if (flip) s.bottom = vh - r.top + offset; else s.top = r.bottom + offset;
      if (placement === "bottom-end") s.right = Math.max(8, vw - r.right);
      else s.left = Math.min(r.left, Math.max(8, vw - Math.max(minWidth, matchWidth ? r.width : 0) - 8));
      if (matchWidth) s.width = Math.max(r.width, minWidth);
      else if (minWidth) s.minWidth = minWidth;
      setStyle(s);
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor, placement, offset, matchWidth, maxHeight, minWidth]);
  return style;
}

/** The value, updated only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Floating panel chrome: paper, hairline, soft layered shadow. */
export const floatingPanel =
  "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(27_27_34/0.04),0_12px_32px_-12px_rgb(27_27_34/0.22)]";

/** Shared input chrome. */
export const inputBase =
  "kit-bare w-full rounded-lg border bg-surface text-[14px] font-light text-ink placeholder:text-faint transition-colors focus:outline-none disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted";
export const inputBorder = (invalid?: boolean) =>
  invalid
    ? "border-rose-300 focus:border-rose-400 focus:ring-[3px] focus:ring-rose-100"
    : "border-line hover:border-line-strong focus:border-primary/60 focus:ring-[3px] focus:ring-primary/10";
export const focusWithinBorder = (invalid?: boolean, open?: boolean) =>
  invalid
    ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-[3px] focus-within:ring-rose-100"
    : open
      ? "border-primary/60 ring-[3px] ring-primary/10"
      : "border-line hover:border-line-strong focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/10";

export const ICON_STROKE = 1.4;
