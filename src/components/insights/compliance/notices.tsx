"use client";

/* Law updates: dated notices with tags; unread ones can be marked as read (then muted). */
import { useState } from "react";
import { Check, Newspaper } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { Chip } from "@/components/shell/page";
import { Button, useToast } from "@/components/ui-kit";
import type { LawNotice } from "./types";

export function LawNotices({ notices, onChanged }: { notices: LawNotice[]; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [readNow, setReadNow] = useState<Set<string>>(new Set());

  async function markRead(n: LawNotice) {
    setBusy(n.key);
    try {
      await api.post("/compliance/records", { key: n.key, status: "read" });
      setReadNow((s) => new Set(s).add(n.key));
      onChanged();
    } catch (e) {
      toast.error("Couldn't mark it as read", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!notices.length) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center">
        <Newspaper size={24} strokeWidth={1.2} className="mb-3 text-faint" />
        <p className="text-[14px] text-ink">No law updates right now</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {notices.map((n) => {
        const read = n.read || readNow.has(n.key);
        return (
          <li key={n.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="w-28 shrink-0 text-[12.5px] text-faint sm:pt-0.5">{formatDate(n.date)}</div>
            <div className={`min-w-0 flex-1 transition-opacity ${read ? "opacity-60" : ""}`}>
              <p className="flex items-center gap-2 text-[14.5px] text-ink">
                {!read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                {n.title}
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{n.body}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {n.tags.map((t) => <Chip key={t}>{t}</Chip>)}
                {n.source && <span className="ml-1 text-[12px] text-faint">Source: {n.source}</span>}
              </div>
            </div>
            <div className="shrink-0">
              {read
                ? <span className="inline-flex items-center gap-1 text-[12.5px] text-faint"><Check size={14} strokeWidth={1.4} /> Read</span>
                : <Button size="sm" variant="ghost" loading={busy === n.key} onClick={() => markRead(n)}>Mark as read</Button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
