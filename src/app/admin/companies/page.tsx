"use client";

import { formatDate } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { Loader2, IndianRupee, CalendarPlus, History, Search, Power, Trash2, AlertTriangle, Plus, Copy, Check, Building2, BadgeCheck, Hourglass, Receipt, BellRing, MoreHorizontal, PanelRight, ExternalLink, ArrowUpDown, ChevronDown, Rows3, LayoutGrid, X, Globe, Mail, Phone, MapPin } from "lucide-react";
import { PageHeader, Stat, Flash, Loading, Empty, Pill, Avatar, Segmented, Modal, Field, inputCls, btn, th, td } from "@/components/admin-ui";
import { platformApi, rupee } from "@/lib/platform-api";

const api = platformApi("/admin/login");

type Sub = { plan: string; plan_name?: string; paid: boolean; whatsapp: boolean; status: "active" | "trial" | "grace" | "expired"; trial_ends_at: string | null; paid_until: string | null; days_left: number | null };
type Company = { id: number; name: string; slug: string; email: string; phone: string | null; city: string | null; created_at: string | null; employees: number; industry: string | null; subscription: Sub; paid_total: number; referred_by: { id: number; name: string; ref_code: string } | null; demo: boolean; active: boolean };
type Payment = { id: number; amount: number; plan: string; months: number; period_start: string; period_end: string; paid_at: string; reference: string | null; note: string | null; details?: { plan?: { name: string; price: number }; period?: { label: string }; coupon?: { code: string; percent: number } | null } | null };
type Prices = {
  plans: { id: string; name: string; price: number; active: boolean; trial?: boolean }[];
  periods: { id: string; label: string; months: number; discount: number; coupons: boolean; active: boolean }[];
  coupons?: { code: string; percent: number; starts_on?: string; expires_on: string; active: boolean }[];
};

const STATUS: Record<string, { tone: "green" | "blue" | "amber" | "red"; label: string }> = {
  active: { tone: "green", label: "Paying" }, trial: { tone: "blue", label: "Trial" }, grace: { tone: "amber", label: "Grace" }, expired: { tone: "red", label: "Expired" },
};
const niceDate = (d: string | null) => (d ? formatDate(d.slice(0, 10)) : "—");

type Filter = "all" | "trial" | "active" | "expired" | "disabled";
type Sort = "newest" | "name" | "employees" | "paid" | "ending";
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest first" }, { id: "ending", label: "Ending soonest" }, { id: "employees", label: "Most employees" }, { id: "paid", label: "Most paid" }, { id: "name", label: "Name A–Z" },
];
const tc = "px-3 py-3 text-left text-[11.5px] font-normal uppercase tracking-[0.06em] text-gray-400";
const cell = "px-3 py-3 align-middle";
const BAR: Record<string, string> = { green: "#5b9e8f", blue: "#7fa6d6", amber: "#e3b46b", red: "#e08a8a" };

/** The company's own website address, built from the address this admin page is on. */
function siteUrl(slug: string) {
  if (typeof window === "undefined" || !slug) return "";
  const host = window.location.host.replace(/^(admin|www)\./, "");
  return `${window.location.protocol}//${slug}.${host}`;
}

