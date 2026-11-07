"use client";

/*
 * Members: every learner and staff member can borrow. The list shows books on loan and fines;
 * the detail modal shows current loans, history and a personal borrowing limit.
 */
import { useState } from "react";
import { Eye, RefreshCcw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, KeyValue, Modal, NumberInput, Section, Tabs, Textarea, Toggle,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { DueBadge, FINE_KIND, FineStatus, errMsg, inr, useGet, type MemberDetail, type Page } from "./common";

type MemberRow = {
  id: number; uuid: string; member_type: string; card_no: string; name: string; active: boolean; max_books: number | null;
  on_loan: number; fines_due: string; detail: string | null;
};

export function MembersTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [syncing, setSyncing] = useState(false);
  const p = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) p.set("q", q);
  if (filters.type?.[0]) p.set("member_type", filters.type[0]);
  if (filters.status?.[0]) p.set("active", filters.status[0] === "active" ? "true" : "false");
  const list = useGet<Page<MemberRow>>(`/library/members?${p}`);
  const [viewing, setViewing] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post<{ added: number; switched_off: number }>("/library/members/sync");
      toast.success("Members are up to date", { description: `${r.added} added, ${r.switched_off} switched off` });
      list.reload();
    } catch (e) { toast.error("Couldn't update members", { description: errMsg(e) }); } finally { setSyncing(false); }
  }

  const columns: Column<MemberRow>[] = [
    {
      key: "name", header: "Member", cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={m.name} size={30} />
          <div className="min-w-0"><p className="truncate text-ink">{m.name}</p><p className="truncate text-[12.5px] text-muted">{m.detail}</p></div>
        </div>
      ),
    },
    { key: "type", header: "Type", hideBelow: "sm", cell: (m) => <Badge tone={m.member_type === "staff" ? "accent" : "neutral"}>{m.member_type === "staff" ? "Staff" : term("student")}</Badge> },
    { key: "card", header: "Card", hideBelow: "md", cell: (m) => <span className="font-mono text-[12.5px] text-muted">{m.card_no}</span> },
    { key: "loans", header: "On loan", align: "right", cell: (m) => <span className="tabular">{m.on_loan}</span> },
    { key: "fines", header: "Fines due", align: "right", cell: (m) => Number(m.fines_due) > 0 ? <span className="tabular text-rose-700">{inr(m.fines_due)}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder="Search name or card no." onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "type", label: "Type", options: [{ value: "student", label: term("students") }, { value: "staff", label: "Staff" }] },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Switched off" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button icon={RefreshCcw} loading={syncing} onClick={sync}>Sync members</Button> : undefined} />
      <DataTable rows={list.data?.items ?? []} rowKey={(m) => m.uuid} columns={columns} loading={list.loading}
        onRowClick={(m) => setViewing(m.uuid)}
        rowActions={(m) => [{ label: "View details", icon: Eye, onSelect: () => setViewing(m.uuid) }]}
        pagination={{ page, size, total: list.data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Users} emptyTitle="No members found"
        emptyHint={canManage ? `Press Sync members to add every ${term("student").toLowerCase()} and staff member.` : "Try another search."} />
      <MemberModal uuid={viewing} onClose={() => setViewing(null)} canManage={canManage} onChanged={list.reload} />
    </div>
  );
}

export function MemberModal({ uuid, onClose, canManage, onChanged }: { uuid: string | null; onClose: () => void; canManage: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const d = useGet<MemberDetail>(uuid ? `/library/members/${uuid}` : null);
  const m = d.data && d.data.uuid === uuid ? d.data : null;
  const [tab, setTab] = useState("loans");
  const [limit, setLimit] = useState<number | null | undefined>(undefined);
  const [notes, setNotes] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    if (!m) return;
    setSaving(true);
    try {
      await api.put(`/library/members/${m.uuid}`, patch);
      toast.success("Member updated");
      setLimit(undefined); setNotes(undefined);
      d.reload(); onChanged?.();
    } catch (e) { toast.error("Couldn't save", { description: errMsg(e) }); } finally { setSaving(false); }
  }

  return (
    <Modal open={!!uuid} onClose={() => { setTab("loans"); setLimit(undefined); setNotes(undefined); onClose(); }} size="lg"
      title={m?.name ?? "Loading…"} leading={m && <Avatar name={m.name} src={m.photo_url ?? undefined} size={42} />}
      description={m ? `${m.member_type === "staff" ? "Staff" : term("student")} · ${m.detail ?? ""} · card ${m.card_no}` : undefined}>
      {m && (
        <>
          <KeyValue columns={3} items={[
            { label: "On loan", value: <span className="tabular">{m.on_loan} of {m.limit}</span> },
            { label: "Overdue", value: <span className={`tabular ${m.overdue ? "text-rose-700" : ""}`}>{m.overdue}</span> },
            { label: "Fines due", value: <span className="tabular">{inr(m.fines_due)}</span> },
          ]} />
          <Tabs className="mt-6" value={tab} onChange={setTab} items={[
            { value: "loans", label: "On loan", count: m.loans.length }, { value: "history", label: "History" },
            { value: "fines", label: "Fines", count: m.fines.length }, ...(canManage ? [{ value: "settings", label: "Settings" }] : []),
          ]} />
          <div className="pt-4">
            {tab === "loans" && (m.loans.length === 0 ? <Empty>No books on loan.</Empty> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {m.loans.map((l) => (
                  <li key={l.uuid} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{l.title}</p>
                      <p className="text-[12.5px] text-muted"><span className="font-mono">{l.accession_no}</span> · due {formatDate(l.due_on)}</p></div>
                    <DueBadge loan={l} />
                  </li>
                ))}
              </ul>
            ))}
            {tab === "history" && (!m.history?.length ? <Empty>Nothing borrowed yet.</Empty> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {m.history.map((l) => (
                  <li key={l.uuid} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{l.title}</p>
                      <p className="text-[12.5px] text-muted">{formatDate(l.issued_on)} – {l.returned_on ? formatDate(l.returned_on) : "now"}</p></div>
                    <DueBadge loan={l} />
                  </li>
                ))}
              </ul>
            ))}
            {tab === "fines" && (m.fines.length === 0 ? <Empty>No fines due.</Empty> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {m.fines.map((f) => (
                  <li key={f.uuid} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1 truncate">{FINE_KIND[f.kind]}{f.title && <span className="text-muted"> · {f.title}</span>}</span>
                    <span className="tabular">{inr(f.amount)}</span><FineStatus status={f.status} />
                  </li>
                ))}
              </ul>
            ))}
            {tab === "settings" && canManage && (
              <Section title="Borrowing">
                <div className="space-y-4">
                  <Field label="Books at a time" hint={`Leave empty to use the rule for ${m.member_type === "staff" ? "staff" : term("students").toLowerCase()} (${m.policy.max_books})`}>
                    <div className="flex gap-2">
                      <NumberInput value={limit === undefined ? m.max_books : limit} onChange={setLimit} min={0} max={100} className="w-40" />
                      <Button loading={saving} onClick={() => save({ max_books: limit === undefined ? m.max_books : limit })}>Save</Button>
                    </div>
                  </Field>
                  <Field label="Notes">
                    <Textarea value={notes ?? m.notes ?? ""} onValueChange={setNotes} rows={2} />
                  </Field>
                  {notes !== undefined && <Button size="sm" loading={saving} onClick={() => save({ notes })}>Save notes</Button>}
                  <Toggle checked={m.active} onChange={(x) => save({ active: x })} label="Can borrow" description="Switch off to stop new loans" />
                </div>
              </Section>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">{children}</p>;
}
