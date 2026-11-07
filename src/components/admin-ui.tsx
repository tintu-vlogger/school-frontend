"use client";

/*
 * Small UI kit for the admin area and the partner portal: page header, panels, KPI
 * cards, outline status pills, switches, segmented controls, modals and the flash
 * message. Light paper look: white cards, hairline borders, light type, one teal accent.
 */
import { useEffect } from "react";
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from "lucide-react";

export const ACCENT = "#5b9e8f";

export const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13.5px] font-light text-gray-900 outline-none transition placeholder:text-gray-300 hover:border-gray-300 focus:border-[#5b9e8f] focus:ring-4 focus:ring-[#5b9e8f]/10";

export const btn = {
  primary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-gray-900 px-4 text-[13px] font-normal text-white transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
  ghost: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-[13px] font-light text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40",
  danger: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 text-[13px] font-normal text-white transition hover:bg-rose-700 disabled:opacity-40",
  icon: "inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30",
};

export function PageHeader({ icon: Icon, title, sub, actions }: { icon?: React.ElementType; title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white">
            <Icon size={19} strokeWidth={1.4} className="text-[#3a4557]" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-gray-900">{title}</h1>
          {sub && <p className="mt-0.5 max-w-2xl text-[13px] font-light leading-relaxed text-gray-500">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, sub, icon: Icon, action, children, className = "", pad = true, id }: {
  title?: string; sub?: React.ReactNode; icon?: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean; id?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-6 overflow-hidden rounded-[22px] border border-gray-200/80 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-50"><Icon size={16} strokeWidth={1.5} className="text-[#3a4557]" /></span>}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-normal text-gray-900">{title}</h2>}
              {sub && <p className="mt-0.5 text-[12.5px] font-light leading-relaxed text-gray-500">{sub}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/** KPI card: icon circle, small label, big light value and an optional hint or bar. */
export function Stat({ icon: Icon, label, value, hint, bar, tone = "gray" }: {
  icon: React.ElementType; label: string; value: React.ReactNode; hint?: React.ReactNode; bar?: number; tone?: "gray" | "teal" | "blue" | "amber";
}) {
  const tones = { gray: "bg-gray-100 text-[#3a4557]", teal: "bg-[#5b9e8f]/12 text-[#3f7d70]", blue: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700" };
  return (
    <div className="rounded-[22px] border border-gray-200/80 bg-white p-[18px]">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tones[tone]}`}><Icon size={15} strokeWidth={1.5} /></span>
        <span className="text-[12.5px] font-light text-gray-500">{label}</span>
      </div>
      <p className="mt-3 text-[28px] font-light leading-none tracking-[-0.02em] text-gray-900 tabular-nums">{value}</p>
      {bar != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: ACCENT }} />
        </div>
      )}
      {hint && <p className="mt-2 text-[12px] font-light text-gray-400">{hint}</p>}
    </div>
  );
}

const PILL: Record<string, string> = {
  green: "border-emerald-200 text-emerald-700 bg-emerald-50/40",
  blue: "border-sky-200 text-sky-700 bg-sky-50/40",
  amber: "border-amber-200 text-amber-700 bg-amber-50/40",
  red: "border-rose-200 text-rose-700 bg-rose-50/40",
  gray: "border-gray-200 text-gray-500 bg-white",
  dark: "border-gray-900 text-white bg-gray-900",
};
export function Pill({ tone = "gray", dot = false, children, className = "" }: { tone?: keyof typeof PILL; dot?: boolean; children: React.ReactNode; className?: string }) {
  const dotColor = { green: "bg-emerald-500", blue: "bg-sky-500", amber: "bg-amber-500", red: "bg-rose-500", gray: "bg-gray-300", dark: "bg-emerald-400" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-normal ${PILL[tone]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}{children}
    </span>
  );
}

const AVATAR_TONES = ["#5b9e8f", "#6b8fc4", "#c48a6b", "#8f7bc4", "#c46b8f", "#7ba86b", "#c4a96b"];
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const clean = (name || "?").replace(/^(dr\.?\s+)/i, "").trim();
  const letters = clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const c = AVATAR_TONES[[...clean].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className="flex flex-shrink-0 items-center justify-center rounded-full font-normal"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `${c}1f`, color: c }}>{letters}</span>
  );
}

export function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex select-none items-center gap-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`} title={hint}>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
        className={`relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors ${on ? "bg-[#5b9e8f]" : "bg-gray-200"}`}>
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[19px]" : "left-[3px]"}`} />
      </button>
      {label && <span className="text-[12.5px] font-light text-gray-600">{label}</span>}
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: React.ReactNode; count?: number }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-gray-200 bg-white p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 ${size === "sm" ? "h-7 text-[12px]" : "h-8 text-[12.5px]"} transition ${on ? "bg-gray-900 font-normal text-white" : "font-light text-gray-600 hover:text-gray-900"}`}>
            {o.label}
            {o.count != null && <span className={`rounded-full px-1.5 text-[10.5px] ${on ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12px] font-light text-gray-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-light text-gray-400">{hint}</span>}
    </label>
  );
}

/** Flash message under the page header. */
export function Flash({ msg, onClose }: { msg: string; onClose: () => void }) {
  if (!msg) return null;
  const bad = /fail|error|not |could|invalid|denied|wrong|must|only one|at least/i.test(msg);
  const Icon = bad ? AlertTriangle : /saved|recorded|confirmed|added|copied|removed|enabled|disabled|extended|set for|paid|rejected|activated/i.test(msg) ? CheckCircle2 : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[13px] font-light ${bad ? "border-rose-200 bg-rose-50/60 text-rose-800" : "border-emerald-200 bg-emerald-50/50 text-emerald-900"}`}>
      <Icon size={16} strokeWidth={1.5} className="mt-px flex-shrink-0" />
      <span className="flex-1 leading-relaxed">{msg}</span>
      <button onClick={onClose} aria-label="Dismiss" className="-m-1 rounded-full p-1 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

export function Modal({ title, sub, icon: Icon, tone = "gray", onClose, children, footer, width = "max-w-md", closeOnBackdrop = true }: {
  title: React.ReactNode; sub?: React.ReactNode; icon?: React.ElementType; tone?: "gray" | "red" | "green"; onClose: () => void;
  children?: React.ReactNode; footer?: React.ReactNode; width?: string; closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const ring = { gray: "bg-gray-100 text-[#3a4557]", red: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-600" }[tone];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/30 p-0 backdrop-blur-[3px] animate-[fadeIn_.15s_ease-out] sm:items-center sm:p-4" onClick={closeOnBackdrop ? onClose : undefined}>
      <div className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-t-[26px] bg-white border border-gray-200 animate-[popIn_.18s_ease-out] sm:rounded-[26px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 pt-6">
          {Icon && <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${ring}`}><Icon size={18} strokeWidth={1.5} /></span>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-normal tracking-[-0.01em] text-gray-900">{title}</h2>
            {sub && <p className="mt-0.5 text-[12.5px] font-light leading-relaxed text-gray-500">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className={btn.icon}><X size={16} strokeWidth={1.5} /></button>
        </div>
        {children && <div className="px-6 pt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-6 py-4">{footer}</div>}
        {!footer && <div className="h-6" />}
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes popIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

export function Loading() {
  return <div className="flex h-48 items-center justify-center text-gray-300"><Loader2 size={22} className="animate-spin" /></div>;
}

export function Empty({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50"><Icon size={20} strokeWidth={1.4} className="text-gray-400" /></span>
      <p className="mt-3 text-[14px] font-normal text-gray-700">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-[12.5px] font-light text-gray-400">{sub}</p>}
    </div>
  );
}

/** Table helpers for the same look everywhere. */
export const th = "px-4 py-3 text-left text-[11.5px] font-normal uppercase tracking-[0.06em] text-gray-400";
export const td = "px-4 py-3.5 align-middle";
