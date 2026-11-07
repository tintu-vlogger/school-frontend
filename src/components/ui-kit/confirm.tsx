"use client";

/*
 * useConfirm(): promise-based confirmation, no local state needed.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Deactivate Finance?", message: "...", confirmLabel: "Deactivate", tone: "danger" })) { ... }
 *
 * Pass `onConfirm` (async) to keep the dialog open with a spinner until the work finishes;
 * if it throws, the dialog closes and the promise resolves false (show your own toast).
 * <ConfirmProvider> is mounted once in src/lib/providers.tsx. For a fully controlled
 * dialog use <ConfirmDialog open ... /> from modal.tsx.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmTone } from "./modal";

export type ConfirmOptions = {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm?: () => Promise<unknown> | unknown;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    resolver.current?.(false);
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  const finish = (v: boolean) => {
    setOpen(false);
    setLoading(false);
    resolver.current?.(v);
    resolver.current = null;
  };

  async function accept() {
    if (opts?.onConfirm) {
      setLoading(true);
      try { await opts.onConfirm(); finish(true); }
      catch { finish(false); }
    } else finish(true);
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={open}
        title={opts?.title ?? ""}
        message={opts?.message}
        confirmLabel={opts?.confirmLabel}
        cancelLabel={opts?.cancelLabel}
        tone={opts?.tone}
        loading={loading}
        onConfirm={accept}
        onCancel={() => finish(false)}
      />
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}
