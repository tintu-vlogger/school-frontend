"use client";

/*
 * A table of notification kinds with an email and a push switch for each.
 *   <ChannelGrid rows={[{ key, label, description, email, push }]} onChange={(key, patch) => ...} />
 * In-app notifications are always on, so they are shown but can't be switched off.
 */
import { Bell, Mail, Smartphone } from "lucide-react";
import { Toggle } from "@/components/ui-kit";

export type ChannelRow = { key: string; label: string; description: string; email: boolean; push: boolean; note?: string };

export function ChannelGrid({ rows, onChange, emailOff, pushOff }: {
  rows: ChannelRow[]; onChange: (key: string, patch: { email?: boolean; push?: boolean }) => void;
  emailOff?: boolean; pushOff?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-[1fr_64px_64px_64px] items-center gap-2 border-b border-line bg-canvas/60 px-4 py-2.5 text-[12px] text-faint">
        <span>Kind of message</span>
        <span className="flex flex-col items-center"><Bell size={15} strokeWidth={1.4} />In app</span>
        <span className="flex flex-col items-center"><Mail size={15} strokeWidth={1.4} />Email</span>
        <span className="flex flex-col items-center"><Smartphone size={15} strokeWidth={1.4} />Phone</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_64px_64px_64px] items-center gap-2 border-b border-line px-4 py-3 last:border-b-0">
          <div className="min-w-0">
            <p className="text-[14px] text-ink">{r.label}</p>
            <p className="text-[12.5px] text-muted">{r.description}</p>
            {r.note && <p className="text-[12px] text-faint">{r.note}</p>}
          </div>
          <div className="flex justify-center"><Toggle size="sm" checked disabled onChange={() => {}} aria-label={`${r.label} in app`} /></div>
          <div className="flex justify-center"><Toggle size="sm" checked={r.email} disabled={emailOff} onChange={(v) => onChange(r.key, { email: v })} aria-label={`${r.label} by email`} /></div>
          <div className="flex justify-center"><Toggle size="sm" checked={r.push} disabled={pushOff} onChange={(v) => onChange(r.key, { push: v })} aria-label={`${r.label} on the phone`} /></div>
        </div>
      ))}
    </div>
  );
}
