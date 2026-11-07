"use client";

/*
 * Bulk import of students from a CSV or XLSX file, read in the browser.
 *   <ImportStudentsModal open onClose onDone={refresh} />
 * Steps: pick a file (template download) -> check (server dry run, nothing saved) -> import.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { Badge, Button, FileDrop, Modal, ModalCancel, Stepper } from "@/components/ui-kit";
import { csvLine, downloadText, errText } from "@/components/academics/shared";
import { excelDate, readSheet } from "./sheet";

const FIELDS: { key: string; label: string; aliases: string[]; date?: boolean }[] = [
  { key: "admission_no", label: "Admission no", aliases: ["admission_number", "adm_no", "admission"] },
  { key: "first_name", label: "First name", aliases: ["first", "given_name"] },
  { key: "middle_name", label: "Middle name", aliases: ["middle"] },
  { key: "last_name", label: "Last name", aliases: ["surname", "last", "family_name"] },
  { key: "gender", label: "Gender", aliases: ["sex"] },
  { key: "date_of_birth", label: "Date of birth", aliases: ["dob", "birth_date"], date: true },
  { key: "blood_group", label: "Blood group", aliases: ["blood"] },
  { key: "email", label: "Email", aliases: ["student_email"] },
  { key: "phone", label: "Phone", aliases: ["mobile", "student_phone"] },
  { key: "program", label: "Class", aliases: ["class", "grade", "programme", "course", "standard"] },
  { key: "section", label: "Section", aliases: ["division", "batch", "group"] },
  { key: "roll_no", label: "Roll no", aliases: ["roll", "roll_number", "register_no"] },
  { key: "father_name", label: "Father name", aliases: ["father", "fathers_name", "father_s_name"] },
  { key: "mother_name", label: "Mother name", aliases: ["mother", "mothers_name", "mother_s_name"] },
  { key: "guardian_phone", label: "Guardian phone", aliases: ["parent_phone", "parent_mobile", "guardian_mobile", "father_phone"] },
  { key: "guardian_email", label: "Guardian email", aliases: ["parent_email", "father_email"] },
  { key: "address", label: "Address", aliases: [] },
  { key: "city", label: "City", aliases: [] },
  { key: "state", label: "State", aliases: [] },
  { key: "pincode", label: "PIN code", aliases: ["pin", "zip", "postal_code"] },
  { key: "admission_date", label: "Admission date", aliases: ["date_of_admission", "joined_on"], date: true },
  { key: "category", label: "Category", aliases: ["caste_category"] },
  { key: "religion", label: "Religion", aliases: [] },
  { key: "mother_tongue", label: "Mother tongue", aliases: ["language"] },
  { key: "previous_institution", label: "Previous school", aliases: ["previous_institution", "last_school"] },
];

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function toISO(v: string): string | null {
  const s = excelDate(v.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day first (DD/MM/YYYY)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

type Mapped = { line: number; data: Record<string, string>; problem: string | null };
type Result = { created: number; errors: { row: number; message: string }[]; dry_run: boolean };

function mapRows(sheet: string[][]): { columns: string[]; unknown: string[]; rows: Mapped[] } {
  const [head, ...body] = sheet;
  const keys = (head ?? []).map((h) => {
    const n = norm(h);
    return FIELDS.find((f) => f.key === n || norm(f.label) === n || f.aliases.includes(n))?.key ?? null;
  });
  const columns = keys.filter((k): k is string => !!k);
  const unknown = (head ?? []).filter((_, i) => !keys[i] && head[i].trim());
  const rows = body.map((cells, i) => {
    const data: Record<string, string> = {};
    let problem: string | null = null;
    keys.forEach((k, j) => {
      const raw = (cells[j] ?? "").trim();
      if (!k || !raw) return;
      const f = FIELDS.find((x) => x.key === k)!;
      if (f.date) {
        const d = toISO(raw);
        if (!d) problem = `${f.label} "${raw}" isn't a date (use YYYY-MM-DD or DD/MM/YYYY)`;
        else data[k] = d;
      } else if (k === "gender") data[k] = raw.toLowerCase().startsWith("m") ? "male" : raw.toLowerCase().startsWith("f") ? "female" : "other";
      else data[k] = raw;
    });
    if (!data.first_name) problem = problem ?? "First name is missing";
    for (const k of ["email", "guardian_email"]) if (data[k] && !/^\S+@\S+\.\S+$/.test(data[k])) problem = problem ?? `"${data[k]}" isn't a valid email`;
    return { line: i + 2, data, problem };
  });
  return { columns, unknown, rows };
}

export function ImportStudentsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ReturnType<typeof mapRows> | null>(null);
  const [check, setCheck] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const step = done ? 2 : parsed ? 1 : 0;
  const good = useMemo(() => (parsed?.rows ?? []).filter((r) => !r.problem), [parsed]);

  function template() {
    const head = FIELDS.map((f) => (f.key === "program" ? term("program") : f.key === "section" ? term("section") : f.label));
    const sample = ["", "Asha", "", "Nair", "Female", "2015-06-14", "B+", "", "", "Grade 5", "A", "", "Rajesh Nair", "Lakshmi Nair", "9876543210", "rajesh.nair@example.com", "12 MG Road", "Kochi", "Kerala", "682016", "", "", "", "", ""];
    downloadText("students-template.csv", [csvLine(head), csvLine(sample)].join("\n"));
  }

  async function read(list: File[]) {
    setFiles(list);
    setParsed(null); setCheck(null);
    if (!list[0]) return;
    setBusy(true);
    try {
      const sheet = await readSheet(list[0]);
      if (sheet.length < 2) throw new Error("The file has no rows under the header.");
      const m = mapRows(sheet);
      if (!m.columns.includes("first_name")) throw new Error("Add a \"First name\" column (download the template to see the columns).");
      if (m.rows.length > 5000) throw new Error("Import up to 5,000 rows at a time.");
      setParsed(m);
      const usable = m.rows.filter((r) => !r.problem);
      if (usable.length) setCheck(await api.post<Result>("/students/import", { rows: usable.map((r) => r.data), dry_run: true }));
    } catch (e) {
      toast.error("Couldn't read the file", { description: errText(e) });
      setFiles([]);
    } finally { setBusy(false); }
  }

  async function run() {
    setBusy(true);
    try {
      const r = await api.post<Result>("/students/import", { rows: good.map((x) => x.data), dry_run: false });
      setDone(r);
      onDone();
      toast.success(`${r.created} ${term("students").toLowerCase()} imported`);
    } catch (e) { toast.error("Import failed", { description: errText(e) }); } finally { setBusy(false); }
  }

  // Server errors use 1-based positions within the rows we sent; map back to sheet lines.
  const serverErrors = (r: Result | null) => (r?.errors ?? []).map((e) => ({ line: good[e.row - 1]?.line ?? e.row, message: e.message }));
  const localErrors = (parsed?.rows ?? []).filter((r) => r.problem).map((r) => ({ line: r.line, message: r.problem! }));
  const allErrors = [...localErrors, ...serverErrors(done ?? check)].sort((a, b) => a.line - b.line);

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={busy} title={`Import ${term("students").toLowerCase()}`}
      description="Upload a spreadsheet. We check every row first; nothing is saved until you confirm."
      footerStart={step === 1 ? <Button onClick={() => { setParsed(null); setFiles([]); setCheck(null); }}>Pick another file</Button> : undefined}
      footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <>
        <ModalCancel />
        {step === 1 && <Button variant="primary" loading={busy} disabled={!check || check.created === 0} onClick={run}>
          Import {check ? check.created : ""} {term("students").toLowerCase()}
        </Button>}
      </>}>
      <Stepper steps={[{ label: "Upload" }, { label: "Check" }, { label: "Done" }]} current={step} className="mb-6" />
      {step === 0 && (
        <div className="space-y-4">
          <FileDrop value={files} onChange={read} accept=".csv,.xlsx" maxFiles={1} maxSizeMb={10} title="Drop a CSV or Excel (.xlsx) file" hint="First row is the header. One student per row." />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sunken/40 px-4 py-3 text-[13.5px] text-muted">
            <span className="flex items-center gap-2"><FileSpreadsheet size={16} strokeWidth={1.4} />
              {term("program")} and {term("section").toLowerCase()} are matched by name in the current session. Father and mother become {term("guardians").toLowerCase()}.</span>
            <Button size="sm" icon={Download} onClick={template}>Download template</Button>
          </div>
        </div>
      )}
      {step >= 1 && parsed && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[13.5px]">
            <Badge tone="neutral">{parsed.rows.length} rows read</Badge>
            {done ? <Badge tone="good" dot>{done.created} imported</Badge> : check && <Badge tone="good" dot>{check.created} ready</Badge>}
            {allErrors.length > 0 && <Badge tone="warn" dot>{allErrors.length} need fixing</Badge>}
            {parsed.unknown.length > 0 && <span className="text-muted">Ignored columns: {parsed.unknown.join(", ")}</span>}
          </div>
          {done && (
            <p className="flex items-center gap-2 text-[14px] text-ink"><CheckCircle2 size={18} strokeWidth={1.4} className="text-emerald-600" />
              Import finished. {allErrors.length ? "Fix the rows below in your file and import just those again." : "Every row was imported."}</p>
          )}
          {allErrors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/50">
              {allErrors.map((e, i) => (
                <p key={i} className="flex gap-2 border-b border-amber-100 px-4 py-2 text-[13px] text-amber-900 last:border-0">
                  <AlertTriangle size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />Row {e.line}: {e.message}
                </p>
              ))}
            </div>
          )}
          {!done && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-sunken/60 text-muted">
                  <tr><th className="px-3 py-2 font-normal">Row</th>{parsed.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-normal">{FIELDS.find((f) => f.key === c)?.label}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r) => (
                    <tr key={r.line} className={`border-t border-line ${r.problem ? "bg-amber-50/40" : ""}`}>
                      <td className="px-3 py-1.5 text-faint">{r.line}</td>
                      {parsed.columns.map((c) => <td key={c} className="whitespace-nowrap px-3 py-1.5 text-ink/80">{r.data[c] ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 50 && <p className="border-t border-line px-3 py-2 text-[12.5px] text-muted">Showing the first 50 of {parsed.rows.length} rows.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
