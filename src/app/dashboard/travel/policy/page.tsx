"use client";

/*
 * Travel policy (HR): grade bands with the modes and classes allowed, hotel limits and daily
 * allowance by city tier (X / Y / Z, international), booking lead time, advance limit and the
 * city tier lists. A change is saved as a new version from a date; old trips keep the
 * version they were planned under.
 */
import { useEffect, useState } from "react";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, TextInput, Textarea, type Column,
} from "@/components/ui-kit";
import { errMsg, inr } from "@/components/payroll/common";
import { useTravelOptions, type ModeOption } from "@/components/travel/trip-modals";

type Tiered = Record<string, number | null>;
type Band = { name: string; grade_codes: string[]; modes: Record<string, string[]>; hotel: Tiered; per_diem: Tiered; lead_days: { domestic: number; international: number } };
type Rules = { city_tiers: { X: string[]; Y: string[] }; bands: Band[]; advance_max_percent: number; claim_categories: Record<string, string> };
type Version = { uuid: string; version: number; name: string; effective_from: string; rules: Rules; change_note: string | null; created_by_name: string | null; created_at: string; in_force: boolean; future: boolean };

const TIERS = ["X", "Y", "Z", "international"];
const tierLabel = (t: string) => (t === "international" ? "International" : `Tier ${t}`);

export default function TravelPolicyPage() {
  const toast = useToast();
  const modes = useTravelOptions();
  const [data, setData] = useState<{ current: Version | null; versions: Version[] } | null>(null);
  const [edit, setEdit] = useState<{ open: boolean; key: number; from: Version | null }>({ open: false, key: 0, from: null });
  const [view, setView] = useState<Version | null>(null);
  const load = () => api.get<typeof data>("/travel/policy").then(setData).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = data?.current;
  const latest = data?.versions[0] ?? null;
  const cols: Column<Version>[] = [
    { key: "v", header: "Version", cell: (v) => <span className="text-ink">Version {v.version}</span> },
    { key: "f", header: "From", cell: (v) => <span className="text-muted">{formatDate(v.effective_from)}</span> },
    { key: "n", header: "Change", cell: (v) => <span className="text-muted">{v.change_note ?? "—"}</span> },
    { key: "b", header: "Saved by", hideBelow: "md", cell: (v) => <span className="text-muted">{v.created_by_name} · {formatDateTime(v.created_at)}</span> },
    { key: "s", header: "", cell: (v) => v.in_force ? <Badge tone="good" dot>In force</Badge> : v.future ? <Badge tone="info" dot>Upcoming</Badge> : <Badge>Past</Badge> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Travel policy" description="Who may travel how, hotel limits and daily allowance by city tier, and booking rules."
        actions={<Button variant="primary" icon={Pencil} disabled={!latest} onClick={() => setEdit({ open: true, key: edit.key + 1, from: latest })}>Change policy</Button>} />
      {cur && <PolicyView v={cur} modes={modes} />}
      <Paper className="mt-5">
        <PaperHeader title="Versions" />
        <DataTable rows={data?.versions ?? []} rowKey={(v) => v.uuid} columns={cols} loading={!data} onRowClick={setView} emptyIcon={History} emptyTitle="No versions" />
      </Paper>
      <Modal open={!!view} onClose={() => setView(null)} size="xl" title={view ? `Version ${view.version}` : ""} description={view ? `From ${formatDate(view.effective_from)}` : undefined}
        footer={<><ModalCancel>Close</ModalCancel>{view && <Button variant="secondary" onClick={() => { setEdit({ open: true, key: edit.key + 1, from: view }); setView(null); }}>Start a new version from this</Button>}</>}>
        {view && <PolicyView v={view} modes={modes} />}
      </Modal>
      <PolicyForm key={edit.key} open={edit.open} from={edit.from} modes={modes} onClose={() => setEdit({ ...edit, open: false })} onSaved={() => { setEdit({ ...edit, open: false }); load(); }} />
    </div>
  );
}

function PolicyView({ v, modes }: { v: Version; modes: ModeOption[] }) {
  const r = v.rules;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {r.bands.map((b, i) => (
          <Paper key={i}>
            <PaperHeader title={b.name} action={<span className="text-[12.5px] text-faint">{b.grade_codes.length ? b.grade_codes.join(", ") : "Everyone else"}</span>} />
            <div className="space-y-3 px-5 py-4 text-[13.5px]">
              {modes.map((m) => <div key={m.value} className="flex justify-between gap-3"><span className="text-muted">{m.label}</span>
                <span className="text-right text-ink">{b.modes[m.value] ? b.modes[m.value].map((c) => m.classes.find((x) => x.value === c)?.label ?? c).join(", ") || "Any" : <span className="text-faint">Not allowed</span>}</span></div>)}
              <table className="w-full"><thead><tr className="text-[12px] text-faint"><th className="text-left font-normal">City</th><th className="text-right font-normal">Hotel</th><th className="text-right font-normal">Allowance</th></tr></thead>
                <tbody>{TIERS.map((t) => <tr key={t}><td className="py-0.5 text-muted">{tierLabel(t)}</td><td className="tabular text-right text-ink">{inr(b.hotel[t])}</td><td className="tabular text-right text-ink">{inr(b.per_diem[t])}</td></tr>)}</tbody></table>
              <p className="text-[12.5px] text-muted">Ask {b.lead_days.domestic} days ahead in India, {b.lead_days.international} days for abroad.</p>
            </div>
          </Paper>))}
      </div>
      <Paper className="px-5 py-4 text-[13.5px]">
        <p className="text-muted">Advance up to <span className="text-ink">{r.advance_max_percent}%</span> of the estimated cost. Claims use the expense categories <span className="text-ink">{Object.values(r.claim_categories ?? {}).join(", ")}</span>.</p>
        <p className="mt-2 text-muted">Tier X: <span className="text-ink">{r.city_tiers.X.join(", ")}</span></p>
        <p className="mt-1 text-muted">Tier Y: <span className="text-ink">{r.city_tiers.Y.length} cities</span> · every other city is tier Z.</p>
      </Paper>
    </div>
  );
}

