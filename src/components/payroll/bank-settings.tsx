"use client";

/*
 * Payroll settings → Bank files: payment rules, the company's debit accounts (per legal entity,
 * each with its bank's file format), the ready-made bank layouts and the custom format builder
 * with a live preview. Used by src/app/dashboard/payroll/settings/page.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, RadioCards,
  Select, Tabs, TextInput, Textarea, Toggle, type Column, type SelectOption,
} from "@/components/ui-kit";
import { errMsg } from "@/components/payroll/common";

/* ── Types ─────────────────────────────────────────────────────── */

export type Col = { label: string; value: string; width?: number; align?: "left" | "right"; pad?: " " | "0"; max?: number; case?: "upper" };
export type Spec = {
  kind: "delimited" | "fixed"; delimiter?: string; quote?: "minimal" | "all" | "none"; extension?: "csv" | "txt";
  line_ending?: "crlf" | "lf"; header_row?: boolean; header_lines?: Col[][]; trailer_lines?: Col[][]; columns: Col[];
  date_format?: string; amount?: { decimals?: number; paise?: boolean }; codes?: Record<string, string>; modes?: string[];
  split?: "none" | "internal_vs_other" | "by_mode"; clean?: boolean; file_name?: string; bank?: string; notes?: string;
  ifsc_prefixes?: string[]; requires?: string[]; variants?: Record<string, Partial<Spec>>;
};
export type BankFormat = {
  key: string; uuid?: string; name: string; bank: string; builtin: boolean; spec: Spec; notes: string; sources: string[];
  active: boolean; based_on?: string | null; confidence?: string;
};
type Account = {
  uuid: string; label: string; bank_name: string | null; account_number: string; account_masked: string; ifsc: string;
  account_name: string | null; format_key: string; format_name: string; client_code: string | null; corporate_id: string | null;
  is_default: boolean; active: boolean; notes: string | null; legal_entity_id: number | null; legal_entity_name: string | null;
};
type Tokens = { row: string[]; total: string[] };

const TOKEN_LABELS: Record<string, string> = {
  seq: "Line number", name: "Beneficiary name", account: "Beneficiary account", ifsc: "Beneficiary IFSC", branch: "Beneficiary branch code",
  bank_name: "Beneficiary bank", email: "Email", phone: "Mobile", employee_code: "Employee ID", amount: "Amount",
  amount_paise: "Amount in paise", mode: "Mode (FT, NEFT, RTGS, IMPS)", mode_code: "Bank's code for the mode", date: "Value date",
  narration: "Narration", payment_ref: "Payment reference", period: "Pay period (YYYYMM)", month: "Pay month",
  debit_account: "Debit account", debit_ifsc: "Debit IFSC", debit_branch: "Debit branch code", debit_name: "Name on debit account",
  client_code: "Client code", corporate_id: "Corporate id", batch_ref: "Batch reference", count: "Number of payments",
  total: "Total amount", total_paise: "Total in paise", account_hash: "Account number hash total", file_date: "File date",
  batch: "File number",
};
const DELIMS: SelectOption<string>[] = [
  { value: ",", label: "Comma ( , )" }, { value: "|", label: "Pipe ( | )" }, { value: "^", label: "Caret ( ^ )" },
  { value: "#", label: "Hash ( # )" }, { value: "~", label: "Tilde ( ~ )" }, { value: ";", label: "Semicolon ( ; )" }, { value: "tab", label: "Tab" },
];
const DATE_FORMATS: SelectOption<string>[] = [
  { value: "%d/%m/%Y", label: "30/11/2026" }, { value: "%d-%m-%Y", label: "30-11-2026" }, { value: "%d-%b-%Y", label: "30-Nov-2026" },
  { value: "%d%m%Y", label: "30112026" }, { value: "%Y%m%d", label: "20261130" }, { value: "%Y-%m-%d", label: "2026-11-30" },
  { value: "%d.%m.%Y", label: "30.11.2026" }, { value: "%m/%d/%Y", label: "11/30/2026" },
];
const MODE_LABELS: Record<string, string> = { internal: "Same bank (fund transfer)", neft: "NEFT", rtgs: "RTGS", imps: "IMPS" };
const GROUP_LABELS: Record<string, string> = { all: "All payments", internal: "Same bank", other: "Other banks", neft: "NEFT", rtgs: "RTGS", imps: "IMPS" };
const CONFIDENCE: Record<string, { label: string; tone: "good" | "info" | "warn" }> = {
  high: { label: "From the bank's sample", tone: "good" }, medium: { label: "From published guides", tone: "info" },
  low: { label: "Check with your bank", tone: "warn" },
};

