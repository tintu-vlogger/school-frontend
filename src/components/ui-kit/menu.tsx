"use client";

/*
 * Menu: a dropdown of actions, portaled so it is never clipped.
 *   <Menu items={[{ label: "Edit", icon: Pencil, onSelect: edit }, "separator", { label: "Delete", icon: Trash2, danger: true, onSelect: del }]} />
 * Default trigger is a "more" (three dots) icon button; pass `trigger` for your own
 * (any element, it is wrapped and toggles the menu on click). align: "end" (default) | "start".
 * Keyboard: arrows move, Enter selects, Escape/Tab close.
 */
import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { Portal, cx, floatingPanel, useAnchorPosition, useEscape, useLayer, useOutsideClick, ICON_STROKE } from "./internal";
import { IconButton, type IconType } from "./button";

export type MenuAction = { label: string; icon?: IconType; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string };
export type MenuItem = MenuAction | "separator";

export type MenuProps = {
  items: MenuItem[];
  trigger?: ReactNode;
  label?: string;
  align?: "start" | "end";
  className?: string;
};

export function Menu({ items, trigger, label = "More actions", align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const isTop = useLayer(open);
  const style = useAnchorPosition(anchor, open, { placement: align === "end" ? "bottom-end" : "bottom-start", minWidth: 180, maxHeight: 360 });
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) anchor.current?.querySelector<HTMLElement>("button,[tabindex]")?.focus();
  };
  useEscape(open, isTop, () => close());
  useOutsideClick(open, [anchor, panel], () => close(false));

  const buttons = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
  function onKey(e: React.KeyboardEvent) {
    const els = buttons();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Tab") close();
  }

  return (
    <>
      <span ref={anchor} className={cx("inline-flex", className)}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); requestAnimationFrame(() => buttons()[0]?.focus()); }}>
        {trigger ?? <IconButton icon={MoreHorizontal} label={label} aria-haspopup="menu" aria-expanded={open} />}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panel}
              role="menu"
              style={style}
              onKeyDown={onKey}
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={cx(floatingPanel, "hr-scroll overflow-y-auto p-1")}
            >
              {items.map((it, i) =>
                it === "separator" ? <div key={i} className="my-1 h-px bg-line" /> : (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => { close(false); it.onSelect(); }}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none transition-colors disabled:opacity-40",
                      it.danger ? "text-rose-700 hover:bg-rose-50 focus:bg-rose-50" : "text-ink hover:bg-sunken focus:bg-sunken",
                    )}
                  >
                    {it.icon && <it.icon size={15} strokeWidth={ICON_STROKE} className={it.danger ? "text-rose-600" : "text-muted"} />}
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="text-[12px] text-faint">{it.hint}</span>}
                  </button>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
