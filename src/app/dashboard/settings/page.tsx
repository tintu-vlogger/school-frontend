"use client";

/*
 * Company settings: company profile, the company's web address (its own subdomain)
 * and the signed-in person's account. Saved through /company/profile and
 * /auth/change-password; logo through /company/profile/logo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, Globe, ShieldCheck, Save, Eye, EyeOff, CheckCircle2, XCircle, LogOut, Upload, Trash2, Mail, Smartphone,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useAuth } from "@/lib/auth";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader, Paper, Chip, btn } from "@/components/shell/page";
import { Select } from "@/components/ui-kit";

type Tab = "company" | "address" | "account";

const TABS: { id: Tab; label: string; icon: React.ElementType; sub: string }[] = [
  { id: "company", label: "Company profile", icon: Building2, sub: "Your company's name, logo, registrations and contact details." },
  { id: "address", label: "Web address", icon: Globe, sub: "The address your employees use to sign in." },
  { id: "account", label: "Account", icon: ShieldCheck, sub: "Your password and sign-in security." },
];

const INDUSTRIES = [
  "IT and software services", "Manufacturing", "Retail and e-commerce", "Healthcare", "Education", "Banking and financial services",
  "Construction and real estate", "Logistics and transport", "Hospitality", "Professional services", "Non-profit", "Other",
];
const SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,000+"];
const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

const inp = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary/50";
const lab = "mb-1.5 block text-[12.5px] text-muted";

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className={lab}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-line px-6 py-6 last:border-b-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] text-ink">{title}</h2>
        {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/* ── Shared loader for /company/profile ──────────────────────────── */
type Company = {
  company_name: string; slug: string; email: string; phone: string; address: string; address_line_2: string;
  city: string; state: string; zip: string; logo_url: string; description: string;
  pan: string; tan: string; gstin: string; cin: string; industry: string; employee_band: string;
};
const EMPTY: Company = {
  company_name: "", slug: "", email: "", phone: "", address: "", address_line_2: "", city: "", state: "", zip: "",
  logo_url: "", description: "", pan: "", tan: "", gstin: "", cin: "", industry: "", employee_band: "",
};

function useCompany() {
  const [data, setData] = useState<Company | null>(null);
  const load = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = await api.get<any>("/company/profile");
      const c = d?.config || {};
      setData({
        company_name: d?.company_name || "", slug: d?.slug || "", email: d?.email || "", phone: d?.phone || "",
        address: d?.address || "", address_line_2: c.address_line_2 || "", city: d?.city || "", state: d?.state || "",
        zip: d?.pincode || "", logo_url: d?.logo_url || "", description: c.description || "",
        pan: d?.pan || "", tan: d?.tan || "", gstin: d?.gstin || "", cin: d?.cin || "", industry: d?.industry || "", employee_band: d?.employee_count_band || "",
      });
    } catch {
      setData({ ...EMPTY });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, setData, reload: load };
}

function Loading() {
  return <div className="flex h-48 items-center justify-center"><div className="h-1 w-24 overflow-hidden rounded-full bg-line"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div></div>;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");
  useUrlTab<Tab>(["company", "address", "account"], setTab);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Company settings" description={current.sub} />

      <div className="mb-5 flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] transition-colors ${active ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              <t.icon size={16} strokeWidth={1.4} className={active ? "text-primary" : ""} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "company" && <CompanyProfile />}
      {tab === "address" && <WebAddress />}
      {tab === "account" && <AccountSettings />}
    </div>
  );
}