export function groupLabel(g: string) { return GROUP_LABELS[g] ?? g; }

export function useBankFormats() {
  const [formats, setFormats] = useState<BankFormat[]>([]);
  const [tokens, setTokens] = useState<Tokens>({ row: [], total: [] });
  const load = useCallback(() => api.get<{ items: BankFormat[]; tokens: Tokens }>("/payroll/bank/formats?include_inactive=true")
    .then((r) => { setFormats(r.items); setTokens(r.tokens); }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return { formats, tokens, reload: load };
}

/* ── The tab ───────────────────────────────────────────────────── */

type BankRules = { default_format: string; narration: string; other_bank_mode?: string; rtgs_from?: number };

export function BankSettings({ s, set, saveBar }: { s: { bank: BankRules }; set: (path: string, v: unknown) => void; saveBar: React.ReactNode }) {
  const { formats, tokens, reload } = useBankFormats();
  const options = useMemo(() => formats.filter((f) => f.active).map((f) => ({ value: f.key, label: f.name, description: f.bank })), [formats]);
  const legacyDefault = ({ hdfc: "hdfc_enet", icici: "icici_cib", sbi: "sbi_cinb", axis: "axis_cib", kotak: "kotak_cms" } as Record<string, string>)[s.bank.default_format] ?? s.bank.default_format;
  return (
    <div className="space-y-5">
      <Paper className="p-6">
        <FormSection title="How salaries are sent" description="Used for every bank file. Each debit account below picks its own bank's layout.">
          <FormGrid>
            <Field label="Layout when no debit account is set up"><Select value={legacyDefault} onChange={(v) => set("bank.default_format", v)} options={options} /></Field>
            <Field label="Narration" hint="{month} becomes the pay month"><TextInput value={s.bank.narration} onValueChange={(v) => set("bank.narration", v)} /></Field>
            <Field label="Payments to other banks">
              <Select value={s.bank.other_bank_mode ?? "auto"} onChange={(v) => set("bank.other_bank_mode", v)} options={[
                { value: "auto", label: "NEFT, and RTGS for large amounts" }, { value: "neft", label: "Always NEFT" },
                { value: "imps", label: "IMPS up to ₹5 lakh, then RTGS" },
              ]} />
            </Field>
            {(s.bank.other_bank_mode ?? "auto") === "auto" && (
              <Field label="Use RTGS from (₹)" hint="RBI minimum for RTGS is ₹2,00,000"><NumberInput value={Number(s.bank.rtgs_from ?? 200000)} onChange={(v) => set("bank.rtgs_from", Math.max(200000, v ?? 200000))} min={200000} step={10000} /></Field>
            )}
          </FormGrid>
        </FormSection>
        {saveBar}
      </Paper>
      <DebitAccounts formats={formats} />
      <FormatList formats={formats} tokens={tokens} reload={reload} />
    </div>
  );
}

/* ── Debit accounts ────────────────────────────────────────────── */

function DebitAccounts({ formats }: { formats: BankFormat[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Account | "new" | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    api.get<{ items: Account[] }>("/payroll/bank/accounts").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Account>[] = [
    { key: "label", header: "Account", cell: (r) => <div><p className="text-ink">{r.label}</p><p className="text-[12.5px] text-faint">{r.account_masked} · {r.ifsc}</p></div>, sortable: true, sortValue: (r) => r.label },
    { key: "entity", header: "Legal entity", cell: (r) => r.legal_entity_name ?? <span className="text-faint">All entities</span>, hideBelow: "md" },
    { key: "format", header: "File format", cell: (r) => r.format_name },
    { key: "state", header: "", align: "right", cell: (r) => <div className="flex justify-end gap-1.5">{r.is_default && <Badge tone="accent">Default</Badge>}{!r.active && <Badge>Off</Badge>}</div> },
  ];
  return (
    <Paper>
      <PaperHeader title="Debit accounts" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setEdit("new")}>Add account</Button>} />
      <p className="px-5 pt-3 text-[13px] text-muted">The company accounts salaries are paid from. Each legal entity uses its default account; an account for all entities covers the rest.</p>
      <div className="p-3">
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setEdit(r)}
          rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => setEdit(r) }]}
          emptyIcon={Landmark} emptyTitle="No debit accounts yet" emptyHint="Add the account your bank debits for salaries and pick its file format." />
      </div>
      {edit && <AccountModal account={edit === "new" ? null : edit} formats={formats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </Paper>
  );
}

