"use client";

/*
 * First sign-in for parents and students: the institution gave them a one-time password,
 * so they choose their own before using the portal. Rendered by AuthProvider in place of
 * every /dashboard page while `must_change_password` is true. /auth/change-password accepts
 * an empty current password in this state.
 *
 *   {user.must_change_password ? <ForcePasswordChange /> : children}
 */
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { api } from "@/lib/api";

function strength(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const label = p.length < 8 ? "Too short" : s <= 2 ? "Fair" : s <= 3 ? "Good" : "Strong";
  return { score: Math.min(s, 4), label };
}

export function ForcePasswordChange() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const st = strength(pw);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 8) { setError("Use at least 8 characters."); return; }
    if (pw !== again) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: "", new_password: pw });
      // Reload so the session picks up the change everywhere.
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password. Please try again.");
      setBusy(false);
    }
  }

  function signOut() {
    api.clearToken();
    window.location.replace("/login");
  }

  const input = "h-11 w-full rounded-lg border border-[var(--hr-line)] bg-white px-3 text-[15px] font-light text-[var(--hr-ink)] outline-none transition-colors placeholder:text-[var(--hr-faint)] focus:border-primary/60";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--hr-canvas)] px-4 py-10" style={{ fontWeight: 300 }}>
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[var(--hr-line)] bg-white p-6 sm:p-7">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--hr-accent-soft)] text-primary">
            <KeyRound size={20} strokeWidth={1.4} />
          </span>
          <h1 className="mt-4 text-[22px] font-extralight text-[var(--hr-ink)]">Choose your own password</h1>
          <p className="mt-1.5 text-[14px] text-[var(--hr-muted)]">
            You signed in with a password from your institution. Pick a new one that only you know.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
            <div>
              <label htmlFor="fp-new" className="mb-1 block text-[12.5px] text-[var(--hr-muted)]">New password</label>
              <div className="relative">
                <input id="fp-new" type={show ? "text" : "password"} autoComplete="new-password" value={pw}
                  onChange={(e) => setPw(e.target.value)} className={`${input} pr-10`} placeholder="8 or more characters" autoFocus />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--hr-faint)] hover:text-[var(--hr-ink)]">
                  {show ? <EyeOff size={16} strokeWidth={1.4} /> : <Eye size={16} strokeWidth={1.4} />}
                </button>
              </div>
              {pw && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`h-[3px] flex-1 rounded-full ${i < st.score ? (st.score >= 3 ? "bg-emerald-500" : "bg-amber-400") : "bg-[var(--hr-line)]"}`} />
                    ))}
                  </div>
                  <span className="text-[11.5px] text-[var(--hr-muted)]">{st.label}</span>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="fp-again" className="mb-1 block text-[12.5px] text-[var(--hr-muted)]">Type it again</label>
              <input id="fp-again" type={show ? "text" : "password"} autoComplete="new-password" value={again}
                onChange={(e) => setAgain(e.target.value)} className={input} />
            </div>
            <button type="submit" disabled={busy}
              className="h-11 w-full rounded-lg bg-primary text-[14.5px] font-light text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </form>
        </div>
        <button type="button" onClick={signOut}
          className="mx-auto mt-4 flex items-center gap-1.5 text-[13px] text-[var(--hr-muted)] hover:text-[var(--hr-ink)]">
          <LogOut size={14} strokeWidth={1.4} /> Sign out
        </button>
      </div>
    </div>
  );
}
