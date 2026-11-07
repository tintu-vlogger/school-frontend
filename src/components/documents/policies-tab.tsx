"use client";

/*
 * Policies. Employees read and acknowledge theirs; people who manage files also add
 * policies, publish versions and follow acknowledgements (report, reminders, CSV).
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Download, FileCheck2, FilePlus2, Pencil, Plus, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DataTable, DateInput, Field, FileDrop, FilterBar, FormGrid, KeyValue, MasterSelect, Modal, ModalCancel,
  NumberInput, Section, Skeleton, StatCard, Tabs, TextInput, Textarea, Toggle, formatDisplayDate, type Column, type FilterValues,
} from "@/components/ui-kit";
import { downloadFrom, uploadFile } from "@/components/workplace/files";
import { ACK_STATUS, AudiencePicker, FilePreview, HtmlFrame, ProgressBar, StatusBadge, audienceLabel, errText, type Audience, type Policy } from "./shared";

const policyHtml = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;font-weight:300;color:#1f2430;line-height:1.6;max-width:720px;margin:28px auto;padding:0 24px;background:#fff}
h1,h2,h3{font-weight:400}</style></head><body>${body}</body></html>`;

export function PoliciesTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<"mine" | "all">(canManage ? "all" : "mine");
  return (
    <div>
      {canManage && <Tabs variant="pill" className="mb-4" value={view} onChange={setView}
        items={[{ value: "all", label: "All policies" }, { value: "mine", label: "My policies" }]} />}
      {view === "all" && canManage ? <ManagePolicies /> : <MyPolicies />}
    </div>
  );
}

function MyPolicies() {
  const toast = useToast();
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [reading, setReading] = useState<Policy | null>(null);
  const load = useCallback(() => {
    api.get<{ items: Policy[] }>("/documents/me/policies").then((r) => setRows(r.items))
      .catch((e) => { setRows([]); toast.error("Couldn't load policies", { description: errText(e) }); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const pending = (rows ?? []).filter((p) => p.my_status === "pending" || p.my_status === "overdue");

  return (
    <div>
      {pending.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[13.5px] text-amber-800">
          <BellRing size={17} strokeWidth={1.4} /> {pending.length === 1 ? "One policy needs" : `${pending.length} policies need`} your acknowledgement.
        </div>
      )}
      {!rows ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div> : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-[14px] text-muted">No policies have been shared with you yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <button key={p.uuid} type="button" onClick={() => setReading(p)}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-muted"><ScrollText size={17} strokeWidth={1.4} /></span>
                <StatusBadge map={ACK_STATUS} value={p.my_status ?? "not_needed"} />
              </div>
              <p className="text-[15px] text-ink">{p.title}</p>
              {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
              <p className="mt-auto pt-3 text-[12px] text-faint">
                Version {p.current_version?.version}
                {p.my_status === "acknowledged" && p.acknowledged_at ? ` · acknowledged ${formatDate(p.acknowledged_at)}` : p.due_on ? ` · by ${formatDisplayDate(p.due_on)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
      <ReadModal policy={reading} onClose={() => setReading(null)} onDone={() => { setReading(null); load(); }} />
    </div>
  );
}

function ReadModal({ policy: p, onClose, onDone }: { policy: Policy | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const needs = p?.my_status === "pending" || p?.my_status === "overdue";
  async function ack() {
    if (!p) return;
    setBusy(true);
    try { await api.post(`/documents/policies/${p.uuid}/acknowledge`); toast.success("Thank you. Your acknowledgement is recorded."); onDone(); }
    catch (e) { toast.error("Couldn't record it", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  const v = p?.current_version;
  return (
    <Modal open={!!p} onClose={onClose} size="xl" busy={busy} title={p?.title}
      description={v ? `Version ${v.version} · in force from ${formatDisplayDate(v.effective_from)}` : undefined}
      footerStart={needs ? <span className="text-[13px] text-muted">{p?.due_on ? `Please acknowledge by ${formatDisplayDate(p.due_on)}` : ""}</span> : undefined}
      footer={needs ? <><ModalCancel>Later</ModalCancel><Button variant="primary" icon={CheckCircle2} loading={busy} onClick={ack}>I have read and accept</Button></> : undefined}>
      {v?.file ? <FilePreview file={v.file} height={560} /> : <HtmlFrame html={policyHtml(v?.body_html ?? "")} height={560} title={p?.title ?? "Policy"} />}
      {p?.my_status === "acknowledged" && p.acknowledged_at && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-emerald-700"><CheckCircle2 size={15} strokeWidth={1.4} /> You acknowledged this on {formatDateTime(p.acknowledged_at)}.</p>
      )}
    </Modal>
  );
}

function ManagePolicies() {
  const toast = useToast();
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ active: ["true"] });
  const [form, setForm] = useState<Policy | "new" | null>(null);
  const [publish, setPublish] = useState<Policy | null>(null);
  const [report, setReport] = useState<Policy | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.active?.[0]) p.set("active", filters.active[0]);
    setRows(null);
    api.get<{ items: Policy[] }>(`/documents/policies?${p}`).then((r) => setRows(r.items))
      .catch((e) => { setRows([]); toast.error("Couldn't load policies", { description: errText(e) }); });
  }, [q, filters, nonce, toast]);
  const refresh = () => setNonce((n) => n + 1);
  const totals = (rows ?? []).reduce((a, p) => ({ assigned: a.assigned + (p.stats?.assigned ?? 0), ack: a.ack + (p.stats?.acknowledged ?? 0), overdue: a.overdue + (p.stats?.overdue ?? 0) }), { assigned: 0, ack: 0, overdue: 0 });

  const columns: Column<Policy>[] = [
    {
      key: "title", header: "Policy", sortable: true, sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-ink">{p.title}{p.is_posh && <Badge tone="accent">POSH</Badge>}{!p.active && <Badge>Off</Badge>}</p>
          <p className="truncate text-[12.5px] text-muted">{[p.category_name, audienceLabel(p.audience)].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "v", header: "Version", hideBelow: "md", cell: (p) => p.current_version ? <span className="text-muted">v{p.current_version.version} · {formatDisplayDate(p.current_version.effective_from)}</span> : <Badge tone="warn">Not published</Badge> },
    {
      key: "ack", header: "Acknowledged", width: "200px", hideBelow: "sm",
      cell: (p) => !p.requires_ack ? <span className="text-faint">Not needed</span> : p.stats && p.stats.assigned ? (
        <div><ProgressBar value={p.stats.acknowledged} total={p.stats.assigned} tone={p.stats.overdue ? "bg-amber-500" : "bg-emerald-500"} />
          <p className="mt-1 text-[12px] text-faint">{p.stats.acknowledged} of {p.stats.assigned}{p.stats.overdue ? <span className="text-rose-600"> · {p.stats.overdue} overdue</span> : null}</p></div>
      ) : <span className="text-faint">—</span>,
    },
    { key: "review", header: "Review on", hideBelow: "lg", cell: (p) => p.review_on ? <span className="text-muted">{formatDisplayDate(p.review_on)}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Policies" value={rows ? rows.length : "—"} icon={ScrollText} />
        <StatCard label="Acknowledged" value={totals.assigned ? `${Math.round((100 * totals.ack) / totals.assigned)}%` : "—"} icon={FileCheck2} hint={`${totals.ack} of ${totals.assigned}`} />
        <StatCard label="Overdue" value={totals.overdue} icon={BellRing} hint="People past the deadline" />
      </div>
      <FilterBar searchPlaceholder="Search policies" onSearchChange={setQ} values={filters} onChange={setFilters}
        filters={[{ key: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Switched off" }] }]}
        actions={<Button variant="primary" icon={Plus} onClick={() => setForm("new")}>New policy</Button>} />
      <DataTable rows={rows ?? []} rowKey={(p) => p.uuid} columns={columns} loading={!rows} onRowClick={setReport}
        rowActions={(p) => [
          { label: "Acknowledgements", icon: FileCheck2, onSelect: () => setReport(p) },
          { label: "Publish a new version", icon: FilePlus2, onSelect: () => setPublish(p) },
          { label: "Edit", icon: Pencil, onSelect: () => setForm(p) },
        ]}
        emptyIcon={ScrollText} emptyTitle="No policies yet" emptyHint="Add the POSH policy, code of conduct and other policies employees must read."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setForm("new")}>New policy</Button>} />
      {form && <PolicyForm target={form} onClose={() => setForm(null)} onSaved={(p, isNew) => { setForm(null); refresh(); if (isNew) setPublish(p); }} />}
      {publish && <PublishModal policy={publish} onClose={() => setPublish(null)} onSaved={() => { setPublish(null); refresh(); }} />}
      <ReportModal policy={report} onClose={() => setReport(null)} onPublish={(p) => { setReport(null); setPublish(p); }} />
    </div>
  );
}

function PolicyForm({ target, onClose, onSaved }: { target: Policy | "new"; onClose: () => void; onSaved: (p: Policy, isNew: boolean) => void }) {
  const toast = useToast();
  const edit = target === "new" ? null : target;
  const [v, setV] = useState({
    title: edit?.title ?? "", category_id: edit?.category_id ?? null as number | null, description: edit?.description ?? "",
    audience: edit?.audience ?? { all: true } as Audience, requires_ack: edit?.requires_ack ?? true, ack_due_days: edit?.ack_due_days ?? 14 as number | null,
    reminder_every_days: edit?.reminder_every_days ?? 3 as number | null, is_posh: edit?.is_posh ?? false, review_on: edit?.review_on ?? "",
    owner_name: edit?.owner_name ?? "", active: edit?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) { toast.error("Give the policy a title"); return; }
    setSaving(true);
    try {
      const body = { ...v, review_on: v.review_on || null, description: v.description || null, owner_name: v.owner_name || null };
      const p = edit ? await api.put<Policy>(`/documents/policies/${edit.uuid}`, body) : await api.post<Policy>("/documents/policies", body);
      toast.success(edit ? "Policy saved" : "Policy added. Publish its first version."); onSaved(p, !edit);
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} title={edit ? `Edit ${edit.title}` : "New policy"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="policy-form" loading={saving}>{edit ? "Save" : "Continue"}</Button></>}>
      <form id="policy-form" onSubmit={save} className="space-y-5" noValidate>
        <FormGrid>
          <Field label="Title" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder="e.g. Code of conduct" /></Field>
          <Field label="Category"><MasterSelect type="policy_category" value={v.category_id} onChange={(x) => setV({ ...v, category_id: x })} clearable /></Field>
          <Field label="Owner" aside="Optional"><TextInput value={v.owner_name} onValueChange={(x) => setV({ ...v, owner_name: x })} placeholder="e.g. HR team" /></Field>
          <Field label="Summary" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} /></Field>
        </FormGrid>
        <Field label="Who it applies to"><AudiencePicker value={v.audience} onChange={(a) => setV({ ...v, audience: a })} /></Field>
        <div className="space-y-3 rounded-xl border border-line p-4">
          <Toggle checked={v.requires_ack} onChange={(x) => setV({ ...v, requires_ack: x })} label="Everyone must acknowledge it" description="People are reminded until they confirm they have read it" />
          {v.requires_ack && <FormGrid>
            <Field label="Deadline"><NumberInput value={v.ack_due_days} onChange={(x) => setV({ ...v, ack_due_days: x })} min={1} max={365} suffix="days" /></Field>
            <Field label="Remind every"><NumberInput value={v.reminder_every_days} onChange={(x) => setV({ ...v, reminder_every_days: x })} min={1} max={30} suffix="days" /></Field>
          </FormGrid>}
        </div>
        <FormGrid>
          <Field label="Review on" hint="HR is reminded 30 days before"><DateInput value={v.review_on} onChange={(x) => setV({ ...v, review_on: x })} clearable /></Field>
          <div className="space-y-3 pt-6">
            <Toggle checked={v.is_posh} onChange={(x) => setV({ ...v, is_posh: x })} label="This is the POSH policy" />
            {edit && <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" />}
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}

function PublishModal({ policy, onClose, onSaved }: { policy: Policy; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"file" | "text">("text");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState(policy.current_version?.body_html ?? "");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [again, setAgain] = useState(true);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let upload_uuid: string | null = null;
      if (mode === "file") { if (!files[0]) { toast.error("Pick the policy document"); setSaving(false); return; } upload_uuid = (await uploadFile(files[0])).uuid; }
      const body_html = mode === "text" ? (/<[a-z][\s\S]*>/i.test(text) ? text : text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")) : null;
      await api.post(`/documents/policies/${policy.uuid}/versions`, { upload_uuid, body_html, effective_from: from || null, change_note: note || null, ask_again: again });
      toast.success("Published", { description: policy.requires_ack && again ? "Everyone it applies to has been asked to acknowledge it." : undefined });
      onSaved();
    } catch (err) { toast.error("Couldn't publish", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} title={`Publish ${policy.current_version ? "a new version of" : ""} ${policy.title}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="publish-form" loading={saving}>Publish</Button></>}>
      <form id="publish-form" onSubmit={save} className="space-y-4" noValidate>
        <Tabs variant="pill" value={mode} onChange={setMode} items={[{ value: "text", label: "Write the text" }, { value: "file", label: "Attach a document" }]} />
        {mode === "file" ? <FileDrop value={files} onChange={setFiles} accept=".pdf,.png,.jpg,.jpeg" maxSizeMb={10} hint="PDF works best" />
          : <Textarea value={text} onValueChange={setText} rows={12} placeholder="Paste or write the policy. Blank lines start new paragraphs; HTML is kept." />}
        <FormGrid>
          <Field label="In force from" aside="Default today"><DateInput value={from} onChange={setFrom} clearable /></Field>
          <Field label="What changed" aside="Optional"><TextInput value={note} onValueChange={setNote} placeholder="e.g. Updated travel limits" /></Field>
        </FormGrid>
        {policy.current_version && policy.requires_ack && (
          <Toggle checked={again} onChange={setAgain} label="Ask everyone to acknowledge again" description="Turn off for small fixes; earlier acknowledgements are kept" />
        )}
      </form>
    </Modal>
  );
}

type AckRow = { employee_id: number; employee_name: string; employee_code: string | null; status: string; due_on: string | null; acknowledged_at: string | null; reminder_count: number };

function ReportModal({ policy: p, onClose, onPublish }: { policy: Policy | null; onClose: () => void; onPublish: (p: Policy) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<AckRow[] | null>(null);
  const [detail, setDetail] = useState<Policy | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!p) return;
    setRows(null); setDetail(null);
    api.get<{ items: AckRow[] }>(`/documents/policies/${p.uuid}/acknowledgements`).then((r) => setRows(r.items)).catch(() => setRows([]));
    api.get<Policy>(`/documents/policies/${p.uuid}`).then(setDetail).catch(() => {});
  }, [p]);
  const shown = (rows ?? []).filter((r) => (!filters.status?.length || filters.status.includes(r.status)) && (!q || r.employee_name.toLowerCase().includes(q.toLowerCase())));
  async function remind() {
    if (!p) return;
    try { const r = await api.post<{ reminded: number }>(`/documents/policies/${p.uuid}/remind`); toast.success(r.reminded ? `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}` : "Nobody is pending"); }
    catch (e) { toast.error("Couldn't send reminders", { description: errText(e) }); }
  }
  const s = detail?.stats ?? p?.stats;
  const cols: Column<AckRow>[] = [
    { key: "n", header: "Employee", sortable: true, sortValue: (r) => r.employee_name, cell: (r) => <div><p className="text-ink">{r.employee_name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "s", header: "Status", cell: (r) => <StatusBadge map={ACK_STATUS} value={r.status} /> },
    { key: "d", header: "Due", hideBelow: "sm", cell: (r) => r.due_on ? formatDisplayDate(r.due_on) : "—" },
    { key: "a", header: "Acknowledged", hideBelow: "md", sortable: true, sortValue: (r) => r.acknowledged_at, cell: (r) => r.acknowledged_at ? formatDateTime(r.acknowledged_at) : <span className="text-faint">{r.reminder_count ? `Reminded ${r.reminder_count}×` : "—"}</span> },
  ];
  return (
    <Modal open={!!p} onClose={onClose} size="xl" title={p?.title} description={p?.current_version ? `Version ${p.current_version.version} · ${audienceLabel(p.audience)}` : "Not published yet"}
      headerActions={p && <Button size="sm" icon={FilePlus2} onClick={() => onPublish(p)}>New version</Button>}>
      {p && <>
        {s && p.requires_ack && <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <StatCard label="Asked" value={s.assigned} /><StatCard label="Acknowledged" value={s.acknowledged} />
          <StatCard label="Pending" value={s.pending} /><StatCard label="Overdue" value={s.overdue} />
        </div>}
        <FilterBar searchPlaceholder="Search people" onSearchChange={setQ} values={filters} onChange={setFilters}
          filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "acknowledged", label: "Acknowledged" }, { value: "pending", label: "Pending" }, { value: "overdue", label: "Overdue" }] }]}
          actions={<>
            <Button size="sm" icon={BellRing} onClick={remind}>Remind pending</Button>
            <Button size="sm" icon={Download} onClick={() => downloadFrom(`/documents/policies/${p.uuid}/acknowledgements?format=csv`, `${p.title} acknowledgements.csv`).catch((e) => toast.error("Couldn't download", { description: errText(e) }))}>CSV</Button>
          </>} />
        <DataTable rows={shown} rowKey={(r) => r.employee_id} columns={cols} loading={!rows} emptyTitle={p.requires_ack ? "Nobody here" : "This policy doesn't need acknowledgement"} />
        {detail?.versions && detail.versions.length > 0 && (
          <Section title="Versions" className="mt-6 border-t border-line">
            <KeyValue columns={1} items={detail.versions.map((v) => ({
              label: `Version ${v.version}`,
              value: <span className="text-muted">{v.change_note || "Published"} · from {formatDisplayDate(v.effective_from)} · {v.published_by_name ?? ""} {formatDate(v.published_at)}</span>,
            }))} />
          </Section>
        )}
      </>}
    </Modal>
  );
}