type EntityAccount = { legal_entity_uuid: string; legal_entity_name: string; account_number: string; account_masked: string; ifsc: string; bank_name: string; account_name: string; suggested_format: string };

function AccountModal({ account, formats, onClose, onSaved }: { account: Account | null; formats: BankFormat[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [entities, setEntities] = useState<SelectOption<string>[]>([]);
  const [entityAccounts, setEntityAccounts] = useState<EntityAccount[]>([]);
  const [f, setF] = useState({
    label: account?.label ?? "", legal_entity_uuid: null as string | null, account_number: "", ifsc: account?.ifsc ?? "",
    bank_name: account?.bank_name ?? "", account_name: account?.account_name ?? "", format_key: account?.format_key ?? "generic_neft",
    client_code: account?.client_code ?? "", corporate_id: account?.corporate_id ?? "", is_default: account?.is_default ?? true,
    active: account?.active ?? true, notes: account?.notes ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const up = (patch: Partial<typeof f>) => { setF((o) => ({ ...o, ...patch })); setDirty(true); };
  useEffect(() => {
    type Ent = { uuid: string; name: string; id: number };
    api.get<Ent[] | { items: Ent[] }>("/organization/legal-entities").then((r) => {
      const list = Array.isArray(r) ? r : r.items ?? [];
      setEntities(list.map((e) => ({ value: e.uuid, label: e.name })));
      if (account?.legal_entity_id) setF((o) => ({ ...o, legal_entity_uuid: list.find((e) => e.id === account.legal_entity_id)?.uuid ?? null }));
    }).catch(() => {});
    api.get<EntityAccount[]>("/payroll/bank/entity-accounts").then(setEntityAccounts).catch(() => {});
    if (account) api.get<Account>(`/payroll/bank/accounts/${account.uuid}`).then((a) => setF((o) => ({ ...o, account_number: a.account_number }))).catch(() => {});
  }, [account]);
  const picks = entityAccounts.filter((a) => !f.legal_entity_uuid || a.legal_entity_uuid === f.legal_entity_uuid);
  const fmt = formats.find((x) => x.key === f.format_key);
  const needs = fmt?.spec.requires ?? [];
  async function suggest(ifsc: string) {
    if (ifsc.length !== 11) return;
    try {
      const r = await api.get<{ bank: string; format_key: string; valid: boolean }>(`/payroll/bank/suggest?ifsc=${ifsc}`);
      setF((o) => ({ ...o, bank_name: o.bank_name || r.bank, format_key: account ? o.format_key : r.format_key }));
    } catch { /* ignore */ }
  }
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, legal_entity_uuid: f.legal_entity_uuid || null };
      if (account) await api.put(`/payroll/bank/accounts/${account.uuid}`, body); else await api.post("/payroll/bank/accounts", body);
      toast.success(account ? "Account saved" : "Account added");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" dirty={dirty} busy={busy} title={account ? "Edit debit account" : "Add debit account"}
      description="The company account the bank debits for salaries, and the file layout its bank accepts."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <FormSection title="Account">
        <FormGrid>
          <Field label="Legal entity" hint="Leave empty to use it for every entity"><Select value={f.legal_entity_uuid} onChange={(v) => up({ legal_entity_uuid: v })} options={entities} clearable placeholder="All entities" /></Field>
          {picks.length > 0 && (
            <Field label="Copy from the entity's saved accounts">
              <Select value={null} placeholder="Pick an account…" onChange={(v) => {
                const a = picks.find((x) => `${x.legal_entity_uuid}:${x.account_number}` === v);
                if (a) up({ legal_entity_uuid: a.legal_entity_uuid, account_number: a.account_number, ifsc: a.ifsc, bank_name: a.bank_name, account_name: a.account_name, format_key: a.suggested_format });
              }} options={picks.map((a) => ({ value: `${a.legal_entity_uuid}:${a.account_number}`, label: `${a.bank_name || a.ifsc} ${a.account_masked}`, description: a.legal_entity_name }))} />
            </Field>
          )}
          <Field label="Account number" required><TextInput value={f.account_number} onValueChange={(v) => up({ account_number: v.replace(/\s/g, "") })} className="font-mono" /></Field>
          <Field label="IFSC" required hint="4 letters, a zero, then 6 letters or digits"><TextInput value={f.ifsc} onValueChange={(v) => { const x = v.toUpperCase().trim(); up({ ifsc: x }); suggest(x); }} className="font-mono" maxLength={11} /></Field>
          <Field label="Bank"><TextInput value={f.bank_name} onValueChange={(v) => up({ bank_name: v })} /></Field>
          <Field label="Name on the account"><TextInput value={f.account_name} onValueChange={(v) => up({ account_name: v })} /></Field>
          <Field label="Short name" hint="Shown in lists, e.g. HDFC salary account"><TextInput value={f.label} onValueChange={(v) => up({ label: v })} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Bank file">
        <FormGrid>
          <Field label="File format" required hint={fmt?.notes}>
            <Select value={f.format_key} onChange={(v) => up({ format_key: v ?? "generic_neft" })} options={formats.filter((x) => x.active || x.key === f.format_key).map((x) => ({ value: x.key, label: x.name, description: x.builtin ? x.bank : "Custom format" }))} />
          </Field>
          <Field label="Client code" required={needs.includes("client_code")} hint="Given by the bank for bulk uploads"><TextInput value={f.client_code} onValueChange={(v) => up({ client_code: v })} /></Field>
          <Field label="Corporate id" required={needs.includes("corporate_id")} hint="Your corporate banking id"><TextInput value={f.corporate_id} onValueChange={(v) => up({ corporate_id: v })} /></Field>
        </FormGrid>
        <div className="mt-4 flex flex-wrap gap-6">
          <Toggle checked={f.is_default} onChange={(v) => up({ is_default: v })} label="Default for this entity" />
          <Toggle checked={f.active} onChange={(v) => up({ active: v })} label="In use" />
        </div>
        <div className="mt-4"><Field label="Notes"><Textarea value={f.notes} onValueChange={(v) => up({ notes: v })} rows={2} /></Field></div>
      </FormSection>
    </Modal>
  );
}

/* ── Formats ───────────────────────────────────────────────────── */

function describe(s: Spec) {
  const sep = s.kind === "fixed" ? "fixed width" : `separated by ${DELIMS.find((d) => d.value === s.delimiter)?.label.split(" ")[0].toLowerCase() ?? s.delimiter}`;
  const split = s.split === "internal_vs_other" ? " · own bank and other banks in separate files" : s.split === "by_mode" ? " · one file per payment type" : "";
  return `.${s.extension ?? "txt"} · ${sep}${s.header_row ? " · column names in the first line" : ""}${split}`;
}

function FormatList({ formats, tokens, reload }: { formats: BankFormat[]; tokens: Tokens; reload: () => void }) {
  const [view, setView] = useState<BankFormat | null>(null);
  const [build, setBuild] = useState<{ format: BankFormat | null; base: BankFormat | null } | null>(null);
  const columns: Column<BankFormat>[] = [
    { key: "name", header: "Format", cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12.5px] text-faint">{describe(r.spec)}</p></div>, sortable: true, sortValue: (r) => r.name },
    { key: "bank", header: "Bank", cell: (r) => r.bank, hideBelow: "md" },
    { key: "kind", header: "", align: "right", cell: (r) => r.builtin
      ? (CONFIDENCE[confidenceOf(r)] ? <Badge tone={CONFIDENCE[confidenceOf(r)].tone}>{CONFIDENCE[confidenceOf(r)].label}</Badge> : null)
      : <div className="flex justify-end gap-1.5"><Badge tone="accent">Custom</Badge>{!r.active && <Badge>Off</Badge>}</div> },
  ];
  return (
    <Paper>
      <PaperHeader title="Bank file formats" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setBuild({ format: null, base: null })}>New custom format</Button>} />
      <p className="px-5 pt-3 text-[13px] text-muted">Ready-made layouts for Indian banks, and your own. Banks change their templates now and then: compare your first file with the sample in your bank&apos;s portal.</p>
      <div className="p-3">
        <DataTable rows={formats} columns={columns} rowKey={(r) => r.key} onRowClick={(r) => setView(r)}
          rowActions={(r) => [
            { label: "View layout", icon: Eye, onSelect: () => setView(r) },
            r.builtin ? { label: "Make a copy to change", icon: Copy, onSelect: () => setBuild({ format: null, base: r }) }
              : { label: "Edit", icon: Pencil, onSelect: () => setBuild({ format: r, base: null }) },
          ]} />
      </div>
      {view && <FormatView format={view} onClose={() => setView(null)} onCopy={() => { setBuild(view.builtin ? { format: null, base: view } : { format: view, base: null }); setView(null); }} />}
      {build && <FormatBuilder format={build.format} base={build.base} tokens={tokens} onClose={() => setBuild(null)} onSaved={() => { setBuild(null); reload(); }} />}
    </Paper>
  );
}

