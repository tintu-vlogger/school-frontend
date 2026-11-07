"use client";

/*
 * App-wide toasts. `const toast = useToast(); toast.success("Saved")`.
 * Each method takes an optional second argument: { description, duration, action }.
 * Drawn by ToastViewport from the UI kit (bottom-right stack, at most three).
 */
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { ToastViewport, type ToastItem, type ToastOptions, type ToastTone } from "@/components/ui-kit/toast";

type ToastFn = (message: string, opts?: ToastOptions) => void;

interface ToastContextType {
  toast: { success: ToastFn; error: ToastFn; warning: ToastFn; info: ToastFn };
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastTone, opts?: ToastOptions) => {
    const id = ++nextId;
    setToasts((prev) => [...prev.filter((t) => t.message !== message), { id, message, type, ...opts }].slice(-3));
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Stable identity so pages can list `toast` in hook dependencies.
  const value = useMemo<ToastContextType>(() => ({
    toast: {
      success: (m, o) => addToast(m, "success", o),
      error: (m, o) => addToast(m, "error", o),
      warning: (m, o) => addToast(m, "warning", o),
      info: (m, o) => addToast(m, "info", o),
    },
  }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context.toast;
}
