"use client";

/*
 * Template designer (full-size modal): rich editor and merge fields on the left, settings
 * in a tab, and a live server-rendered preview on the right.
 */
import { useMemo, useRef, useState } from "react";
import { Braces, Plus, Save, Settings2, Trash2, Type, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, Checkbox, Field, FormGrid, FormSection, Modal, ModalCancel, NumberInput, Select, Tabs, TextInput, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { LetterPreviewPane, MergePalette, useLetterheads, useLettersMeta } from "./letter-tools";
import { RichEditor, type RichEditorHandle } from "./rich-editor";
import { errText, type ExtraField, type Template, type TemplateSigner } from "./shared";

type Draft = Omit<Template, "id" | "uuid" | "letter_type_label" | "version" | "updated_at" | "fields_used">;

const BLANK: Draft = {
  name: "", letter_type: "other", description: "", subject: "", body_html: "<p>Dear {{employee.first_name}},</p><p></p>", header_id: null, footer_id: null,
  page_size: "A4", orientation: "portrait", margin_top: 20, margin_right: 20, margin_bottom: 20, margin_left: 20, font_family: "Helvetica",
  font_size: 11, extra_fields: [], self_service: false, esign_required: false, signers: [], signing_order: true, is_default: false, active: true,
};
const SIZE_MM: Record<string, [number, number]> = { A4: [210, 297], A5: [148, 210], Letter: [216, 279], Legal: [216, 356] };

export function TemplateDesigner({ template, onClose, onSaved }: { template: Template | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const meta = useLettersMeta();
  const heads = useLetterheads();
  const edit = template === "new" ? null : template;
  const initial: Draft = useMemo(() => (edit ? { ...BLANK, ...edit, description: edit.description ?? "", subject: edit.subject ?? "", body_html: edit.body_html ?? "" } : BLANK), [edit]);
  const [d, setD] = useState<Draft>(initial);
  const [side, setSide] = useState<"fields" | "settings" | "signing">("fields");
  const [saving, setSaving] = useState(false);
  const editor = useRef<RichEditorHandle>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const lh = (kind: "header" | "footer"): SelectOption<number>[] => (heads ?? []).filter((h) => h.kind === kind).map((h) => ({ value: h.id, label: h.name, description: h.is_default ? "Default" : undefined }));
  const previewDraft = useMemo(() => ({ ...d, name: d.name || "Preview" }), [d]);
  const [w] = SIZE_MM[d.page_size] ?? SIZE_MM.A4;
  const pageW = d.orientation === "landscape" ? (SIZE_MM[d.page_size] ?? SIZE_MM.A4)[1] : w;

  async function save() {
    if (!d.name.trim()) { toast.error("Give the template a name"); setSide("settings"); return; }
    setSaving(true);
    try {
      if (edit) await api.put(`/letters/templates/${edit.uuid}`, d); else await api.post("/letters/templates", d);
      toast.success("Template saved"); onSaved();
    } catch (e) { toast.error("Couldn't save the template", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="full" dirty={dirty} busy={saving} bodyClassName="!p-0"
      title={<span className="flex items-center gap-3">
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Template name"
          className="w-[320px] max-w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-light text-ink outline-none hover:border-line focus:border-primary/40" />
      </span>}
      description={edit ? `Version ${edit.version} · ${edit.letter_type_label ?? ""}` : "New template"}
      footerStart={<span className="text-[12.5px] text-faint">Merge fields like {"{{employee.full_name}}"} are filled in for each employee.</span>}
      footer={<><ModalCancel /><Button variant="primary" icon={Save} loading={saving} onClick={save}>Save template</Button></>}>
      <div className="grid h-full min-h-[70vh] gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3 border-line p-4 lg:border-r">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <TextInput value={d.subject ?? ""} onValueChange={(v) => set("subject", v)} placeholder="Letter title, e.g. Offer of employment" leading={Type} />
            <Select value={d.letter_type} onChange={(v) => set("letter_type", v ?? "other")} options={(meta?.letter_types ?? []).map((t) => ({ value: t.value, label: t.label }))} aria-label="Kind of letter" />
          </div>
          <RichEditor ref={editor} value={d.body_html ?? ""} onChange={(v) => set("body_html", v)} minHeight={340} placeholder="Write the letter" />
          <div className="rounded-xl border border-line">
            <Tabs className="px-3" value={side} onChange={setSide} items={[
              { value: "fields", label: "Merge fields", icon: Braces }, { value: "settings", label: "Page and layout", icon: Settings2 }, { value: "signing", label: "Use and signing", icon: Users },
            ]} />
            <div className="h-[260px] overflow-y-auto p-4">
              {side === "fields" && <MergePalette onInsert={(t) => editor.current?.insert(t)} extra={d.extra_fields.map((f) => ({ key: f.key, label: f.label }))} />}
              {side === "settings" && (
                <div className="space-y-4">
                  <FormGrid columns={3}>
                    <Field label="Header"><Select value={d.header_id} onChange={(v) => set("header_id", v)} options={lh("header")} placeholder="Company default" clearable /></Field>
                    <Field label="Footer"><Select value={d.footer_id} onChange={(v) => set("footer_id", v)} options={lh("footer")} placeholder="Company default" clearable /></Field>
                    <Field label="Page"><Select value={d.page_size} onChange={(v) => set("page_size", v ?? "A4")} options={(meta?.page_sizes ?? ["A4"]).map((p) => ({ value: p, label: p }))} /></Field>
                    <Field label="Orientation"><Select value={d.orientation} onChange={(v) => set("orientation", v ?? "portrait")} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} /></Field>
                    <Field label="Font"><Select value={d.font_family} onChange={(v) => set("font_family", v ?? "Helvetica")} options={(meta?.fonts ?? ["Helvetica"]).map((f) => ({ value: f, label: f }))} /></Field>
                    <Field label="Size"><NumberInput value={d.font_size} onChange={(v) => set("font_size", v ?? 11)} min={8} max={16} suffix="pt" /></Field>
                  </FormGrid>
                  <FormGrid columns={3}>
                    {(["margin_top", "margin_right", "margin_bottom", "margin_left"] as const).map((k) => (
                      <Field key={k} label={`${k.split("_")[1][0].toUpperCase()}${k.split("_")[1].slice(1)} margin`}>
                        <NumberInput value={d[k]} onChange={(v) => set(k, v ?? 20)} min={5} max={60} suffix="mm" />
                      </Field>
                    ))}
                  </FormGrid>
                  <Field label="Description" aside="Optional"><TextInput value={d.description ?? ""} onValueChange={(v) => set("description", v)} /></Field>
                </div>
              )}
              {side === "signing" && <UseAndSigning d={d} set={set} />}
            </div>
          </div>
        </div>
        <div className="min-h-0 p-4">
          <LetterPreviewPane templateUuid={edit?.uuid ?? null} draft={previewDraft as unknown as Record<string, unknown>} pickEmployee pageWidthMm={pageW} />
        </div>
      </div>
    </Modal>
  );
}

function UseAndSigning({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  const updField = (i: number, p: Partial<ExtraField>) => set("extra_fields", d.extra_fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const updSigner = (i: number, p: Partial<TemplateSigner>) => set("signers", d.signers.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle checked={d.is_default} onChange={(v) => set("is_default", v)} label="Default for this kind of letter" />
        <Toggle checked={d.active} onChange={(v) => set("active", v)} label="Active" />
        <Toggle checked={d.self_service} onChange={(v) => set("self_service", v)} label="Employees can request it" description="After approval it is made automatically" />
        <Toggle checked={d.esign_required} onChange={(v) => set("esign_required", v)} label="Needs signatures" description="Sent for e-signature when made" />
      </div>
      <FormSection title="Details asked when making the letter" description="Typed by HR, e.g. salary.ctc for an offer letter.">
        <div className="space-y-2">
          {d.extra_fields.map((f, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_120px_auto_auto]">
              <TextInput value={f.key} onValueChange={(v) => updField(i, { key: v.replace(/[^a-z0-9_.]/gi, "").toLowerCase() })} placeholder="salary.ctc" className="font-mono text-[12.5px]" />
              <TextInput value={f.label} onValueChange={(v) => updField(i, { label: v })} placeholder="Label" />
              <Select value={f.type} onChange={(v) => updField(i, { type: v ?? "text" })} aria-label="Type"
                options={[{ value: "text", label: "Text" }, { value: "money", label: "Amount" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "textarea", label: "Long text" }]} />
              <Checkbox checked={!!f.required} onChange={(v) => updField(i, { required: v })} label="Required" />
              <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove" onClick={() => set("extra_fields", d.extra_fields.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("extra_fields", [...d.extra_fields, { key: "", label: "", type: "text", required: false }])}>Add a detail</Button>
        </div>
      </FormSection>
      {d.esign_required && (
        <FormSection title="Who signs">
          <div className="space-y-2">
            {d.signers.map((s, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[180px_1fr_1fr_auto]">
                <Select value={s.kind} onChange={(v) => updSigner(i, { kind: v ?? "employee" })} aria-label="Signer"
                  options={[{ value: "employee", label: "The employee" }, { value: "manager", label: "Their manager" }, { value: "specific", label: "A colleague" }]} />
                {s.kind === "specific" ? <Select value={s.employee_id ?? null} onChange={(v) => updSigner(i, { employee_id: v ?? undefined })} loadOptions={loadEmployees} placeholder="Search people" /> : <span />}
                <TextInput value={s.label ?? ""} onValueChange={(v) => updSigner(i, { label: v })} placeholder="Shown as" />
                <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove" onClick={() => set("signers", d.signers.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div className="flex items-center gap-4">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("signers", [...d.signers, { kind: "employee", label: "" }])}>Add signer</Button>
              <Checkbox checked={d.signing_order} onChange={(v) => set("signing_order", v)} label="Sign in this order" />
            </div>
          </div>
        </FormSection>
      )}
    </div>
  );
}