function confidenceOf(f: BankFormat): string {
  return f.confidence ?? "medium";
}

function Preview({ spec, debit }: { spec: Spec | null; debit?: Record<string, string> }) {
  const [out, setOut] = useState<{ files: { group: string; file_name: string; lines: string[] }[] } | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!spec) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post<typeof out>("/payroll/bank/formats/preview", { spec, debit }).then((r) => { setOut(r); setError(""); }).catch((e) => setError(errMsg(e)));
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [spec, debit]);
  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      {out?.files.map((f) => (
        <div key={f.file_name} className="overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line bg-sunken/60 px-3 py-1.5 text-[12.5px] text-muted">
            <span className="font-mono">{f.file_name}</span><span>{groupLabel(f.group)}</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre px-3 py-2 font-mono text-[12px] leading-5 text-ink">{f.lines.join("\n")}</pre>
        </div>
      ))}
      <p className="text-[12px] text-faint">Sample rows: one same-bank transfer, one NEFT and one RTGS payment.</p>
    </div>
  );
}

function FormatView({ format, onClose, onCopy }: { format: BankFormat; onClose: () => void; onCopy: () => void }) {
  const [tab, setTab] = useState("columns");
  const c = CONFIDENCE[confidenceOf(format)];
  return (
    <Modal open onClose={onClose} size="xl" title={format.name} description={describe(format.spec)}
      footer={<><ModalCancel>Close</ModalCancel><Button variant="primary" icon={format.builtin ? Copy : Pencil} onClick={onCopy}>{format.builtin ? "Make a copy to change" : "Edit"}</Button></>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {format.builtin && c && <Badge tone={c.tone}>{c.label}</Badge>}
        {format.spec.requires?.includes("client_code") && <Badge>Needs client code</Badge>}
        {format.spec.requires?.includes("corporate_id") && <Badge>Needs corporate id</Badge>}
        {(format.spec.modes ?? []).map((m) => <Badge key={m} tone="neutral">{MODE_LABELS[m]}{format.spec.codes?.[m] ? `: ${format.spec.codes[m]}` : ""}</Badge>)}
      </div>
      {format.notes && <p className="mb-4 text-[13.5px] text-muted">{format.notes}</p>}
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "columns", label: "Columns" }, { value: "preview", label: "Sample file" }, ...(format.sources.length ? [{ value: "sources", label: "Sources" }] : [])]} />
      {tab === "columns" && (
        <div className="space-y-4">
          {(format.spec.header_lines ?? []).map((row, i) => <LineTable key={`h${i}`} title={`Header line ${i + 1}`} cols={row} />)}
          <LineTable title="One line per payment" cols={format.spec.columns} />
          {(format.spec.trailer_lines ?? []).map((row, i) => <LineTable key={`t${i}`} title={`Trailer line ${i + 1}`} cols={row} />)}
          {Object.entries(format.spec.variants ?? {}).map(([g, v]) => v.columns ? <LineTable key={g} title={`${groupLabel(g)} file: one line per payment`} cols={v.columns} /> : null)}
        </div>
      )}
      {tab === "preview" && <Preview spec={format.spec} />}
      {tab === "sources" && <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-muted">{format.sources.map((s) => <li key={s}>{s}</li>)}</ul>}
    </Modal>
  );
}

