"use client";

import { ReactNode } from "react";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./toast-context";
import { I18nProvider } from "@/i18n/provider";
import { LiveTranslate } from "@/i18n/live-translate";
import { ConfirmProvider } from "@/components/ui-kit/confirm";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <LiveTranslate />
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
