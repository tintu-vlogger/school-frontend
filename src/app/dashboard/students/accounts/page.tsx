"use client";

/*
 * Portal sign-ins for parents and students: switch on/off, reset passwords, and create
 * sign-ins for a whole section at once (passwords shown once, downloadable as CSV).
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Power, PowerOff, RefreshCw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Select, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, useSectionOptions } from "@/components/academics/shared";
import { NewLogins, type NewLogin, type PortalAccount } from "@/components/students/shared";

type Row = PortalAccount & { name: string; student_uuid: string | null; admission_no: string | null; guardian_uuid: string | null; children: string[] };
type Page = { items: Row[]; total: number };

export default function AccountsPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page } | null>(null);
  const [logins, setLogins] = useState<{ title: string; rows: NewLogin[]; file: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const qs = new URLSearchParams({ page: String(page), size: String(size) });
  if (search) qs.set("q", search);
  if (filters.kind?.[0]) qs.set("kind", filters.kind[0]);
  if (filters.active?.[0]) qs.set("active", filters.active[0]);
  const query = qs.toString();
  const key = `${query}|${nonce}`;

  useEffect(() => {
    let live = true;
    api.get<Page>(`/portal-accounts?${query}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0 } }); toast.error("Couldn't load sign-ins", { description: errText(e) }); } });
    return () => { live = false; };
  }, [key, query, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  async function setActive(list: Row[], active: boolean, clear?: () => void) {
    const todo = list.filter((a) => a.active !== active);
    if (!todo.length) return;
    if (!active && !(await confirm({ title: todo.length === 1 ? `Switch off ${todo[0].name}'s sign-in?` : `Switch off ${todo.length} sign-ins?`, message: "They can't sign in until it's switched back on. Nothing else changes.", confirmLabel: "Switch off", tone: "danger" }))) return;
    const res = await Promise.allSettled(todo.map((a) => api.post(`/portal-accounts/${a.uuid}/active`, { active })));
    const failed = res.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} couldn't be changed`); else toast.success(active ? "Switched on" : "Switched off");
    clear?.();
    refresh();
  }
  async function reset(a: Row) {
    if (!(await confirm({ title: `Reset ${a.name}'s password?`, message: "A new one-time password is created and the old one stops working.", confirmLabel: "Reset" }))) return;
    try {
      const r = await api.post<{ login: string; password: string }>(`/portal-accounts/${a.uuid}/reset-password`, {});
      setLogins({ title: "New password", file: `${a.login}.csv`, rows: [{ kind: a.kind, name: a.name, login: r.login, password: r.password }] });
    } catch (e) { toast.error("Couldn't reset", { description: errText(e) }); }
  }

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (a) => (
      <div className="min-w-0"><p className="truncate text-ink">{a.name}</p>
        <p className="truncate text-[12.5px] text-muted">{a.kind === "parent" ? (a.children.length ? `${term("guardian")} of ${a.children.join(", ")}` : term("guardian")) : `${term("student")} · ${a.admission_no ?? ""}`}</p></div>
    ) },
    { key: "login", header: "Sign-in", hideBelow: "sm", cell: (a) => <span className="font-mono text-[12.5px] text-ink/80">{a.login}</span> },
    { key: "last", header: "Last signed in", hideBelow: "md", cell: (a) => a.last_login_at ? <span title={formatDateTime(a.last_login_at)} className="text-muted">{formatRelative(a.last_login_at)}</span> : <span className="text-faint">Never</span> },
    { key: "status", header: "Status", cell: (a) => (
      <span className="flex flex-wrap gap-1.5">
        <Badge tone={a.active ? "good" : "neutral"} dot>{a.active ? "On" : "Off"}</Badge>
        {a.active && a.must_change_password && <Badge tone="warn">Password not changed yet</Badge>}
      </span>
    ) },
  ];

  const filtered = !!search || Object.values(filters).some((v) => v.length);
  return (
    <div>
      <PageHeader eyebrow={term("students")} title="Portal sign-ins"
        description={`Parent and ${term("student").toLowerCase()} access to the portal: notices, attendance, homework, results and fees.`}
        actions={<Button variant="primary" icon={KeyRound} onClick={() => setBulkOpen(true)}>Create for a {term("section").toLowerCase()}</Button>} />
      <FilterBar searchPlaceholder="Search by name, sign-in or admission no." onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "kind", label: "Who", options: [{ value: "parent", label: term("guardians") }, { value: "student", label: term("students") }] },
          { key: "active", label: "Status", options: [{ value: "true", label: "On" }, { value: "false", label: "Off" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(a) => a.uuid} columns={columns} loading={data?.key !== key}
        rowActions={(a) => [
          { label: "Reset password", icon: RefreshCw, onSelect: () => reset(a) },
          a.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => setActive([a], false) } : { label: "Switch on", icon: Power, onSelect: () => setActive([a], true) },
        ]}
        selectable
        bulkActions={[
          { label: "Switch on", icon: Power, onSelect: (rows, clear) => setActive(rows, true, clear) },
          { label: "Switch off", icon: PowerOff, danger: true, onSelect: (rows, clear) => setActive(rows, false, clear) },
        ]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Users}
        emptyTitle={filtered ? "No sign-ins match" : "No portal sign-ins yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : `Create sign-ins for a whole ${term("section").toLowerCase()} at once, or one at a time from a ${term("student").toLowerCase()}'s details.`}
        emptyAction={!filtered && <Button variant="primary" icon={KeyRound} onClick={() => setBulkOpen(true)}>Create for a {term("section").toLowerCase()}</Button>} />

      {bulkOpen && <BulkModal onClose={() => setBulkOpen(false)} onDone={(rows, label) => {
        setBulkOpen(false); refresh();
        setLogins({ title: `Sign-ins for ${label}`, rows, file: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sign-ins.csv` });
      }} />}
      <Modal open={!!logins} onClose={() => setLogins(null)} size="lg" title={logins?.title}
        description="Share them by hand or print the CSV. Everyone chooses a new password the first time they sign in."
        footer={<Button variant="primary" onClick={() => setLogins(null)}>Done</Button>}>
        {logins && <NewLogins logins={logins.rows} fileName={logins.file} guardianWord={term("guardian")} studentWord={term("student")} />}
      </Modal>
    </div>
  );
}

function BulkModal({ onClose, onDone }: { onClose: () => void; onDone: (rows: NewLogin[], label: string) => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const { options } = useSectionOptions(null);
  const [section, setSection] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!section) return;
    setBusy(true);
    try {
      const r = await api.post<{ new_logins: NewLogin[]; skipped: { student: string; reason: string }[]; section: string }>(`/students/section/${section}/portal-accounts`);
      if (r.skipped.length) toast.warning(`${r.skipped.length} skipped`, { description: r.skipped.slice(0, 3).map((s) => `${s.student}: ${s.reason}`).join("; ") });
      onDone(r.new_logins, r.section);
    } catch (e) { toast.error("Couldn't create sign-ins", { description: errText(e) }); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={busy} title={`Create sign-ins for a ${term("section").toLowerCase()}`}
      description={`Every ${term("student").toLowerCase()} gets one, and every ${term("guardian").toLowerCase()} with an email or mobile. Existing sign-ins are left as they are.`}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!section} onClick={run}>Create</Button></>}>
      <Field label={term("section")}><Select value={section} onChange={setSection} options={options} placeholder="Pick" /></Field>
    </Modal>
  );
}