/** Status pill plus a thin bar for the days left (a 30-day scale). */
function StatusCell({ c, wide = false, until = false }: { c: Company; wide?: boolean; until?: boolean }) {
  const st = STATUS[c.subscription.status] ?? STATUS.expired;
  const d = c.subscription.days_left;
  return (
    <div className={wide ? "" : "min-w-[120px]"}>
      <Pill tone={st.tone} dot>{st.label}{d != null ? ` · ${d <= 0 ? "today" : `${d}d`}` : ""}</Pill>
      {d != null && (
        <div className={`mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100 ${wide ? "w-full" : "w-[110px]"}`}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, (d / 30) * 100))}%`, background: d <= 3 ? BAR.red : BAR[st.tone] }} />
        </div>
      )}
      {until && (c.subscription.paid_until || c.subscription.trial_ends_at) && <p className="mt-1 whitespace-nowrap text-[11px] font-light text-gray-400">until {niceDate(c.subscription.paid_until || c.subscription.trial_ends_at)}</p>}
    </div>
  );
}

function MoreMenu({ c, onExtend, onHistory, onToggle, onRemove, onOpen }: { c: Company; onExtend: () => void; onHistory: () => void; onToggle: () => void; onRemove: () => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const url = siteUrl(c.slug);
  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-light text-gray-700 hover:bg-gray-50";
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className={btn.icon} title="More" aria-label="More actions"><MoreHorizontal size={16} strokeWidth={1.5} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-9 z-40 w-56 rounded-2xl border border-gray-200 bg-white p-1.5 text-left" onClick={(e) => e.stopPropagation()}>
            <button onClick={run(onOpen)} className={item}><PanelRight size={14} strokeWidth={1.5} /> Open details</button>
            <button onClick={run(onHistory)} className={item}><History size={14} strokeWidth={1.5} /> Payment history</button>
            <button onClick={run(onExtend)} className={item}><CalendarPlus size={14} strokeWidth={1.5} /> Extend trial by 14 days</button>
            {url && <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}><ExternalLink size={14} strokeWidth={1.5} /> Open company website</a>}
            <div className="my-1 border-t border-gray-100" />
            <button onClick={run(onToggle)} className={`${item} ${c.active ? "" : "text-emerald-700"}`}><Power size={14} strokeWidth={1.5} /> {c.active ? "Disable company" : "Enable company"}</button>
            <button onClick={run(onRemove)} className={`${item} text-rose-600 hover:bg-rose-50`}><Trash2 size={14} strokeWidth={1.5} /> Remove company…</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminCompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<"table" | "cards">("table");
  const [paying, setPaying] = useState<Company | null>(null);
  const [history, setHistory] = useState<Company | null>(null);
  const [removing, setRemoving] = useState<Company | null>(null);
  const [disabling, setDisabling] = useState<Company | null>(null);
  const [detail, setDetail] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([api.get<Company[]>("/admin/companies"), api.get<Prices>("/admin/settings")]);
      setRows(c); setPrices(s);
      setDetail((d) => (d ? c.find((x) => x.id === d.id) ?? null : d));
    }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { const v = localStorage.getItem("admin-companies-view"); if (v === "cards" || v === "table") setTimeout(() => setView(v), 0); } catch { /* private mode */ }
  }, []);
  const changeView = (v: "table" | "cards") => { setView(v); try { localStorage.setItem("admin-companies-view", v); } catch { /* private mode */ } };

  async function extend(c: Company) {
    try { await api.put(`/admin/companies/${c.id}`, { extend_trial_days: 14 }); setMsg(`Trial extended for ${c.name}`); load(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }
  async function setActive(c: Company, active: boolean) {
    try { await api.put(`/admin/companies/${c.id}`, { active }); setMsg(`${c.name} ${active ? "enabled" : "disabled"}.`); load(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }
  function toggleActive(c: Company) { if (c.active) setDisabling(c); else setActive(c, true); }

  const inFilter = (c: Company, f: Filter) => f === "all" || (f === "disabled" ? !c.active : f === "expired" ? ["expired", "grace"].includes(c.subscription.status) : c.subscription.status === f);
  const ending = (c: Company) => c.subscription.days_left ?? 99999;
  const shown = rows
    .filter((c) => inFilter(c, filter) && (!q || `${c.name} ${c.email} ${c.slug} ${c.phone ?? ""} ${c.city ?? ""} ${c.referred_by?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === "name" ? (a.name || a.email).localeCompare(b.name || b.email)
      : sort === "employees" ? b.employees - a.employees
      : sort === "paid" ? b.paid_total - a.paid_total
      : sort === "ending" ? ending(a) - ending(b)
      : (b.created_at || "").localeCompare(a.created_at || ""));
  const totals = { companies: rows.length, active: rows.filter((c) => c.subscription.status === "active").length, trial: rows.filter((c) => c.subscription.status === "trial").length, revenue: rows.reduce((a, c) => a + c.paid_total, 0) };
  const totalEmployees = rows.reduce((a, c) => a + (c.employees || 0), 0);
  const endingSoon = rows.filter((c) => c.active && c.subscription.days_left != null && c.subscription.days_left <= 7 && c.subscription.status !== "expired").length;

  const actions = (c: Company) => ({
    onExtend: () => extend(c), onHistory: () => setHistory(c), onToggle: () => toggleActive(c), onRemove: () => setRemoving(c), onOpen: () => setDetail(c),
  });

  return (
    <div className="space-y-6">
      <PageHeader icon={Building2} title="Companies" sub="Every company on the platform. Record UPI payments here; each payment extends the paid period and credits the partner who brought the company in."
        actions={<button onClick={() => setCreating(true)} className={btn.primary}><Plus size={15} strokeWidth={1.5} /> New company</button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={Building2} label="Companies" value={totals.companies} hint={`${totalEmployees} employees in total`} />
        <Stat icon={BadgeCheck} label="Paying" tone="teal" value={totals.active} bar={totals.companies ? (totals.active / totals.companies) * 100 : 0} hint={totals.companies ? `${Math.round((totals.active / totals.companies) * 100)}% of companies` : undefined} />
        <Stat icon={Hourglass} label="On trial" tone="blue" value={totals.trial} hint="Free trial running" />
        <Stat icon={BellRing} label="Ending in 7 days" tone="amber" value={endingSoon} hint={endingSoon ? "Worth a call" : "Nothing urgent"} />
        <Stat icon={IndianRupee} label="Collected" value={rupee(totals.revenue)} hint="All payments so far" />
      </div>

      <Flash msg={msg} onClose={() => setMsg("")} />

      <div className="rounded-[22px] border border-gray-200/80 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, city, partner" className={`${inputCls} rounded-full pl-10`} />
          </div>
          <Segmented size="sm" value={filter} onChange={setFilter} options={(["all", "trial", "active", "expired", "disabled"] as const).map((f) => ({
            value: f, label: f === "all" ? "All" : f === "expired" ? "Expired / grace" : f === "active" ? "Paying" : f === "disabled" ? "Disabled" : "Trial", count: rows.filter((c) => inFilter(c, f)).length,
          }))} />
          <div className="ml-auto flex items-center gap-2">
            <label className="relative">
              <ArrowUpDown size={13} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 appearance-none rounded-full border border-gray-200 bg-white pl-8 pr-8 text-[12.5px] font-light text-gray-700 outline-none hover:border-gray-300 focus:border-[#5b9e8f]">
                {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </label>
            <div className="inline-flex rounded-full border border-gray-200 p-0.5">
              {([["table", Rows3], ["cards", LayoutGrid]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => changeView(v)} title={v === "table" ? "Table" : "Cards"}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${view === v ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}><Icon size={14} strokeWidth={1.5} /></button>
              ))}
            </div>
          </div>
        </div>

        {loading && rows.length === 0 ? <Loading /> : shown.length === 0 ? <Empty icon={Search} title="No companies match" sub="Try another search or filter." /> : view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-gray-100 bg-gray-50/40">
                <tr><th className={th}>Company</th><th className={tc}>Plan</th><th className={tc}>Status</th><th className={`${tc} text-right`}>Employees</th><th className={`${tc} text-right`}>Paid</th><th className={`${tc} hidden xl:table-cell`}>Partner</th><th className={tc}></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)} className={`group cursor-pointer transition hover:bg-gray-50/70 ${c.active ? "" : "bg-gray-50/60"}`}>
                    <td className={td}>
                      <div className={`flex items-center gap-3 ${c.active ? "" : "opacity-60"}`}>
                        <Avatar name={c.name || c.email} size={38} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 font-normal text-gray-900">
                            {c.name || <span className="font-light italic text-gray-400">(name not set yet)</span>}
                            {c.demo && <Pill>demo</Pill>}
                            {!c.active && <Pill tone="red" dot>Disabled</Pill>}
                          </p>
                          <p className="truncate text-[12px] font-light text-gray-400">{c.email}{c.city ? ` · ${c.city}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${cell} max-w-[130px] text-[12.5px] font-light leading-snug text-gray-700`}>{c.subscription.plan_name || c.subscription.plan}</td>
                    <td className={cell}><StatusCell c={c} until /></td>
                    <td className={`${cell} text-right tabular-nums`}><span className="text-gray-900">{c.employees}</span></td>
                    <td className={`${cell} whitespace-nowrap text-right tabular-nums text-gray-900`}>{rupee(c.paid_total)}</td>
                    <td className={`${cell} hidden xl:table-cell`}>
                      {c.referred_by
                        ? <span className="flex items-center gap-2"><Avatar name={c.referred_by.name} size={26} /><span className="min-w-0"><span className="block truncate font-light text-gray-700">{c.referred_by.name}</span><span className="font-mono text-[10.5px] text-gray-400">{c.referred_by.ref_code}</span></span></span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`${cell} whitespace-nowrap pr-4 text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {!c.active
                          ? <button onClick={() => setActive(c, true)} title="Enable this company again" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"><Power size={13} /></button>
                          : <button onClick={() => setPaying(c)} title="Record payment" aria-label="Record payment" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-800"><IndianRupee size={13} /></button>}
                        <MoreMenu c={c} {...actions(c)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <div key={c.id} onClick={() => setDetail(c)} className={`group flex cursor-pointer flex-col rounded-[20px] border p-4 transition hover:border-gray-300 ${c.active ? "border-gray-200/80" : "border-dashed border-gray-200 bg-gray-50/60"}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={c.name || c.email} size={42} />
                  <div className={`min-w-0 flex-1 ${c.active ? "" : "opacity-60"}`}>
                    <p className="truncate text-[14.5px] font-normal text-gray-900">{c.name || <span className="font-light italic text-gray-400">(name not set yet)</span>}</p>
                    <p className="truncate text-[12px] font-light text-gray-400">{[c.city, c.subscription.plan_name || c.subscription.plan].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}><MoreMenu c={c} {...actions(c)} /></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">{c.demo && <Pill>demo</Pill>}{!c.active && <Pill tone="red" dot>Disabled</Pill>}</div>
                <StatusCell c={c} wide />
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                  {[["Employees", c.employees, "on record"], ["Plan", c.subscription.plan_name || c.subscription.plan, "current"], ["Paid", rupee(c.paid_total), "so far"]].map(([l, v, h]) => (
                    <div key={String(l)}><p className="text-[11px] font-light text-gray-400">{l}</p><p className="text-[17px] font-light tabular-nums text-gray-900">{v}</p><p className="text-[10.5px] font-light text-gray-400">{h}</p></div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  {c.referred_by ? <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-light text-gray-500"><Avatar name={c.referred_by.name} size={20} /><span className="truncate">{c.referred_by.name}</span></span> : <span className="text-[12px] font-light text-gray-300">Signed up directly</span>}
                  {c.active
                    ? <button onClick={() => setPaying(c)} className="inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-full bg-gray-900 px-3 text-[12px] text-white hover:bg-gray-800"><IndianRupee size={12} /> Record payment</button>
                    : <button onClick={() => setActive(c, true)} className="inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12px] text-emerald-700"><Power size={12} /> Enable</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {shown.length > 0 && <p className="border-t border-gray-100 px-5 py-2.5 text-[12px] font-light text-gray-400">Showing {shown.length} of {rows.length} companies</p>}
      </div>

      {detail && <DetailDrawer c={detail} onClose={() => setDetail(null)} onPay={() => setPaying(detail)} {...actions(detail)} />}
      {paying && prices && <PaymentModal company={paying} prices={prices} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); setMsg(m); load(); }} />}
      {history && <HistoryModal company={history} onClose={() => setHistory(null)} />}
      {creating && <NewCompanyModal onClose={() => setCreating(false)} onDone={() => load()} />}
      {removing && <RemoveModal company={removing} onClose={() => setRemoving(null)} onDone={(m) => { setRemoving(null); setDetail(null); setMsg(m); load(); }} />}
      {disabling && (
        <Modal title={`Disable ${disabling.name}?`} icon={Power} tone="red" onClose={() => setDisabling(null)}
          sub="Nobody will be able to log in to it until you enable it again. Nothing is deleted."
          footer={<><button onClick={() => setDisabling(null)} className={btn.ghost}>Cancel</button><button onClick={() => { const c = disabling; setDisabling(null); setActive(c, false); }} className={btn.danger}>Disable company</button></>} />
      )}
    </div>
  );
}

/** Side panel with everything about one company, its payments and its actions. */
function DetailDrawer({ c, onClose, onPay, onExtend, onToggle, onRemove }: { c: Company; onClose: () => void; onPay: () => void; onExtend: () => void; onHistory: () => void; onToggle: () => void; onRemove: () => void; onOpen: () => void }) {
  const [pays, setPays] = useState<Payment[] | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let live = true;
    api.get<Payment[]>(`/admin/companies/${c.id}/payments`).then((r) => { if (live) setPays(r); }).catch(() => { if (live) setPays([]); });
    return () => { live = false; };
  }, [c.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const url = siteUrl(c.slug);
  const copy = (label: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(""), 1400); });
  const sub = c.subscription;
  const facts: [string, React.ReactNode][] = [
    ["Plan", sub.plan_name || sub.plan],
    [sub.status === "active" ? "Paid until" : "Trial ends", niceDate(sub.paid_until || sub.trial_ends_at)],
    ["WhatsApp self-service", sub.whatsapp ? "Included" : "Not included"],
    ["Joined", niceDate(c.created_at)],
    ["Employees", c.employees],
    ["Brought in by", c.referred_by ? `${c.referred_by.name} (${c.referred_by.ref_code})` : "Signed up directly"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/20 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-gray-200 bg-white animate-[slideIn_.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <div className="flex items-start gap-3 border-b border-gray-100 p-6">
          <Avatar name={c.name || c.email} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[19px] font-light tracking-[-0.01em] text-gray-900">{c.name || "(name not set yet)"}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{!c.active && <Pill tone="red" dot>Disabled</Pill>}{c.demo && <Pill>demo</Pill>}</div>
            <div className="mt-2"><StatusCell c={c} wide /></div>
          </div>
          <button onClick={onClose} className={btn.icon} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-3 gap-2">
            {[["Employees", c.employees, "on record"], ["Joined", niceDate(c.created_at), "date"], ["Paid", rupee(c.paid_total), "in total"]].map(([l, v, h]) => (
              <div key={String(l)} className="rounded-2xl bg-gray-50 px-3 py-3"><p className="text-[11px] font-light text-gray-400">{l}</p><p className="mt-0.5 text-[20px] font-light tabular-nums text-gray-900">{v}</p><p className="text-[10.5px] font-light text-gray-400">{h}</p></div>
            ))}
          </div>

          <div className="space-y-1.5">
            {[
              { icon: Globe, label: url.replace(/^https?:\/\//, ""), href: url, copy: url },
              { icon: Mail, label: c.email, href: `mailto:${c.email}`, copy: c.email },
              ...(c.phone ? [{ icon: Phone, label: c.phone, href: `tel:${c.phone}`, copy: c.phone }] : []),
              ...(c.city ? [{ icon: MapPin, label: c.city, href: "", copy: "" }] : []),
            ].filter((x) => x.label).map((x) => (
              <div key={x.label} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"><x.icon size={14} strokeWidth={1.5} className="text-[#3a4557]" /></span>
                {x.href ? <a href={x.href} target={x.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] font-light text-gray-700 hover:text-gray-900">{x.label}</a> : <span className="flex-1 text-[13px] font-light text-gray-700">{x.label}</span>}
                {x.copy && <button onClick={() => copy(x.label, x.copy)} className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-gray-700" title="Copy">{copied === x.label ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}</button>}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200/80">
            {facts.map(([l, v], i) => (
              <div key={l} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] ${i ? "border-t border-gray-100" : ""}`}>
                <span className="font-light text-gray-500">{l}</span><span className="text-right font-light text-gray-900">{v}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-3 text-[12px] font-normal uppercase tracking-[0.08em] text-gray-400">Payments</p>
            {!pays ? <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-300" /></div> : pays.length === 0 ? (
              <p className="rounded-2xl bg-gray-50 px-4 py-5 text-center text-[13px] font-light text-gray-400">No payments yet.</p>
            ) : (
              <ol className="relative space-y-2.5 border-l border-gray-200 pl-5">
                {pays.map((p) => (
                  <li key={p.id} className="relative">
                    <span className="absolute -left-[25px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#5b9e8f]" />
                    <div className="rounded-2xl border border-gray-200/80 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="font-normal text-gray-900">{p.details?.plan?.name || (p.plan === "standard_whatsapp" ? "Standard + WhatsApp" : "Standard")} · {p.details?.period?.label || `${p.months}m`}</span>
                        <span className="tabular-nums text-gray-900">{rupee(p.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] font-light text-gray-500">Paid {niceDate(p.paid_at)} · {niceDate(p.period_start)} → {niceDate(p.period_end)}{p.details?.coupon ? ` · ${p.details.coupon.code}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 bg-gray-50/50 p-4">
          {c.active && <button onClick={onPay} className={btn.primary}><IndianRupee size={14} /> Record payment</button>}
          <button onClick={onExtend} className={btn.ghost}><CalendarPlus size={14} strokeWidth={1.5} /> +14 days trial</button>
          <button onClick={onToggle} className={c.active ? btn.ghost : `${btn.ghost} border-emerald-200 text-emerald-700`}><Power size={14} strokeWidth={1.5} /> {c.active ? "Disable" : "Enable"}</button>
          <button onClick={onRemove} className={`${btn.ghost} ml-auto text-rose-600 hover:border-rose-200 hover:bg-rose-50`}><Trash2 size={14} strokeWidth={1.5} /> Remove</button>
        </div>
      </aside>
    </div>
  );
}

function PaymentModal({ company, prices, onClose, onDone }: { company: Company; prices: Prices; onClose: () => void; onDone: (msg: string) => void }) {
  const [plan, setPlan] = useState<string>(prices.plans.some((p) => p.id === company.subscription.plan && !p.trial) ? company.subscription.plan : prices.plans.find((p) => !p.trial)?.id || "");
  const [months, setMonths] = useState(prices.periods[0]?.months ?? 1);
  const [amount, setAmount] = useState<number>(0);
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState(""); const [note, setNote] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  // Same rules as the company's Subscription page: period discount, coupons only where allowed
  const [couponCode, setCouponCode] = useState("");
  const per = prices.periods.find((p) => p.months === months);
  const off = per?.discount ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const cp = (prices.coupons || []).find((c) => c.code === couponCode.trim().toUpperCase() && c.active && (!c.starts_on || c.starts_on <= today) && (!c.expires_on || c.expires_on >= today) && !!per?.coupons);
  const couponOff = cp ? cp.percent : 0;
  const base = (prices.plans.find((p) => p.id === plan)?.price ?? 0) * months;
  const raw = base * (1 - off / 100) * (1 - couponOff / 100);
  const suggested = off || couponOff ? (raw >= 500 ? Math.round(raw / 50) * 50 : Math.max(1, Math.round(raw))) : base;
  useEffect(() => { setAmount(suggested); }, [suggested]);
  async function submit() {
    setErr(""); setBusy(true);
    try { const r = await api.post<{ paid_until: string; commission: { executive: string; amount: number } | null }>(`/admin/companies/${company.id}/payments`, { amount, plan, months, coupon: cp ? cp.code : null, paid_at: paidAt, reference: reference || null, note: [cp ? `Coupon ${cp.code} (${cp.percent}%)` : "", note].filter(Boolean).join(" · ") || null }); onDone(`Recorded. ${company.name} is paid until ${r.paid_until}${r.commission ? `. ${r.commission.executive} earns ${rupee(r.commission.amount)}` : ""}.`); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  const inp = inputCls;
  return (
    <Modal title={<>Record payment</>} sub={<>{company.name} · confirm only after the money is in the account.</>} icon={Receipt} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btn.ghost}>Cancel</button>
        <button onClick={submit} disabled={busy || amount < 1} className={btn.primary}>{busy ? "Saving…" : `Confirm ${rupee(amount || 0)}`}</button>
      </>}>
      <div className="space-y-4">
        <Field label="Plan">
          <div className="grid grid-cols-2 gap-2">
            {prices.plans.filter((p) => !p.trial).map((p) => (
              <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                className={`rounded-2xl border px-3 py-2.5 text-left transition ${plan === p.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300"} ${p.active ? "" : "opacity-60"}`}>
                <span className="block text-[13px] font-normal">{p.name}</span>
                <span className={`block text-[11.5px] font-light ${plan === p.id ? "text-white/70" : "text-gray-400"}`}>{rupee(p.price)} / month</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Months"><select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inp}>{Array.from(new Set([...prices.periods.map((p) => p.months), 1, 3, 6, 12])).sort((a, b) => a - b).map((m) => { const pp = prices.periods.find((p) => p.months === m); return <option key={m} value={m}>{m}{pp ? ` · ${pp.label}${pp.discount ? ` (−${pp.discount}%)` : ""}` : ""}</option>; })}</select></Field>
          <Field label="Amount received (₹)"><input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={`${inp} text-[15px]`} /></Field>
          <Field label="Paid on"><input type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidAt(e.target.value)} className={inp} /></Field>
          <Field label="UPI reference"><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction id" className={inp} /></Field>
          <Field label="Coupon code" hint={couponCode ? <span className={cp ? "text-emerald-700" : "text-rose-600"}>{cp ? `${cp.percent}% off applied to the amount` : per && !per.coupons ? `Coupons don't work on ${per.label}` : "Not a valid code"}</span> : undefined}>
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Optional" className={`${inp} font-mono uppercase`} />
          </Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} className={inp} /></Field>
        </div>
        {(off > 0 || couponOff > 0) && (
          <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-[12.5px] font-light text-gray-600">
            <span>{rupee(base)}{off ? ` − ${off}%` : ""}{couponOff ? ` − ${couponOff}% coupon` : ""}</span>
            <span className="text-[15px] font-normal text-gray-900">{rupee(suggested)}</span>
          </div>
        )}
        {err && <p className="text-[12px] text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

function HistoryModal({ company, onClose }: { company: Company; onClose: () => void }) {
  const [rows, setRows] = useState<Payment[] | null>(null);
  useEffect(() => { api.get<Payment[]>(`/admin/companies/${company.id}/payments`).then(setRows).catch(() => setRows([])); }, [company.id]);
  const total = (rows || []).reduce((a, p) => a + p.amount, 0);
  return (
    <Modal title="Payment history" sub={<>{company.name}{rows && rows.length > 0 ? ` · ${rows.length} payment${rows.length === 1 ? "" : "s"} · ${rupee(total)}` : ""}</>} icon={History} onClose={onClose} width="max-w-xl"
      footer={<button onClick={onClose} className={btn.ghost}>Close</button>}>
      {!rows ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-300" /></div> : rows.length === 0 ? <Empty icon={Receipt} title="No payments yet" /> : (
        <ol className="relative space-y-3 border-l border-gray-200 pl-5">
          {rows.map((p) => (
            <li key={p.id} className="relative">
              <span className="absolute -left-[25px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#5b9e8f]" />
              <div className="rounded-2xl border border-gray-200/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-normal text-gray-900">{p.details?.plan?.name || (p.plan === "standard_whatsapp" ? "Standard + WhatsApp" : "Standard")} · {p.details?.period?.label || `${p.months}m`}{p.details?.coupon ? ` · ${p.details.coupon.code}` : ""}</span>
                  <span className="text-[15px] font-normal tabular-nums text-gray-900">{rupee(p.amount)}</span>
                </div>
                <p className="mt-1 text-[12px] font-light text-gray-500">Paid {niceDate(p.paid_at)} · covers {niceDate(p.period_start)} → {niceDate(p.period_end)}{p.reference ? ` · ref ${p.reference}` : ""}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/** Remove a company for good. Asks twice: first "are you sure", then the exact company name. */
function RemoveModal({ company, onClose, onDone }: { company: Company; onClose: () => void; onDone: (msg: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = (company.name || "").trim() || company.email;
  async function remove() {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ removed: string; rows: number }>(`/admin/companies/${company.id}/remove`, { confirm_name: typed });
      onDone(`${r.removed} was removed (${r.rows} records deleted).`);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }
  return (
    <Modal title="Remove company" sub={step === 1 ? "Step 1 of 2" : "Step 2 of 2 · last check"} icon={AlertTriangle} tone="red" onClose={onClose}
      footer={step === 1 ? <>
        <button onClick={onClose} className={btn.ghost}>Cancel</button>
        <button onClick={() => setStep(2)} className={btn.danger}>Yes, continue</button>
      </> : <>
        <button onClick={onClose} className={btn.ghost}>Cancel</button>
        <button onClick={remove} disabled={busy || typed.trim() !== name} className={btn.danger}>{busy ? "Removing…" : "Remove permanently"}</button>
      </>}>
      {step === 1 ? (
        <div className="space-y-3 text-[13.5px] font-light leading-relaxed text-gray-700">
          <p>This permanently deletes <b className="font-normal text-gray-900">{name}</b> and everything in it: employees, attendance, leave, payroll, payments and settings.</p>
          <p>It cannot be undone. Use this only for test companies.</p>
          {company.paid_total > 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[12.5px] text-amber-800">This company has paid {rupee(company.paid_total)}. Make sure it really is a test company.</p>}
        </div>
      ) : (
        <div>
          <p className="text-[13.5px] font-light text-gray-700">To confirm, type the company name: <b className="select-all font-normal text-gray-900">{name}</b></p>
          <input autoFocus value={typed} onChange={(e) => { setTyped(e.target.value); setErr(""); }} placeholder={name}
            className={`mt-3 ${inputCls} focus:border-rose-400 focus:ring-rose-100`} />
          {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Create a company for an owner who can't sign up by themselves. Same result as sign-up:
 *  30-day trial on the starting plan, owner as the first admin. A generated password is shown once. */
function NewCompanyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ company_name: "", slug: "", owner_name: "", email: "", phone: "", password: "", referred_by_id: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; msg?: string; suggestion?: string }>({ state: "idle" });
  const [partners, setPartners] = useState<{ id: number; name: string; ref_code: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<{ name: string; email: string; login_url: string; password: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<{ id: number; name: string; role: string; ref_code: string | null; is_active: boolean }[]>("/admin/users")
      .then((u) => setPartners(u.filter((x) => x.role === "executive" && x.is_active))).catch(() => {});
  }, []);
  // web address follows the company name until edited
  useEffect(() => {
    if (!slugEdited) set("slug", f.company_name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.company_name, slugEdited]);
  useEffect(() => {
    if (!f.slug) { setCheck({ state: "idle" }); return; }
    setCheck({ state: "checking" });
    const tm = setTimeout(() => {
      api.get<{ available: boolean; reason?: string; suggestion?: string }>(`/admin/slug-check?slug=${encodeURIComponent(f.slug)}`)
        .then((r) => setCheck(r.available ? { state: "ok" } : { state: "bad", msg: r.reason, suggestion: r.suggestion }))
        .catch(() => setCheck({ state: "bad", msg: "Could not check this address." }));
    }, 400);
    return () => clearTimeout(tm);
  }, [f.slug]);

  const ready = f.company_name.trim().length >= 2 && f.owner_name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && check.state === "ok" && (!f.password || f.password.length >= 8);
  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ name: string; email: string; login_url: string; password: string | null }>("/admin/companies", {
        company_name: f.company_name.trim(), slug: f.slug, owner_name: f.owner_name.trim(), email: f.email.trim(),
        phone: f.phone.trim() || null, password: f.password || null, referred_by_id: f.referred_by_id ? Number(f.referred_by_id) : null,
      });
      setMade(r); onDone();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  const inp = inputCls;
  const host = typeof window !== "undefined" ? window.location.host.replace(/^admin\./, "") : "campusly.app";
  const loginText = made ? `${made.name}\nLogin: ${made.login_url}\nEmail: ${made.email}${made.password ? `\nPassword: ${made.password}` : ""}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/30 backdrop-blur-[3px] sm:items-center sm:p-4" onClick={made ? undefined : onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-white p-6 border border-gray-200 sm:rounded-[26px]" onClick={(e) => e.stopPropagation()}>
        {!made ? (
          <>
            <h2 className="flex items-center gap-3 text-[17px] font-normal text-gray-900"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><Building2 size={18} strokeWidth={1.5} className="text-[#3a4557]" /></span>New company</h2>
            <p className="mt-2 text-[12.5px] font-light text-gray-500">For an owner who can&apos;t sign up themselves. They get the 30-day free trial and finish the rest of the setup after logging in.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 block text-[12px] font-light text-gray-500">Company name *<input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="e.g. Green Valley Foods" className={`mt-1 ${inp}`} /></label>
              <label className="col-span-2 block text-[12px] font-light text-gray-500">Web address *
                <div className={`mt-1 flex items-center overflow-hidden rounded-xl border ${check.state === "bad" ? "border-red-300" : check.state === "ok" ? "border-green-300" : "border-gray-200"}`}>
                  <span className="bg-gray-50 px-2.5 py-2.5 text-xs text-gray-400">https://</span>
                  <input value={f.slug} onChange={(e) => { set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setSlugEdited(true); }} placeholder="green-valley-foods" className="min-w-0 flex-1 px-2 py-2.5 text-sm outline-none" />
                  <span className="bg-gray-50 px-2.5 py-2.5 text-xs text-gray-400">.{host.includes("campusly") ? "campusly.app" : host}</span>
                </div>
                <span className={`mt-1 block min-h-[16px] text-[11px] ${check.state === "bad" ? "text-red-600" : check.state === "ok" ? "text-green-700" : "text-gray-400"}`}>
                  {check.state === "checking" ? "Checking…" : check.state === "ok" ? "✓ Available" : check.state === "bad" ? <>{check.msg}{check.suggestion && <> Try <button type="button" className="underline" onClick={() => { set("slug", check.suggestion!); setSlugEdited(true); }}>{check.suggestion}</button></>}</> : "Fills in from the company name"}
                </span>
              </label>
              <label className="block text-[12px] font-light text-gray-500">Owner&apos;s full name *<input value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} placeholder="e.g. Dr. Ravi Kumar" className={`mt-1 ${inp}`} /></label>
              <label className="block text-[12px] font-light text-gray-500">Phone<input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" className={`mt-1 ${inp}`} /></label>
              <label className="col-span-2 block text-[12px] font-light text-gray-500">Owner&apos;s email (their login) *<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="owner@example.com" className={`mt-1 ${inp}`} /></label>
              <label className="block text-[12px] font-light text-gray-500">Password<input value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Leave empty to generate" className={`mt-1 ${inp}`} />
                {f.password && f.password.length < 8 && <span className="mt-0.5 block text-[11px] text-red-600">At least 8 characters</span>}
              </label>
              <label className="block text-[12px] font-light text-gray-500">Brought in by
                <select value={f.referred_by_id} onChange={(e) => set("referred_by_id", e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="">Nobody</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ref_code ? ` (${p.ref_code})` : ""}</option>)}
                </select>
              </label>
            </div>
            {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className={btn.ghost}>Cancel</button>
              <button onClick={create} disabled={!ready || busy} className={btn.primary}>{busy ? "Creating…" : "Create company"}</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-3 text-[17px] font-normal text-gray-900"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={18} /></span>{made.name} is ready</h2>
            <p className="mt-1 text-xs text-gray-500">Send these login details to the owner.{made.password ? " The password is shown only now." : ""}</p>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 font-mono text-[13px] text-gray-800">{loginText}</pre>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(loginText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                className={btn.ghost}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy details"}</button>
              <button onClick={onClose} className={btn.primary}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
