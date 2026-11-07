"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import en from "./messages/en.json";
import ml from "./messages/ml.json";
import hi from "./messages/hi.json";
import ta from "./messages/ta.json";

export type Locale = "en" | "ml" | "hi" | "ta";
type Messages = typeof en;

const messages: Record<Locale, Messages> = { en, ml, hi, ta };

export const LANGUAGES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
];

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("hrms_locale") as Locale;
    if (saved && saved in messages) {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem("hrms_locale", l);
  }

  function t(key: string): string {
    const parts = key.split(".");
    // Try current locale first, fallback to English
    for (const loc of [locale, "en"] as Locale[]) {
      let value: unknown = messages[loc];
      let found = true;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          found = false;
          break;
        }
      }
      if (found && typeof value === "string") return value;
    }
    return key;
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
