"use client";

/*
 * Circulation desk: scan a library card (or type an admission no.), scan books to issue,
 * renew or mark lost; scan a returned book to check it in with any fine.
 * Barcode scanners type the code and press Enter, so every input submits on Enter.
 */
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, BookX, IdCard, RefreshCw, ScanBarcode, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { Avatar, Badge, Button, Field, Modal, ModalCancel, NumberInput, Select, Tabs, TextInput, Toggle, useConfirm } from "@/components/ui-kit";
import { Paper } from "@/components/shell/page";
import { CopyStatus, DueBadge, FINE_KIND, errMsg, inr, type Copy, type Fine, type Loan, type MemberDetail } from "./common";

const focusId = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.focus();

export function DeskTab({ canCirculate, canManage }: { canCirculate: boolean; canManage: boolean }) {
  const [mode, setMode] = useState<"issue" | "return">("issue");
  return (
    <div className="space-y-5">
      <Tabs variant="pill" value={mode} onChange={setMode} items={[
        { value: "issue", label: "Issue and renew", icon: ArrowUpFromLine },
        { value: "return", label: "Return", icon: ArrowDownToLine },
      ]} />
      {mode === "issue" ? <IssuePanel canCirculate={canCirculate} /> : <ReturnPanel canCirculate={canCirculate} canManage={canManage} />}
    </div>
  );
}

/* ── Issue ───────────────────────────────────────────────────────── */

