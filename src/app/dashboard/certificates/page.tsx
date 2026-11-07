"use client";

/*
 * Certificates: the issue register (numbered, never deleted; cancelled with a reason) and the
 * templates (transfer, leaving, bonafide, character, conduct, study, migration, custom) with
 * merge fields. Issue opens a modal with a live preview; each certificate prints as a PDF.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Ban, Eye, FileDown, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, IconButton, KeyValue, Modal, ModalCancel, Select,
  StatCard, StatGrid, Tabs, TextInput, Textarea, Toggle, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { HtmlPreview, PdfModal, type Page } from "@/components/admissions/shared";

type TField = { key?: string; label: string; type: "text" | "date" | "textarea"; required: boolean; default?: string };
type Template = {
  id: number; uuid: string; name: string; kind: string; kind_label: string; title: string | null; body_html: string; fields: TField[];
  page_size: string; orientation: string; font_family: string; show_letterhead: boolean; marks_student: string | null; active: boolean; issued: number;
};
type Cert = {
  id: number; uuid: string; number: string | null; kind: string; kind_label: string; title: string; issued_on: string; status: string;
  student_id: number; student_uuid: string | null; student_name: string | null; admission_no: string | null; template_name: string | null;
  marked_student: string | null; issued_by_name: string | null; cancelled_at: string | null; cancel_reason: string | null;
  cancelled_by_name: string | null; created_at: string; values?: Record<string, string>; html?: string;
};
const KINDS = [
  { value: "transfer", label: "Transfer certificate" }, { value: "leaving", label: "Leaving certificate" }, { value: "bonafide", label: "Bonafide certificate" },
  { value: "character", label: "Character certificate" }, { value: "conduct", label: "Conduct certificate" }, { value: "study", label: "Study certificate" },
  { value: "migration", label: "Migration certificate" }, { value: "custom", label: "Other" },
];

export default function CertificatesPage() {
  const { can } = useAccess();
  const canManage = can("admissions.certificates.manage");
  const [tab, setTab] = useState<"register" | "templates">("register");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueKey, setIssueKey] = useState(0);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return (
    <div>
      <PageHeader title="Certificates" description="Transfer, bonafide, character and other certificates, numbered and kept in one register."
        actions={canManage && <Button variant="primary" icon={Plus} onClick={() => { setIssueKey((k) => k + 1); setIssueOpen(true); }}>Issue certificate</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "register", label: "Issue register" }, { value: "templates", label: "Templates" }]} />
      {tab === "register" ? <Register nonce={nonce} canManage={canManage} onChanged={refresh} /> : <Templates canManage={canManage} />}
      <IssueModal key={issueKey} open={issueOpen} onClose={() => setIssueOpen(false)} onIssued={() => { setIssueOpen(false); setTab("register"); refresh(); }} />
    </div>
  );
}

/* ── Register ────────────────────────────────────────────────────────── */

