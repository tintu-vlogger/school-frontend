"use client";

import { formatDate } from "@/lib/datetime";
import { useEffect, useState } from "react";
import { Settings, Layers, CalendarRange, Ticket, Landmark, HandCoins, Plus, Trash2, Check, Sparkles, MessageCircle, GripVertical, RotateCcw } from "lucide-react";
import { platformApi } from "@/lib/platform-api";
import { PageHeader, Panel, Flash, Loading, Switch, Field, Pill, Empty, inputCls, btn } from "@/components/admin-ui";

const api = platformApi("/admin/login");
type Plan = { id: string; name: string; tagline: string; price: number; per_learner?: number; max_learners?: number; features: string[]; whatsapp: boolean; active: boolean; order: number; trial?: boolean; trial_days?: number; badge?: string };
type Period = { id: string; label: string; months: number; discount: number; coupons: boolean; active: boolean; order: number };
type UpiAccount = { id: string; label: string; upi_id: string; upi_name: string };
type Coupon = { code: string; percent: number; applies_to: "yearly"; starts_on?: string; expires_on: string; active: boolean };
type S = { price_standard: number; price_standard_whatsapp: number; first_payment_bonus: number; percent: number; percent_months: number; min_payout: number; upi_id: string; upi_name: string; support_phone: string; discount_12: number; coupons: Coupon[]; upi_accounts: UpiAccount[]; active_upi: string; plans: Plan[]; periods: Period[] };

/** Each tab owns a few settings and saves only those. */
const TABS = [
  { id: "plans", label: "Plans", icon: Layers, keys: ["plans"] },
  { id: "periods", label: "Payment choices", icon: CalendarRange, keys: ["periods"] },
  { id: "coupons", label: "Coupons", icon: Ticket, keys: ["coupons"] },
  { id: "payto", label: "Institutions pay to", icon: Landmark, keys: ["upi_accounts", "active_upi", "upi_id", "upi_name", "support_phone"] },
  { id: "commission", label: "Commission", icon: HandCoins, keys: ["first_payment_bonus", "percent", "percent_months", "min_payout"] },
] as const;
type TabId = (typeof TABS)[number]["id"];

