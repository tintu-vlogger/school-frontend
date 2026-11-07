"use client";

/*
 * Modal: the one container for Add, Edit and View-details flows (modals, not drawers).
 *
 *   <Modal open={open} onClose={close} title="Add employee" size="lg" dirty={changed}
 *     footer={<><ModalCancel /><Button variant="primary" type="submit" form="emp-form">Save</Button></>}>
 *     ...form...
 *   </Modal>
 *
 * - size: sm 400px | md 560px | lg 720px | xl 960px | full (near full screen, for big forms).
 * - Sticky header and footer; only the body scrolls.
 * - Escape, the X button and a click on the backdrop all close it. With `dirty` set, closing
 *   first asks "Discard changes?". Inside the modal, `useModalClose()` (or <ModalCancel />)
 *   gives the same guarded close for your own Cancel buttons.
 * - `busy` blocks closing while a save is in flight.
 * - Focus is trapped inside, lands on the first `[data-autofocus]` element (else the panel),
 *   and returns to where it was on close. Portaled to document.body.
 * - Scale + fade in ~180 ms; opacity only when the user prefers reduced motion.
 *
 * ConfirmDialog: a small confirmation dialog (also see useConfirm in confirm.tsx).
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { Portal, cx, useEscape, useFocusTrap, useLayer, useScrollLock, ICON_STROKE } from "./internal";
import { Button, IconButton } from "./button";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Small visual at the left of the title, e.g. an <Avatar />. */
  leading?: ReactNode;
  /** Extra buttons in the header, left of the close button. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  /** Left side of the footer (e.g. a Delete button or step count). */
  footerStart?: ReactNode;
  size?: ModalSize;
  /** Ask before closing when there are unsaved changes. */
  dirty?: boolean;
  dirtyTitle?: string;
  dirtyMessage?: string;
  /** Prevent closing (e.g. while saving). */
  busy?: boolean;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  /** Remove the body padding (for full-bleed tables or tabs). */
  flush?: boolean;
  /** Stacking order; confirmations use 75 so they sit above any open modal. */
  zIndex?: number;
  /** Hide the close (X) button. */
  hideClose?: boolean;
  children?: ReactNode;
  "aria-label"?: string;
};

const widths: Record<ModalSize, string> = {
  sm: "w-full max-w-[400px]",
  md: "w-full max-w-[560px]",
  lg: "w-full max-w-[720px]",
  xl: "w-full max-w-[960px]",
  full: "w-full max-w-[1280px] h-full",
};

const ModalCtx = createContext<{ requestClose: () => void } | null>(null);

/** Inside a Modal: a close function that honours the `dirty` guard and `busy`. */
export function useModalClose() {
  const ctx = useContext(ModalCtx);
  return ctx?.requestClose ?? (() => {});
}

/** A ready-made Cancel button for modal footers (guarded close). */
export function ModalCancel({ children = "Cancel" }: { children?: ReactNode }) {
  const close = useModalClose();
  return <Button variant="secondary" onClick={close}>{children}</Button>;
}

export function Modal({
  open, onClose, title, description, leading, headerActions, footer, footerStart, size = "md",
  dirty, dirtyTitle = "Discard changes?", dirtyMessage = "You have changes that haven't been saved. They will be lost.",
  busy, closeOnBackdrop = true, bodyClassName, flush, hideClose, zIndex = 70, children, ...aria
}: ModalProps) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const isTop = useLayer(open);
  useScrollLock(open);
  useFocusTrap(panel, open, isTop);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setAsking(true);
    else onClose();
  };
  useEscape(open, isTop, requestClose);

  const full = size === "full";

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="modal"
            className={cx("fixed inset-0 flex justify-center overflow-y-auto", full ? "items-stretch p-3 sm:p-6" : "items-center p-3 sm:p-4")}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) requestClose(); }}
            style={{ zIndex, background: "rgb(22 22 29 / 0.32)", backdropFilter: "blur(2px)" }}
          >
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={aria["aria-label"] ?? (typeof title === "string" ? title : undefined)}
              tabIndex={-1}
              className={cx(
                "relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface outline-none",
                "shadow-[0_1px_2px_rgb(27_27_34/0.05),0_24px_64px_-24px_rgb(27_27_34/0.35)]",
                full ? "max-h-full" : "max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]",
                widths[size],
              )}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ModalCtx.Provider value={{ requestClose }}>
                {(title || headerActions) && (
                  <header className="flex flex-none items-start gap-3 border-b border-line px-6 py-4">
                    {leading && <div className="mt-0.5 shrink-0">{leading}</div>}
                    <div className="min-w-0 flex-1">
                      {title && <h2 className="truncate text-[17px] font-normal leading-7 text-ink">{title}</h2>}
                      {description && <p className="mt-0.5 text-[13.5px] leading-5 text-muted">{description}</p>}
                    </div>
                    <div className="-mr-2 flex shrink-0 items-center gap-1">
                      {headerActions}
                      {!hideClose && <IconButton icon={X} label="Close" onClick={requestClose} disabled={busy} />}
                    </div>
                  </header>
                )}
                {!title && !headerActions && !hideClose && (
                  <IconButton icon={X} label="Close" onClick={requestClose} disabled={busy} className="absolute right-3 top-3 z-10" />
                )}
                <div className={cx("hr-scroll min-h-0 flex-1 overflow-y-auto", !flush && "px-6 py-5", bodyClassName)}>{children}</div>
                {(footer || footerStart) && (
                  <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2">{footerStart}</div>
                    <div className="flex items-center gap-2">{footer}</div>
                  </footer>
                )}
              </ModalCtx.Provider>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Only dirty-aware modals carry a guard (ConfirmDialog is itself a Modal without `dirty`). */}
      {dirty !== undefined && <ConfirmDialog
        open={open && asking}
        title={dirtyTitle}
        message={dirtyMessage}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); onClose(); }}
      />}
    </Portal>
  );
}

/* ── ConfirmDialog ─────────────────────────────────────────────────────── */

export type ConfirmTone = "danger" | "primary";

export type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Shows a spinner on the confirm button and blocks closing. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "primary", loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const Icon = tone === "danger" ? AlertTriangle : HelpCircle;
  return (
    <Modal open={open} onClose={onCancel} size="sm" hideClose zIndex={75} busy={loading} aria-label={typeof title === "string" ? title : "Confirm"} bodyClassName="!px-6 !pt-6 !pb-5">
      <div className="flex gap-4">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-primary-soft text-primary")}>
          <Icon size={18} strokeWidth={ICON_STROKE} />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[16px] font-normal leading-6 text-ink">{title}</h2>
          {message && <div className="mt-1 text-[13.5px] leading-5 text-muted">{message}</div>}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading} data-autofocus>{cancelLabel}</Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