function LineTable({ title, cols }: { title: string; cols: Col[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <p className="border-b border-line bg-sunken/60 px-3 py-1.5 text-[12.5px] text-muted">{title}</p>
      <table className="w-full text-[13px]">
        <tbody className="divide-y divide-line">
          {cols.map((c, i) => (
            <tr key={i}>
              <td className="w-10 px-3 py-1.5 text-faint">{i + 1}</td>
              <td className="px-3 py-1.5 text-ink">{c.label || <span className="text-faint">(blank)</span>}</td>
              <td className="px-3 py-1.5 text-muted">{tokenText(c.value)}</td>
              <td className="px-3 py-1.5 text-right text-faint">{c.width ? `${c.width} wide` : c.max ? `up to ${c.max}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tokenText(v: string) {
  if (!v) return "empty";
  const m = /^\{(\w+)(?::[^}]*)?\}$/.exec(v);
  if (m) return TOKEN_LABELS[m[1]] ?? v;
  return /\{/.test(v) ? v : `“${v}”`;
}

/* ── Builder ───────────────────────────────────────────────────── */

const NEW_SPEC: Spec = {
  kind: "delimited", delimiter: ",", quote: "minimal", extension: "csv", line_ending: "crlf", header_row: true, date_format: "%d/%m/%Y",
  amount: { decimals: 2 }, split: "none", clean: true, modes: ["internal", "neft", "rtgs"], codes: { internal: "FT", neft: "NEFT", rtgs: "RTGS", imps: "IMPS" },
  columns: [
    { label: "Payment mode", value: "{mode_code}" }, { label: "Beneficiary name", value: "{name}", max: 40 }, { label: "Account number", value: "{account}" },
    { label: "IFSC", value: "{ifsc}" }, { label: "Amount", value: "{amount}" }, { label: "Value date", value: "{date}" }, { label: "Narration", value: "{narration}", max: 30 },
  ],
  header_lines: [], trailer_lines: [], file_name: "salary-{period}-{group}-{batch}",
};

function FormatBuilder({ format, base, tokens, onClose, onSaved }: { format: BankFormat | null; base: BankFormat | null; tokens: Tokens; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const start = format ?? base;
  const [name, setName] = useState(format?.name ?? (base ? `${base.name} (our copy)` : ""));
  const [spec, setSpec] = useState<Spec>(() => structuredClone(start?.spec ?? NEW_SPEC));
  const [active, setActive] = useState(format?.active ?? true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("file");
  const up = (patch: Partial<Spec>) => { setSpec((o) => ({ ...o, ...patch })); setDirty(true); };
  const fixed = spec.kind === "fixed";
  const amountChoice = spec.amount?.paise ? "paise" : spec.amount?.decimals === 0 ? "whole" : "decimals";
  async function save() {
    setBusy(true);
    try {
      const body = { name, spec, based_on: base?.key ?? format?.based_on ?? null, active };
      if (format?.uuid) await api.put(`/payroll/bank/formats/${format.uuid}`, body); else await api.post("/payroll/bank/formats", body);
      toast.success("Format saved");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="full" dirty={dirty} busy={busy} title={format ? "Edit custom format" : "New custom bank format"}
      description="Lay out the file exactly as your bank's sample. The preview updates as you change it."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>Save format</Button></>}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <FormGrid>
            <Field label="Name" required><TextInput value={name} onValueChange={(v) => { setName(v); setDirty(true); }} placeholder="e.g. Saraswat Bank salary upload" /></Field>
            <Field label="Bank"><TextInput value={spec.bank ?? ""} onValueChange={(v) => up({ bank: v })} /></Field>
          </FormGrid>
          <Tabs value={tab} onChange={setTab} className="my-4" items={[{ value: "file", label: "File" }, { value: "columns", label: `Columns (${spec.columns.length})` }, { value: "lines", label: "Header and footer" }, { value: "payments", label: "Payment types" }]} />
          {tab === "file" && (
            <div className="space-y-4">
              <RadioCards value={spec.kind} onChange={(v) => up(v === "fixed" ? { kind: "fixed", header_row: false, extension: "txt", columns: spec.columns.map((c) => ({ ...c, width: c.width ?? Math.max(c.max ?? 0, 15) })) } : { kind: "delimited" })} options={[
                { value: "delimited", label: "Separated values", description: "Values with a separator between them (CSV, pipe, caret…)" },
                { value: "fixed", label: "Fixed width", description: "Each value takes a set number of characters" },
              ]} />
              <FormGrid>
                {!fixed && <Field label="Separator"><Select value={spec.delimiter ?? ","} onChange={(v) => up({ delimiter: v ?? "," })} options={DELIMS} /></Field>}
                {!fixed && <Field label="Quotes around values"><Select value={spec.quote ?? "minimal"} onChange={(v) => up({ quote: (v ?? "minimal") as Spec["quote"] })} options={[{ value: "minimal", label: "Only when needed" }, { value: "all", label: "Always" }, { value: "none", label: "Never (separators removed from values)" }]} /></Field>}
                <Field label="File type"><Select value={spec.extension ?? "txt"} onChange={(v) => up({ extension: (v ?? "txt") as Spec["extension"] })} options={[{ value: "csv", label: ".csv" }, { value: "txt", label: ".txt" }]} /></Field>
                <Field label="Line ending"><Select value={spec.line_ending ?? "crlf"} onChange={(v) => up({ line_ending: (v ?? "crlf") as Spec["line_ending"] })} options={[{ value: "crlf", label: "Windows (CRLF)" }, { value: "lf", label: "Unix (LF)" }]} /></Field>
                <Field label="Dates"><Select value={spec.date_format ?? "%d/%m/%Y"} onChange={(v) => up({ date_format: v ?? "%d/%m/%Y" })} options={DATE_FORMATS} /></Field>
                <Field label="Amounts"><Select value={amountChoice} onChange={(v) => up({ amount: v === "paise" ? { paise: true } : v === "whole" ? { decimals: 0 } : { decimals: 2 } })} options={[{ value: "decimals", label: "Rupees and paise: 1234.50" }, { value: "whole", label: "Whole rupees: 1235" }, { value: "paise", label: "In paise: 123450" }]} /></Field>
                <Field label="Separate files"><Select value={spec.split ?? "none"} onChange={(v) => up({ split: (v ?? "none") as Spec["split"] })} options={[{ value: "none", label: "One file for all payments" }, { value: "internal_vs_other", label: "Same bank and other banks apart" }, { value: "by_mode", label: "One file per payment type" }]} /></Field>
                <Field label="File name" hint="Tokens such as {period}, {date:%d%m%Y}, {client_code}, {batch}"><TextInput value={spec.file_name ?? ""} onValueChange={(v) => up({ file_name: v })} className="font-mono" /></Field>
              </FormGrid>
              <div className="flex flex-wrap gap-6">
                {!fixed && <Toggle checked={!!spec.header_row} onChange={(v) => up({ header_row: v })} label="Column names in the first line" />}
                <Toggle checked={spec.clean !== false} onChange={(v) => up({ clean: v })} label="Remove special characters" description="Keeps letters, digits, space and . , - / ( ) & @ _" />
              </div>
              {spec.variants && Object.keys(spec.variants).length > 0 && <p className="text-[12.5px] text-faint">This layout has a different line for {Object.keys(spec.variants).map(groupLabel).join(", ").toLowerCase()} files; it is kept as it is.</p>}
            </div>
          )}
          {tab === "columns" && <ColumnsEditor cols={spec.columns} fixed={fixed} tokens={tokens.row} onChange={(columns) => up({ columns })} />}
          {tab === "lines" && (
            <div className="space-y-5">
              <LinesEditor title="Header lines" hint="Lines before the payments, such as a batch header with the debit account, date, count and total." lines={spec.header_lines ?? []} fixed={fixed} tokens={tokens.total} onChange={(header_lines) => up({ header_lines })} />
              <LinesEditor title="Footer lines" hint="Lines after the payments, such as a trailer with the number of payments, the total and a hash total." lines={spec.trailer_lines ?? []} fixed={fixed} tokens={tokens.total} onChange={(trailer_lines) => up({ trailer_lines })} />
            </div>
          )}
          {tab === "payments" && (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">Tick the payment types the bank accepts in this file and the code it uses for each.</p>
              {(["internal", "neft", "rtgs", "imps"] as const).map((m) => (
                <div key={m} className="grid grid-cols-[1fr_180px] items-center gap-3">
                  <Checkbox checked={(spec.modes ?? []).includes(m)} onChange={(on) => up({ modes: on ? [...(spec.modes ?? []), m] : (spec.modes ?? []).filter((x) => x !== m) })} label={MODE_LABELS[m]} />
                  <TextInput value={spec.codes?.[m] ?? ""} onValueChange={(v) => up({ codes: { ...(spec.codes ?? {}), [m]: v } })} placeholder="Code" className="font-mono" />
                </div>
              ))}
              <Field label="This bank's IFSC starts with" hint="Used to spot same-bank transfers when the debit account is unknown"><TextInput value={(spec.ifsc_prefixes ?? []).join(", ")} onValueChange={(v) => up({ ifsc_prefixes: v.split(/[,\s]+/).map((x) => x.toUpperCase().slice(0, 4)).filter(Boolean) })} className="font-mono" placeholder="e.g. SRCB" /></Field>
              <div className="flex flex-wrap gap-6 pt-1">
                <Checkbox checked={(spec.requires ?? []).includes("client_code")} onChange={(on) => up({ requires: on ? [...(spec.requires ?? []), "client_code"] : (spec.requires ?? []).filter((x) => x !== "client_code") })} label="Needs a client code" />
                <Checkbox checked={(spec.requires ?? []).includes("corporate_id")} onChange={(on) => up({ requires: on ? [...(spec.requires ?? []), "corporate_id"] : (spec.requires ?? []).filter((x) => x !== "corporate_id") })} label="Needs a corporate id" />
              </div>
            </div>
          )}
          {format && <div className="mt-5 border-t border-line pt-4"><Toggle checked={active} onChange={(v) => { setActive(v); setDirty(true); }} label="In use" /></div>}
        </div>
        <div className="xl:sticky xl:top-0 xl:self-start">
          <p className="mb-2 text-[13px] text-muted">Preview</p>
          <Preview spec={spec} />
        </div>
      </div>
    </Modal>
  );
}

function tokenOptions(list: string[]): SelectOption<string>[] {
  return [{ value: "__text", label: "Fixed text", description: "Type the value" }, { value: "__blank", label: "Leave empty" },
    ...list.map((t) => ({ value: `{${t}}`, label: TOKEN_LABELS[t] ?? t, description: `{${t}}` }))];
}

function ColumnsEditor({ cols, fixed, tokens, onChange }: { cols: Col[]; fixed: boolean; tokens: string[]; onChange: (c: Col[]) => void }) {
  const opts = useMemo(() => tokenOptions(tokens), [tokens]);
  const set = (i: number, patch: Partial<Col>) => onChange(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => { const n = [...cols]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };
  return (
    <div className="space-y-2">
      {cols.map((c, i) => {
        const tokenValue = /^\{\w+\}$/.test(c.value) ? c.value : c.value ? "__text" : "__blank";
        return (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2.5 w-6 shrink-0 text-right text-[12.5px] text-faint">{i + 1}</span>
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <TextInput value={c.label} onValueChange={(v) => set(i, { label: v })} placeholder="Column name" aria-label="Column name" />
                <Select value={tokenValue} onChange={(v) => set(i, { value: v === "__text" ? (tokenValue === "__text" ? c.value : "") : v === "__blank" ? "" : v ?? "" })} options={opts} aria-label="Value" />
                {(tokenValue === "__text" || /\{\w+:/.test(c.value)) && <TextInput value={c.value} onValueChange={(v) => set(i, { value: v })} className="font-mono sm:col-span-2" placeholder="Text, may include {tokens}" aria-label="Text" />}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === cols.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => onChange(cols.filter((_, j) => j !== i))} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 pl-8">
              {fixed ? (
                <>
                  <div className="w-28"><NumberInput value={c.width ?? null} onChange={(v) => set(i, { width: v ?? undefined })} min={1} max={500} suffix="wide" /></div>
                  <div className="w-36"><Select value={c.align ?? "left"} onChange={(v) => set(i, { align: (v ?? "left") as Col["align"] })} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} aria-label="Align" /></div>
                  <div className="w-40"><Select value={c.pad ?? " "} onChange={(v) => set(i, { pad: (v ?? " ") as Col["pad"] })} options={[{ value: " ", label: "Pad with spaces" }, { value: "0", label: "Pad with zeros" }]} aria-label="Padding" /></div>
                </>
              ) : (
                <div className="w-36"><NumberInput value={c.max ?? null} onChange={(v) => set(i, { max: v ?? undefined })} min={1} max={500} suffix="max" /></div>
              )}
              <Checkbox checked={c.case === "upper"} onChange={(on) => set(i, { case: on ? "upper" : undefined })} label="Capitals" />
            </div>
          </div>
        );
      })}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...cols, { label: "", value: "", ...(fixed ? { width: 10 } : {}) }])}>Add column</Button>
    </div>
  );
}

function LinesEditor({ title, hint, lines, fixed, tokens, onChange }: { title: string; hint: string; lines: Col[][]; fixed: boolean; tokens: string[]; onChange: (l: Col[][]) => void }) {
  return (
    <div>
      <p className="text-[14px] text-ink">{title}</p>
      <p className="mb-2 text-[12.5px] text-faint">{hint}</p>
      <div className="space-y-3">
        {lines.map((row, i) => (
          <div key={i} className="rounded-xl bg-sunken/40 p-2">
            <div className="mb-1 flex items-center justify-between px-1"><span className="text-[12.5px] text-muted">Line {i + 1}</span>
              <IconButton icon={Trash2} label="Remove line" size="sm" onClick={() => onChange(lines.filter((_, j) => j !== i))} /></div>
            <ColumnsEditor cols={row} fixed={fixed} tokens={tokens} onChange={(c) => onChange(lines.map((r, j) => (j === i ? c : r)))} />
          </div>
        ))}
        {lines.length < 5 && <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...lines, [{ label: "Record type", value: title.startsWith("Header") ? "H" : "T", ...(fixed ? { width: 1 } : {}) }]])}>Add line</Button>}
      </div>
    </div>
  );
}
