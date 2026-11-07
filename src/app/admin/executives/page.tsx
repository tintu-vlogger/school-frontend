"use client";

import { formatDate } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { UserPlus, KeyRound, Ban, CheckCircle2, Copy, Users, Building2, HandCoins, Wallet, ShieldCheck } from "lucide-react";
import { PageHeader, Panel, Stat, Flash, Loading, Empty, Pill, Avatar, Modal, Field, inputCls, btn, th, td } from "@/components/admin-ui";
import { platformApi, rupee, type PlatformUser } from "@/lib/platform-api";

const api = platformApi("/admin/login");
type Row = PlatformUser & { companies: number; earned: number; pending: number };

export default function AdminTeamPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => { setLoading(true); try { setRows(await api.get<Row[]>("/admin/users")); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(u: Row) {
    try { await api.put(`/admin/users/${u.id}`, { is_active: !u.is_active }); setMsg(`${u.name} ${u.is_active ? "deactivated" : "reactivated"}`); load(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }
  function copy(code: string) { navigator.clipboard?.writeText(`${window.location.origin}/register?ref=${code}`); setMsg("Referral link copied"); }

  const execs = rows.filter((r) => r.role === "executive"); const admins = rows.filter((r) => r.role === "admin");

  const totalCompanies = execs.reduce((a, u) => a + u.companies, 0);
  const totalEarned = execs.reduce((a, u) => a + u.earned, 0);
  const totalPending = execs.reduce((a, u) => a + u.pending, 0);
  const ago = (d: string | null) => {
    if (!d) return "Never";
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : formatDate(d);
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={Users} title="Team" sub="Marketing partners bring companies in with their code. Admins run this area."
        actions={<button onClick={() => setCreating(true)} className={btn.primary}><UserPlus size={15} strokeWidth={1.5} /> Add person</button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Partners" value={execs.filter((u) => u.is_active).length} hint={`${admins.length} admin${admins.length === 1 ? "" : "s"}`} />
        <Stat icon={Building2} label="Companies brought in" tone="teal" value={totalCompanies} />
        <Stat icon={HandCoins} label="Partners earned" tone="amber" value={rupee(totalEarned)} />
        <Stat icon={Wallet} label="Waiting to be paid" tone="blue" value={rupee(totalPending)} />
      </div>
      <Flash msg={msg} onClose={() => setMsg("")} />
      {loading ? <Loading /> : (
        <>
          <Panel icon={Users} title="Marketing partners" sub="Click a code to copy their sign-up link." pad={false}>
            {execs.length === 0 ? <Empty icon={Users} title="No partners yet" sub="Add a marketing partner to give them a referral code." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="border-b border-gray-100"><tr><th className={th}>Name</th><th className={th}>Code</th><th className={`${th} text-right`}>Companies</th><th className={`${th} text-right`}>Earned</th><th className={`${th} text-right`}>Pending</th><th className={th}>Last login</th><th className={th}></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {execs.map((u) => (
                      <tr key={u.id} className="transition hover:bg-gray-50/60">
                        <td className={td}>
                          <div className={`flex items-center gap-3 ${u.is_active ? "" : "opacity-50"}`}>
                            <Avatar name={u.name} size={36} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-normal text-gray-900">{u.name}{!u.is_active && <Pill tone="red" dot>Off</Pill>}</p>
                              <p className="truncate text-[12px] font-light text-gray-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}{u.upi_id ? ` · ${u.upi_id}` : ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className={td}><button onClick={() => u.ref_code && copy(u.ref_code)} title="Copy sign-up link" className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-2.5 py-1 font-mono text-[12px] text-gray-700 transition hover:border-[#5b9e8f] hover:text-[#3f7d70]">{u.ref_code} <Copy size={11} /></button></td>
                        <td className={`${td} text-right tabular-nums text-gray-900`}>{u.companies}</td>
                        <td className={`${td} text-right tabular-nums text-gray-900`}>{rupee(u.earned)}</td>
                        <td className={`${td} text-right tabular-nums ${u.pending ? "text-amber-700" : "text-gray-400"}`}>{rupee(u.pending)}</td>
                        <td className={`${td} font-light text-gray-500`}>{ago(u.last_login_at)}</td>
                        <td className={`${td} whitespace-nowrap text-right`}><RowActions u={u} onReset={() => setResetFor(u)} onToggle={() => toggle(u)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel icon={ShieldCheck} title="Admins" pad={false}>
            <div className="divide-y divide-gray-100">
              {admins.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className={`flex min-w-0 flex-1 items-center gap-3 ${u.is_active ? "" : "opacity-50"}`}>
                    <Avatar name={u.name} size={36} />
                    <div className="min-w-0"><p className="font-normal text-gray-900">{u.name}</p><p className="truncate text-[12px] font-light text-gray-400">{u.email}</p></div>
                  </div>
                  <span className="text-[12px] font-light text-gray-500">Last login {ago(u.last_login_at).toLowerCase()}</span>
                  <RowActions u={u} onReset={() => setResetFor(u)} onToggle={() => toggle(u)} />
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={(m) => { setCreating(false); setMsg(m); load(); }} />}
      {resetFor && <ResetModal user={resetFor} onClose={() => setResetFor(null)} onDone={(m) => { setResetFor(null); setMsg(m); }} />}
    </div>
  );
}

function RowActions({ u, onReset, onToggle }: { u: Row; onReset: () => void; onToggle: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={onReset} title="Set a new password" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-[12px] font-light text-gray-700 transition hover:bg-gray-50"><KeyRound size={12} strokeWidth={1.5} /> Password</button>
      <button onClick={onToggle} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-light transition ${u.is_active ? "border-gray-200 text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{u.is_active ? <><Ban size={12} strokeWidth={1.5} /> Deactivate</> : <><CheckCircle2 size={12} strokeWidth={1.5} /> Activate</>}</button>
    </span>
  );
}

const inp = inputCls;

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "executive" as "executive" | "admin", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setErr("");
    if (f.password.length < 10) { setErr("Password must be at least 10 characters"); return; }
    setBusy(true);
    try { const u = await api.post<PlatformUser>("/admin/users", { ...f, phone: f.phone || null }); onDone(u.role === "executive" ? `${u.name} added. Referral code ${u.ref_code}.` : `${u.name} added as admin.`); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add person" sub="Share the password privately. They can change it after signing in." icon={UserPlus} onClose={onClose}
      footer={<><button onClick={onClose} className={btn.ghost}>Cancel</button><button onClick={submit} disabled={busy || !f.name || !f.email} className={btn.primary}>{busy ? "Adding…" : "Add"}</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["executive", "admin"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setF({ ...f, role: r })}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${f.role === r ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
              <span className="block text-[13px] font-normal">{r === "executive" ? "Marketing partner" : "Admin"}</span>
              <span className={`block text-[11.5px] font-light ${f.role === r ? "text-white/70" : "text-gray-400"}`}>{r === "executive" ? "Gets a referral code" : "Runs this area"}</span>
            </button>
          ))}
        </div>
        <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></Field>
        <Field label="Email (their login)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inp} /></Field>
        <Field label="Phone (optional)"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inp} /></Field>
        <Field label="Temporary password" hint="At least 10 characters"><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={`${inp} font-mono`} autoComplete="off" /></Field>
        {err && <p className="text-[12px] text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }: { user: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    if (pw.length < 10) { setErr("At least 10 characters"); return; }
    setBusy(true);
    try { await api.put(`/admin/users/${user.id}`, { new_password: pw }); onDone(`Password set for ${user.name}. Their other sessions are signed out.`); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  return (
    <Modal title="New password" sub={`${user.name} · their other sessions are signed out.`} icon={KeyRound} onClose={onClose} width="max-w-sm"
      footer={<><button onClick={onClose} className={btn.ghost}>Cancel</button><button onClick={submit} disabled={busy} className={btn.primary}>Set password</button></>}>
      <Field label="New password" hint="At least 10 characters"><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} className={`${inp} font-mono`} autoComplete="off" /></Field>
      {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
    </Modal>
  );
}