/* ── Company profile ─────────────────────────────────────────────── */
function CompanyProfile() {
  const toast = useToast();
  const { data, setData } = useCompany();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!data) return <Paper><Loading /></Paper>;
  const set = (k: keyof Company, v: string) => setData({ ...data, [k]: v });

  async function save() {
    if (!data) return;
    if (!data.company_name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      await api.put("/company/profile", {
        company_name: data.company_name.trim(),
        phone: data.phone,
        address: data.address, city: data.city, state: data.state, pincode: data.zip,
        pan: data.pan, tan: data.tan, gstin: data.gstin, cin: data.cin,
        industry: data.industry, employee_count_band: data.employee_band,
        config: { address_line_2: data.address_line_2, description: data.description },
      });
      toast.success("Company profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!data) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("hrms_token");
      const res = await fetch(`${API_BASE}/company/profile/logo`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Upload failed");
      const out = await res.json();
      setData({ ...data, logo_url: out.logo_url || "" });
      toast.success("Logo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    if (!data) return;
    try {
      await api.delete("/company/profile/logo");
      setData({ ...data, logo_url: "" });
      toast.success("Logo removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the logo");
    }
  }

  return (
    <Paper>
      <Section title="Company" hint="How your company appears to employees, on letters and on payslips.">
        <div className="flex items-center gap-4 sm:col-span-2">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken">
            {data.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={data.logo_url} alt="Company logo" className="h-full w-full object-contain" />
              : <span className="text-[22px] font-extralight text-faint">{(data.company_name || "C").charAt(0).toUpperCase()}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" id="company-logo"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={btn.ghost}>
              <Upload size={15} strokeWidth={1.4} /> {uploading ? "Uploading…" : data.logo_url ? "Change logo" : "Upload logo"}
            </button>
            {data.logo_url && (
              <button type="button" onClick={removeLogo} className={btn.ghost}><Trash2 size={15} strokeWidth={1.4} /> Remove</button>
            )}
          </div>
        </div>
        <Field label="Company name"><input id="company-name" className={inp} value={data.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Industry">
          <Select id="company-industry" value={data.industry || null} onChange={(v) => set("industry", v ?? "")} options={INDUSTRIES.map((i) => ({ value: i, label: i }))} placeholder="Choose…" clearable />
        </Field>
        <Field label="Number of employees">
          <Select id="company-size" value={data.employee_band || null} onChange={(v) => set("employee_band", v ?? "")} options={SIZES.map((x) => ({ value: x, label: x }))} placeholder="Choose…" clearable />
        </Field>
        <Field label="About the company" wide>
          <textarea id="company-about" rows={3} className={`${inp} h-auto resize-none py-2.5`} value={data.description}
            onChange={(e) => set("description", e.target.value)} placeholder="A short description shown to new joiners" />
        </Field>
      </Section>

      <Section title="Registrations" hint="Used on payslips, tax certificates and government files. Each legal entity can have its own later.">
        <Field label="PAN" hint="10 characters, e.g. AAACN1234F"><input id="company-pan" className={`${inp} uppercase`} maxLength={10} value={data.pan} onChange={(e) => set("pan", e.target.value)} /></Field>
        <Field label="TAN" hint="Needed to deduct income tax from salaries"><input id="company-tan" className={`${inp} uppercase`} maxLength={10} value={data.tan} onChange={(e) => set("tan", e.target.value)} /></Field>
        <Field label="GSTIN"><input id="company-gstin" className={`${inp} uppercase`} maxLength={15} value={data.gstin} onChange={(e) => set("gstin", e.target.value)} /></Field>
        <Field label="CIN" hint="Company Identification Number, if registered with MCA"><input id="company-cin" className={`${inp} uppercase`} maxLength={21} value={data.cin} onChange={(e) => set("cin", e.target.value)} /></Field>
      </Section>

      <Section title="Contact" hint="The main contact for HR and payroll questions.">
        <Field label="Sign-in email"><input id="company-email" type="email" className={inp} value={data.email} readOnly disabled /></Field>
        <Field label="Phone"><input id="company-phone" type="tel" className={inp} value={data.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
      </Section>

      <Section title="Registered address" hint="The state decides which state rules apply by default.">
        <Field label="Address line 1" wide><input id="company-address" className={inp} value={data.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Address line 2" wide><input id="company-address2" className={inp} value={data.address_line_2} onChange={(e) => set("address_line_2", e.target.value)} /></Field>
        <Field label="City"><input id="company-city" className={inp} value={data.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="State">
          <Select id="company-state" value={data.state || null} onChange={(v) => set("state", v ?? "")} options={STATES.map((x) => ({ value: x, label: x }))} placeholder="Choose…" clearable />
        </Field>
        <Field label="PIN code"><input id="company-pin" inputMode="numeric" maxLength={6} className={inp} value={data.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} /></Field>
      </Section>

      <div className="flex justify-end border-t border-line px-6 py-4">
        <button onClick={save} disabled={saving} className={btn.primary}><Save size={15} strokeWidth={1.5} /> {saving ? "Saving…" : "Save changes"}</button>
      </div>
    </Paper>
  );
}

/* ── Web address (subdomain) ─────────────────────────────────────── */
function WebAddress() {
  const toast = useToast();
  const { data, setData } = useCompany();
  const [original, setOriginal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (data && original === null) setOriginal(data.slug);
  if (!data) return <Paper><Loading /></Paper>;

  const host = typeof window !== "undefined" ? window.location.host : "";
  const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost").split(",").map((r) => r.trim()).filter(Boolean);
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  const root = roots.find((r) => hostname === r || hostname.endsWith(`.${r}`)) || "campusly.app";
  const changed = original !== null && data.slug !== original;

  async function save() {
    if (!data) return;
    if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(data.slug)) { toast.error("Use 3 or more letters, numbers or hyphens, not starting or ending with a hyphen"); return; }
    setSaving(true);
    try {
      await api.put("/company/profile", { slug: data.slug });
      toast.success("Web address updated");
      setOriginal(data.slug);
      // Continue on the new address.
      const token = localStorage.getItem("hrms_token");
      if (token && hostname !== root) {
        window.location.href = `${window.location.protocol}//${data.slug}.${root}${port}/auth/callback?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent("/dashboard/settings?tab=address")}`;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the address");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper>
      <Section title="Sign-in address" hint="Employees open this address to sign in. Share it with your team.">
        <Field label="Web address" wide hint="Letters, numbers and hyphens only.">
          <div className="flex h-10 items-center overflow-hidden rounded-lg border border-line bg-surface focus-within:border-primary/50">
            <span className="pl-3 text-[14px] text-faint">https://</span>
            <input id="company-slug" className="h-full min-w-0 flex-1 bg-transparent px-1 text-[14px] text-ink outline-none" value={data.slug}
              onChange={(e) => setData({ ...data, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
            <span className="border-l border-line bg-sunken px-3 py-2.5 text-[13.5px] text-muted">.{root}</span>
          </div>
        </Field>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Current address <Chip tone="accent">{original}.{root}</Chip>
        </div>
        {changed && (
          <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
            The old address will stop working. Employees will need the new one, and saved bookmarks will break.
          </p>
        )}
      </Section>
      <div className="flex justify-end border-t border-line px-6 py-4">
        <button onClick={save} disabled={saving || !changed} className={btn.primary}><Save size={15} strokeWidth={1.5} /> {saving ? "Saving…" : "Change address"}</button>
      </div>
    </Paper>
  );
}

/* ── Account ─────────────────────────────────────────────────────── */
function AccountSettings() {
  const toast = useToast();
  const { user, logout } = useAuth();
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function change() {
    const e: Record<string, string> = {};
    if (!currentPassword) e.current = "Enter your current password";
    if (!newPassword) e.next = "Enter a new password";
    else if (newPassword.length < 6) e.next = "Use at least 6 characters";
    if (!confirmPassword) e.confirm = "Type the new password again";
    else if (newPassword !== confirmPassword) e.confirm = "The passwords don't match";
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      toast.success("Password changed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  const rules = [
    { ok: newPassword.length >= 8, label: "8 or more characters" },
    { ok: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword), label: "Upper and lower case" },
    { ok: /\d/.test(newPassword), label: "A number" },
    { ok: /[^A-Za-z0-9]/.test(newPassword), label: "A symbol like ! or #" },
  ];
  const score = newPassword ? rules.filter((r) => r.ok).length : 0;
  const bar = ["bg-line", "bg-rose-400", "bg-amber-400", "bg-sky-400", "bg-emerald-500"][score];
  const match = !!confirmPassword && confirmPassword === newPassword;
  const sub = user?.subscription;
  const plan = sub ? (sub.status === "trial" ? "Free trial" : sub.status === "active" ? `${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)} plan` : sub.status === "grace" ? "Payment due" : "Expired") : "";

  const pw = (id: "current" | "next" | "confirm", label: string, value: string, setValue: (v: string) => void, extra?: React.ReactNode) => (
    <Field label={label} wide>
      <div className="relative">
        <input id={`pw-${id}`} type={show[id] ? "text" : "password"} value={value} autoComplete={id === "current" ? "current-password" : "new-password"}
          onChange={(e) => { setValue(e.target.value); setErrors((p) => ({ ...p, [id]: "" })); }}
          className={`${inp} pr-16 ${errors[id] ? "border-rose-300" : ""}`} />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {extra}
          <button type="button" onClick={() => setShow((s) => ({ ...s, [id]: !s[id] }))} className="text-faint hover:text-ink" aria-label={show[id] ? "Hide password" : "Show password"}>
            {show[id] ? <EyeOff size={16} strokeWidth={1.4} /> : <Eye size={16} strokeWidth={1.4} />}
          </button>
        </div>
      </div>
      {errors[id] && <p className="mt-1 text-[12px] text-rose-600">{errors[id]}</p>}
    </Field>
  );

  return (
    <div className="space-y-5">
      <Paper className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-[18px] font-light text-white">
          {(user?.full_name || user?.email || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] text-ink">{user?.full_name || user?.email}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="flex items-center gap-1.5"><Mail size={13} strokeWidth={1.4} />{user?.email}</span>
            <span className="flex items-center gap-1.5"><Building2 size={13} strokeWidth={1.4} />{user?.company_name}</span>
          </div>
        </div>
        {sub && (
          <Link href="/dashboard/subscription" className="rounded-xl border border-line px-4 py-2.5 hover:border-line-strong">
            <p className="text-[13.5px] text-ink">{plan}</p>
            <p className="text-[12px] text-faint">{sub.days_left != null ? `${sub.days_left} days left` : "Manage plan"}</p>
          </Link>
        )}
      </Paper>

      <Paper>
        <Section title="Change password" hint="You stay signed in on this device.">
          {pw("current", "Current password", currentPassword, setCurrentPassword)}
          <div className="sm:col-span-2">
            {pw("next", "New password", newPassword, setNewPassword)}
            {newPassword && (
              <div className="mt-2 flex gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-[3px] flex-1 rounded-full ${i <= score ? bar : "bg-line"}`} />)}</div>
            )}
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {rules.map((r) => (
                <li key={r.label} className={`flex items-center gap-2 text-[12.5px] ${r.ok ? "text-ink" : "text-faint"}`}>
                  {r.ok ? <CheckCircle2 size={14} strokeWidth={1.5} className="text-emerald-500" /> : <span className="flex h-3.5 w-3.5 items-center justify-center"><span className="h-1 w-1 rounded-full bg-line-strong" /></span>}
                  {r.label}
                </li>
              ))}
            </ul>
          </div>
          {pw("confirm", "Confirm new password", confirmPassword, setConfirmPassword,
            confirmPassword ? (match ? <CheckCircle2 size={15} strokeWidth={1.5} className="text-emerald-500" /> : <XCircle size={15} strokeWidth={1.5} className="text-rose-400" />) : null)}
          <div className="sm:col-span-2">
            <button onClick={change} disabled={busy || !currentPassword || !newPassword || !confirmPassword} className={btn.primary}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </div>
        </Section>

        <section className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <Smartphone size={18} strokeWidth={1.3} className="text-faint" />
            <div>
              <p className="text-[14.5px] text-ink">This device</p>
              <p className="text-[13px] text-muted">Signed in as {user?.email}. Sign out on shared computers.</p>
            </div>
          </div>
          <button type="button" onClick={logout} className={btn.ghost}><LogOut size={15} strokeWidth={1.4} /> Sign out</button>
        </section>
      </Paper>
    </div>
  );
}
