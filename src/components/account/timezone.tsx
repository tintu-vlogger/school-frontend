"use client";

/*
 * Timezone pieces for the signed-in person:
 * - TimezoneSuggestion: a slim banner offering to save the browser's timezone when it
 *   differs from the saved one (shown on first sign-in from such a device).
 * - TimezoneCard: the profile setting (own timezone, or follow the company's).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Globe2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { allTimeZones, formatTime, timeZoneOffsetLabel } from "@/lib/datetime";
import { SearchableSelect } from "@/components/ui";
import { Paper, PaperHeader, btn } from "@/components/shell/page";

async function saveTimezone(tz: string | null) {
  await api.put("/auth/me/timezone", { timezone: tz });
}

export function TimezoneSuggestion({ showProfileLink = false }: { showProfileLink?: boolean }) {
  const { timezoneSuggestion, dismissTimezoneSuggestion, refresh, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (!timezoneSuggestion || !user) return null;

  async function accept() {
    setSaving(true);
    try {
      await saveTimezone(timezoneSuggestion);
      await refresh();
      toast.success("Timezone saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the timezone");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary-soft px-4 py-3">
      <Globe2 size={18} strokeWidth={1.4} className="text-primary" />
      <p className="min-w-0 flex-1 text-[13.5px] text-ink">
        This device is set to <span className="text-primary">{timezoneSuggestion.replace(/_/g, " ")}</span>, but times are
        shown in {user.timezone?.replace(/_/g, " ")}. Use this device&apos;s timezone?
        {showProfileLink && <Link href="/dashboard/profile" className="ml-1 text-muted underline-offset-2 hover:underline">Change it later in your profile.</Link>}
      </p>
      <button onClick={accept} disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Use it"}</button>
      <button onClick={dismissTimezoneSuggestion} className="rounded-lg p-2 text-muted hover:bg-surface" aria-label="Not now">
        <X size={16} strokeWidth={1.4} />
      </button>
    </div>
  );
}

const FOLLOW_COMPANY = "__company__";

export function TimezoneCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => {
    const now = new Date();
    return [
      { value: FOLLOW_COMPANY, label: `Same as the company (${(user?.company_timezone || "Asia/Kolkata").replace(/_/g, " ")})` },
      ...allTimeZones().map((tz) => ({
        value: tz,
        label: tz.replace(/_/g, " "),
        description: `${timeZoneOffsetLabel(tz, now)} · now ${formatTime(now, tz)}`,
        searchTerms: tz,
      })),
    ];
  }, [user?.company_timezone]);

  if (!user) return null;
  const value = user.timezone_source === "own" ? user.timezone ?? FOLLOW_COMPANY : FOLLOW_COMPANY;

  async function change(v: string | number) {
    setSaving(true);
    try {
      await saveTimezone(v === FOLLOW_COMPANY ? null : String(v));
      await refresh();
      toast.success("Timezone saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the timezone");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper>
      <PaperHeader title="Timezone" />
      <div className="space-y-3 px-5 py-4">
        <p className="text-[13.5px] text-muted">
          Every date and time in the app is shown in this timezone. It is now {formatTime(new Date())} for you.
        </p>
        <SearchableSelect options={options} value={value} onChange={change} disabled={saving} placeholder="Choose a timezone" />
      </div>
    </Paper>
  );
}
