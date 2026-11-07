"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, KeyRound, Eye, EyeOff, Mail, AlertCircle, ArrowRight, ShieldCheck, Building2, Wallet, Settings2 } from "lucide-react";
import { platformApi, platformToken, type PlatformUser } from "@/lib/platform-api";
import { Modal, Field, inputCls, btn } from "@/components/admin-ui";

type NavItem = { label: string; href: string; icon: React.ElementType };

/** Shared frame for the admin area and the executive portal: login gate, sidebar,
 *  password change, logout. Each area passes its own role, nav and login path. */
export function PlatformShell({ role, nav, loginPath, title, children }: { role: "admin" | "executive"; nav: NavItem[]; loginPath: string; title: string; children: React.ReactNode }) {
  const api = platformApi(loginPath);
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (!platformToken.get()) { router.replace(loginPath); return; }
    api.get<PlatformUser>("/auth/me")
      .then((u) => { if (u.role !== role) { platformToken.clear(); router.replace(loginPath); return; } setUser(u); })
      .catch(() => router.replace(loginPath))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* token already dead */ }
    platformToken.clear();
    router.replace(loginPath);
  }, [api, router, loginPath]);

  if (checking || !user) return <div className="flex h-screen items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Campusly" className="h-7 w-auto" />
          <p className="mt-2 truncate text-xs text-gray-400">{role === "admin" ? "Admin" : "Partner"} · {user.name}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                <n.icon size={16} strokeWidth={1.6} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-0.5 border-t border-gray-100 p-3">
          <button onClick={() => setPwOpen(true)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"><KeyRound size={16} strokeWidth={1.6} /> Change password</button>
          <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"><LogOut size={16} strokeWidth={1.6} /> Sign out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt={title} className="mr-2 h-5 w-auto flex-shrink-0" />
          {nav.map((n) => <Link key={n.href} href={n.href} className={`rounded-md px-2.5 py-1 text-xs ${pathname.startsWith(n.href) ? "bg-gray-900 text-white" : "text-gray-600"}`}>{n.label}</Link>)}
          <button onClick={logout} className="ml-auto text-xs text-gray-500">Sign out</button>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
      {pwOpen && <PasswordModal api={api} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordModal({ api, onClose }: { api: ReturnType<typeof platformApi>; onClose: () => void }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  async function submit() {
    setErr("");
    if (nw.length < 10) { setErr("New password must be at least 10 characters"); return; }
    setBusy(true);
    try { const r = await api.post<{ access_token: string }>("/auth/change-password", { current_password: cur, new_password: nw }); platformToken.set(r.access_token); setDone(true); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  return (
    <Modal title="Change password" sub={done ? undefined : "Other sessions are signed out after the change."} icon={KeyRound} tone={done ? "green" : "gray"} onClose={onClose} width="max-w-sm"
      footer={<>
        <button onClick={onClose} className={btn.ghost}>{done ? "Close" : "Cancel"}</button>
        {!done && <button onClick={submit} disabled={busy || !cur || !nw} className={btn.primary}>{busy ? "Saving…" : "Save password"}</button>}
      </>}>
      {done ? <p className="text-[13.5px] font-light text-emerald-700">Password changed. Other sessions have been signed out.</p> : (
        <div className="space-y-3">
          <Field label="Current password"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} /></Field>
          <Field label="New password" hint="At least 10 characters">
            <div className="relative">
              <input type={show ? "text" : "password"} value={nw} onChange={(e) => setNw(e.target.value)} className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
          </Field>
          {err && <p className="text-[12px] text-rose-600">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Login form used by both areas. */
export function PlatformLogin({ role, title, afterLogin }: { role: "admin" | "executive"; title: string; afterLogin: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Login failed");
      if (body.user?.role !== role) throw new Error("This login does not belong to this area");
      platformToken.set(body.access_token);
      router.replace(afterLogin);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Login failed"); } finally { setBusy(false); }
  }
  const isAdmin = role === "admin";
  const points = isAdmin
    ? [
        { icon: Building2, text: "Every company, its plan and payment status" },
        { icon: Wallet, text: "Record payments and pay out partners" },
        { icon: Settings2, text: "Prices, coupons and where companies pay" },
      ]
    : [
        { icon: Building2, text: "Companies you brought in and their status" },
        { icon: Wallet, text: "Your earnings and payouts" },
        { icon: ShieldCheck, text: "Your referral code to share" },
      ];
  return (
    <div className="flex min-h-screen bg-[#f7f7f5]">
      {/* Brand side */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-gray-200/80 bg-white p-12 lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#5b9e8f]/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#5b9e8f]/5" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="relative h-9 w-auto self-start" />
        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[11.5px] font-normal text-gray-600">
            <ShieldCheck size={12} strokeWidth={1.5} className="text-[#5b9e8f]" />{isAdmin ? "Platform admin" : "Partner portal"}
          </span>
          <h2 className="mt-5 text-[34px] font-light leading-[1.15] tracking-[-0.02em] text-gray-900">
            {isAdmin ? <>Run the platform,<br />one company at a time.</> : <>Grow with companies,<br />earn as they grow.</>}
          </h2>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[14px] font-light text-gray-600">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white"><Icon size={16} strokeWidth={1.5} className="text-[#3a4557]" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] font-light text-gray-400">© {new Date().getFullYear()} Campusly</p>
      </div>

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="mb-8 h-8 w-auto lg:hidden" />
          <h1 className="text-[26px] font-light tracking-[-0.01em] text-gray-900">{title}</h1>
          <p className="mt-1 text-[13.5px] font-light text-gray-500">Sign in with the account you were given.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="pl-email" className="mb-1.5 block text-[12px] font-normal text-gray-500">Email</label>
              <div className="relative">
                <Mail size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="pl-email" type="email" required autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                  placeholder="you@example.com" autoComplete="username"
                  className="h-12 w-full rounded-xl border border-gray-200/80 bg-white pl-10 pr-3 text-[14px] font-light text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-400" />
              </div>
            </div>
            <div>
              <label htmlFor="pl-pass" className="mb-1.5 block text-[12px] font-normal text-gray-500">Password</label>
              <div className="relative">
                <KeyRound size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="pl-pass" type={show ? "text" : "password"} required value={password} onChange={(e) => { setPassword(e.target.value); setErr(""); }}
                  placeholder="Your password" autoComplete="current-password"
                  className="h-12 w-full rounded-xl border border-gray-200/80 bg-white pl-10 pr-11 text-[14px] font-light text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-400" />
                <button type="button" onClick={() => setShow((v) => !v)} title={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-gray-700">
                  {show ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-2.5 text-[12.5px] font-light text-rose-700">
                <AlertCircle size={15} strokeWidth={1.5} className="mt-px flex-shrink-0" />{err}
              </div>
            )}

            <button type="submit" disabled={busy || !email || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-900 text-[14px] font-normal text-white transition-colors hover:bg-gray-800 disabled:opacity-40">
              {busy ? <><Loader2 size={16} strokeWidth={1.5} className="animate-spin" />Signing in…</> : <>Sign in <ArrowRight size={16} strokeWidth={1.5} /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-[12px] font-light text-gray-400">
            {isAdmin ? "Admin access only. Companies sign in at their own address." : "Forgot your password? Ask the platform admin to reset it."}
          </p>
        </div>
      </div>
    </div>
  );
}
