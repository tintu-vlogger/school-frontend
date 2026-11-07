"use client";

/*
 * Probation policies: who they apply to, length, when the review starts, extension limits,
 * reviewers by level, feedback from others, auto-confirmation and the confirmation letter.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, Select, TextInput, Toggle,
  type Column, type SelectOption,
} from "@/components/ui-kit";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import { AudienceEditor, audienceSummary, useOrgOptions } from "@/components/onboarding/audience";
import type { Meta, Policy, Reviewer } from "@/components/probation/types";

const UNITS: SelectOption<string>[] = [{ value: "months", label: "Months" }, { value: "days", label: "Days" }];
const ROLES: SelectOption<string>[] = [{ value: "hr", label: "HR" }, { value: "admin", label: "HR admin" }, { value: "manager", label: "Managers" }];

export default function ProbationSettingsPage() {
  const toast = useToast();
  const org = useOrgOptions();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const load = () => api.get<{ items: Policy[] }>("/probation/policies").then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  useEffect(() => { api.get<Meta>("/probation/meta").then(setMeta).catch(() => {}); load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cols: Column<Policy>[] = [
    { key: "name", header: "Policy", cell: (p) => <div><p className="text-ink">{p.name}</p><p className="text-[12px] text-faint">{p.description}</p></div> },
    { key: "aud", header: "Applies to", cell: (p) => <span className="text-muted">{audienceSummary(p.audience, org)}</span> },
    { key: "len", header: "Length", cell: (p) => `${p.duration_value} ${p.duration_unit}` },
    { key: "ext", header: "Extensions", hideBelow: "md", cell: (p) => p.allow_extension ? `${p.max_extensions} × ${p.extension_value} ${p.extension_unit}` : "None" },
    { key: "rev", header: "Reviewers", hideBelow: "md", cell: (p) => p.reviewers.map((r) => r.label).join(" → ") },
    { key: "use", header: "In use", align: "right", hideBelow: "lg", cell: (p) => p.in_use },
    { key: "on", header: "", cell: (p) => p.active ? <Badge tone="good">On</Badge> : <Badge>Off</Badge> },
  ];
  return (
    <div>
      <PageHeader eyebrow={<Link href="/dashboard/probation" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={12} strokeWidth={1.4} />Probation</Link>}
        title="Probation policies" description="The first active policy (lowest order) that matches a person decides their probation."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New policy</Button>} />
      <DataTable rows={rows ?? []} loading={!rows} columns={cols} rowKey={(p) => p.uuid} onRowClick={setEditing} emptyTitle="No policies yet" />
      <PolicyModal policy={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

const BLANK: Policy = {
  uuid: "", name: "", description: "", audience: {}, priority: 100, duration_value: 6, duration_unit: "months", review_before_days: 15,
  allow_extension: true, extension_value: 3, extension_unit: "months", max_extensions: 1, max_total_months: 12,
  reviewers: [{ level: 1, type: "reporting_manager", value: null, label: "Reporting manager" }, { level: 2, type: "role", value: "hr", label: "HR" }],
  feedback_from: [], auto_confirm: false, confirmation_letter: true, active: true, in_use: 0,
};

function PolicyModal({ policy, meta, onClose, onSaved }: { policy: Policy | "new" | null; meta: Meta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<Policy>(BLANK);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    if (!policy) return;
    const x = policy === "new" ? BLANK : policy;
    setP(JSON.parse(JSON.stringify(x)));
    setDirty(false);
    employeeOptionsFor([...x.reviewers, ...x.feedback_from].filter((r) => r.type === "employee").map((r) => Number(r.value))).then(setPeople).catch(() => {});
  }, [policy]);
  const up = (patch: Partial<Policy>) => { setP((x) => ({ ...x, ...patch })); setDirty(true); };
  const types = Object.entries(meta?.reviewer_types ?? {}).map(([value, label]) => ({ value, label }));

  function reviewerList({ field, title, levels }: { field: "reviewers" | "feedback_from"; title: string; levels: boolean }) {
    const list = p[field];
    const set = (i: number, r: Partial<Reviewer>) => up({ [field]: list.map((x, j) => (j === i ? { ...x, ...r } : x)) } as Partial<Policy>);
    return (
      <div className="space-y-2">
        {list.map((r, i) => (
          <div key={i} className="grid items-center gap-2 sm:grid-cols-[90px_200px_1fr_auto]">
            {levels ? <NumberInput value={r.level} onChange={(v) => set(i, { level: v ?? 1 })} min={1} suffix="lvl" /> : <span className="text-[12.5px] text-faint">Feedback</span>}
            <Select options={types} value={r.type} onChange={(v) => set(i, { type: v ?? "reporting_manager", value: null, label: types.find((t) => t.value === v)?.label })} aria-label="Who" />
            {r.type === "role" ? <Select options={ROLES} value={(r.value as string) ?? null} onChange={(v) => set(i, { value: v, label: ROLES.find((x) => x.value === v)?.label })} placeholder="Role" />
              : r.type === "employee" ? <Select loadOptions={loadEmployees} selectedOption={people.find((o) => o.value === Number(r.value)) ?? null} value={r.value ? Number(r.value) : null} onChange={(v, o) => set(i, { value: v, label: o?.label })} placeholder="Person" />
              : <span className="text-[13px] text-muted">{types.find((t) => t.value === r.type)?.label} of the employee</span>}
            <IconButton icon={Trash2} label="Remove" onClick={() => up({ [field]: list.filter((_, j) => j !== i) } as Partial<Policy>)} />
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => up({ [field]: [...list, { level: (list[list.length - 1]?.level ?? 0) + (levels ? 1 : 0), type: "reporting_manager", value: null, label: "Reporting manager" }] } as Partial<Policy>)}>{title}</Button>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      if (policy === "new") await api.post("/probation/policies", p);
      else await api.put(`/probation/policies/${p.uuid}`, p);
      toast.success("Policy saved");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!policy} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={policy === "new" ? "New probation policy" : p.name || "Policy"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save policy</Button></>}>
      <FormSection title="Basics">
        <FormGrid>
          <Field label="Name" required><TextInput value={p.name} onValueChange={(v) => up({ name: v })} /></Field>
          <Field label="Order" hint="Lower is checked first"><NumberInput value={p.priority} onChange={(v) => up({ priority: v ?? 100 })} min={1} /></Field>
          <Field label="Description" className="sm:col-span-2"><TextInput value={p.description ?? ""} onValueChange={(v) => up({ description: v })} /></Field>
        </FormGrid>
        <Toggle className="mt-4" checked={p.active} onChange={(v) => up({ active: v })} label="Active" />
      </FormSection>
      <FormSection title="Who it applies to"><AudienceEditor value={p.audience} onChange={(a) => up({ audience: a })} /></FormSection>
      <FormSection title="Length and review" description="Counted from the joining date.">
        <FormGrid columns={3}>
          <Field label="Length"><NumberInput value={p.duration_value} onChange={(v) => up({ duration_value: v ?? 1 })} min={1} /></Field>
          <Field label="Unit"><Select options={UNITS} value={p.duration_unit} onChange={(v) => up({ duration_unit: (v as "days" | "months") ?? "months" })} /></Field>
          <Field label="Start the review" hint="Days before the end"><NumberInput value={p.review_before_days} onChange={(v) => up({ review_before_days: v ?? 0 })} min={0} max={90} suffix="days" /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Extensions" description="Standing orders or state rules may cap probation; enter that cap so nothing goes beyond it.">
        <Toggle checked={p.allow_extension} onChange={(v) => up({ allow_extension: v })} label="Allow extensions" />
        {p.allow_extension && (
          <FormGrid columns={3} className="mt-4">
            <Field label="Each extension"><NumberInput value={p.extension_value} onChange={(v) => up({ extension_value: v ?? 1 })} min={1} /></Field>
            <Field label="Unit"><Select options={UNITS} value={p.extension_unit} onChange={(v) => up({ extension_unit: (v as "days" | "months") ?? "months" })} /></Field>
            <Field label="At most"><NumberInput value={p.max_extensions} onChange={(v) => up({ max_extensions: v ?? 0 })} min={0} max={5} suffix="times" /></Field>
          </FormGrid>
        )}
        <Field label="Longest probation in total" hint="Empty for no cap" className="mt-4 max-w-xs">
          <NumberInput value={p.max_total_months} onChange={(v) => up({ max_total_months: v })} min={1} suffix="months" />
        </Field>
      </FormSection>
      <FormSection title="Reviewers" description="Each level reviews after the one before it.">
        {reviewerList({ field: "reviewers", title: "Add reviewer", levels: true })}
      </FormSection>
      <FormSection title="Feedback from others" description="Optional input from peers or project leads before the decision.">
        {reviewerList({ field: "feedback_from", title: "Ask for feedback", levels: false })}
      </FormSection>
      <FormSection title="Outcome">
        <div className="space-y-3">
          <Toggle checked={p.auto_confirm} onChange={(v) => up({ auto_confirm: v })} label="Confirm automatically when every reviewer recommends it" />
          <Toggle checked={p.confirmation_letter} onChange={(v) => up({ confirmation_letter: v })} label="Issue the confirmation letter" />
        </div>
      </FormSection>
    </Modal>
  );
}
