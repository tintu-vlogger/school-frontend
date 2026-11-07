"use client";

/*
 * My celebrations: whether my birthday and anniversaries show on Buzz, celebration
 * emails, and my wedding anniversary date. Birth years are never shown to anyone.
 *   <CelebrationPrivacyCard />   (renders nothing for the company owner)
 */
import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { DateInput, Field, Toggle } from "@/components/ui-kit";

type Prefs = {
  show_birthday: boolean; show_work_anniversary: boolean; show_wedding_anniversary: boolean; celebration_emails: boolean;
  has_birth_date: boolean; has_joining_date: boolean; wedding_date: string | null;
};

export function CelebrationPrivacyCard({ className = "" }: { className?: string }) {
  const toast = useToast();
  const [p, setP] = useState<Prefs | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { api.get<Prefs>("/engagement/me/celebrations").then(setP).catch(() => setHidden(true)); }, []);
  if (hidden) return null;

  async function save(patch: Partial<Prefs>) {
    const before = p;
    setP((cur) => (cur ? { ...cur, ...patch } : cur));
    try { setP(await api.put<Prefs>("/engagement/me/celebrations", patch)); toast.success("Saved"); }
    catch (e) { setP(before); toast.error((e as Error).message); }
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex items-center gap-3 border-b border-line px-6 py-4" style={{ background: "linear-gradient(120deg,#fdf2f8,#fffbeb)" }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-pink-600"><PartyPopper size={18} strokeWidth={1.5} /></span>
        <div>
          <h3 className="text-[15px] text-ink">My celebrations</h3>
          <p className="text-[12.5px] text-muted">Choose what colleagues see on Buzz. Your birth year is never shown.</p>
        </div>
      </header>
      {!p ? <div className="h-40 animate-pulse" /> : (
        <div className="space-y-4 px-6 py-5">
          <Toggle checked={p.show_birthday} onChange={(v) => save({ show_birthday: v })} label="Celebrate my birthday"
            description={p.has_birth_date ? "Shows the day and month on Buzz and the kiosk screens." : "Your date of birth isn't recorded yet, so nothing shows."} />
          <Toggle checked={p.show_work_anniversary} onChange={(v) => save({ show_work_anniversary: v })} label="Celebrate my work anniversary"
            description="How many years you've been with the company." />
          <Toggle checked={p.show_wedding_anniversary} onChange={(v) => save({ show_wedding_anniversary: v })} label="Celebrate my wedding anniversary" />
          {p.show_wedding_anniversary && (
            <Field label="Wedding date" hint="Only the day and month are shown.">
              <DateInput value={p.wedding_date ?? ""} clearable onChange={(v) => save({ wedding_date: v || null })} className="max-w-xs" />
            </Field>
          )}
          <Toggle checked={p.celebration_emails} onChange={(v) => save({ celebration_emails: v })} label="Send me celebration emails"
            description="A greeting email on your birthday and anniversaries." />
        </div>
      )}
    </section>
  );
}
