"use client";

/*
 * Numbering: formats and counters for employee IDs, requests, letters, assets and tickets.
 * Editing happens in a modal with a live preview of the next numbers. Groups with several
 * legal entities can put {ENTITY} (the entity's short code) in a format and choose whether
 * all entities share one counter or each counts on its own.
 */
import { useCallback, useEffect, useState } from "react";
import { Hash, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FormGrid, Modal, ModalCancel, NumberInput, RadioCards, Select, TextInput, Toggle, type Column,
} from "@/components/ui-kit";

type Series = {
  uuid: string; key: string; name: string; description: string | null; prefix: string; pattern: string; reset: string;
  start_number: number; allow_manual: boolean; is_system: boolean; active: boolean; next: string;
  counter_scope: "shared" | "per_entity";
  next_by_entity: { legal_entity_id: number; name: string; code: string; next: string }[];
};
type EntityRef = { id: number; name: string; code: string };
type Option = { value: string; label: string };
type Draft = Omit<Series, "uuid" | "is_system" | "next" | "next_by_entity"> & { uuid?: string; is_system?: boolean };

const TOKENS = [
  { token: "{PREFIX}", hint: "Prefix" }, { token: "{YYYY}", hint: "Year" }, { token: "{YY}", hint: "Year, 2 digits" },
  { token: "{MM}", hint: "Month" }, { token: "{DD}", hint: "Day" }, { token: "{FY}", hint: "Financial year" },
  { token: "{ENTITY}", hint: "Legal entity's short code" },
  { token: "{SEQ:4}", hint: "Counter, 4 digits" },
];
const EMPTY: Draft = { key: "", name: "", description: "", prefix: "", pattern: "{PREFIX}{SEQ:4}", reset: "never", start_number: 1, allow_manual: true, active: true, counter_scope: "shared" };

