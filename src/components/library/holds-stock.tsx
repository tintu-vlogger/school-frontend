"use client";

/*
 * Holds: the waiting list for titles that are out, and copies kept at the desk.
 * Stock check: start a verification, scan every copy on the shelf, then close it and see
 * what's missing (optionally marking missing copies as lost).
 */
import { useState } from "react";
import { BookmarkPlus, ClipboardCheck, Hourglass, Play, ScanBarcode, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatRelative } from "@/lib/datetime";
import { Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Select, StatCard, TextInput, Toggle, useConfirm,
  type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { errMsg, useGet, type Book, type Hold, type Page } from "./common";

export function HoldsTab({ canCirculate }: { canCirculate: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const p = new URLSearchParams({ page: String(page), size: "25" });
  if (filters.status?.[0]) p.set("status", filters.status[0]);
  const list = useGet<Page<Hold>>(`/library/reservations?${p}`);

  async function cancel(h: Hold) {
    if (!(await confirm({ title: "Cancel this reservation?", message: `${h.title} for ${h.member_name}.`, confirmLabel: "Cancel reservation", tone: "danger" }))) return;
    try { await api.post(`/library/reservations/${h.uuid}/cancel`); toast.success("Reservation cancelled"); list.reload(); }
    catch (e) { toast.error("Couldn't cancel", { description: errMsg(e) }); }
  }
  const columns: Column<Hold>[] = [
    { key: "title", header: "Title", cell: (h) => <div className="min-w-0"><p className="truncate text-ink">{h.title}</p><p className="truncate text-[12.5px] text-muted">{h.authors}</p></div> },
    { key: "member", header: "Reserved by", cell: (h) => <div className="min-w-0"><p className="truncate">{h.member_name}</p><p className="font-mono text-[12px] text-muted">{h.card_no}</p></div> },
    { key: "when", header: "Reserved", hideBelow: "md", cell: (h) => formatRelative(h.reserved_at) },
    {
      key: "status", header: "Status", cell: (h) => h.status === "ready"
        ? <Badge tone="accent" dot>Ready · {h.accession_no}{h.expires_on ? ` · until ${formatDate(h.expires_on)}` : ""}</Badge>
        : h.status === "waiting" ? <Badge tone="neutral">Waiting</Badge> : <Badge tone="neutral">{h.status}</Badge>,
    },
  ];
  return (
    <div>
      <FilterBar filters={[{ key: "status", label: "Status", options: [
        { value: "waiting", label: "Waiting" }, { value: "ready", label: "Ready to collect" }, { value: "fulfilled", label: "Collected" },
        { value: "expired", label: "Expired" }, { value: "cancelled", label: "Cancelled" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canCirculate ? <Button variant="primary" icon={BookmarkPlus} onClick={() => setAdding(true)}>Reserve a title</Button> : undefined} />
      <DataTable rows={list.data?.items ?? []} rowKey={(h) => h.uuid} columns={columns} loading={list.loading}
        rowActions={(h) => canCirculate && (h.status === "waiting" || h.status === "ready") ? [{ label: "Cancel reservation", icon: X, danger: true, onSelect: () => cancel(h) }] : []}
        pagination={{ page, size: 25, total: list.data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Hourglass} emptyTitle="No reservations" emptyHint="When a title is out, members can reserve it and the next returned copy is kept for them." />
      <ReserveModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.reload(); }} />
    </div>
  );
}

function ReserveModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [member, setMember] = useState("");
  const [book, setBook] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadBooks = async (q: string): Promise<SelectOption<string>[]> => {
    const r = await api.get<Page<Book>>(`/library/books?size=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    return r.items.filter((b) => !b.reference_only).map((b) => ({ value: b.uuid, label: b.title, description: `${b.available} of ${b.copies} on shelf` }));
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member.trim() || !book) { toast.info("Pick a member and a title"); return; }
    setSaving(true);
    try {
      const r = await api.post<Hold>("/library/reservations", { member: member.trim(), book_uuid: book });
      toast.success(r.status === "ready" ? "A copy is kept aside now" : "Added to the waiting list");
      setMember(""); setBook(null);
      onSaved();
    } catch (err) { toast.error("Couldn't reserve", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Reserve a title"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="reserve-form" loading={saving}>Reserve</Button></>}>
      <form id="reserve-form" onSubmit={submit} className="space-y-4">
        <Field label="Member card" hint="Card, admission no. or staff code">
          <TextInput autoFocusInModal value={member} onValueChange={setMember} className="font-mono" />
        </Field>
        <Field label="Title"><Select value={book} onChange={setBook} loadOptions={loadBooks} placeholder="Search the catalogue" /></Field>
      </form>
    </Modal>
  );
}

/* ── Stock check ─────────────────────────────────────────────────── */

type Check = {
  uuid: string; name: string; started_on: string; closed_on: string | null; status: string; scope_shelf: string | null;
  expected: number; scanned: number; missing: number; created_by: string | null;
  missing_list?: { accession_no: string; title: string; shelf?: string | null }[];
};

export function StockTab({ canManage, canCirculate }: { canManage: boolean; canCirculate: boolean }) {
  const toast = useToast();
  const list = useGet<Page<Check>>("/library/stock-checks?size=50");
  const open = list.data?.items.find((c) => c.status === "open") ?? null;
  const [starting, setStarting] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const columns: Column<Check>[] = [
    { key: "name", header: "Stock check", cell: (c) => <div><p className="text-ink">{c.name}</p><p className="text-[12.5px] text-muted">{c.scope_shelf ? `Shelf ${c.scope_shelf}` : "Whole library"}</p></div> },
    { key: "dates", header: "Dates", hideBelow: "sm", cell: (c) => `${formatDate(c.started_on)}${c.closed_on ? ` – ${formatDate(c.closed_on)}` : ""}` },
    { key: "scanned", header: "Seen", align: "right", cell: (c) => <span className="tabular">{c.scanned}</span> },
    { key: "missing", header: "Missing", align: "right", cell: (c) => <span className={`tabular ${c.missing ? "text-rose-700" : ""}`}>{c.missing}</span> },
    { key: "status", header: "Status", cell: (c) => c.status === "open" ? <Badge tone="accent" dot>In progress</Badge> : <Badge tone="neutral">Closed</Badge> },
  ];
  return (
    <div className="space-y-5">
      {open && <ScanPanel check={open} canManage={canManage} canScan={canManage || canCirculate} onChanged={list.reload} />}
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-ink">All stock checks</p>
        {canManage && !open && <Button variant="primary" icon={Play} onClick={() => setStarting(true)}>Start stock check</Button>}
      </div>
      <DataTable rows={list.data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={list.loading}
        onRowClick={(c) => setViewing(c.uuid)}
        emptyIcon={ClipboardCheck} emptyTitle="No stock checks yet" emptyHint="Start one and scan every copy on the shelves to find what's missing." />
      <StartModal open={starting} onClose={() => setStarting(false)} onSaved={() => { setStarting(false); list.reload(); toast.success("Stock check started"); }} />
      <CheckModal uuid={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ScanPanel({ check, canManage, canScan, onChanged }: { check: Check; canManage: boolean; canScan: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [counts, setCounts] = useState({ expected: check.expected, scanned: check.scanned, missing: check.missing });
  const [last, setLast] = useState<{ accession_no: string; title: string; already_scanned: boolean; note: string | null }[]>([]);
  const [closing, setClosing] = useState(false);
  async function scan(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setCode("");
    try {
      const r = await api.post<{ accession_no: string; title: string; already_scanned: boolean; note: string | null; expected: number; scanned: number; missing: number }>(
        `/library/stock-checks/${check.uuid}/scan`, { code: c });
      setCounts({ expected: r.expected, scanned: r.scanned, missing: r.missing });
      setLast((l) => [r, ...l].slice(0, 8));
      if (r.note) toast.info(r.note);
    } catch (err) { toast.error("Not recognised", { description: errMsg(err) }); }
  }
  return (
    <Paper className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[15px] text-ink">{check.name}</p><p className="text-[12.5px] text-muted">Started {formatDate(check.started_on)} · {check.scope_shelf ? `shelf ${check.scope_shelf}` : "whole library"}</p></div>
        {canManage && <Button onClick={() => setClosing(true)}>Close stock check</Button>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Should be on shelf" value={counts.expected} />
        <StatCard label="Seen" value={counts.scanned} />
        <StatCard label="Not seen yet" value={counts.missing} />
      </div>
      {canScan && (
        <form onSubmit={scan} className="mt-4">
          <Field label="Scan each copy">
            <TextInput autoFocus value={code} onValueChange={setCode} leading={ScanBarcode} placeholder="Scan accession no." className="font-mono" />
          </Field>
        </form>
      )}
      {last.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {last.map((r, i) => <li key={i} className="flex gap-3"><span className="w-28 font-mono">{r.accession_no}</span><span className="flex-1 truncate text-muted">{r.title}</span>{r.already_scanned && <Badge tone="neutral">Seen before</Badge>}</li>)}
        </ul>
      )}
      <CloseModal open={closing} check={check} onClose={() => setClosing(false)} onDone={() => { setClosing(false); onChanged(); }} />
    </Paper>
  );
}

function StartModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(`Stock check ${new Date().getFullYear()}`);
  const [shelf, setShelf] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await api.post("/library/stock-checks", { name, scope_shelf: shelf || null }); onSaved(); }
    catch (err) { toast.error("Couldn't start", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Start stock check"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="start-form" loading={saving}>Start</Button></>}>
      <form id="start-form" onSubmit={submit} className="space-y-4">
        <Field label="Name"><TextInput autoFocusInModal value={name} onValueChange={setName} /></Field>
        <Field label="Only one shelf" aside="Optional" hint="Leave empty to check the whole library"><TextInput value={shelf} onValueChange={setShelf} className="font-mono" /></Field>
      </form>
    </Modal>
  );
}

function CloseModal({ open, check, onClose, onDone }: { open: boolean; check: Check; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [markLost, setMarkLost] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      const r = await api.post<Check>(`/library/stock-checks/${check.uuid}/close`, { mark_missing_lost: markLost });
      toast.success("Stock check closed", { description: `${r.missing} missing` });
      onDone();
    } catch (err) { toast.error("Couldn't close", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Close stock check"
      description="Copies not scanned are listed as missing."
      footer={<><ModalCancel /><Button variant="primary" onClick={submit} loading={saving}>Close</Button></>}>
      <Toggle checked={markLost} onChange={setMarkLost} label="Mark missing copies as lost" description="They stop showing as available in the catalogue" />
    </Modal>
  );
}

function CheckModal({ uuid, onClose }: { uuid: string | null; onClose: () => void }) {
  const d = useGet<Check>(uuid ? `/library/stock-checks/${uuid}` : null);
  const c = d.data && d.data.uuid === uuid ? d.data : null;
  return (
    <Modal open={!!uuid} onClose={onClose} size="md" title={c?.name ?? "Loading…"}
      description={c ? `${c.scanned} seen of ${c.expected}${c.status === "closed" ? "" : " so far"}` : undefined}>
      {c && (c.missing_list?.length ? (
        <>
          <p className="mb-2 text-[13px] text-muted">{c.status === "open" ? "Not seen yet" : "Missing"} ({c.missing_list.length})</p>
          <ul className="divide-y divide-line rounded-xl border border-line text-[13.5px]">
            {c.missing_list.map((m) => <li key={m.accession_no} className="flex gap-3 px-4 py-2"><span className="w-28 font-mono">{m.accession_no}</span><span className="flex-1 truncate">{m.title}</span>{m.shelf && <span className="font-mono text-faint">{m.shelf}</span>}</li>)}
          </ul>
        </>
      ) : <p className="py-6 text-center text-[13.5px] text-muted">Every copy was found.</p>)}
    </Modal>
  );
}
