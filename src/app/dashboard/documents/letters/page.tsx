"use client";

/*
 * Letters: every generated letter, with single and bulk generation (live preview),
 * and e-signature (send, follow, remind, recall).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, Bell, Eye, FileCode, FileStack, FileText, Plus, RotateCcw, Send, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, NumberInput, Section, Select, Skeleton,
  TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { fileHref } from "@/components/workplace/files";
import { ExtraFieldInputs, LetterPreviewPane, useLettersMeta, useLetterheads, useTemplates } from "@/components/documents/letter-tools";
import { FilePreview, LETTER_STATUS, SIGNER_STATUS, StatusBadge, errText, type Letter } from "@/components/documents/shared";

type Page<T> = { items: T[]; total: number; page: number; size: number };

export default function LettersPage() {
  const toast = useToast();
  const params = useSearchParams();
  const meta = useLettersMeta();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Letter> | null>(null);
  const [nonce, setNonce] = useState(0);
  const [generating, setGenerating] = useState(params.get("new") === "1");
  const [bulk, setBulk] = useState(false);
  const [viewing, setViewing] = useState<string | null>(params.get("view"));

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.type?.[0]) p.set("letter_type", filters.type[0]);
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    setData(null);
    api.get<Page<Letter>>(`/letters?${p}`).then(setData).catch((e) => { setData({ items: [], total: 0, page: 1, size: 25 }); toast.error("Couldn't load letters", { description: errText(e) }); });
  }, [q, filters, page, nonce, toast]);
  const refresh = () => setNonce((n) => n + 1);

  const columns: Column<Letter>[] = [
    { key: "t", header: "Letter", cell: (l) => <div className="min-w-0"><p className="truncate text-ink">{l.title}</p><p className="truncate text-[12.5px] text-faint">{l.reference_no}</p></div> },
    { key: "e", header: "Employee", cell: (l) => <span className="text-ink/80">{l.employee_name ?? "—"}</span> },
    { key: "k", header: "Kind", hideBelow: "md", cell: (l) => <span className="text-muted">{l.letter_type_label}</span> },
    { key: "s", header: "Status", cell: (l) => <StatusBadge map={LETTER_STATUS} value={l.status} /> },
    { key: "d", header: "Created", hideBelow: "lg", cell: (l) => <span className="text-muted">{formatDate(l.created_at)}{l.generated_by_name ? ` · ${l.generated_by_name}` : ""}</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Documents" title="Letters" description="Letters made from your templates, ready to download or send for signature."
        actions={<>
          <Link href="/dashboard/templates"><Button icon={FileCode}>Templates</Button></Link>
          <Button icon={FileStack} onClick={() => setBulk(true)}>Bulk generate</Button>
          <Button variant="primary" icon={Plus} onClick={() => setGenerating(true)}>New letter</Button>
        </>} />
      <FilterBar searchPlaceholder="Search by title, number or employee" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "type", label: "Kind", options: (meta?.letter_types ?? []).map((t) => ({ value: t.value, label: t.label })) },
          { key: "status", label: "Status", options: Object.entries(LETTER_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]} />
      <DataTable rows={data?.items ?? []} rowKey={(l) => l.uuid} columns={columns} loading={!data} onRowClick={(l) => setViewing(l.uuid)}
        rowActions={(l) => [{ label: "Open", icon: Eye, onSelect: () => setViewing(l.uuid) }]}
        pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
        emptyIcon={FileText} emptyTitle={q || Object.values(filters).some((v) => v.length) ? "No letters match" : "No letters yet"}
        emptyHint="Generate offer, appointment, experience and other letters from your templates."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setGenerating(true)}>New letter</Button>} />
      {generating && <GenerateModal onClose={() => setGenerating(false)} onDone={(uuid) => { setGenerating(false); refresh(); setViewing(uuid); }} />}
      {bulk && <BulkModal onClose={() => setBulk(false)} onDone={() => { setBulk(false); refresh(); }} />}
      <LetterModal uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} />
    </div>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: (uuid: string) => void }) {
  const toast = useToast();
  const templates = useTemplates();
  const heads = useLetterheads();
  const [tpl, setTpl] = useState<string | null>(null);
  const [emp, setEmp] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [header, setHeader] = useState<number | "none" | null>(null);
  const [footer, setFooter] = useState<number | "none" | null>(null);
  const [saving, setSaving] = useState(false);
  const t = templates?.find((x) => x.uuid === tpl) ?? null;

  async function generate() {
    if (!t || !emp) { toast.error("Pick a template and an employee"); return; }
    setSaving(true);
    try {
      const r = await api.post<Letter>("/letters/generate", {
        template_uuid: t.uuid, employee_id: emp, values,
        header_id: typeof header === "number" ? header : null, footer_id: typeof footer === "number" ? footer : null,
        use_header: header !== "none", use_footer: footer !== "none",
      });
      toast.success(r.status === "out_for_signature" ? "Letter made and sent for signature" : "Letter made", { description: r.reference_no ?? undefined });
      onDone(r.uuid);
    } catch (e) { toast.error("Couldn't make the letter", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  const lhOptions = (kind: "header" | "footer"): SelectOption<number | "none">[] => [
    { value: "none", label: `No ${kind}` }, ...(heads ?? []).filter((h) => h.kind === kind).map((h) => ({ value: h.id, label: h.name, description: h.is_default ? "Default" : undefined })),
  ];
  return (
    <Modal open onClose={onClose} size="full" busy={saving} title="New letter" dirty={!!tpl}
      footer={<><ModalCancel /><Button variant="primary" icon={FileText} loading={saving} onClick={generate}>Make letter</Button></>}>
      <div className="grid h-full gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Field label="Template" required>
            <Select value={tpl} onChange={(v) => { setTpl(v); setValues({}); }} placeholder="Pick a template"
              options={(templates ?? []).filter((x) => x.active).map((x) => ({ value: x.uuid, label: x.name, description: x.letter_type_label ?? undefined }))} />
          </Field>
          <Field label="Employee" required><Select value={emp} onChange={setEmp} loadOptions={loadEmployees} placeholder="Search people" /></Field>
          {t && <ExtraFieldInputs fields={t.extra_fields} values={values} onChange={setValues} />}
          <FormGrid>
            <Field label="Header"><Select value={header} onChange={setHeader} options={lhOptions("header")} placeholder="Template's" clearable /></Field>
            <Field label="Footer"><Select value={footer} onChange={setFooter} options={lhOptions("footer")} placeholder="Template's" clearable /></Field>
          </FormGrid>
          {t?.esign_required && <p className="rounded-xl bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-800">This letter goes out for signature as soon as it is made.</p>}
        </div>
        <LetterPreviewPane templateUuid={tpl} employeeId={emp} values={values}
          headerId={typeof header === "number" ? header : null} footerId={typeof footer === "number" ? footer : null} />
      </div>
    </Modal>
  );
}

function BulkModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const templates = useTemplates();
  const [tpl, setTpl] = useState<string | null>(null);
  const [emps, setEmps] = useState<number[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ generated: number; failed: { employee_name: string | null; reason: string }[] } | null>(null);
  const t = templates?.find((x) => x.uuid === tpl) ?? null;
  async function run() {
    if (!t || !emps.length) { toast.error("Pick a template and people"); return; }
    setSaving(true);
    try { setResult(await api.post("/letters/bulk", { template_uuid: t.uuid, employee_ids: emps, values })); }
    catch (e) { toast.error("Couldn't generate", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={result ? onDone : onClose} size="lg" busy={saving} title="Bulk generate" description="The same letter for many people at once (up to 200)."
      footer={result ? <Button variant="primary" onClick={onDone}>Done</Button> : <><ModalCancel /><Button variant="primary" icon={FileStack} loading={saving} onClick={run}>Generate {emps.length || ""} letters</Button></>}>
      {result ? (
        <div className="space-y-3">
          <p className="text-[15px] text-ink">{result.generated} {result.generated === 1 ? "letter" : "letters"} made and filed in each employee&apos;s documents.</p>
          {result.failed.length > 0 && <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-[13px] text-rose-700">
            {result.failed.map((f, i) => <li key={i}>{f.employee_name ?? "Someone"}: {f.reason}</li>)}
          </ul>}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Template" required>
            <Select value={tpl} onChange={(v) => { setTpl(v); setValues({}); }} options={(templates ?? []).filter((x) => x.active).map((x) => ({ value: x.uuid, label: x.name, description: x.letter_type_label ?? undefined }))} />
          </Field>
          <Field label="Employees" required hint="Each gets their own letter with their details"><MultiSelect<number> value={emps} onChange={setEmps} loadOptions={loadEmployees} placeholder="Search and add people" /></Field>
          {t && <ExtraFieldInputs fields={t.extra_fields} values={values} onChange={setValues} note="These values are used for everyone." />}
        </div>
      )}
    </Modal>
  );
}

type SignerDraft = { kind: string; employee_id: number | null; name: string; email: string; label: string };

function LetterModal({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useLettersMeta();
  const [l, setL] = useState<Letter | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setL(null); setSending(false);
    if (uuid) api.get<Letter>(`/letters/${uuid}`).then(setL).catch((e) => toast.error("Couldn't open the letter", { description: errText(e) }));
  }, [uuid, toast]);

  async function act(path: string, ok: string, body?: unknown) {
    setBusy(true);
    try { const r = await api.post<Letter>(path, body); if (r && "uuid" in r) setL(r); else if (uuid) setL(await api.get<Letter>(`/letters/${uuid}`)); toast.success(ok); onChanged(); }
    catch (e) { toast.error("Couldn't do that", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  const es = l?.esign;
  const file = es?.signed_file ?? l?.file;
  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy} title={l?.title ?? "Letter"}
      description={l ? `${l.reference_no ?? ""} · ${l.employee_name ?? ""} · ${formatDateTime(l.created_at)}` : undefined}
      headerActions={l && <StatusBadge map={LETTER_STATUS} value={l.status} />}
      footer={l && <>
        {l.status !== "cancelled" && l.status !== "signed" && <Button icon={Trash2} onClick={async () => {
          if (await confirm({ title: "Withdraw this letter?", message: "It is removed from the employee's documents and any signing stops.", confirmLabel: "Withdraw", tone: "danger" }))
            act(`/letters/${l.uuid}/cancel`, "Letter withdrawn");
        }}>Withdraw</Button>}
        {(l.status === "issued" || l.status === "declined") && <Button variant="primary" icon={Send} onClick={() => setSending(true)}>Send for signature</Button>}
        {file?.download_url && <a href={fileHref(file.download_url)}><Button icon={FileText} type="button">Download</Button></a>}
      </>}>
      {!l ? <Skeleton className="h-[480px]" /> : sending ? (
        <SendForm letter={l} providers={meta?.providers ?? []} onCancel={() => setSending(false)}
          onSend={(body) => { setSending(false); act(`/letters/${l.uuid}/esign`, "Sent for signature", body); }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <FilePreview file={file} height={560} />
          <div className="space-y-6">
            <KeyValue columns={1} items={[
              { label: "Template", value: l.template_name }, { label: "Made by", value: l.generated_by_name },
              ...Object.entries(l.values ?? {}).slice(0, 6).map(([k, v]) => ({ label: k, value: v })),
            ]} />
            {es && (
              <Section title="Signatures" className="border-t border-line" description={es.status === "completed" ? `Completed ${formatDateTime(es.completed_at!)}` : es.expires_at ? `Link works until ${formatDate(es.expires_at)}` : undefined}>
                <ol className="space-y-3">
                  {es.signers.map((s) => (
                    <li key={s.uuid} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[11.5px] text-muted">{s.position}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] text-ink">{s.name}<span className="text-faint">{s.label ? ` · ${s.label}` : ""}</span></p>
                        <p className="truncate text-[12px] text-muted">{s.signed_at ? `Signed ${formatDateTime(s.signed_at)}` : s.decline_reason ? `Declined: ${s.decline_reason}` : s.email}</p>
                      </div>
                      <StatusBadge map={SIGNER_STATUS} value={s.status} />
                    </li>
                  ))}
                </ol>
                {es.status === "out_for_signature" && <div className="mt-4 flex gap-2">
                  <Button size="sm" icon={Bell} onClick={() => act(`/letters/esign/${es.uuid}/remind`, "Reminder sent")}>Remind</Button>
                  <Button size="sm" icon={RotateCcw} onClick={async () => { if (await confirm({ title: "Recall the signing request?", message: "People can no longer sign it.", confirmLabel: "Recall" })) act(`/letters/esign/${es.uuid}/recall`, "Recalled"); }}>Recall</Button>
                </div>}
              </Section>
            )}
            {l.status === "cancelled" && <p className="flex items-center gap-2 text-[13px] text-muted"><Ban size={14} strokeWidth={1.4} /> This letter was withdrawn.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SendForm({ letter, providers, onCancel, onSend }: {
  letter: Letter; providers: { key: string; label: string; ready: boolean }[]; onCancel: () => void; onSend: (body: unknown) => void;
}) {
  const toast = useToast();
  const [signers, setSigners] = useState<SignerDraft[]>([{ kind: "employee", employee_id: null, name: "", email: "", label: "Employee" }]);
  const [order, setOrder] = useState(true);
  const [days, setDays] = useState<number | null>(14);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("in_app_otp");
  const kinds: SelectOption<string>[] = [
    { value: "employee", label: `The employee (${letter.employee_name ?? ""})` }, { value: "manager", label: "Their reporting manager" },
    { value: "specific", label: "A colleague" }, { value: "external", label: "Someone outside the company" },
  ];
  const upd = (i: number, p: Partial<SignerDraft>) => setSigners(signers.map((s, j) => (j === i ? { ...s, ...p } : s)));
  function submit() {
    for (const s of signers) {
      if (s.kind === "specific" && !s.employee_id) { toast.error("Pick the colleague who signs"); return; }
      if (s.kind === "external" && (!s.name.trim() || !s.email.includes("@"))) { toast.error("Give outside signers a name and email"); return; }
    }
    onSend({ signers: signers.map((s) => ({ kind: s.kind, employee_id: s.employee_id, name: s.name || null, email: s.email || null, label: s.label || null })),
      signing_order: order, expires_days: days ?? 14, message: message || null, provider });
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Section title="Who signs" description={order ? "In this order; each person is asked after the one before signs." : "Everyone at once."}>
        <div className="space-y-3">
          {signers.map((s, i) => (
            <div key={i} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[28px_1fr_1fr_auto]">
              <span className="mb-2 text-[13px] text-faint">{i + 1}.</span>
              <Field label="Signer"><Select value={s.kind} onChange={(v) => upd(i, { kind: v ?? "employee" })} options={kinds} /></Field>
              <Field label="Shown as"><TextInput value={s.label} onValueChange={(v) => upd(i, { label: v })} placeholder="e.g. Authorised signatory" /></Field>
              <Button variant="ghost" icon={Trash2} aria-label="Remove signer" disabled={signers.length === 1} onClick={() => setSigners(signers.filter((_, j) => j !== i))} />
              {s.kind === "specific" && <div className="sm:col-span-3 sm:col-start-2"><Select value={s.employee_id} onChange={(v) => upd(i, { employee_id: v })} loadOptions={loadEmployees} placeholder="Search people" /></div>}
              {s.kind === "external" && <div className="grid gap-3 sm:col-span-3 sm:col-start-2 sm:grid-cols-2">
                <TextInput value={s.name} onValueChange={(v) => upd(i, { name: v })} placeholder="Name" />
                <TextInput type="email" value={s.email} onValueChange={(v) => upd(i, { email: v })} placeholder="Email" />
              </div>}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={UserPlus} disabled={signers.length >= 5} onClick={() => setSigners([...signers, { kind: "specific", employee_id: null, name: "", email: "", label: "" }])}>Add signer</Button>
        </div>
      </Section>
      <FormGrid>
        <Field label="Signing method">
          <Select value={provider} onChange={(v) => setProvider(v ?? "in_app_otp")}
            options={providers.map((p) => ({ value: p.key, label: p.ready ? p.label : `${p.label} (coming soon)`, disabled: !p.ready }))} />
        </Field>
        <Field label="Link works for"><NumberInput value={days} onChange={setDays} min={1} max={90} suffix="days" /></Field>
      </FormGrid>
      <Toggle checked={order} onChange={setOrder} label="Sign in order" />
      <Field label="Message" aside="Optional"><Textarea value={message} onValueChange={setMessage} rows={2} placeholder="Shown to everyone who signs" /></Field>
      <div className="flex justify-end gap-2"><Button onClick={onCancel}>Back</Button><Button variant="primary" icon={Send} onClick={submit}>Send</Button></div>
      <p className="text-[12px] text-faint"><Badge tone="info">How it works</Badge> Each signer confirms with a code sent to their email, then draws or types a signature. The signed copy is filed in the employee&apos;s documents.</p>
    </div>
  );
}
