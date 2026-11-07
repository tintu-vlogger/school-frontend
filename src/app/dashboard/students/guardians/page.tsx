"use client";

/*
 * Parents and guardians: everyone on record with their children and portal sign-in status.
 * Row click opens the details (edit contact, open a child, create or reset the sign-in).
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, RefreshCw, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, TextInput,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText } from "@/components/academics/shared";
import { NewLogins, relationLabel, type NewLogin, type PortalAccount, type StudentFull } from "@/components/students/shared";
import { StudentDetailModal } from "@/components/students/student-detail";
import { StudentFormModal } from "@/components/students/student-form";

type GuardianRow = {
  id: number; uuid: string; name: string; first_name: string; last_name: string | null; email: string | null;
  phone: string | null; occupation: string | null; children: { id: number; uuid: string; name: string; relation: string }[];
  portal_account: PortalAccount | null;
};
type Page = { items: GuardianRow[]; total: number };

export default function GuardiansPage() {
  const { term } = useInstitution();
  const { can } = useAccess();
  const canManage = can("students.manage");
  const canPortal = can("students.portal.manage");
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page } | null>(null);
  const [viewing, setViewing] = useState<GuardianRow | null>(null);
  const [logins, setLogins] = useState<NewLogin[] | null>(null);
  const [childUuid, setChildUuid] = useState<string | null>(null);
  const [childOpen, setChildOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentFull | null>(null);
  const key = `${search}|${page}|${size}|${nonce}`;

  useEffect(() => {
    let live = true;
    api.get<Page>(`/guardians?page=${page}&size=${size}${search ? `&q=${encodeURIComponent(search)}` : ""}`)
      .then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0 } }); toast.error("Couldn't load the list", { description: errText(e) }); } });
    return () => { live = false; };
  }, [key, page, size, search, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const signin = filters.signin?.[0];
  const rows = (data?.page.items ?? []).filter((g) => !signin || (signin === "yes" ? !!g.portal_account : !g.portal_account));

  async function createSignIn(g: GuardianRow) {
    try {
      const r = await api.post<PortalAccount & { password: string | null }>(`/guardians/${g.uuid}/portal-account`, {});
      if (r.password) setLogins([{ kind: "parent", name: g.name, login: r.login, password: r.password, student: g.children.map((c) => c.name).join(", ") }]);
      else toast.info("They already have a sign-in");
      refresh();
      setViewing(null);
    } catch (e) { toast.error("Couldn't create the sign-in", { description: errText(e) }); }
  }
  async function resetSignIn(g: GuardianRow) {
    if (!g.portal_account) return;
    try {
      const r = await api.post<{ login: string; password: string }>(`/portal-accounts/${g.portal_account.uuid}/reset-password`, {});
      setLogins([{ kind: "parent", name: g.name, login: r.login, password: r.password }]);
      setViewing(null);
    } catch (e) { toast.error("Couldn't reset the password", { description: errText(e) }); }
  }

  const columns: Column<GuardianRow>[] = [
    { key: "name", header: "Name", cell: (g) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={g.name} size={32} />
        <div className="min-w-0"><p className="truncate text-ink">{g.name}</p>{g.occupation && <p className="truncate text-[12.5px] text-muted">{g.occupation}</p>}</div></div>
    ) },
    { key: "contact", header: "Contact", hideBelow: "sm", cell: (g) => (
      <div className="min-w-0 text-[13px]"><p className="text-ink/80">{g.phone ?? "—"}</p>{g.email && <p className="truncate text-muted">{g.email}</p>}</div>
    ) },
    { key: "children", header: "Children", cell: (g) => g.children.length
      ? <span className="text-ink/80">{g.children.map((c) => `${c.name} (${relationLabel(c.relation).toLowerCase()})`).join(", ")}</span>
      : <span className="text-faint">None linked</span> },
    { key: "signin", header: "Sign-in", hideBelow: "md", cell: (g) => g.portal_account
      ? <Badge tone={g.portal_account.active ? "good" : "neutral"} dot>{g.portal_account.active ? "Active" : "Off"}</Badge>
      : <Badge tone="warn">None</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow={term("students")} title={term("guardians")}
        description={`Everyone on record as a ${term("guardian").toLowerCase()} or emergency contact, the children they're linked to and whether they can sign in to the portal.`} />
      <FilterBar searchPlaceholder="Search by name, phone or email" onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "signin", label: "Portal sign-in", options: [{ value: "yes", label: "Has a sign-in" }, { value: "no", label: "No sign-in" }] }]}
        values={filters} onChange={setFilters} />
      <DataTable rows={rows} rowKey={(g) => g.uuid} columns={columns} loading={data?.key !== key} onRowClick={setViewing}
        rowActions={(g) => canPortal ? [g.portal_account
          ? { label: "Reset password", icon: RefreshCw, onSelect: () => resetSignIn(g) }
          : { label: "Create sign-in", icon: KeyRound, onSelect: () => createSignIn(g) }] : []}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={UsersRound}
        emptyTitle={search ? "Nobody matches" : `No ${term("guardians").toLowerCase()} yet`}
        emptyHint={search ? "Try another name or number." : `${term("guardians")} are added with each ${term("student").toLowerCase()} (or from a spreadsheet import).`} />

      {viewing && <GuardianModal g={viewing} canManage={canManage} canPortal={canPortal} onClose={() => setViewing(null)}
        onSaved={() => { setViewing(null); refresh(); }} onCreate={() => createSignIn(viewing)} onReset={() => resetSignIn(viewing)}
        onChild={(uuid) => { setChildUuid(uuid); setChildOpen(true); }} />}
      <Modal open={!!logins} onClose={() => setLogins(null)} size="lg" title="Sign-in details" footer={<Button variant="primary" onClick={() => setLogins(null)}>Done</Button>}>
        {logins && <NewLogins logins={logins} guardianWord={term("guardian")} studentWord={term("student")} />}
      </Modal>
      <StudentDetailModal uuid={childUuid} open={childOpen} onClose={() => setChildOpen(false)} onChanged={refresh}
        onEdit={(s) => { setChildOpen(false); setEditStudent(s); }} />
      {editStudent && <StudentFormModal open target={editStudent} onClose={() => setEditStudent(null)} onSaved={() => { setEditStudent(null); refresh(); }} />}
    </div>
  );
}

function GuardianModal({ g, canManage, canPortal, onClose, onSaved, onCreate, onReset, onChild }: {
  g: GuardianRow; canManage: boolean; canPortal: boolean; onClose: () => void; onSaved: () => void;
  onCreate: () => void; onReset: () => void; onChild: (uuid: string) => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ first_name: g.first_name, last_name: g.last_name ?? "", phone: g.phone ?? "", email: g.email ?? "", occupation: g.occupation ?? "" });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!v.first_name.trim()) { toast.error("Enter a first name"); return; }
    setSaving(true);
    try {
      await api.put(`/guardians/${g.uuid}`, { first_name: v.first_name.trim(), last_name: v.last_name.trim() || null, phone: v.phone.trim() || null, email: v.email.trim() || null, occupation: v.occupation.trim() || null });
      toast.success("Saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={g.name} leading={<Avatar name={g.name} size={44} />}
      description={g.occupation ?? undefined}
      headerActions={canManage && !editing && <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
      footer={editing ? <><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save</Button></> : canPortal && (
        g.portal_account ? <Button icon={RefreshCw} onClick={onReset}>Reset password</Button> : <Button variant="primary" icon={KeyRound} onClick={onCreate}>Create sign-in</Button>
      )}>
      {editing ? (
        <FormGrid>
          <Field label="First name" required><TextInput autoFocusInModal value={v.first_name} onValueChange={(x) => setV({ ...v, first_name: x })} /></Field>
          <Field label="Last name"><TextInput value={v.last_name} onValueChange={(x) => setV({ ...v, last_name: x })} /></Field>
          <Field label="Mobile"><TextInput value={v.phone} inputMode="tel" onValueChange={(x) => setV({ ...v, phone: x })} /></Field>
          <Field label="Email"><TextInput type="email" value={v.email} onValueChange={(x) => setV({ ...v, email: x })} /></Field>
          <Field label="Occupation" className="sm:col-span-2"><TextInput value={v.occupation} onValueChange={(x) => setV({ ...v, occupation: x })} /></Field>
        </FormGrid>
      ) : (
        <>
          <Section title="Contact">
            <KeyValue items={[{ label: "Mobile", value: g.phone }, { label: "Email", value: g.email }]} />
          </Section>
          <Section title="Children" className="border-t border-line">
            {g.children.length === 0 ? <p className="text-[13.5px] text-muted">No children linked. Link this {term("guardian").toLowerCase()} from a {term("student").toLowerCase()}&apos;s details.</p> : (
              <div className="space-y-2">
                {g.children.map((c) => (
                  <button key={c.uuid} type="button" onClick={() => onChild(c.uuid)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-sunken/50">
                    <Avatar name={c.name} size={28} /><span className="flex-1 text-ink">{c.name}</span><span className="text-[12.5px] text-muted">{relationLabel(c.relation)}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>
          <Section title="Portal sign-in" className="border-t border-line">
            {g.portal_account ? (
              <KeyValue items={[
                { label: "Sign-in", value: <span className="font-mono text-[13px]">{g.portal_account.login}</span> },
                { label: "Status", value: <Badge tone={g.portal_account.active ? "good" : "neutral"} dot>{g.portal_account.active ? "Active" : "Off"}</Badge> },
                { label: "Last signed in", value: g.portal_account.last_login_at ? formatDateTime(g.portal_account.last_login_at) : "Never" },
              ]} />
            ) : <p className="text-[13.5px] text-muted">No sign-in yet. {g.email || g.phone ? "Create one to let them see notices, attendance and fees." : "Add an email or mobile number first."}</p>}
          </Section>
        </>
      )}
    </Modal>
  );
}