function IssuePanel({ canCirculate }: { canCirculate: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [card, setCard] = useState("");
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [finding, setFinding] = useState(false);
  const [code, setCode] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);

  async function findMember(e?: React.FormEvent, value?: string) {
    e?.preventDefault();
    const c = (value ?? card).trim();
    if (!c) return;
    setFinding(true);
    try {
      const m = await api.get<MemberDetail>(`/library/members/lookup?code=${encodeURIComponent(c)}`);
      setMember(m);
      setQueue([]);
      setTimeout(() => focusId("lib-book-scan"), 50);
    } catch (err) {
      setMember(null);
      toast.error("Member not found", { description: errMsg(err) });
    } finally { setFinding(false); }
  }
  const refresh = () => member && findMember(undefined, member.card_no);

  function addBook(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    if (!queue.includes(c)) setQueue((q) => [...q, c]);
    setCode("");
  }

  async function issue() {
    if (!member || !queue.length) return;
    setIssuing(true);
    try {
      const r = await api.post<{ member: MemberDetail; issued: Loan[] }>("/library/issue", { member: member.card_no, copies: queue });
      setMember(r.member);
      setQueue([]);
      toast.success(`${r.issued.length} ${r.issued.length === 1 ? "book" : "books"} issued`, { description: `Due ${formatDate(r.issued[0].due_on)}` });
    } catch (err) {
      toast.error("Couldn't issue", { description: errMsg(err) });
    } finally { setIssuing(false); focusId("lib-book-scan"); }
  }

  async function renew(l: Loan) {
    try {
      const r = await api.post<Loan>(`/library/loans/${l.uuid}/renew`);
      toast.success("Renewed", { description: `New due date ${formatDate(r.due_on)}` });
      refresh();
    } catch (err) { toast.error("Couldn't renew", { description: errMsg(err) }); }
  }
  async function lost(l: Loan) {
    if (!(await confirm({ title: `Mark ${l.title} as lost?`, message: "The copy's price plus any late fine becomes a fine for this member.", confirmLabel: "Mark lost", tone: "danger" }))) return;
    try {
      await api.post(`/library/loans/${l.uuid}/lost`, {});
      toast.success("Marked lost");
      refresh();
    } catch (err) { toast.error("Couldn't mark it lost", { description: errMsg(err) }); }
  }

  const room = member ? Math.max(0, member.limit - member.on_loan) : 0;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Paper className="p-5">
        <form onSubmit={findMember}>
          <Field label="Library card" hint={`Scan the card or type an admission no. or staff code`}>
            <div className="flex gap-2">
              <TextInput value={card} onValueChange={setCard} leading={IdCard} placeholder="Scan card" autoFocus className="flex-1 font-mono" />
              <Button type="submit" loading={finding}>Find</Button>
            </div>
          </Field>
        </form>
        {member && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={member.name} src={member.photo_url ?? undefined} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ink">{member.name}</p>
                <p className="truncate text-[12.5px] text-muted">
                  {member.member_type === "student" ? term("student") : "Staff"} · {member.detail} · card <span className="font-mono">{member.card_no}</span>
                </p>
              </div>
              <button type="button" aria-label="Clear" onClick={() => { setMember(null); setCard(""); }} className="text-faint hover:text-ink"><X size={16} strokeWidth={1.4} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile label="On loan" value={`${member.on_loan} / ${member.limit}`} />
              <Tile label="Overdue" value={member.overdue} bad={member.overdue > 0} />
              <Tile label="Fines due" value={inr(member.fines_due)} bad={Number(member.fines_due) > 0} />
            </div>
            {!member.active && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">This membership is switched off.</p>}
            {canCirculate && member.active && (
              <div className="space-y-3 border-t border-line pt-4">
                <form onSubmit={addBook}>
                  <Field label="Books to issue" hint={room ? `Up to ${room} more; due in ${member.policy.loan_days} days` : "The borrowing limit is reached"}>
                    <TextInput id="lib-book-scan" value={code} onValueChange={setCode} leading={ScanBarcode} placeholder="Scan accession no." className="font-mono" disabled={!room} />
                  </Field>
                </form>
                {queue.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {queue.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken/60 px-2.5 py-1 font-mono text-[12.5px]">
                        {c}<button type="button" aria-label={`Remove ${c}`} onClick={() => setQueue((q) => q.filter((x) => x !== c))}><X size={12} strokeWidth={1.4} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <Button variant="primary" icon={ArrowUpFromLine} disabled={!queue.length} loading={issuing} onClick={issue} className="w-full justify-center">
                  Issue {queue.length || ""} {queue.length === 1 ? "book" : "books"}
                </Button>
              </div>
            )}
          </div>
        )}
        {!member && <p className="mt-6 text-[13px] text-faint">Find a member to see their books, issue more or renew.</p>}
      </Paper>

      <Paper className="p-5">
        <p className="mb-3 text-[15px] text-ink">Books with this member</p>
        {!member ? <p className="text-[13px] text-faint">Nothing to show yet.</p> : member.loans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">No books on loan.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {member.loans.map((l) => (
              <li key={l.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">{l.title}</p>
                  <p className="text-[12.5px] text-muted"><span className="font-mono">{l.accession_no}</span> · due {formatDate(l.due_on)}
                    {l.fine_so_far && Number(l.fine_so_far) > 0 && <> · fine so far {inr(l.fine_so_far)}</>}</p>
                </div>
                <DueBadge loan={l} />
                {canCirculate && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={RefreshCw} disabled={!l.renewals_left} onClick={() => renew(l)}
                      title={l.renewals_left ? `${l.renewals_left} renewal(s) left` : "No renewals left"}>Renew</Button>
                    <Button size="sm" variant="ghost" icon={BookX} onClick={() => lost(l)}>Lost</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {member && member.fines.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-muted">Fines due</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {member.fines.map((f: Fine) => (
                <li key={f.uuid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="min-w-0 truncate text-ink">{FINE_KIND[f.kind] ?? f.kind}{f.title && <span className="text-muted"> · {f.title}</span>}</span>
                  <span className="tabular text-ink">{inr(f.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-faint">Collect or waive fines on the Overdue &amp; fines tab.</p>
          </div>
        )}
        {member && member.holds.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-muted">Reserved</p>
            <ul className="space-y-1.5 text-[13.5px]">
              {member.holds.map((h) => (
                <li key={h.uuid} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink">{h.title}</span>
                  {h.status === "ready" ? <Badge tone="accent">Ready · {h.accession_no}</Badge> : <Badge tone="neutral">Waiting</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Paper>
    </div>
  );
}

function Tile({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-line px-2 py-2.5">
      <p className={`tabular text-[17px] font-light ${bad ? "text-rose-700" : "text-ink"}`}>{value}</p>
      <p className="text-[11.5px] text-faint">{label}</p>
    </div>
  );
}

/* ── Return ──────────────────────────────────────────────────────── */

type ReturnResult = { loan: Loan; late_days: number; copy_status: string; fines: Fine[]; hold_for: string | null };

function ReturnPanel({ canCirculate, canManage }: { canCirculate: boolean; canManage: boolean }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [copy, setCopy] = useState<Copy | null>(null);
  const [looking, setLooking] = useState(false);
  const [done, setDone] = useState<ReturnResult[]>([]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setLooking(true);
    try {
      const r = await api.get<Copy>(`/library/copies/lookup?code=${encodeURIComponent(c)}`);
      if (!r.loan) { toast.info(`Copy ${r.accession_no} is not on loan`, { description: r.title ?? undefined }); setCode(""); return; }
      setCopy(r);
    } catch (err) { toast.error("Copy not found", { description: errMsg(err) }); } finally { setLooking(false); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Paper className="p-5">
        <form onSubmit={lookup}>
          <Field label="Returned book" hint="Scan the barcode on the book">
            <div className="flex gap-2">
              <TextInput id="lib-return-scan" value={code} onValueChange={setCode} leading={ScanBarcode} placeholder="Scan accession no." autoFocus className="flex-1 font-mono" disabled={!canCirculate} />
              <Button type="submit" loading={looking} disabled={!canCirculate}>Check</Button>
            </div>
          </Field>
        </form>
        {!canCirculate && <p className="mt-3 text-[13px] text-faint">You can see the desk but not take books back.</p>}
      </Paper>
      <Paper className="p-5">
        <p className="mb-3 text-[15px] text-ink">Returned this session</p>
        {done.length === 0 ? <p className="text-[13px] text-faint">Books you check in appear here.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {done.map((r) => (
              <li key={r.loan.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">{r.loan.title}</p>
                  <p className="text-[12.5px] text-muted">{r.loan.member_name} · <span className="font-mono">{r.loan.accession_no}</span>
                    {r.hold_for && <> · keep aside for {r.hold_for}</>}</p>
                </div>
                {r.fines.length > 0 ? <Badge tone="warn">Fine {inr(r.fines.reduce((a, f) => a + Number(f.amount), 0))}</Badge>
                  : r.late_days > 0 ? <Badge tone="neutral">{r.late_days} days late</Badge> : <Badge tone="good">On time</Badge>}
                <CopyStatus status={r.copy_status} />
              </li>
            ))}
          </ul>
        )}
      </Paper>
      <ReturnModal copy={copy} canManage={canManage} onClose={() => { setCopy(null); focusId("lib-return-scan"); }}
        onDone={(r) => { setDone((d) => [r, ...d]); setCopy(null); setCode(""); setTimeout(() => focusId("lib-return-scan"), 50);
          toast.success("Book returned", { description: r.hold_for ? `Keep it aside: reserved by ${r.hold_for}` : undefined }); }} />
    </div>
  );
}

function ReturnModal({ copy, canManage, onClose, onDone }: { copy: Copy | null; canManage: boolean; onClose: () => void; onDone: (r: ReturnResult) => void }) {
  const toast = useToast();
  const [condition, setCondition] = useState<string>("good");
  const [damageFine, setDamageFine] = useState<number | null>(null);
  const [waive, setWaive] = useState(false);
  const [saving, setSaving] = useState(false);
  const loan = copy?.loan;
  async function submit() {
    if (!copy) return;
    setSaving(true);
    try {
      const r = await api.post<ReturnResult>("/library/return", {
        code: copy.accession_no, condition, damage_fine: condition === "damaged" && damageFine ? damageFine.toFixed(2) : null, waive_overdue: waive,
      });
      setCondition("good"); setDamageFine(null); setWaive(false);
      onDone(r);
    } catch (err) { toast.error("Couldn't return the book", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  const fine = Number(loan?.fine_if_returned ?? 0);
  return (
    <Modal open={!!copy} onClose={onClose} size="sm" busy={saving} title="Return book" description={copy?.title ?? undefined}
      footer={<><ModalCancel /><Button variant="primary" onClick={submit} loading={saving} data-autofocus>Return</Button></>}>
      {copy && loan && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line px-4 py-3 text-[13.5px]">
            <p className="text-ink">{loan.member}</p>
            <p className="text-muted">Issued {formatDate(loan.issued_on)} · due {formatDate(loan.due_on)}</p>
            {(loan.late_days ?? 0) > 0 ? (
              <p className="mt-1 text-rose-700">{loan.late_days} days late{fine > 0 ? ` · fine ${inr(fine)}` : " · within the grace days"}</p>
            ) : <p className="mt-1 text-emerald-700">On time</p>}
          </div>
          <Field label="Condition">
            <Select value={condition} onChange={(x) => setCondition(x || "good")} options={[
              { value: "good", label: "Good" }, { value: "fair", label: "Fair" }, { value: "poor", label: "Worn" }, { value: "damaged", label: "Damaged (take off the shelf)" }]} />
          </Field>
          {condition === "damaged" && (
            <Field label="Damage fine" aside="Optional"><NumberInput value={damageFine} onChange={setDamageFine} min={0} step={10} suffix="₹" /></Field>
          )}
          {canManage && fine > 0 && <Toggle checked={waive} onChange={setWaive} label="Waive the late fine" description="Recorded as waived at return" />}
        </div>
      )}
    </Modal>
  );
}
