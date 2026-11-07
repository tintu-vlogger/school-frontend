"use client";

/*
 * Portal helpers for fees: the child picker (parents with several children) and online
 * checkout for each payment provider (test, Razorpay, Stripe, Cashfree, PayU).
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { Tabs } from "@/components/ui-kit";
import type { StudentBrief } from "./shared";

export function useMyChildren() {
  const { portalRole } = useAccess();
  const [kids, setKids] = useState<StudentBrief[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get<StudentBrief[]>("/students/mine").then((r) => { if (live) setKids(r); }).catch(() => { if (live) setKids([]); });
    return () => { live = false; };
  }, []);
  const studentId = picked ?? kids?.[0]?.id ?? null;
  return { kids, studentId, setStudentId: setPicked, isParent: portalRole === "parent" };
}

export function ChildPicker({ kids, value, onChange }: { kids: StudentBrief[] | null; value: number | null; onChange: (id: number) => void }) {
  if (!kids || kids.length < 2 || value === null) return null;
  return (
    <Tabs variant="pill" value={String(value)} onChange={(v) => onChange(Number(v))}
      items={kids.map((k) => ({ value: String(k.id), label: k.name.split(" ")[0] }))} />
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The payment page could not be loaded. Check your connection."));
    document.body.appendChild(s);
  });
}

export type OrderResult = {
  order: string; provider: string; test_mode: boolean; amount: number; currency: string; description: string; institution: string;
  checkout?: Record<string, unknown>; redirect_url?: string; form?: { action: string; fields: Record<string, string> };
};

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: () => void) => void };
type CashfreeCtor = (opts: { mode: string }) => { checkout: (o: Record<string, unknown>) => Promise<unknown> };

/** Open the provider's checkout. Resolves with "verified" (Razorpay, after the server confirmed),
 *  "redirected" (the browser is leaving for the provider) or "dismissed". Test orders are
 *  handled by the page (a simulated checkout). */
export async function openCheckout(o: OrderResult): Promise<"verified" | "redirected" | "dismissed"> {
  if (o.provider === "razorpay" && o.checkout) {
    await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
    return new Promise((resolve, reject) => {
      const rz = new Razorpay({
        ...o.checkout,
        theme: { color: "#4f46e5" },
        handler: async (resp: Record<string, string>) => {
          try { await api.post(`/fees/portal/orders/${o.order}/verify`, resp); resolve("verified"); } catch (e) { reject(e); }
        },
        modal: { ondismiss: () => resolve("dismissed") },
      });
      rz.open();
    });
  }
  if (o.provider === "stripe" && o.redirect_url) {
    window.location.href = o.redirect_url;
    return "redirected";
  }
  if (o.provider === "cashfree" && o.checkout) {
    await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
    const Cashfree = (window as unknown as { Cashfree: CashfreeCtor }).Cashfree;
    await Cashfree({ mode: String(o.checkout.mode) }).checkout({ paymentSessionId: o.checkout.payment_session_id, redirectTarget: "_self" });
    return "redirected";
  }
  if (o.provider === "payu" && o.form) {
    const f = document.createElement("form");
    f.method = "POST"; f.action = o.form.action;
    for (const [k, v] of Object.entries(o.form.fields)) {
      const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i);
    }
    document.body.appendChild(f); f.submit();
    return "redirected";
  }
  throw new Error("Online payment is not available right now.");
}