export default function NumberingPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Series[] | null>(null);
  const [resets, setResets] = useState<Option[]>([]);
  const [entities, setEntities] = useState<EntityRef[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: Series[]; resets: Option[]; legal_entities?: EntityRef[] }>("/number-series/");
      setRows(data.items);
      setResets(data.resets);
      setEntities(data.legal_entities ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load number series");
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(s: Series, active: boolean) {
    setRows((r) => r?.map((x) => (x.uuid === s.uuid ? { ...x, active } : x)) ?? null);
    try {
      await api.put(`/number-series/${s.uuid}`, { active });
      toast.success(active ? `${s.name} numbers switched on` : `${s.name} numbers switched off`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
      load();
    }
  }

  const resetLabel = (v: string) => resets.find((r) => r.value === v)?.label ?? v;
  const columns: Column<Series>[] = [
    {
      key: "name", header: "Series", sortable: true, sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{s.name}</p>
          {s.description && <p className="truncate text-[12.5px] text-faint">{s.description}</p>}
        </div>
      ),
    },
    { key: "pattern", header: "Format", hideBelow: "md", cell: (s) => <code className="rounded bg-sunken px-1.5 py-0.5 text-[12.5px] text-muted">{s.pattern}</code> },
    {
      key: "next", header: "Next number",
      cell: (s) => s.next_by_entity?.length > 1 ? (
        <div className="space-y-0.5">
          {s.next_by_entity.slice(0, 3).map((e) => (
            <p key={e.legal_entity_id} className="flex items-baseline gap-2"><span className="tabular-nums text-ink">{e.next}</span><span className="truncate text-[12px] text-faint">{e.name}</span></p>
          ))}
          {s.next_by_entity.length > 3 && <p className="text-[12px] text-faint">and {s.next_by_entity.length - 3} more</p>}
        </div>
      ) : <span className="tabular-nums text-ink">{s.next}</span>,
    },
    { key: "reset", header: "Starts again", hideBelow: "lg", cell: (s) => <span className="text-muted">{resetLabel(s.reset)}</span> },
    {
      key: "active", header: "In use", align: "right",
      cell: (s) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Toggle size="sm" checked={s.active} onChange={(v) => toggle(s, v)} aria-label={`Use ${s.name} numbers`} />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Numbering"
        description="How employee IDs, requests, letters and other records are numbered. Changes apply to the next number."
        actions={<Button variant="primary" icon={Plus} onClick={() => setDraft({ ...EMPTY })}>New series</Button>} />

      <DataTable rows={rows ?? []} loading={rows === null} columns={columns} rowKey={(s) => s.uuid}
        onRowClick={(s) => setDraft({ ...s })}
        rowActions={(s) => [{ label: "Edit", icon: Pencil, onSelect: () => setDraft({ ...s }) }]}
        emptyIcon={Hash} emptyTitle="No number series yet" emptyHint="Add one to number a kind of record." />

      {draft && <SeriesModal draft={draft} resets={resets} entities={entities} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />}
    </div>
  );
}

function SeriesModal({ draft, resets, entities, onClose, onSaved }: { draft: Draft; resets: Option[]; entities: EntityRef[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => ({
    key: draft.key, name: draft.name, description: draft.description, prefix: draft.prefix, pattern: draft.pattern, reset: draft.reset,
    start_number: draft.start_number, allow_manual: draft.allow_manual, active: draft.active, counter_scope: draft.counter_scope ?? "shared",
    uuid: draft.uuid, is_system: draft.is_system,
  }));
  const [start] = useState(d);
  const [examples, setExamples] = useState<string[]>([]);
  const [byEntity, setByEntity] = useState<{ name: string; example: string }[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = !draft.uuid;
  const dirty = JSON.stringify(d) !== JSON.stringify(start);
  const usesEntity = d.pattern.includes("{ENTITY}");
  const scopeError = d.counter_scope === "per_entity" && !usesEntity ? "Put {ENTITY} in the format so numbers stay unique across entities." : "";
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const r = await api.post<{ examples: string[]; by_entity?: { name: string; example: string }[] }>("/number-series/preview", {
          prefix: d.prefix, pattern: d.pattern, reset: d.reset, start_number: d.start_number,
        });
        setExamples(r.examples);
        setByEntity(r.by_entity ?? []);
        setPreviewError("");
      } catch (e) {
        setExamples([]);
        setPreviewError(e instanceof Error ? e.message : "This format doesn't work");
      }
    }, 300);
    return () => clearTimeout(id);
  }, [d.prefix, d.pattern, d.reset, d.start_number]);

  async function save() {
    setSaving(true);
    try {
      const body = { name: d.name, description: d.description || null, prefix: d.prefix, pattern: d.pattern, reset: d.reset,
        start_number: d.start_number, allow_manual: d.allow_manual, active: d.active, counter_scope: d.counter_scope };
      if (isNew) await api.post("/number-series/", { ...body, key: d.key || d.name });
      else await api.put(`/number-series/${draft.uuid}`, body);
      toast.success("Number series saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={isNew ? "New number series" : d.name} description={isNew ? "A format and counter for one kind of record." : "Format and counter"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!!previewError || !!scopeError || !d.name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-6">
        <FormGrid>
          <Field label="Name" required><TextInput value={d.name} onValueChange={(v) => set("name", v)} placeholder="e.g. Visitor passes" data-autofocus /></Field>
          {isNew
            ? <Field label="Used for" hint="A short code, e.g. visitor_pass"><TextInput value={d.key} onValueChange={(v) => set("key", v)} placeholder="visitor_pass" /></Field>
            : <Field label="Used for"><TextInput value={d.key} disabled /></Field>}
          <Field label="Prefix" hint="Replaces {PREFIX} in the format"><TextInput value={d.prefix} onValueChange={(v) => set("prefix", v)} placeholder="EMP" /></Field>
          <Field label="Counter starts again">
            <Select value={d.reset} onChange={(v) => set("reset", (v as string) || "never")} options={resets} />
          </Field>
        </FormGrid>

        <Field label="Format" required error={previewError || undefined}
          hint="Mix your own text with the parts below. The counter must appear once.">
          <TextInput value={d.pattern} onValueChange={(v) => set("pattern", v)} invalid={!!previewError} className="font-mono" />
        </Field>
        <div className="-mt-3 flex flex-wrap gap-1.5">
          {TOKENS.map((t) => (
            <button key={t.token} type="button" title={t.hint} onClick={() => set("pattern", d.pattern + t.token)}
              className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[12px] text-muted transition-colors hover:border-primary/40 hover:text-primary">
              {t.token}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-sunken/50 px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Next numbers</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.length ? examples.map((x) => <Badge key={x} tone="accent">{x}</Badge>)
              : <span className="text-[13px] text-faint">{previewError ? "Fix the format to see examples" : "…"}</span>}
          </div>
          {usesEntity && byEntity.length > 1 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {byEntity.map((e) => (
                <li key={e.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate text-muted">{e.name}</span><span className="tabular-nums text-ink">{e.example}</span>
                </li>
              ))}
            </ul>
          )}
          {usesEntity && entities.length > 0 && entities.every((e) => !e.code) && (
            <p className="mt-2 text-[12.5px] text-faint">No legal entity has a short code yet, so the initials of its name are used. Set codes under Settings › Legal entities.</p>
          )}
        </div>

        {(entities.length > 1 || usesEntity || d.counter_scope === "per_entity") && (
          <Field label="Counting across legal entities" error={scopeError || undefined}
            hint="Numbers for a record use its legal entity; without one, the main entity.">
            <RadioCards<"shared" | "per_entity"> columns={2} value={d.counter_scope} onChange={(v) => set("counter_scope", v)} options={[
              { value: "shared", label: "One counter", description: "All entities share the sequence: KA-001, MH-002, KA-003" },
              { value: "per_entity", label: "A counter per entity", description: "Each entity counts on its own: KA-001, MH-001, KA-002" },
            ]} />
          </Field>
        )}

        <FormGrid>
          <Field label="First number"><NumberInput value={d.start_number} onChange={(v) => set("start_number", Math.max(0, Math.round(v ?? 1)))} min={0} /></Field>
          <div />
          <Toggle checked={d.allow_manual} onChange={(v) => set("allow_manual", v)} label="People may type their own number"
            description="When off, the number is always given automatically." />
          <Toggle checked={d.active} onChange={(v) => set("active", v)} label="In use"
            description={d.key === "employee" ? "New employees get the next ID automatically." : "Numbers are given from this series."} />
        </FormGrid>
      </div>
    </Modal>
  );
}