const pick = (s: S, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, s[k as keyof S]])) as Partial<S>;
const same = (a: S, b: S, keys: readonly string[]) => JSON.stringify(pick(a, keys)) === JSON.stringify(pick(b, keys));

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState<S | null>(null);   // what the server has
  const [s, setS] = useState<S | null>(null);           // what is on screen
  const [tab, setTab] = useState<TabId>("plans");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<S>("/admin/settings").then((r) => { setSaved(r); setS(r); }).catch((e) => setMsg(e.message));
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === h)) setTimeout(() => setTab(h as TabId), 0);
  }, []);
  const go = (t: TabId) => { setTab(t); setMsg(""); history.replaceState(null, "", `#${t}`); };

  if (!s || !saved) return <div className="space-y-6"><PageHeader icon={Settings} title="Settings" />{msg ? <Flash msg={msg} onClose={() => setMsg("")} /> : <Loading />}</div>;

  const cur = TABS.find((t) => t.id === tab)!;
  const dirty = !same(s, saved, cur.keys);

  async function save() {
    if (!s || !saved) return;
    setBusy(true); setMsg("");
    try {
      const mine = pick(s, cur.keys);
      if (mine.plans) mine.plans = mine.plans.map((p) => ({ ...p, features: p.features.map((f) => f.trim()).filter(Boolean) }));
      // only this tab's changes go out; other tabs keep what the server has
      const r = await api.put<S>("/admin/settings", { ...saved, ...mine });
      setSaved(r);
      setS((d) => (d ? { ...d, ...pick(r, cur.keys) } : r));
      setMsg(`${cur.label} saved.${tab === "plans" || tab === "periods" ? " New prices and choices apply to new payments; institutions already paid keep their deal." : ""}`);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  const reset = () => setS({ ...s, ...pick(saved, cur.keys) });

  const saveBar = (
    <div className={`sticky bottom-4 z-20 mt-5 flex items-center justify-between gap-3 rounded-full border px-5 py-2.5 transition-all ${dirty ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-500"}`}>
      <span className="flex items-center gap-2 text-[13px] font-light">
        {dirty ? <><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />Unsaved changes in {cur.label}</> : <><Check size={14} strokeWidth={1.5} className="text-emerald-600" />{cur.label} is up to date</>}
      </span>
      <span className="flex items-center gap-2">
        {dirty && <button onClick={reset} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-light text-white/70 hover:text-white"><RotateCcw size={13} />Undo</button>}
        <button onClick={save} disabled={!dirty || busy}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-[13px] font-normal transition disabled:opacity-40 ${dirty ? "bg-white text-gray-900 hover:bg-gray-100" : "bg-gray-900 text-white"}`}>
          {busy ? "Saving…" : `Save ${cur.label.toLowerCase()}`}
        </button>
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={Settings} title="Settings" sub="Prices institutions see, how they pay, coupons, and how partners earn. Each tab saves on its own." />

      {/* tabs (same flat underline tabs as the company app) */}
      <div className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-gray-200/80 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const on = t.id === tab;
          const changed = !same(s, saved, t.keys);
          return (
            <button key={t.id} onClick={() => go(t.id)}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-[14px] font-normal transition-colors ${on ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
              <t.icon size={16} strokeWidth={1.5} className={on ? "text-gray-900" : "text-[#3a4557]"} />
              <span>{t.label}</span>
              {changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
            </button>
          );
        })}
      </div>

      <Flash msg={msg} onClose={() => setMsg("")} />

      <div className="max-w-4xl">
        {tab === "plans" && <PlansTab s={s} setS={setS} />}
        {tab === "periods" && <PeriodsTab s={s} setS={setS} />}
        {tab === "coupons" && <CouponsTab s={s} setS={setS} />}
        {tab === "payto" && <PayToTab s={s} setS={setS} />}
        {tab === "commission" && <CommissionTab s={s} setS={setS} />}
        {saveBar}
      </div>
    </div>
  );
}

type TabProps = { s: S; setS: (s: S) => void };

/* ── Plans ─────────────────────────────────────────────────────────── */
function PlansTab({ s, setS }: TabProps) {
  const add = () => setS({ ...s, plans: [...s.plans, { id: `plan_${Date.now().toString(36)}`, name: "", tagline: "", price: 0, per_learner: 0, max_learners: 0, features: [], whatsapp: false, active: false, order: s.plans.length + 1, trial: false, trial_days: 0, badge: "" }] });
  return (
    <Panel icon={Layers} title="Plans" pad={false}
      sub="What institutions can buy, and the free trial. Plans are learner tiers: set the learner limit, the rate per learner and the monthly price billed for the tier. Switched-off plans are hidden. New institutions start on the free trial plan for its number of days (institutions already registered keep their dates). Institutions on a paid plan keep what they paid for until their period ends."
      action={<button type="button" onClick={add} className={btn.ghost}><Plus size={14} strokeWidth={1.5} /> Add plan</button>}>
      <div className="divide-y divide-gray-100">
        {s.plans.map((pl, i) => {
          const set = (patch: Partial<Plan>) => setS({ ...s, plans: s.plans.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          const builtIn = pl.id === "standard" || pl.id === "standard_whatsapp";
          const setTrial = (on: boolean) => setS({ ...s, plans: s.plans.map((x, j) => (j === i ? { ...x, trial: on, trial_days: on ? (x.trial_days || 30) : 0, price: on ? 0 : x.price } : on ? { ...x, trial: false } : x)) });
          return (
            <div key={pl.id} className={`p-5 transition ${pl.trial ? "bg-emerald-50/30" : !pl.active ? "bg-gray-50/50" : ""}`}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <GripVertical size={14} className="text-gray-300" />
                <span className="text-[15px] font-normal text-gray-900">{pl.name || "Untitled plan"}</span>
                {pl.trial ? <Pill tone="green" dot>Free trial · new institutions start here</Pill> : pl.active ? <Pill tone="green" dot>On sale</Pill> : <Pill tone="gray" dot>Off</Pill>}
                {pl.whatsapp && <Pill tone="blue"><MessageCircle size={11} />WhatsApp</Pill>}
                {pl.badge && <Pill tone="amber"><Sparkles size={11} />{pl.badge}</Pill>}
                <span className="ml-auto font-mono text-[10.5px] text-gray-300">{pl.id}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_1.6fr_120px_140px]">
                <Field label="Name"><input value={pl.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Growth" className={inputCls} /></Field>
                <Field label="Short line"><input value={pl.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Shown under the name" className={inputCls} /></Field>
                {pl.trial
                  ? <Field label="Trial days"><input type="number" min={1} max={365} value={pl.trial_days || 0} onChange={(e) => set({ trial_days: Number(e.target.value) })} className={inputCls} /></Field>
                  : <Field label="₹ per month"><input type="number" min={0} value={pl.price} onChange={(e) => set({ price: Number(e.target.value) })} className={inputCls} /></Field>}
                <Field label="Badge"><input value={pl.badge || ""} onChange={(e) => set({ badge: e.target.value })} placeholder="e.g. Most popular" className={inputCls} /></Field>
              </div>
              {!pl.trial && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[140px_140px_1fr]">
                  <Field label="Up to (learners)"><input type="number" min={0} value={pl.max_learners || 0} onChange={(e) => set({ max_learners: Number(e.target.value) })} className={inputCls} /></Field>
                  <Field label="₹ per learner a month"><input type="number" min={0} value={pl.per_learner || 0} onChange={(e) => set({ per_learner: Number(e.target.value) })} className={inputCls} /></Field>
                  <div className="flex items-end pb-2.5 text-[12px] font-light text-gray-400">
                    {pl.per_learner && pl.max_learners ? <>Full tier at this rate: ₹{(pl.per_learner * pl.max_learners).toLocaleString("en-IN")} a month.{" "}
                      <button type="button" className="underline" onClick={() => set({ price: (pl.per_learner || 0) * (pl.max_learners || 0) })}>Use as price</button></> : "Learner limit 0 means no limit."}
                  </div>
                </div>
              )}
              <Field label="Features (one per line)" className="mt-3">
                <textarea rows={Math.max(2, pl.features.length)} value={pl.features.join("\n")} onChange={(e) => set({ features: e.target.value.split("\n") })}
                  className={`${inputCls} h-auto py-2.5 leading-relaxed`} />
              </Field>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Switch on={pl.active} onChange={(v) => set({ active: v })} label="On (institutions can buy it)" />
                <Switch on={pl.whatsapp} onChange={(v) => set({ whatsapp: v })} label="Includes WhatsApp notices and reminders" />
                <Switch on={!!pl.trial} onChange={setTrial} label="Free trial plan" hint="New institutions start on this plan for its number of days" />
                <label className="flex items-center gap-2 text-[12.5px] font-light text-gray-600">Order
                  <input type="number" value={pl.order} onChange={(e) => set({ order: Number(e.target.value) })} className="h-8 w-14 rounded-lg border border-gray-200 px-2 text-[13px] outline-none focus:border-[#5b9e8f]" />
                </label>
                {!builtIn && (
                  <button type="button" onClick={() => setS({ ...s, plans: s.plans.filter((_, j) => j !== i) })}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-light text-rose-600 hover:bg-rose-50"><Trash2 size={13} strokeWidth={1.5} /> Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Payment choices ───────────────────────────────────────────────── */
function PeriodsTab({ s, setS }: TabProps) {
  const add = () => {
    const used = new Set(s.periods.map((p) => p.months));
    const m = [3, 6, 2, 24, 18, 9].find((x) => !used.has(x)) ?? 6;
    setS({ ...s, periods: [...s.periods, { id: `m${m}`, label: `${m} months`, months: m, discount: 0, coupons: false, active: false, order: s.periods.length + 1 }] });
  };
  return (
    <Panel icon={CalendarRange} title="Payment choices" pad={false}
      sub="How long institutions can pay for at once, the discount for it, and whether coupon codes work. Switch a choice on or off any time."
      action={<button type="button" onClick={add} className={btn.ghost}><Plus size={14} strokeWidth={1.5} /> Add choice</button>}>
      <div className="hidden grid-cols-[1.4fr_100px_100px_120px_90px_36px] gap-3 border-b border-gray-100 px-5 py-2.5 text-[11px] font-normal uppercase tracking-[0.06em] text-gray-400 sm:grid">
        <span>Label</span><span>Months</span><span>% off</span><span>Coupons</span><span>Status</span><span />
      </div>
      <div className="divide-y divide-gray-100">
        {s.periods.map((pe, i) => {
          const set = (patch: Partial<Period>) => setS({ ...s, periods: s.periods.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={pe.id} className={`grid grid-cols-2 gap-3 px-5 py-3.5 sm:grid-cols-[1.4fr_100px_100px_120px_90px_36px] sm:items-center ${pe.active ? "" : "bg-gray-50/50"}`}>
              <input value={pe.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. 6 months" className={inputCls} />
              <input type="number" min={1} max={36} value={pe.months} onChange={(e) => set({ months: Number(e.target.value) })} className={inputCls} aria-label="Months" />
              <div className="relative"><input type="number" min={0} max={90} value={pe.discount} onChange={(e) => set({ discount: Number(e.target.value) })} className={`${inputCls} pr-7`} aria-label="% off" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">%</span></div>
              <Switch on={pe.coupons} onChange={(v) => set({ coupons: v })} label="Allowed" />
              <Switch on={pe.active} onChange={(v) => set({ active: v })} label={pe.active ? "On" : "Off"} />
              <button type="button" onClick={() => setS({ ...s, periods: s.periods.filter((_, j) => j !== i) })} title="Delete" className={`${btn.icon} hover:bg-rose-50 hover:text-rose-600`}><Trash2 size={14} strokeWidth={1.5} /></button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Coupons ───────────────────────────────────────────────────────── */
function CouponsTab({ s, setS }: TabProps) {
  const list = s.coupons || [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel icon={Ticket} title="Coupon codes" pad={false}
      sub={<>Extra % off an institution gets by entering the code on its Subscription page. Works only on payment choices where Coupons is Allowed, on top of that choice&apos;s discount.</>}
      action={<button type="button" onClick={() => setS({ ...s, coupons: [...list, { code: "", percent: 10, applies_to: "yearly", starts_on: "", expires_on: "", active: true }] })} className={btn.ghost}><Plus size={14} strokeWidth={1.5} /> Add coupon</button>}>
      {list.length === 0 ? <Empty icon={Ticket} title="No coupons yet" sub="Add one to give institutions an extra discount on the payment choices that allow it." /> : (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {list.map((c, i) => {
            const set = (patch: Partial<Coupon>) => setS({ ...s, coupons: list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            const expired = !!c.expires_on && c.expires_on < today;
            const upcoming = !!c.starts_on && c.starts_on > today;
            const nice = (d: string) => formatDate(d);
            return (
              <div key={i} className={`relative overflow-hidden rounded-2xl border p-4 ${c.active && !expired ? "border-gray-200" : "border-dashed border-gray-200 bg-gray-50/60"}`}>
                {/* ticket notches */}
                <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-gray-200 bg-gray-50" />
                <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-gray-200 bg-gray-50" />
                <div className="flex items-center gap-2">
                  <input value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="WELCOME10"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-dashed border-gray-300 bg-white px-3 font-mono text-[15px] uppercase tracking-[0.12em] text-gray-900 outline-none focus:border-[#5b9e8f]" />
                  <button type="button" onClick={() => setS({ ...s, coupons: list.filter((_, j) => j !== i) })} className={`${btn.icon} hover:bg-rose-50 hover:text-rose-600`} title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Field label="% off"><div className="relative"><input type="number" min={1} max={90} value={c.percent} onChange={(e) => set({ percent: Number(e.target.value) })} className={`${inputCls} pr-7`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">%</span></div></Field>
                  <Field label="Starts"><input type="date" value={c.starts_on || ""} max={c.expires_on || undefined} onChange={(e) => set({ starts_on: e.target.value })} className={`${inputCls} px-2`} /></Field>
                  <Field label="Ends"><input type="date" value={c.expires_on} min={c.starts_on || undefined} onChange={(e) => set({ expires_on: e.target.value })} className={`${inputCls} px-2`} /></Field>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Switch on={c.active} onChange={(v) => set({ active: v })} label="On" />
                  {!c.active ? <Pill>Off</Pill> : expired ? <Pill tone="red">Ended</Pill> : upcoming ? <Pill tone="blue" dot>Starts {nice(c.starts_on!)}</Pill> : <Pill tone="green" dot>Working now</Pill>}
                </div>
                <p className="mt-2 text-[11.5px] font-light text-gray-400">
                  {c.starts_on || c.expires_on
                    ? <>Works {c.starts_on ? `from ${nice(c.starts_on)}` : "from today"} {c.expires_on ? `to ${nice(c.expires_on)}` : "with no end date"}.</>
                    : "Leave the dates empty to make it work from today with no end."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ── Companies pay to ────────────────────────────────────────────────── */
function PayToTab({ s, setS }: TabProps) {
  const accounts = s.upi_accounts || [];
  const add = () => {
    const id = `acct${Date.now().toString(36)}`;
    setS({ ...s, upi_accounts: [...accounts, { id, label: "", upi_id: "", upi_name: s.upi_name || "" }], active_upi: s.active_upi || id });
  };
  return (
    <div className="space-y-5">
      <Panel icon={Landmark} title="Institutions pay to" pad={false}
        sub={<>Your bank accounts. The one marked <b className="font-normal text-gray-700">In use</b> is the QR institutions see on their Subscription page.</>}
        action={<button type="button" onClick={add} className={btn.ghost}><Plus size={14} strokeWidth={1.5} /> Add account</button>}>
        {accounts.length === 0 ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="UPI id"><input value={s.upi_id} onChange={(e) => setS({ ...s, upi_id: e.target.value })} placeholder="name@bank" className={inputCls} /></Field>
            <Field label="Name shown on the QR"><input value={s.upi_name} onChange={(e) => setS({ ...s, upi_name: e.target.value })} className={inputCls} /></Field>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            {accounts.map((a, i) => {
              const on = s.active_upi === a.id;
              const set = (patch: Partial<UpiAccount>) => setS({ ...s, upi_accounts: accounts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={a.id} className={`rounded-2xl border p-4 transition ${on ? "border-[#5b9e8f] bg-[#5b9e8f]/[0.04] ring-4 ring-[#5b9e8f]/10" : "border-gray-200"}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${on ? "bg-[#5b9e8f] text-white" : "bg-gray-100 text-[#3a4557]"}`}><Landmark size={15} strokeWidth={1.5} /></span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-normal text-gray-900">{a.label || "New account"}</span>
                    {on ? <Pill tone="green" dot>In use</Pill> : (
                      <button type="button" onClick={() => setS({ ...s, active_upi: a.id })} className={btn.ghost}>Use this</button>
                    )}
                    <button type="button" disabled={on} title={on ? "Choose another account first" : "Remove"}
                      onClick={() => setS({ ...s, upi_accounts: accounts.filter((_, j) => j !== i) })}
                      className={`${btn.icon} hover:bg-rose-50 hover:text-rose-600`}><Trash2 size={14} strokeWidth={1.5} /></button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr]">
                    <Field label="Bank"><input value={a.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. SBI ··7557" className={inputCls} /></Field>
                    <Field label="UPI id"><input value={a.upi_id} onChange={(e) => set({ upi_id: e.target.value.trim() })} placeholder="name@ybl" className={`${inputCls} font-mono`} /></Field>
                    <Field label="Name on the QR"><input value={a.upi_name} onChange={(e) => set({ upi_name: e.target.value })} className={inputCls} /></Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title="Support" sub="Shown to institutions when they need help with a payment.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Support phone"><input value={s.support_phone} onChange={(e) => setS({ ...s, support_phone: e.target.value })} className={inputCls} /></Field>
        </div>
      </Panel>
    </div>
  );
}

/* ── Commission ────────────────────────────────────────────────────── */
function CommissionTab({ s, setS }: TabProps) {
  const num = (k: keyof S) => ({ type: "number" as const, value: s[k] as number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) }), className: inputCls });
  return (
    <Panel icon={HandCoins} title="Partner commission" sub="What a marketing partner earns from the institutions they bring in.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bonus on an institution's first payment (₹)"><input {...num("first_payment_bonus")} /></Field>
        <Field label="Share of each payment (%)"><input {...num("percent")} /></Field>
        <Field label="For the first N months of paid service"><input {...num("percent_months")} /></Field>
        <Field label="Minimum payout (₹)"><input {...num("min_payout")} /></Field>
      </div>
      <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 text-[12.5px] font-light leading-relaxed text-gray-600">
        Example: an institution pays ₹1,250. The partner earns <b className="font-normal text-gray-900">₹{s.first_payment_bonus}</b> bonus on the first payment, plus{" "}
        <b className="font-normal text-gray-900">{s.percent}%</b> (₹{Math.round(1250 * (s.percent || 0) / 100)}) of each payment for the first {s.percent_months} months. They can withdraw once they have ₹{s.min_payout}.
      </div>
    </Panel>
  );
}
