"use client";

/*
 * Helpers for the public hiring pages (careers, offer, reference): no sign-in.
 *   const slug = useCompanySlug();              // from the company's own address (or ?company=)
 *   const data = await publicFetch<T>("/public/careers/acme");
 *   useEmbedHeight(embed);                      // tells the parent page our height (widget)
 */
import { useEffect, useState, type ReactNode } from "react";
import { API_BASE, resolveImageUrl } from "@/lib/api";
import { companyAddress } from "@/components/workplace/files";

export function useCompanySlug(): string | null | undefined {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const fromHost = companyAddress();
    const q = new URLSearchParams(window.location.search).get("company");
    setSlug(fromHost ?? q ?? null);
  }, []);
  return slug;
}

export async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error("Unable to connect. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Something went wrong. Please try again.");
  }
  return res.json();
}

export const postJson = <T,>(path: string, body: unknown) =>
  publicFetch<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function useEmbedHeight(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || window.parent === window) return;
    const send = () => window.parent.postMessage({ hrmsCareersHeight: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, [enabled]);
}

export function CompanyMark({ name, logo, accent }: { name?: string | null; logo?: string | null; accent?: string | null }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveImageUrl(logo)} alt={name ?? ""} className="h-9 max-w-[160px] object-contain" />;
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[15px] text-white" style={{ background: accent || "#4f46e5" }}>
      {(name ?? "?").slice(0, 1)}
    </span>
  );
}

export function PublicCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function PublicMessage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-[20px] font-light text-ink">{title}</p>
      {hint && <p className="mt-2 text-[14px] text-muted">{hint}</p>}
    </div>
  );
}

export function rupees(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : String(v);
}