function PolicyForm({ open, from, modes, onClose, onSaved }: { open: boolean; from: Version | null; modes: ModeOption[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rules, setRules] = useState<Rules | null>(from ? structuredClone(from.rules) : null);
  const [eff, setEff] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [grades, setGrades] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { if (open) api.get<{ code: string | null; name: string }[]>("/organization/grades").then((g) => setGrades(g.map((x) => ({ value: x.code ?? x.name, label: `${x.name}${x.code ? ` (${x.code})` : ""}` })))).catch(() => {}); }, [open]);
  if (!rules) return null;
  const setBand = (i: number, p: Partial<Band>) => setRules({ ...rules, bands: rules.bands.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  async function save() {
    setBusy(true);
    try {
      await api.post("/travel/policy", { effective_from: eff, rules, change_note: note || null, name: "Travel policy" });
      toast.success("New policy version saved"); onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const tiered = (b: Band, i: number, key: "hotel" | "per_diem") => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{TIERS.map((t) => (
      <Field key={t} label={tierLabel(t)}><NumberInput value={b[key][t] ?? null} min={0} onChange={(x) => setBand(i, { [key]: { ...b[key], [t]: x } } as Partial<Band>)} /></Field>))}</div>);
  return (
    <Modal open={open} onClose={onClose} size="full" title="Change the travel policy" description="Saved as a new version from the date you choose; trips already planned keep their version." busy={busy} dirty
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save new version</Button></>}>
      <div className="space-y-6">
        <FormGrid columns={3}>
          <Field label="Applies from" required><DateInput value={eff} onChange={setEff} /></Field>
          <Field label="What changed?"><TextInput value={note} onValueChange={setNote} placeholder="e.g. Higher hotel limits in metros" /></Field>
          <Field label="Advance limit (% of estimated cost)"><NumberInput value={rules.advance_max_percent} min={0} max={100} onChange={(x) => setRules({ ...rules, advance_max_percent: x ?? 0 })} /></Field>
        </FormGrid>
        {rules.bands.map((b, i) => (
          <div key={i} className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[14px] text-ink">Band {i + 1}{!b.grade_codes.length ? " · everyone else" : ""}</p>
              {rules.bands.length > 1 && <IconButton icon={Trash2} label="Remove band" size="sm" onClick={() => setRules({ ...rules, bands: rules.bands.filter((_, j) => j !== i) })} />}
            </div>
            <FormGrid columns={2}>
              <Field label="Name"><TextInput value={b.name} onValueChange={(x) => setBand(i, { name: x })} /></Field>
              <Field label="Grades" hint="Leave empty for everyone not in a band above"><MultiSelect value={b.grade_codes} onChange={(x) => setBand(i, { grade_codes: x })} options={grades} /></Field>
            </FormGrid>
            <p className="mb-2 mt-4 text-[13px] text-muted">Modes and classes allowed (leave a mode empty to not allow it)</p>
            <FormGrid columns={3}>
              {modes.map((m) => (
                <Field key={m.value} label={m.label}><MultiSelect value={b.modes[m.value] ?? []} options={m.classes}
                  onChange={(x) => { const next = { ...b.modes }; if (x.length) next[m.value] = x; else delete next[m.value]; setBand(i, { modes: next }); }} /></Field>))}
            </FormGrid>
            <p className="mb-2 mt-4 text-[13px] text-muted">Hotel limit a night (₹)</p>{tiered(b, i, "hotel")}
            <p className="mb-2 mt-4 text-[13px] text-muted">Daily allowance (₹)</p>{tiered(b, i, "per_diem")}
            <FormGrid columns={2} className="mt-4">
              <Field label="Ask ahead, India (days)"><NumberInput value={b.lead_days.domestic} min={0} onChange={(x) => setBand(i, { lead_days: { ...b.lead_days, domestic: x ?? 0 } })} /></Field>
              <Field label="Ask ahead, abroad (days)"><NumberInput value={b.lead_days.international} min={0} onChange={(x) => setBand(i, { lead_days: { ...b.lead_days, international: x ?? 0 } })} /></Field>
            </FormGrid>
          </div>))}
        <Button variant="ghost" icon={Plus} onClick={() => setRules({ ...rules, bands: [{ ...structuredClone(rules.bands[rules.bands.length - 1]), name: "New band", grade_codes: [] }, ...rules.bands] })}>Add band</Button>
        <FormGrid columns={2}>
          <Field label="Tier X cities" hint="Comma separated"><Textarea rows={3} value={rules.city_tiers.X.join(", ")} onValueChange={(x) => setRules({ ...rules, city_tiers: { ...rules.city_tiers, X: x.split(",").map((s) => s.trim()).filter(Boolean) } })} /></Field>
          <Field label="Tier Y cities" hint="Comma separated; every other city is tier Z"><Textarea rows={3} value={rules.city_tiers.Y.join(", ")} onValueChange={(x) => setRules({ ...rules, city_tiers: { ...rules.city_tiers, Y: x.split(",").map((s) => s.trim()).filter(Boolean) } })} /></Field>
        </FormGrid>
        <FormGrid columns={3}>
          {(["ticket", "hotel", "per_diem"] as const).map((k) => (
            <Field key={k} label={k === "ticket" ? "Expense category for tickets" : k === "hotel" ? "Expense category for hotels" : "Expense category for daily allowance"} hint="Category code">
              <TextInput value={rules.claim_categories?.[k] ?? ""} onValueChange={(x) => setRules({ ...rules, claim_categories: { ...rules.claim_categories, [k]: x.toUpperCase() } })} /></Field>))}
        </FormGrid>
      </div>
    </Modal>
  );
}