function Register({ nonce, canManage, onChanged }: { nonce: number; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<{ key: string; page: Page<Cert> } | null>(null);
  const [summary, setSummary] = useState<{ issued: number; this_month: number; cancelled: number; by_kind: Record<string, number> } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const key = `${search}|${JSON.stringify(filters)}|${page}|${size}|${nonce}`;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) p.set("q", search);
    if (filters.kind?.[0]) p.set("kind", filters.kind[0]);
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    api.get<Page<Cert>>(`/certificates/issued?${p}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load certificates", { description: e.message }); } });
    api.get<typeof summary>("/certificates/issued/summary").then((s) => { if (live) setSummary(s); }).catch(() => {});
    return () => { live = false; };
  }, [key, search, filters, page, size, toast]);
  const rows = data?.key === key ? data.page : null;
  const columns: Column<Cert>[] = [
    { key: "number", header: "Number", cell: (c) => <span className="font-mono text-[12.5px] text-ink">{c.number ?? "—"}</span> },
    { key: "student", header: term("student"), cell: (c) => <div className="min-w-0"><p className="truncate text-ink">{c.student_name}</p><p className="truncate text-[12.5px] text-muted">{c.admission_no}</p></div> },
    { key: "kind", header: "Certificate", hideBelow: "sm", cell: (c) => c.title },
    { key: "issued", header: "Issued", sortable: true, sortValue: (c) => c.issued_on, hideBelow: "md", cell: (c) => formatDate(c.issued_on) },
    { key: "status", header: "Status", cell: (c) => c.status === "cancelled" ? <Badge tone="bad" dot>Cancelled</Badge> : <Badge tone="good" dot>Issued</Badge> },
    { key: "by", header: "By", hideBelow: "lg", cell: (c) => <span className="text-muted">{c.issued_by_name}</span> },
  ];
  const filtered = !!search || Object.values(filters).some((x) => x?.length);
  return (
    <>
      <StatGrid className="mb-5">
        <StatCard label="Issued" value={summary?.issued ?? "—"} icon={Award} />
        <StatCard label="This month" value={summary?.this_month ?? "—"} />
        <StatCard label="Transfer certificates" value={summary ? (summary.by_kind.transfer ?? 0) : "—"} />
        <StatCard label="Cancelled" value={summary?.cancelled ?? "—"} />
      </StatGrid>
      <FilterBar searchPlaceholder="Search number, name or admission number" onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "kind", label: "Kind", options: KINDS }, { key: "status", label: "Status", options: [{ value: "issued", label: "Issued" }, { value: "cancelled", label: "Cancelled" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={rows?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!rows} onRowClick={(c) => setViewing(c.uuid)}
        rowActions={(c) => [{ label: "View", icon: Eye, onSelect: () => setViewing(c.uuid) }]}
        rowClassName={(c) => (c.status === "cancelled" ? "opacity-60" : undefined)}
        pagination={{ page, size, total: rows?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Award} emptyTitle={filtered ? "No certificates match" : "No certificates issued yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Issue a bonafide or transfer certificate; it gets the next number and stays in this register."} />
      <CertModal uuid={viewing} onClose={() => setViewing(null)} canManage={canManage} onChanged={onChanged} />
    </>
  );
}

function CertModal({ uuid, onClose, canManage, onChanged }: { uuid: string | null; onClose: () => void; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [c, setC] = useState<Cert | null>(null);
  const [pdf, setPdf] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Cert>(`/certificates/issued/${uuid}`).then((x) => { if (live) setC(x); }).catch((e) => toast.error("Couldn't open it", { description: e.message }));
    return () => { live = false; };
  }, [uuid, toast]);
  const cur = c && c.uuid === uuid ? c : null;
  async function cancel() {
    if (!cur) return;
    setBusy(true);
    try {
      await api.post(`/certificates/issued/${cur.uuid}/cancel`, { reason });
      toast.success("Certificate cancelled"); setCancelOpen(false); setReason(""); onChanged();
      setC(await api.get<Cert>(`/certificates/issued/${cur.uuid}`));
    } catch (e) { toast.error("Couldn't cancel", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="xl" title={cur ? `${cur.title} · ${cur.student_name}` : "Certificate"}
        description={cur ? <span className="font-mono text-[12.5px]">{cur.number}</span> : undefined}
        footerStart={cur && canManage && cur.status === "issued" && <Button variant="ghost" icon={Ban} onClick={() => setCancelOpen(true)}>Cancel certificate</Button>}
        footer={cur && <Button variant="primary" icon={FileDown} onClick={() => setPdf(true)}>PDF</Button>}>
        {cur && (
          <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
            <HtmlPreview html={cur.html ?? null} />
            <KeyValue columns={1} items={[
              { label: term("student"), value: <>{cur.student_name}<span className="block text-[12.5px] text-muted">{cur.admission_no}</span></> },
              { label: "Issued", value: `${formatDate(cur.issued_on)}${cur.issued_by_name ? ` by ${cur.issued_by_name}` : ""}` },
              { label: "Status", value: cur.status === "cancelled" ? <Badge tone="bad" dot>Cancelled</Badge> : <Badge tone="good" dot>Issued</Badge> },
              ...(cur.marked_student ? [{ label: `${term("student")} status`, value: `Marked ${cur.marked_student}` }] : []),
              ...(cur.status === "cancelled" ? [{ label: "Cancelled", value: <>{cur.cancel_reason}<span className="block text-[12.5px] text-muted">{cur.cancelled_by_name} · {cur.cancelled_at ? formatDateTime(cur.cancelled_at) : ""}</span></> }] : []),
            ]} />
          </div>
        )}
      </Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} size="sm" busy={busy} title="Cancel this certificate?"
        description="It stays in the register marked cancelled. The number is not reused."
        footer={<><ModalCancel /><Button variant="danger" loading={busy} disabled={reason.trim().length < 2} onClick={cancel}>Cancel certificate</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} autoFocus /></Field>
        {cur?.marked_student && <p className="mt-3 text-[12.5px] text-muted">The {term("student").toLowerCase()} stays marked {cur.marked_student}; change that on their record if needed.</p>}
      </Modal>
      {cur && <PdfModal path={`/certificates/issued/${cur.uuid}/pdf`} title={`${cur.title} · ${cur.number ?? ""}`} open={pdf} onClose={() => setPdf(false)} filename={`${(cur.number ?? "certificate").replace(/\//g, "-")}.pdf`} />}
    </>
  );
}

/* ── Issue ───────────────────────────────────────────────────────────── */

type StudentRow = { id: number; uuid: string; name: string; admission_no: string; section_label: string | null; status: string };
const searchStudents = async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<Page<StudentRow>>(`/students?status=&size=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return r.items.map((s) => ({ value: s.id, label: s.name, description: [s.admission_no, s.section_label, s.status !== "active" ? s.status : null].filter(Boolean).join(" · ") }));
};

function IssueModal({ open, onClose, onIssued }: { open: boolean; onClose: () => void; onIssued: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tid, setTid] = useState<number | null>(null);
  const [sid, setSid] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [issuedOn, setIssuedOn] = useState(new Date().toISOString().slice(0, 10));
  const [mark, setMark] = useState(true);
  const [preview, setPreview] = useState<{ html: string; missing: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) api.get<Template[]>("/certificates/templates?active=true").then(setTemplates).catch(() => {}); }, [open]);
  const t = templates.find((x) => x.id === tid) ?? null;
  const merged = useMemo(() => ({ ...Object.fromEntries((t?.fields ?? []).map((f) => [f.key!, f.default ?? ""])), ...values }), [t, values]);
  const previewKey = JSON.stringify([tid, sid, merged]);
  useEffect(() => {
    if (!t || !sid) { setPreview(null); return; }
    let live = true;
    const h = setTimeout(() => {
      api.post<{ html: string; missing: string[] }>(`/certificates/templates/${t.uuid}/preview`, { student_id: sid, values: merged })
        .then((r) => { if (live) setPreview(r); }).catch(() => {});
    }, 350);
    return () => { live = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  async function issue() {
    if (!t || !sid) return;
    setSaving(true);
    try {
      const c = await api.post<Cert>("/certificates/issued", { template_id: t.id, student_id: sid, issued_on: issuedOn, values: merged, mark_student: !!t.marks_student && mark });
      toast.success(`Issued ${c.number ?? ""}`); onIssued();
    } catch (e) { toast.error("Couldn't issue", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="full" busy={saving} title="Issue a certificate"
      footer={<><ModalCancel /><Button variant="primary" icon={Award} loading={saving} disabled={!t || !sid} onClick={issue}>Issue</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Field label="Certificate" required><Select value={tid} onChange={(x) => { setTid(x); setValues({}); }} options={templates.map((x) => ({ value: x.id, label: x.name, description: x.kind_label }))} placeholder="Pick a template" /></Field>
          <Field label={term("student")} required><Select value={sid} onChange={setSid} loadOptions={searchStudents} placeholder="Search name or admission number" /></Field>
          <Field label="Date of issue"><DateInput value={issuedOn} onChange={setIssuedOn} /></Field>
          {(t?.fields ?? []).map((f) => (
            <Field key={f.key} label={f.label} required={f.required}>
              {f.type === "date" ? <DateInput value={merged[f.key!] ?? ""} onChange={(x) => setValues((v) => ({ ...v, [f.key!]: x }))} clearable />
                : f.type === "textarea" ? <Textarea value={merged[f.key!] ?? ""} onValueChange={(x) => setValues((v) => ({ ...v, [f.key!]: x }))} rows={2} />
                : <TextInput value={merged[f.key!] ?? ""} onValueChange={(x) => setValues((v) => ({ ...v, [f.key!]: x }))} />}
            </Field>
          ))}
          {t?.marks_student && <Toggle checked={mark} onChange={setMark} label={`Mark the ${term("student").toLowerCase()} ${t.marks_student}`}
            description="Ends the current enrolment and switches off their sign-ins." />}
          {preview && preview.missing.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-800">Empty on this certificate: {preview.missing.join(", ")}</p>}
        </div>
        {t && sid ? <HtmlPreview html={preview?.html ?? null} className="h-[70vh]" />
          : <div className="flex h-[50vh] items-center justify-center rounded-xl border border-dashed border-line-strong text-[13.5px] text-muted">Pick a certificate and a {term("student").toLowerCase()} to see it here.</div>}
      </div>
    </Modal>
  );
}

/* ── Templates ───────────────────────────────────────────────────────── */

function Templates({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  const [editKey, setEditKey] = useState(0);
  useEffect(() => {
    api.get<Template[]>("/certificates/templates").then(setRows).catch((e) => { setRows([]); toast.error("Couldn't load templates", { description: e.message }); });
  }, [nonce, toast]);
  const open = (t: Template | "new") => { setEditKey((k) => k + 1); setEdit(t); };
  const columns: Column<Template>[] = [
    { key: "name", header: "Template", cell: (t) => <div className="flex items-center gap-3"><FileText size={18} strokeWidth={1.4} className="text-faint" /><div><p className="text-ink">{t.name}</p><p className="text-[12.5px] text-muted">{t.kind_label}</p></div></div> },
    { key: "fields", header: "Asks for", hideBelow: "md", cell: (t) => <span className="text-muted">{t.fields.map((f) => f.label).join(", ") || "Nothing extra"}</span> },
    { key: "issued", header: "Issued", align: "right", cell: (t) => <span className="tabular">{t.issued}</span> },
    { key: "status", header: "Status", cell: (t) => <Badge tone={t.active ? "good" : "neutral"} dot>{t.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <>
      {canManage && <div className="mb-4 flex justify-end"><Button icon={Plus} onClick={() => open("new")}>New template</Button></div>}
      <DataTable rows={rows ?? []} rowKey={(t) => t.uuid} columns={columns} loading={!rows} onRowClick={canManage ? open : undefined}
        rowActions={canManage ? (t) => [{ label: "Edit", icon: Pencil, onSelect: () => open(t) }] : undefined}
        emptyIcon={FileText} emptyTitle="No templates" emptyHint="Add a template for each kind of certificate you issue." />
      <TemplateModal key={editKey} target={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setNonce((n) => n + 1); }} />
    </>
  );
}

type Catalogue = { group: string; label: string; fields: { key: string; label: string }[] }[];

function TemplateModal({ target, onClose, onSaved }: { target: Template | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target && target !== "new" ? target : null;
  const init = {
    name: editing?.name ?? "", kind: editing?.kind ?? "custom", title: editing?.title ?? "", body_html: editing?.body_html ?? "<h2 class=\"center\">CERTIFICATE</h2>\n<p>This is to certify that <b>{{student.full_name}}</b> …</p>",
    fields: (editing?.fields ?? []).map((f) => ({ ...f })) as TField[], page_size: editing?.page_size ?? "A4", orientation: editing?.orientation ?? "portrait",
    font_family: editing?.font_family ?? "Georgia", show_letterhead: editing?.show_letterhead ?? true, marks_student: editing?.marks_student ?? null as string | null,
    active: editing?.active ?? true,
  };
  const [v, setV] = useState(init);
  const [tab, setTab] = useState<"design" | "preview">("design");
  const [preview, setPreview] = useState<string | null>(null);
  const [cat, setCat] = useState<Catalogue>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof init>(k: K, x: (typeof init)[K]) => setV((p) => ({ ...p, [k]: x }));
  useEffect(() => { if (target) api.get<Catalogue>("/certificates/fields").then(setCat).catch(() => {}); }, [target]);
  useEffect(() => {
    if (tab !== "preview") return;
    setPreview(null);
    api.post<{ html: string }>("/certificates/preview", { template: v, values: Object.fromEntries(v.fields.map((f) => [f.key || f.label, f.default || `[${f.label}]`])) })
      .then((r) => setPreview(r.html)).catch((e) => { setPreview(""); toast.error("No preview", { description: e.message }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const insert = (key: string) => set("body_html", `${v.body_html}{{${key}}}`);

  async function save() {
    if (!v.name.trim()) { toast.error("Give the template a name"); return; }
    setSaving(true);
    try {
      const body = { ...v, title: v.title || null, fields: v.fields.filter((f) => f.label.trim()) };
      if (editing) await api.put(`/certificates/templates/${editing.uuid}`, body); else await api.post("/certificates/templates", body);
      toast.success("Template saved"); onSaved();
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!target} onClose={onClose} size="full" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(init)}
      title={editing ? `Edit ${editing.name}` : "New certificate template"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save template</Button></>}>
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "design", label: "Design" }, { value: "preview", label: "Preview" }]} />
      {tab === "preview" ? <HtmlPreview html={preview} className="h-[68vh]" /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <FormGrid columns={3}>
              <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => set("name", x)} /></Field>
              <Field label="Kind"><Select value={v.kind} onChange={(x) => set("kind", x ?? "custom")} options={KINDS} /></Field>
              <Field label="Title" hint="Shown in the register"><TextInput value={v.title} onValueChange={(x) => set("title", x)} /></Field>
              <Field label="Paper"><Select value={v.page_size} onChange={(x) => set("page_size", x ?? "A4")} options={["A4", "A5", "Letter", "Legal"].map((p) => ({ value: p, label: p }))} /></Field>
              <Field label="Orientation"><Select value={v.orientation} onChange={(x) => set("orientation", x ?? "portrait")} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} /></Field>
              <Field label="Font"><Select value={v.font_family} onChange={(x) => set("font_family", x ?? "Georgia")} options={["Georgia", "Times", "Helvetica", "Noto Sans"].map((p) => ({ value: p, label: p }))} /></Field>
            </FormGrid>
            <Field label="Certificate text (HTML)"><Textarea value={v.body_html} onValueChange={(x) => set("body_html", x)} rows={16} className="font-mono text-[12.5px]" /></Field>
            <div>
              <p className="mb-2 text-[14px] text-ink">Asked when issuing</p>
              <div className="space-y-2">
                {v.fields.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <TextInput value={f.label} onValueChange={(x) => set("fields", v.fields.map((y, j) => (j === i ? { ...y, label: x } : y)))} placeholder="Label" className="min-w-40 flex-1" aria-label="Label" />
                    <Select value={f.type} onChange={(x) => set("fields", v.fields.map((y, j) => (j === i ? { ...y, type: (x ?? "text") as TField["type"] } : y)))} options={[{ value: "text", label: "Text" }, { value: "date", label: "Date" }, { value: "textarea", label: "Long text" }]} className="w-32" aria-label="Type" />
                    <TextInput value={f.default ?? ""} onValueChange={(x) => set("fields", v.fields.map((y, j) => (j === i ? { ...y, default: x } : y)))} placeholder="Default" className="w-36" aria-label="Default" />
                    <Checkbox checked={f.required} onChange={(x) => set("fields", v.fields.map((y, j) => (j === i ? { ...y, required: x } : y)))} label="Required" />
                    {f.key && <code className="rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-muted">{`{{certificate.${f.key}}}`}</code>}
                    <IconButton icon={Trash2} label="Remove" onClick={() => set("fields", v.fields.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" icon={Plus} onClick={() => set("fields", [...v.fields, { label: "", type: "text", required: false, default: "" }])}>Add a field</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle checked={v.show_letterhead} onChange={(x) => set("show_letterhead", x)} label="Print on letterhead" />
              <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Active" />
              <Field label="When issued, offer to mark the student" className="w-64">
                <Select value={v.marks_student} onChange={(x) => set("marks_student", x)} clearable placeholder="Nothing" options={[{ value: "transferred", label: "Transferred" }, { value: "left", label: "Left" }]} />
              </Field>
            </div>
          </div>
          <aside className="space-y-4 lg:max-h-[70vh] lg:overflow-y-auto">
            <p className="text-[13px] text-muted">Click a field to add it at the end of the text.</p>
            {cat.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.fields.map((f) => <button key={f.key} type="button" onClick={() => insert(f.key)} title={`{{${f.key}}}`}
                    className="rounded-md border border-line px-2 py-1 text-[12px] text-ink hover:bg-sunken">{f.label}</button>)}
                </div>
              </div>
            ))}
          </aside>
        </div>
      )}
    </Modal>
  );
}
