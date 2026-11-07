"use client";

/*
 * Letter helpers: cached meta (letter types, merge fields, page sizes), template and
 * header/footer lists, inputs for a template's extra fields, the merge-field palette and the
 * live preview pane (server-rendered HTML in a scaled iframe, plus a real PDF preview).
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Braces, FileDown, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { DateInput, Field, FormGrid, NumberInput, Select, TextInput, Textarea } from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { postForBlob } from "@/components/workplace/files";
import { errText, type ExtraField, type Letterhead, type LettersMeta, type Template } from "./shared";

let metaCache: LettersMeta | null = null;
export function useLettersMeta() {
  const [m, setM] = useState<LettersMeta | null>(metaCache);
  useEffect(() => { if (!metaCache) api.get<LettersMeta>("/letters/meta").then((r) => { metaCache = r; setM(r); }).catch(() => {}); }, []);
  return m;
}

export function useTemplates(nonce = 0) {
  const [t, setT] = useState<Template[] | null>(null);
  useEffect(() => { api.get<{ items: Template[] }>("/letters/templates").then((r) => setT(r.items)).catch(() => setT([])); }, [nonce]);
  return t;
}

export function useLetterheads(nonce = 0) {
  const [h, setH] = useState<Letterhead[] | null>(null);
  useEffect(() => { api.get<{ items: Letterhead[] }>("/letters/letterheads").then((r) => setH(r.items)).catch(() => setH([])); }, [nonce]);
  return h;
}

export function ExtraFieldInputs({ fields, values, onChange, note }: {
  fields: ExtraField[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; note?: string;
}) {
  if (!fields.length) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-[13px] text-muted">{note ?? "Details for this letter"}</p>
      <FormGrid columns={1}>
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required}>
            {f.type === "date" ? <DateInput value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} clearable />
              : f.type === "money" || f.type === "number" ? <NumberInput value={values[f.key] ? Number(values[f.key]) : null} onChange={(v) => set(f.key, v === null ? "" : String(v))} suffix={f.type === "money" ? "₹" : undefined} />
                : f.type === "textarea" ? <Textarea value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)} rows={3} />
                  : <TextInput value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)} />}
          </Field>
        ))}
      </FormGrid>
    </div>
  );
}

const FILTERS = [{ value: "", label: "As is" }, { value: "date", label: "Date" }, { value: "money", label: "₹ amount" }, { value: "words", label: "In words" }, { value: "upper", label: "CAPITALS" }];

/** Click a field to insert {{field}} (with an optional filter). */
export function MergePalette({ onInsert, groups, extra = [] }: { onInsert: (token: string) => void; groups?: string[]; extra?: { key: string; label: string }[] }) {
  const meta = useLettersMeta();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const list = (meta?.merge_fields ?? []).filter((g) => !groups || groups.includes(g.group));
  const t = q.trim().toLowerCase();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 pb-2">
        <TextInput leading={Search} value={q} onValueChange={setQ} placeholder="Find a field" className="h-8 text-[13px]" />
        <div className="w-[118px] shrink-0"><Select value={filter} onChange={(v) => setFilter(v ?? "")} options={FILTERS} aria-label="Format" /></div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {[...list.map((g) => ({ label: g.label, fields: g.fields })), ...(extra.length ? [{ label: "Page and extra", fields: extra.map((e) => ({ ...e, sample: "" })) }] : [])].map((g) => {
          const fields = g.fields.filter((f) => !t || f.label.toLowerCase().includes(t) || f.key.includes(t));
          if (!fields.length) return null;
          return (
            <div key={g.label}>
              <p className="mb-1 text-[11px] uppercase tracking-[0.07em] text-faint">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {fields.map((f) => (
                  <button key={f.key} type="button" title={f.sample ? `e.g. ${f.sample}` : f.key}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsert(`{{${f.key}${filter && !f.key.startsWith("page.") ? `|${filter}` : ""}}}`)}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft/40 hover:text-primary">
                    <Braces size={11} strokeWidth={1.4} className="text-faint" />{f.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A scaled preview of an A4/Letter page rendered by the server. Pass a saved template uuid and/or an unsaved template draft. */
export function LetterPreviewPane({ templateUuid, draft, employeeId, values, headerId, footerId, pickEmployee = false, pageWidthMm = 210 }: {
  templateUuid: string | null; draft?: Record<string, unknown> | null; employeeId?: number | null; values?: Record<string, string>;
  headerId?: number | null; footerId?: number | null; pickEmployee?: boolean; pageWidthMm?: number;
}) {
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [html, setHtml] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [asEmp, setAsEmp] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const emp = employeeId ?? asEmp;
  const body = JSON.stringify({ template_uuid: templateUuid, template: draft ?? null, employee_id: emp, values: values ?? {}, header_id: headerId ?? null, footer_id: footerId ?? null });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!templateUuid && !draft) { setHtml(null); return; }
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api.post<{ html: string; missing: string[] }>("/letters/preview", JSON.parse(body))
        .then((r) => { if (live) { setHtml(r.html); setMissing(r.missing); } })
        .catch(() => { /* keep the last good preview while typing */ })
        .finally(() => { if (live) setLoading(false); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [body, templateUuid, draft]);

  const pxPerMm = 96 / 25.4;
  const pagePx = pageWidthMm * pxPerMm;
  const scale = Math.min(1, (width - 24) / pagePx);

  async function pdf() {
    setPdfBusy(true);
    try { const url = await postForBlob("/letters/preview.pdf", JSON.parse(body)); window.open(url, "_blank"); }
    catch (e) { toast.error("Couldn't make the PDF", { description: errText(e) }); }
    finally { setPdfBusy(false); }
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-line bg-[#eceae6]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/80 px-3 py-2">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          {loading ? <Loader2 size={14} strokeWidth={1.4} className="animate-spin" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
          Live preview
        </div>
        <div className="flex items-center gap-2">
          {pickEmployee && <div className="w-56"><Select value={asEmp} onChange={setAsEmp} loadOptions={loadEmployees} placeholder="Preview as (sample data)" clearable /></div>}
          <button type="button" onClick={pdf} disabled={pdfBusy || (!templateUuid && !draft)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink hover:border-line-strong disabled:opacity-40">
            {pdfBusy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} strokeWidth={1.4} />} PDF
          </button>
        </div>
      </div>
      {missing.length > 0 && emp && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-800">
          <AlertTriangle size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />
          <span>No value yet for: {missing.join(", ")}</span>
        </div>
      )}
      <div ref={box} className="relative min-h-0 flex-1 overflow-auto p-3">
        {html ? (
          <div style={{ width: pagePx * scale, height: 1123 * scale * 1.05, margin: "0 auto" }}>
            <iframe title="Letter preview" sandbox="" srcDoc={html} style={{ width: pagePx + 2, height: 1123 * 1.05, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }} />
          </div>
        ) : <div className="flex h-full items-center justify-center text-[13.5px] text-muted">Pick a template to see the letter</div>}
      </div>
    </div>
  );
}
