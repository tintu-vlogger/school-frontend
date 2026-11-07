"use client";

/*
 * Admission settings: programs open for admission (seats, fee, dates, age limits), the online
 * form, required documents, acknowledgement and offer emails, offer letter and merit weights.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, ExternalLink, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, Skeleton,
  Tabs, TextInput, Textarea, Toggle, useConfirm, type Column,
} from "@/components/ui-kit";
import { money, useAdmissionsMeta, useOfferings, usePrograms, type Offering } from "@/components/admissions/shared";

type Doc = { key?: string; label: string; required: boolean };
type Settings = {
  online_enabled: boolean; form_title: string; form_intro: string; privacy_notice: string; required_documents: Doc[];
  ack_email_subject: string; ack_email_body: string; offer_email_body: string; offer_letter_html: string;
  offer_valid_days: number; test_weight: number; interview_weight: number;
};

export default function AdmissionSettingsPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const canEdit = useAccess().can("admissions.settings.manage");
  const meta = useAdmissionsMeta();
  const [tab, setTab] = useState<"programs" | "form" | "messages">("programs");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const session = sessionId ?? meta?.default_session_id ?? null;
  const [nonce, setNonce] = useState(0);
  const offerings = useOfferings(session, nonce);
  const [conf, setConf] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<Offering | "new" | null>(null);
  const [editKey, setEditKey] = useState(0);
  const confirm = useConfirm();

  useEffect(() => {
    api.get<Settings>("/admissions/settings").then((s) => { setConf(s); setSaved(JSON.stringify(s)); })
      .catch((e) => toast.error("Couldn't load settings", { description: e.message }));
  }, [toast]);
  const dirty = !!conf && JSON.stringify(conf) !== saved;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setConf((c) => (c ? { ...c, [k]: v } : c));

  async function save() {
    if (!conf) return;
    setSaving(true);
    try {
      const out = await api.put<Settings>("/admissions/settings", { ...conf, required_documents: conf.required_documents.filter((d) => d.label.trim()) });
      setConf(out); setSaved(JSON.stringify(out)); toast.success("Settings saved");
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  async function close(o: Offering) {
    if (!(await confirm({ title: `Close ${o.program_name} for admission?`, message: "It disappears from the online form. Applications already received stay.", confirmLabel: "Close", tone: "danger" }))) return;
    await api.delete(`/admissions/offerings/${o.uuid}`);
    toast.success("Closed for admission");
    setNonce((n) => n + 1);
  }

  const columns: Column<Offering>[] = [
    { key: "program", header: term("program"), cell: (o) => <div><p className="text-ink">{o.program_name}</p>
      <p className="text-[12.5px] text-muted">{[o.test_required && "Test", o.interview_required && "Interview", (o.min_age_years || o.max_age_years) && `Age ${o.min_age_years ?? "–"} to ${o.max_age_years ?? "–"}`].filter(Boolean).join(" · ") || "No test or interview"}</p></div> },
    { key: "seats", header: "Seats", align: "right", cell: (o) => <span className="tabular">{o.taken} / {o.seats}</span> },
    { key: "fee", header: "Fee", align: "right", hideBelow: "sm", cell: (o) => Number(o.application_fee) > 0 ? <span className="tabular">{money(o.application_fee)}{o.fee_required && <span className="text-faint"> · before offer</span>}</span> : <span className="text-faint">Free</span> },
    { key: "dates", header: "Online form", hideBelow: "md", cell: (o) => !o.active ? <Badge>Closed</Badge> : o.open_online
      ? <span className="text-[13px] text-ink/80">{o.closes_on ? `Until ${formatDate(o.closes_on)}` : "Open"}{o.opens_on ? ` · from ${formatDate(o.opens_on)}` : ""}</span> : <Badge tone="warn">Office only</Badge> },
    { key: "applied", header: "Applied", align: "right", hideBelow: "md", cell: (o) => <span className="tabular text-muted">{o.applied}</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Admissions" title="Admission settings" description="What is open for admission, what the online form asks for and what families receive."
        actions={<>
          <a href="/apply" target="_blank" rel="noreferrer"><Button icon={ExternalLink}>View online form</Button></a>
          {tab !== "programs" && canEdit && <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "programs", label: `${term("programs")} and seats` }, { value: "form", label: "Online form and documents" }, { value: "messages", label: "Messages and offers" },
      ]} />

      {tab === "programs" && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Select value={session} onChange={setSessionId} options={(meta?.sessions ?? []).map((s) => ({ value: s.id, label: s.name }))} className="w-44" aria-label={term("session")} />
            {canEdit && <Button variant="primary" icon={Plus} onClick={() => { setEditKey((k) => k + 1); setEdit("new"); }}>Open a {term("program").toLowerCase()}</Button>}
          </div>
          <DataTable rows={offerings ?? []} rowKey={(o) => o.uuid} columns={columns} loading={!offerings}
            onRowClick={canEdit ? (o) => { setEditKey((k) => k + 1); setEdit(o); } : undefined}
            rowActions={canEdit ? (o) => [{ label: "Edit", icon: Pencil, onSelect: () => { setEditKey((k) => k + 1); setEdit(o); } },
              ...(o.active ? ["separator" as const, { label: "Close for admission", icon: Ban, danger: true, onSelect: () => close(o) }] : [])] : undefined}
            emptyIcon={Settings2} emptyTitle={`No ${term("programs").toLowerCase()} open for admission`}
            emptyHint={`Open the ${term("programs").toLowerCase()} you admit into, with the number of seats. They then appear on the online form.`}
            emptyAction={canEdit && <Button variant="primary" icon={Plus} onClick={() => { setEditKey((k) => k + 1); setEdit("new"); }}>Open a {term("program").toLowerCase()}</Button>} />
          <OfferingModal key={editKey} target={edit} sessionId={session} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setNonce((n) => n + 1); }} />
        </>
      )}

      {tab === "form" && (!conf ? <Skeleton className="h-64 w-full" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Paper>
            <PaperHeader title="Online application form" />
            <div className="space-y-5 p-5">
              <Toggle checked={conf.online_enabled} onChange={(x) => set("online_enabled", x)} disabled={!canEdit} label="Accept applications on our website"
                description="The form is at /apply on your institution's address." />
              <Field label="Heading"><TextInput value={conf.form_title} onValueChange={(x) => set("form_title", x)} disabled={!canEdit} /></Field>
              <Field label="Introduction"><Textarea value={conf.form_intro} onValueChange={(x) => set("form_intro", x)} rows={3} disabled={!canEdit} /></Field>
              <Field label="Privacy notice" hint="Families must agree to this before sending"><Textarea value={conf.privacy_notice} onValueChange={(x) => set("privacy_notice", x)} rows={2} disabled={!canEdit} /></Field>
              <p className="text-[13px] text-muted">Need more questions on the form? Add them as <Link href="/dashboard/custom-fields" className="text-primary">custom fields</Link> for “Admission application”.
                Enquiry sources are a <Link href="/dashboard/masters" className="text-primary">master list</Link> (“Enquiry source”).</p>
            </div>
          </Paper>
          <Paper>
            <PaperHeader title="Documents to upload" />
            <div className="space-y-2 p-5">
              {conf.required_documents.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput value={d.label} onValueChange={(x) => set("required_documents", conf.required_documents.map((y, j) => (j === i ? { ...y, label: x } : y)))} disabled={!canEdit} aria-label="Document" className="flex-1" />
                  <Checkbox checked={d.required} onChange={(x) => set("required_documents", conf.required_documents.map((y, j) => (j === i ? { ...y, required: x } : y)))} disabled={!canEdit} label="Required" />
                  {canEdit && <IconButton icon={Trash2} label="Remove" onClick={() => set("required_documents", conf.required_documents.filter((_, j) => j !== i))} />}
                </div>
              ))}
              {conf.required_documents.length === 0 && <p className="py-4 text-center text-[13.5px] text-muted">No documents are asked for.</p>}
              {canEdit && <Button size="sm" icon={Plus} onClick={() => set("required_documents", [...conf.required_documents, { label: "", required: false }])}>Add a document</Button>}
              <p className="pt-2 text-[12.5px] text-faint">PDF or photos, up to 5 MB each.</p>
            </div>
          </Paper>
        </div>
      ))}

      {tab === "messages" && (!conf ? <Skeleton className="h-64 w-full" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Paper>
            <PaperHeader title="Acknowledgement email" />
            <div className="space-y-4 p-5">
              <Field label="Subject"><TextInput value={conf.ack_email_subject} onValueChange={(x) => set("ack_email_subject", x)} disabled={!canEdit} /></Field>
              <Field label="Message"><Textarea value={conf.ack_email_body} onValueChange={(x) => set("ack_email_body", x)} rows={8} disabled={!canEdit} /></Field>
              <MergeHint />
            </div>
          </Paper>
          <Paper>
            <PaperHeader title="Offer email" />
            <div className="space-y-4 p-5">
              <Field label="Message"><Textarea value={conf.offer_email_body} onValueChange={(x) => set("offer_email_body", x)} rows={8} disabled={!canEdit} /></Field>
              <Field label="Offers are valid for"><NumberInput value={conf.offer_valid_days} onChange={(x) => set("offer_valid_days", x ?? 14)} min={1} max={365} suffix="days" disabled={!canEdit} /></Field>
            </div>
          </Paper>
          <Paper className="lg:col-span-2">
            <PaperHeader title="Offer letter" />
            <div className="space-y-4 p-5">
              <Field label="Letter (HTML)" hint="Printed on your letterhead. Use the fields below."><Textarea value={conf.offer_letter_html} onValueChange={(x) => set("offer_letter_html", x)} rows={10} className="font-mono text-[12.5px]" disabled={!canEdit} /></Field>
              <MergeHint extra />
            </div>
          </Paper>
          <Paper className="lg:col-span-2">
            <PaperHeader title="Merit score" />
            <div className="p-5">
              <FormGrid columns={3}>
                <Field label="Entrance test weight"><NumberInput value={conf.test_weight} onChange={(x) => set("test_weight", x ?? 0)} min={0} max={100} suffix="%" disabled={!canEdit} /></Field>
                <Field label="Interview weight"><NumberInput value={conf.interview_weight} onChange={(x) => set("interview_weight", x ?? 0)} min={0} max={100} suffix="%" disabled={!canEdit} /></Field>
              </FormGrid>
              <p className="mt-3 text-[12.5px] text-faint">Scores are turned into percentages and combined by these weights. When only one is entered, it counts alone.</p>
            </div>
          </Paper>
        </div>
      ))}
    </div>
  );
}

function MergeHint({ extra }: { extra?: boolean }) {
  const fields = ["{{guardian.name}}", "{{applicant.name}}", "{{applicant.first_name}}", "{{application.number}}", "{{application.program}}",
    "{{application.session}}", "{{institution.name}}", "{{offer.expires_on}}", ...(extra ? ["{{offer.date}}", "{{offer.note}}", "{{application.merit_rank}}"] : [])];
  return <p className="flex flex-wrap gap-1.5 text-[12px] text-muted">{fields.map((f) => <code key={f} className="rounded bg-sunken px-1.5 py-0.5">{f}</code>)}</p>;
}

function OfferingModal({ target, sessionId, onClose, onSaved }: { target: Offering | "new" | null; sessionId: number | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const programs = usePrograms();
  const editing = target && target !== "new" ? target : null;
  const init = {
    program_id: editing?.program_id ?? null as number | null, seats: editing?.seats ?? 30, application_fee: editing ? Number(editing.application_fee) : 0,
    fee_required: editing?.fee_required ?? false, open_online: editing?.open_online ?? true, opens_on: editing?.opens_on ?? "", closes_on: editing?.closes_on ?? "",
    test_required: editing?.test_required ?? false, interview_required: editing?.interview_required ?? false,
    min_age_years: editing?.min_age_years ? Number(editing.min_age_years) : null as number | null,
    max_age_years: editing?.max_age_years ? Number(editing.max_age_years) : null as number | null,
    age_as_on: editing?.age_as_on ?? "", notes: editing?.notes ?? "", active: editing?.active ?? true,
  };
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof init>(k: K, x: (typeof init)[K]) => setV((p) => ({ ...p, [k]: x }));
  async function submit() {
    if (!editing && !v.program_id) { toast.error(`Pick the ${term("program").toLowerCase()}`); return; }
    setSaving(true);
    const body = { ...v, opens_on: v.opens_on || null, closes_on: v.closes_on || null, age_as_on: v.age_as_on || null,
      application_fee: (v.application_fee ?? 0).toFixed(2), notes: v.notes || null };
    try {
      if (editing) { const { program_id: _p, ...rest } = body; void _p; await api.put(`/admissions/offerings/${editing.uuid}`, rest); }
      else await api.post("/admissions/offerings", { ...body, session_id: sessionId });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!target} onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(init)}
      title={editing ? `${editing.program_name} · ${editing.session_name}` : `Open a ${term("program").toLowerCase()} for admission`}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={submit}>{editing ? "Save changes" : "Open for admission"}</Button></>}>
      <FormGrid>
        {!editing && <Field label={term("program")} required className="sm:col-span-2">
          <Select value={v.program_id} onChange={(x) => set("program_id", x)} options={programs.map((p) => ({ value: p.id, label: p.name }))} placeholder="Pick one" />
        </Field>}
        <Field label="Seats"><NumberInput value={v.seats} onChange={(x) => set("seats", x ?? 0)} min={0} /></Field>
        <Field label="Application fee"><NumberInput value={v.application_fee} onChange={(x) => set("application_fee", x ?? 0)} min={0} suffix="₹" /></Field>
        <Toggle checked={v.fee_required} onChange={(x) => set("fee_required", x)} label="Fee must be paid before an offer" />
        <Toggle checked={v.open_online} onChange={(x) => set("open_online", x)} label="Show on the online form" />
        <Field label="Form opens on" aside="Optional"><DateInput value={v.opens_on} onChange={(x) => set("opens_on", x)} clearable /></Field>
        <Field label="Last date to apply" aside="Optional"><DateInput value={v.closes_on} onChange={(x) => set("closes_on", x)} clearable /></Field>
        <Toggle checked={v.test_required} onChange={(x) => set("test_required", x)} label="Entrance test" />
        <Toggle checked={v.interview_required} onChange={(x) => set("interview_required", x)} label="Interview" />
        <Field label="Minimum age" aside="Optional"><NumberInput value={v.min_age_years} onChange={(x) => set("min_age_years", x)} min={0} step={0.5} suffix="years" /></Field>
        <Field label="Maximum age" aside="Optional"><NumberInput value={v.max_age_years} onChange={(x) => set("max_age_years", x)} min={0} step={0.5} suffix="years" /></Field>
        <Field label="Age as on" hint={`Empty: the start of the ${term("session").toLowerCase()}`}><DateInput value={v.age_as_on} onChange={(x) => set("age_as_on", x)} clearable /></Field>
        {editing && <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Open for admission" />}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
      </FormGrid>
    </Modal>
  );
}
