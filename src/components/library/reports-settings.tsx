"use client";

/*
 * Reports: most borrowed titles, top readers and loans by category for a date range.
 * Settings: borrowing rules per member type, categories and e-resource links.
 */
import { useState } from "react";
import { BookOpen, ExternalLink, Link2, Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { Paper, PaperHeader } from "@/components/shell/page";
import { MiniBars } from "@/components/home/kit";
import {
  Badge, Button, DataTable, DateRangeInput, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, Toggle,
  useConfirm, type Column,
} from "@/components/ui-kit";
import { errMsg, inr, useGet, type Page, type Policy } from "./common";

type Report = {
  date_from: string; date_to: string;
  books: { uuid: string; title: string; authors: string | null; loans: number }[];
  readers: { uuid: string; name: string; member_type: string; card_no: string; loans: number }[];
  categories: { name: string; loans: number }[];
};

function yearAgo() {
  const d = new Date(`${todayISO()}T12:00:00`);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function ReportsTab() {
  const [range, setRange] = useState({ from: yearAgo(), to: todayISO() });
  const r = useGet<Report>(`/library/reports/most-borrowed?date_from=${range.from}&date_to=${range.to}&limit=15`);
  const data = r.data;
  return (
    <div className="space-y-5">
      <div className="max-w-sm">
        <Field label="Period"><DateRangeInput value={range} onChange={(v) => v.from && v.to && setRange({ from: v.from, to: v.to })} /></Field>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Paper>
          <PaperHeader title="Most borrowed" />
          <div className="p-5">
            {!data ? <p className="text-[13px] text-faint">Loading…</p> : data.books.length === 0 ? <p className="text-[13px] text-faint">No loans in this period.</p>
              : <MiniBars items={data.books.map((b) => ({ label: b.title, value: b.loans }))} />}
          </div>
        </Paper>
        <div className="space-y-5">
          <Paper>
            <PaperHeader title="Top readers" />
            <div className="p-5">
              {!data ? <p className="text-[13px] text-faint">Loading…</p> : data.readers.length === 0 ? <p className="text-[13px] text-faint">No readers yet.</p>
                : <MiniBars items={data.readers.map((x) => ({ label: x.name, value: x.loans }))} />}
            </div>
          </Paper>
          <Paper>
            <PaperHeader title="Loans by category" />
            <div className="p-5">
              {!data ? <p className="text-[13px] text-faint">Loading…</p> : data.categories.length === 0 ? <p className="text-[13px] text-faint">Nothing yet.</p>
                : <MiniBars items={data.categories.map((c) => ({ label: c.name, value: c.loans }))} />}
            </div>
          </Paper>
        </div>
      </div>
      <p className="text-[12.5px] text-faint">Overdue books and member history are on the Overdue &amp; fines and Members tabs.</p>
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────── */

export function SettingsTab({ canManage }: { canManage: boolean }) {
  const pol = useGet<{ items: Policy[]; fees_billing: boolean }>("/library/policies");
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        {(pol.data?.items ?? []).map((p) => <PolicyCard key={p.uuid} policy={p} canManage={canManage} onSaved={pol.reload} />)}
      </div>
      {pol.data && (
        <p className="text-[12.5px] text-faint">
          {pol.data.fees_billing ? "Fines of learners can be added to their fees from the fines list." : "Adding fines to fees becomes available once fee collection is set up."}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Categories canManage={canManage} />
        <EResources canManage={canManage} />
      </div>
    </div>
  );
}

function PolicyCard({ policy, canManage, onSaved }: { policy: Policy; canManage: boolean; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const init = {
    max_books: policy.max_books, loan_days: policy.loan_days, fine_per_day: Number(policy.fine_per_day), grace_days: policy.grace_days,
    max_fine: policy.max_fine === null ? null : Number(policy.max_fine), max_renewals: policy.max_renewals,
    renew_when_overdue: policy.renew_when_overdue, hold_days: policy.hold_days, max_reservations: policy.max_reservations,
    block_fine_above: policy.block_fine_above === null ? null : Number(policy.block_fine_above),
  };
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((d) => ({ ...d, [k]: x }));
  async function save() {
    setSaving(true);
    try {
      await api.put(`/library/policies/${policy.uuid}`, {
        ...v, max_books: v.max_books ?? 0, loan_days: v.loan_days ?? 14, grace_days: v.grace_days ?? 0, max_renewals: v.max_renewals ?? 0,
        hold_days: v.hold_days ?? 3, max_reservations: v.max_reservations ?? 0,
        fine_per_day: (v.fine_per_day ?? 0).toFixed(2), max_fine: v.max_fine === null ? null : v.max_fine.toFixed(2),
        block_fine_above: v.block_fine_above === null ? null : v.block_fine_above.toFixed(2),
      });
      toast.success("Rules saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: errMsg(e) }); } finally { setSaving(false); }
  }
  const title = policy.member_type === "student" ? term("students") : "Staff";
  return (
    <Paper>
      <PaperHeader title={`Borrowing rules: ${title}`} action={canManage && dirty && <Button size="sm" variant="primary" loading={saving} onClick={save}>Save</Button>} />
      <div className="p-5">
        <fieldset disabled={!canManage}>
          <FormGrid>
            <Field label="Books at a time"><NumberInput value={v.max_books} onChange={(x) => set("max_books", x ?? 0)} min={0} max={100} /></Field>
            <Field label="Loan period"><NumberInput value={v.loan_days} onChange={(x) => set("loan_days", x ?? 1)} min={1} max={365} suffix="days" /></Field>
            <Field label="Fine per late day"><NumberInput value={v.fine_per_day} onChange={(x) => set("fine_per_day", x ?? 0)} min={0} step={0.5} suffix="₹" /></Field>
            <Field label="Grace days" hint="No fine for these first late days"><NumberInput value={v.grace_days} onChange={(x) => set("grace_days", x ?? 0)} min={0} max={60} /></Field>
            <Field label="Most fine per book" aside="Optional"><NumberInput value={v.max_fine} onChange={(x) => set("max_fine", x)} min={0} step={10} suffix="₹" /></Field>
            <Field label="Stop issuing when fines pass" aside="Optional"><NumberInput value={v.block_fine_above} onChange={(x) => set("block_fine_above", x)} min={0} step={10} suffix="₹" /></Field>
            <Field label="Renewals per loan"><NumberInput value={v.max_renewals} onChange={(x) => set("max_renewals", x ?? 0)} min={0} max={20} /></Field>
            <Field label="Reservations at a time"><NumberInput value={v.max_reservations} onChange={(x) => set("max_reservations", x ?? 0)} min={0} max={20} /></Field>
            <Field label="Keep a reserved copy for"><NumberInput value={v.hold_days} onChange={(x) => set("hold_days", x ?? 1)} min={1} max={30} suffix="days" /></Field>
            <div className="flex items-end"><Toggle checked={v.renew_when_overdue} onChange={(x) => set("renew_when_overdue", x)} label="Renew late books" description="The late fine is charged first" /></div>
          </FormGrid>
        </fieldset>
        <p className="mt-4 text-[12.5px] text-faint">Example: 5 days late with these rules costs {inr(Math.min(v.max_fine ?? Infinity, Math.max(0, 5 - (v.grace_days ?? 0)) * (v.fine_per_day ?? 0)))}.</p>
      </div>
    </Paper>
  );
}

type Category = { id: number; uuid: string; name: string; code: string | null; description: string | null; active: boolean };

function Categories({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const list = useGet<Page<Category>>("/library/categories?all=true");
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const open = (c: Category | "new") => { setEdit(c); setName(c === "new" ? "" : c.name); setCode(c === "new" ? "" : c.code ?? ""); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), code: code.trim() || null };
      if (edit === "new") await api.post("/library/categories", body); else if (edit) await api.put(`/library/categories/${edit.uuid}`, body);
      toast.success("Category saved");
      setEdit(null); list.reload();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  async function toggle(c: Category) {
    try { await api.put(`/library/categories/${c.uuid}`, { active: !c.active }); list.reload(); }
    catch (err) { toast.error("Couldn't change it", { description: errMsg(err) }); }
  }
  const columns: Column<Category>[] = [
    { key: "name", header: "Category", cell: (c) => <span className={c.active ? "text-ink" : "text-faint"}>{c.name}</span> },
    { key: "code", header: "Class no.", cell: (c) => c.code ? <span className="font-mono text-[12.5px] text-muted">{c.code}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "", align: "right", cell: (c) => c.active ? null : <Badge tone="neutral">Off</Badge> },
  ];
  return (
    <Paper>
      <PaperHeader title="Categories" action={canManage && <Button size="sm" icon={Plus} onClick={() => open("new")}>Add</Button>} />
      <div className="p-3">
        <DataTable rows={list.data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={list.loading}
          onRowClick={canManage ? open : undefined}
          rowActions={canManage ? (c) => [{ label: "Edit", icon: Pencil, onSelect: () => open(c) }, { label: c.active ? "Switch off" : "Switch on", onSelect: () => toggle(c) }] : undefined}
          emptyIcon={Shapes} emptyTitle="No categories" emptyHint="Group titles by subject, such as Fiction or Science." />
      </div>
      <Modal open={edit !== null} onClose={() => setEdit(null)} size="sm" busy={saving} title={edit === "new" ? "Add category" : "Edit category"}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="cat-form" loading={saving}>Save</Button></>}>
        <form id="cat-form" onSubmit={submit} className="space-y-4">
          <Field label="Name" required><TextInput autoFocusInModal value={name} onValueChange={setName} /></Field>
          <Field label="Class number" aside="Optional" hint="e.g. a Dewey number such as 500"><TextInput value={code} onValueChange={setCode} className="font-mono" /></Field>
        </form>
      </Modal>
    </Paper>
  );
}

type EResource = { id: number; uuid: string; title: string; url: string; kind: string; subject: string | null; description: string | null; access_note: string | null; audience: string; active: boolean };
const EKINDS = [{ value: "ebook", label: "E-book" }, { value: "journal", label: "Journal" }, { value: "database", label: "Database" }, { value: "video", label: "Video" }, { value: "website", label: "Website" }];

function EResources({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const list = useGet<Page<EResource>>("/library/eresources?all=true&active=true");
  const blank = { title: "", url: "https://", kind: "ebook", subject: "", access_note: "", audience: "all", description: "" };
  const [edit, setEdit] = useState<EResource | "new" | null>(null);
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const open = (e: EResource | "new") => {
    setEdit(e);
    setV(e === "new" ? blank : { title: e.title, url: e.url, kind: e.kind, subject: e.subject ?? "", access_note: e.access_note ?? "", audience: e.audience, description: e.description ?? "" });
  };
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!v.title.trim() || !/^https?:\/\/.+/.test(v.url)) { toast.info("Give a title and a full web address"); return; }
    setSaving(true);
    try {
      const body = { ...v, subject: v.subject || null, access_note: v.access_note || null, description: v.description || null };
      if (edit === "new") await api.post("/library/eresources", body); else if (edit) await api.put(`/library/eresources/${edit.uuid}`, body);
      toast.success("Link saved"); setEdit(null); list.reload();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  async function remove(e: EResource) {
    if (!(await confirm({ title: `Remove ${e.title}?`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/library/eresources/${e.uuid}`); list.reload(); } catch (err) { toast.error("Couldn't remove", { description: errMsg(err) }); }
  }
  const columns: Column<EResource>[] = [
    { key: "title", header: "E-resource", cell: (e) => <div className="min-w-0"><p className="truncate text-ink">{e.title}</p><p className="truncate text-[12.5px] text-muted">{e.subject || e.url}</p></div> },
    { key: "kind", header: "Type", hideBelow: "sm", cell: (e) => EKINDS.find((k) => k.value === e.kind)?.label ?? e.kind },
    { key: "open", header: "", align: "right", cell: (e) => <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-muted hover:text-primary" aria-label="Open"><ExternalLink size={15} strokeWidth={1.4} /></a> },
  ];
  return (
    <Paper>
      <PaperHeader title="E-resources" action={canManage && <Button size="sm" icon={Plus} onClick={() => open("new")}>Add link</Button>} />
      <div className="p-3">
        <DataTable rows={list.data?.items ?? []} rowKey={(e) => e.uuid} columns={columns} loading={list.loading}
          onRowClick={canManage ? open : undefined}
          rowActions={canManage ? (e) => [{ label: "Edit", icon: Pencil, onSelect: () => open(e) }, { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(e) }] : undefined}
          emptyIcon={Link2} emptyTitle="No e-resources" emptyHint="Add links to e-books, journals and learning sites." />
      </div>
      <Modal open={edit !== null} onClose={() => setEdit(null)} size="md" busy={saving} title={edit === "new" ? "Add e-resource" : "Edit e-resource"}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="eres-form" loading={saving}>Save</Button></>}>
        <form id="eres-form" onSubmit={submit}>
          <FormGrid>
            <Field label="Title" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => setV({ ...v, title: x })} /></Field>
            <Field label="Web address" required className="sm:col-span-2"><TextInput value={v.url} onValueChange={(x) => setV({ ...v, url: x })} leading={BookOpen} /></Field>
            <Field label="Type"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x || "ebook" })} options={EKINDS} /></Field>
            <Field label="Who sees it"><Select value={v.audience} onChange={(x) => setV({ ...v, audience: x || "all" })}
              options={[{ value: "all", label: "Everyone" }, { value: "students", label: `${term("students")} and parents` }, { value: "staff", label: "Staff only" }]} /></Field>
            <Field label="Subject" aside="Optional"><TextInput value={v.subject} onValueChange={(x) => setV({ ...v, subject: x })} /></Field>
            <Field label="How to sign in" aside="Optional"><TextInput value={v.access_note} onValueChange={(x) => setV({ ...v, access_note: x })} placeholder="e.g. Use the school login" /></Field>
            <Field label="Description" aside="Optional" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} /></Field>
          </FormGrid>
        </form>
      </Modal>
    </Paper>
  );
}
