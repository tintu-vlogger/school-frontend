"use client";

/*
 * Templates (settings): letter templates with the designer, and header/footer designs
 * (logo, address, signature images) that templates and letters can use.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, FileText, LayoutTemplate, PanelBottom, PanelTop, Pencil, Plus, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useUrlTab } from "@/lib/use-url-tab";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Skeleton, Tabs, TextInput, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { readAsDataUrl } from "@/components/workplace/files";
import { MergePalette, useLetterheads, useLettersMeta, useTemplates } from "@/components/documents/letter-tools";
import { RichEditor, type RichEditorHandle } from "@/components/documents/rich-editor";
import { TemplateDesigner } from "@/components/documents/template-designer";
import { HtmlFrame, errText, type Letterhead, type Template } from "@/components/documents/shared";

type Tab = "templates" | "designs";

export default function TemplatesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("templates");
  useUrlTab(["templates", "designs"] as const, setTab);
  const [nonce, setNonce] = useState(0);
  const templates = useTemplates(nonce);
  const heads = useLetterheads(nonce);
  const meta = useLettersMeta();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [designing, setDesigning] = useState<Template | "new" | null>(null);
  const [designKey, setDesignKey] = useState(0);
  const [headForm, setHeadForm] = useState<Letterhead | "header" | "footer" | null>(null);

  const rows = useMemo(() => (templates ?? []).filter((t) =>
    (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (!filters.type?.length || filters.type.includes(t.letter_type))
    && (!filters.flag?.length || filters.flag.every((f) => (f === "self" ? t.self_service : f === "esign" ? t.esign_required : !t.active)))), [templates, q, filters]);

  async function open(t: Template) {
    try { const full = await api.get<Template>(`/letters/templates/${t.uuid}`); setDesignKey((k) => k + 1); setDesigning(full); }
    catch (e) { toast.error("Couldn't open the template", { description: errText(e) }); }
  }
  async function duplicate(t: Template) {
    try { const c = await api.post<Template>(`/letters/templates/${t.uuid}/duplicate`); toast.success("Copy made"); setNonce((n) => n + 1); setDesignKey((k) => k + 1); setDesigning(c); }
    catch (e) { toast.error("Couldn't copy", { description: errText(e) }); }
  }
  const headName = (id: number | null) => (heads ?? []).find((h) => h.id === id)?.name;

  const columns: Column<Template>[] = [
    {
      key: "name", header: "Template", sortable: true, sortValue: (t) => t.name,
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunken text-muted"><FileText size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{t.name}</p>
            <p className="truncate text-[12.5px] text-muted">{t.subject || t.description}</p>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Kind", sortable: true, sortValue: (t) => t.letter_type_label, hideBelow: "md", cell: (t) => <span className="text-muted">{t.letter_type_label}</span> },
    {
      key: "flags", header: "", cell: (t) => (
        <div className="flex flex-wrap gap-1.5">
          {t.is_default && <Badge tone="accent">Default</Badge>}
          {t.self_service && <Badge tone="info">Self-service</Badge>}
          {t.esign_required && <Badge tone="warn">E-sign</Badge>}
          {!t.active && <Badge>Off</Badge>}
        </div>
      ),
    },
    { key: "design", header: "Header / footer", hideBelow: "lg", cell: (t) => <span className="text-muted">{headName(t.header_id) ?? "Default"} · {headName(t.footer_id) ?? "Default"}</span> },
    { key: "upd", header: "Updated", hideBelow: "lg", cell: (t) => <span className="text-muted">v{t.version} · {formatDate(t.updated_at)}</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Templates" description="Letters filled in with employee details, printed on your own header and footer designs."
        actions={<>
          <Link href="/dashboard/documents/letters"><Button icon={FileText}>Generated letters</Button></Link>
          {tab === "templates" ? <Button variant="primary" icon={Plus} onClick={() => { setDesignKey((k) => k + 1); setDesigning("new"); }}>New template</Button>
            : <><Button icon={PanelBottom} onClick={() => setHeadForm("footer")}>New footer</Button><Button variant="primary" icon={PanelTop} onClick={() => setHeadForm("header")}>New header</Button></>}
        </>} />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[
        { value: "templates", label: "Letter templates", icon: LayoutTemplate, count: templates?.length },
        { value: "designs", label: "Headers and footers", icon: PanelTop, count: heads?.length },
      ]} />
      {tab === "templates" ? (
        <>
          <FilterBar searchPlaceholder="Search templates" onSearchChange={setQ} values={filters} onChange={setFilters}
            filters={[
              { key: "type", label: "Kind", multiple: true, options: (meta?.letter_types ?? []).map((t) => ({ value: t.value, label: t.label })) },
              { key: "flag", label: "Show", multiple: true, options: [{ value: "self", label: "Self-service" }, { value: "esign", label: "Needs signatures" }, { value: "off", label: "Switched off" }] },
            ]} />
          <DataTable rows={rows} rowKey={(t) => t.uuid} columns={columns} loading={!templates} onRowClick={open}
            rowActions={(t) => [{ label: "Edit", icon: Pencil, onSelect: () => open(t) }, { label: "Duplicate", icon: Copy, onSelect: () => duplicate(t) }]}
            emptyIcon={LayoutTemplate} emptyTitle={q ? "No templates match" : "No templates yet"} />
        </>
      ) : (
        <Designs heads={heads} onEdit={setHeadForm} />
      )}
      {designing && <TemplateDesigner key={designKey} template={designing} onClose={() => setDesigning(null)} onSaved={() => { setDesigning(null); setNonce((n) => n + 1); }} />}
      {headForm && <LetterheadModal target={headForm} onClose={() => setHeadForm(null)} onSaved={() => { setHeadForm(null); setNonce((n) => n + 1); }} />}
    </div>
  );
}

function Designs({ heads, onEdit }: { heads: Letterhead[] | null; onEdit: (h: Letterhead) => void }) {
  if (!heads) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>;
  return (
    <div className="space-y-8">
      {(["header", "footer"] as const).map((kind) => (
        <section key={kind}>
          <p className="mb-3 text-[12px] uppercase tracking-[0.07em] text-faint">{kind === "header" ? "Headers" : "Footers"}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {heads.filter((h) => h.kind === kind).map((h) => <DesignCard key={h.uuid} h={h} onEdit={() => onEdit(h)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function DesignCard({ h, onEdit }: { h: Letterhead; onEdit: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { api.post<{ html: string }>(`/letters/letterheads/${h.uuid}/preview`).then((r) => setHtml(r.html)).catch(() => setHtml("")); }, [h.uuid, h.html, h.height_mm]);
  return (
    <button type="button" onClick={onEdit} className="group overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-line-strong">
      <div className="pointer-events-none relative h-44 overflow-hidden bg-[#eceae6]">
        {html === null ? <Skeleton className="h-full w-full" /> : (
          <iframe title={h.name} sandbox="" srcDoc={html} className="absolute left-1/2 border-0"
            style={{ width: 800, height: 1123, transform: "translateX(-50%) scale(0.46)", transformOrigin: "50% 0", top: h.kind === "footer" ? -1123 * 0.46 + 176 : 0 }} />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div className="min-w-0"><p className="truncate text-[14px] text-ink">{h.name}</p><p className="text-[12px] text-faint">{h.height_mm} mm tall</p></div>
        <div className="flex gap-1.5">{h.is_default && <Badge tone="accent">Default</Badge>}{!h.active && <Badge>Off</Badge>}</div>
      </div>
    </button>
  );
}

function LetterheadModal({ target, onClose, onSaved }: { target: Letterhead | "header" | "footer"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const edit = typeof target === "string" ? null : target;
  const kind = edit?.kind ?? (target as "header" | "footer");
  const init = { name: edit?.name ?? "", html: edit?.html ?? (kind === "header" ? "<div>{{company.logo}}<div style=\"font-size:15pt\">{{company.name}}</div><div class=\"muted\" style=\"font-size:8.5pt\">{{company.address}}</div></div><hr>" : "<div class=\"center muted\" style=\"font-size:8pt\">{{legal_entity.name}} · Page {{page.number}} of {{page.total}}</div>"),
    height_mm: edit?.height_mm ?? (kind === "header" ? 28 : 14), is_default: edit?.is_default ?? false, active: edit?.active ?? true };
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const editor = useRef<RichEditorHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => frame(v.html, kind, v.height_mm), [v.html, kind, v.height_mm]);

  async function pickImage(f: File | undefined) {
    if (!f) return;
    if (f.size > 600_000) { toast.error("Use an image under 600 KB"); return; }
    const url = await readAsDataUrl(f);
    editor.current?.insertHtml(`<img src="${url}" style="max-height:${kind === "header" ? 18 : 10}mm;max-width:60mm" alt="">`);
  }
  async function save() {
    if (!v.name.trim()) { toast.error("Give the design a name"); return; }
    setSaving(true);
    try {
      if (edit) await api.put(`/letters/letterheads/${edit.uuid}`, { ...v, kind }); else await api.post("/letters/letterheads", { ...v, kind });
      toast.success("Design saved"); onSaved();
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="full" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(init)}
      title={edit ? `Edit ${edit.name}` : `New ${kind}`} description="Add your logo, address, registration details or a signature image."
      footer={<><ModalCancel /><Button variant="primary" icon={Save} loading={saving} onClick={save}>Save design</Button></>}>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="grid h-full gap-6 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4">
          <FormGrid columns={3}>
            <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Classic with logo" /></Field>
            <Field label="Height"><NumberInput value={v.height_mm} onChange={(x) => setV({ ...v, height_mm: x ?? 20 })} min={5} max={120} suffix="mm" /></Field>
            <div className="space-y-2 pt-6"><Toggle size="sm" checked={v.is_default} onChange={(x) => setV({ ...v, is_default: x })} label="Default" /></div>
          </FormGrid>
          <RichEditor ref={editor} value={v.html} onChange={(x) => setV({ ...v, html: x })} minHeight={200} onImage={() => file.current?.click()} />
          <div className="h-56 rounded-xl border border-line p-3">
            <MergePalette onInsert={(t) => editor.current?.insert(t)} groups={["company", "legal_entity", "letter"]}
              extra={kind === "footer" ? [{ key: "page.number", label: "Page number" }, { key: "page.total", label: "Total pages" }] : []} />
          </div>
          {edit && <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" description="Switched-off designs can't be picked for new letters" />}
        </div>
        <div className="min-h-[480px]"><HtmlFrame html={preview} height={640} title="Design preview" /></div>
      </div>
    </Modal>
  );
}

/** Sample page for the design editor; merge fields shown as their names. */
function frame(html: string, kind: "header" | "footer", heightMm: number) {
  const shown = html.replace(/\{\{\s*([\w.]+)(?:\|\w+)?\s*\}\}/g, (_m, k: string) =>
    k === "company.logo" ? '<span style="display:inline-block;width:34mm;height:12mm;border:1px dashed #b8b4ac;border-radius:3px;color:#9a968e;font-size:8pt;text-align:center;line-height:12mm">Logo</span>'
      : k === "page.number" ? "1" : k === "page.total" ? "2" : `<span style="background:#eef0ff;color:#4f46e5;border-radius:3px;padding:0 3px">${k}</span>`);
  const block = `<div style="height:${heightMm}mm;overflow:hidden;${kind === "header" ? "margin-bottom:8mm" : "margin-top:8mm"}">${shown}</div>`;
  const body = '<p style="color:#9a968e">The letter text goes here.</p>'.repeat(6);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#eceae6}.sheet{box-sizing:border-box;width:210mm;min-height:150mm;margin:12px auto;background:#fff;padding:12mm 20mm;
font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11pt;color:#1f2430;display:flex;flex-direction:column}
.muted{color:#6b7080}.center{text-align:center}.right{text-align:right}table{width:100%;border-collapse:collapse}td{vertical-align:top}hr{border:none;border-top:.6pt solid #c9ccd4}img{max-width:100%}
</style></head><body><div class="sheet">${kind === "header" ? block : ""}<div style="flex:1">${body}</div>${kind === "footer" ? block : ""}</div></body></html>`;
}
