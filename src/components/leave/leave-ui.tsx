"use client";

/*
 * Small building blocks shared by the leave pages: the leave type icon, status badge,
 * day counts, date ranges and the balance card.
 *   <LeaveIcon name="sun" color="#4f46e5" />   <StatusBadge status="pending" />   <BalanceCardView card={c} onApply={...} />
 */
import {
  Ban, Baby, Briefcase, Calendar, Clock, Coffee, Flower2, Gift, GraduationCap, HandHeart, Heart, Home, Moon, PartyPopper,
  Plane, Star, Stethoscope, Sun, Thermometer, Umbrella, type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui-kit";
import { formatDate } from "@/lib/datetime";
import type { BalanceCard } from "./types";

export const ICONS: Record<string, LucideIcon> = {
  plane: Plane, sun: Sun, coffee: Coffee, thermometer: Thermometer, baby: Baby, heart: Heart, flower: Flower2, home: Home,
  briefcase: Briefcase, calendar: Calendar, gift: Gift, "graduation-cap": GraduationCap, stethoscope: Stethoscope,
  umbrella: Umbrella, clock: Clock, moon: Moon, star: Star, "party-popper": PartyPopper, ban: Ban, "hand-heart": HandHeart,
};

export const STROKE = 1.4;

export function LeaveIcon({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  const Icon = ICONS[name] ?? Plane;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}26` }}>
      <Icon size={Math.round(size * 0.48)} strokeWidth={STROKE} />
    </span>
  );
}

export function TypeDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warn" }, approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" }, cancelled: { label: "Cancelled", tone: "neutral" },
  cancel_pending: { label: "Cancellation pending", tone: "info" }, expired: { label: "Expired", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function fmtDays(n: number | null | undefined, short = false) {
  const v = Number(n ?? 0);
  const t = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  if (short) return t;
  return `${t} ${Math.abs(v) === 1 ? "day" : "days"}`;
}

export function dateRange(from: string, to: string) {
  if (from === to) return formatDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? formatDate(from, { year: undefined }) : formatDate(from)} – ${formatDate(to)}`;
}

export const UNIT_LABEL: Record<string, string> = { day: "Full day", half_day: "Half day", quarter_day: "Quarter day", hour: "Hours" };

export function unitText(unit: string, half?: string | null, hours?: number | null) {
  if (unit === "day") return "";
  if (unit === "hour") return `${hours ?? ""} h`;
  return `${unit === "half_day" ? "Half day" : "Quarter day"}${half ? ` · ${half === "first" ? "first half" : "second half"}` : ""}`;
}

/** A balance card: big available number, a thin usage bar and the year's movements. */
export function BalanceCardView({ card, onApply, onHistory }: { card: BalanceCard; onApply?: () => void; onHistory?: () => void }) {
  const t = card.type;
  const earned = card.opening + card.accrued + card.granted + card.adjusted;
  const used = card.availed + card.booked;
  const pct = earned > 0 ? Math.min(100, Math.max(0, (used / earned) * 100)) : 0;
  const grant = t.mode === "grant";
  const unpaid = t.kind === "lop" || t.paid !== "paid";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.color, opacity: 0.55 }} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <LeaveIcon name={t.icon} color={t.color} />
          <div className="min-w-0">
            <p className="truncate text-[14.5px] text-ink">{t.name}</p>
            <p className="text-[12px] text-faint">{t.code}{t.statutory ? " · statutory" : ""}{card.year_text ? ` · ${card.year_text}` : ""}</p>
          </div>
        </div>
        {!card.applicable && <Badge>Not eligible</Badge>}
      </div>

      {grant ? (
        <div className="mt-5">
          <p className="text-[13px] text-muted">Granted on request</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-faint">
            {t.grant_options.slice(0, 3).map((o) => <li key={o.key} className="flex justify-between gap-2"><span className="truncate">{o.label}</span><span className="tabular text-muted">{fmtDays(o.days)}</span></li>)}
          </ul>
          {card.availed > 0 && <p className="mt-2 text-[12.5px] text-muted">Taken this year: {fmtDays(card.availed)}</p>}
        </div>
      ) : unpaid ? (
        <div className="mt-5">
          <p className="text-[13px] text-muted">Unpaid; deducted from salary</p>
          <p className="mt-1 text-[12.5px] text-faint">Taken this year: {fmtDays(card.availed)}</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <p className="tabular text-[34px] font-extralight leading-none tracking-tight text-ink">{fmtDays(card.available, true)}</p>
              <p className="mt-1.5 text-[12.5px] text-muted">available{card.booked > 0 ? ` · ${fmtDays(card.booked)} waiting` : ""}</p>
            </div>
            {typeof card.to_come === "number" && card.to_come > 0 && (
              <p className="text-right text-[12px] text-faint">+{fmtDays(card.to_come)}<br />still to come</p>
            )}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: t.color, opacity: 0.7 }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <Mini label="Opening" value={card.opening} />
            <Mini label="Earned" value={card.accrued + card.granted} />
            <Mini label="Taken" value={card.availed} />
          </dl>
          {(card.lapsed > 0 || card.encashed > 0 || card.adjusted !== 0) && (
            <p className="mt-2 text-[11.5px] text-faint">
              {[card.adjusted !== 0 && `Adjusted ${card.adjusted > 0 ? "+" : ""}${fmtDays(card.adjusted, true)}`,
                card.encashed > 0 && `Encashed ${fmtDays(card.encashed, true)}`,
                card.lapsed > 0 && `Lapsed ${fmtDays(card.lapsed, true)}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {!!card.expiring_soon?.length && (
            <p className="mt-2 text-[12px] text-amber-700">
              {fmtDays(card.expiring_soon.reduce((a, b) => a + b.days, 0))} expire by {formatDate(card.expiring_soon[0].expires_on)}
            </p>
          )}
        </>
      )}
      {(onApply || onHistory) && (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[13px]">
          {onApply && card.applicable && <button type="button" onClick={onApply} className="text-primary hover:underline">Apply</button>}
          {onHistory && <button type="button" onClick={onHistory} className="text-muted hover:text-ink">History</button>}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="tabular text-ink/80">{fmtDays(value, true)}</dd>
    </div>
  );
}

export const LEDGER_KIND: Record<string, string> = {
  opening: "Opening balance", accrual: "Credited", availed: "Leave taken", restored: "Leave cancelled (returned)",
  adjustment: "Manual change", encashed: "Encashed", lapsed: "Lapsed", carried_out: "Carried to next year",
  carry_forward: "Carried forward", expired: "Expired", grant: "Granted", comp_off: "Comp off earned",
};
