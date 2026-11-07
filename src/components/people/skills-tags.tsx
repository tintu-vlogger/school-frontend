"use client";

/*
 * Skills (level 1-5, verified flag) and tags on the employee profile.
 *   <SkillsPanel employeeUuid skills canAdd canVerify onChanged />
 *   <TagsPanel employeeUuid tags teams canEdit onChanged />
 */
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Lightbulb, Pencil, Plus, Tags, Trash2, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Field, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Select, Textarea, Toggle, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { tagOptions, useTags } from "./hooks";
import type { Profile, SkillRow, TagRef } from "./types";

const LEVELS = ["Beginner", "Basic", "Intermediate", "Advanced", "Expert"];

export function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`${LEVELS[level - 1]} (${level} of 5)`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-4 rounded-full ${i <= level ? "bg-primary" : "bg-line"}`} />)}
    </span>
  );
}

export function TagChip({ tag }: { tag: TagRef }) {
  return (
    <span className="inline-flex h-[24px] max-w-[180px] items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-[12.5px] text-ink/80">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag.color || "#94a3b8" }} />
      {tag.parent_name && <span className="text-faint">{tag.parent_name} ›</span>}<span className="truncate">{tag.name}</span>
    </span>
  );
}

function SkillModal({ open, employeeUuid, row, canVerify, existing, onClose, onSaved }: {
  open: boolean; employeeUuid: string; row: SkillRow | null; canVerify: boolean; existing: number[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [skills, setSkills] = useState<SelectOption<number>[]>([]);
  const [v, setV] = useState({ skill_id: row?.skill_id ?? null as number | null, level: row?.level ?? 3, years: row?.years ?? null as number | null, verified: row?.verified ?? false, notes: row?.notes ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.getCached<{ id: number; name: string; category_name: string | null; active: boolean }[]>("/organization/skills", 60)
      .then((r) => setSkills(r.filter((s) => s.active && (!existing.includes(s.id) || s.id === row?.skill_id)).map((s) => ({ value: s.id, label: s.name, description: s.category_name ?? undefined }))))
      .catch(() => {});
  }, [existing, row]);
  async function save() {
    if (!v.skill_id) { setError("Pick a skill"); return; }
    setSaving(true);
    try {
      const body = { skill_id: v.skill_id, level: v.level, years: v.years, notes: v.notes || null, ...(canVerify ? { verified: v.verified } : {}) };
      if (row) await api.put(`/employees/${employeeUuid}/skills/${row.uuid}`, body);
      else await api.post(`/employees/${employeeUuid}/skills`, body);
      toast.success("Skill saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save the skill", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={row ? `Edit ${row.skill_name}` : "Add a skill"}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-5">
        <Field label="Skill" required error={error}><Select<number> value={v.skill_id} onChange={(x) => { setV({ ...v, skill_id: x }); setError(""); }} options={skills} disabled={!!row} placeholder="Search the skills library" /></Field>
        <Field label="Level">
          <div className="grid grid-cols-5 gap-1.5">
            {LEVELS.map((l, i) => (
              <button key={l} type="button" onClick={() => setV({ ...v, level: i + 1 })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[12px] transition-colors ${v.level === i + 1 ? "border-primary/50 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>
                <LevelDots level={i + 1} />{l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Years of experience"><NumberInput value={v.years} onChange={(x) => setV({ ...v, years: x })} min={0} max={60} suffix="years" /></Field>
        <Field label="Notes" aside="Optional"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={2} /></Field>
        {canVerify && <Toggle checked={v.verified} onChange={(x) => setV({ ...v, verified: x })} label="Verified" description="You have seen this skill in their work or a certificate" />}
      </div>
    </Modal>
  );
}

export function SkillsPanel({ employeeUuid, skills, canAdd, canVerify, onChanged }: { employeeUuid: string; skills: SkillRow[]; canAdd: boolean; canVerify: boolean; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ row: SkillRow | null; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  async function remove(s: SkillRow) {
    if (!(await confirm({ title: `Remove ${s.skill_name}?`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/employees/${employeeUuid}/skills/${s.uuid}`); toast.success("Skill removed"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] text-ink"><Lightbulb size={16} strokeWidth={1.4} className="text-faint" /> Skills <span className="text-[12.5px] text-faint tabular">{skills.length}</span></p>
        {canAdd && <Button size="sm" icon={Plus} onClick={() => { setForm({ row: null, key: Date.now() }); setOpen(true); }}>Add skill</Button>}
      </header>
      {skills.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-muted">No skills added yet.</p> : (
        <ul className="grid gap-px bg-line sm:grid-cols-2">
          {skills.map((s) => (
            <li key={s.uuid} className="group flex items-center gap-3 bg-surface px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] text-ink">{s.skill_name}{s.verified && <BadgeCheck size={15} strokeWidth={1.4} className="text-emerald-600" aria-label="Verified" />}</p>
                <div className="mt-1 flex items-center gap-2 text-[12.5px] text-muted"><LevelDots level={s.level} /> {s.level_label}{s.years ? ` · ${s.years} yrs` : ""}</div>
                {s.category_name && <p className="mt-0.5 text-[12px] text-faint">{s.category_name}{s.verified && s.verified_by_name ? ` · verified by ${s.verified_by_name}` : ""}</p>}
              </div>
              {(canAdd || canVerify) && (
                <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100">
                  <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => { setForm({ row: s, key: Date.now() }); setOpen(true); }} />
                  {canAdd && <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => remove(s)} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {form && <SkillModal key={form.key} open={open} employeeUuid={employeeUuid} row={form.row} canVerify={canVerify} existing={skills.map((s) => s.skill_id)}
        onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />}
    </section>
  );
}

export function TagsPanel({ profile, canEdit, onChanged }: { profile: Profile; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const { tags } = useTags();
  const opts = useMemo(() => tagOptions(tags), [tags]);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await api.put(`/employees/${profile.uuid}/tags`, { tag_ids: value }); toast.success("Tags saved"); setOpen(false); onChanged(); }
    catch (e) { toast.error("Couldn't save the tags", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] text-ink"><Tags size={16} strokeWidth={1.4} className="text-faint" /> Tags and teams</p>
        {canEdit && <Button size="sm" icon={Pencil} onClick={() => { setValue(profile.tags.map((t) => t.id)); setOpen(true); }}>Edit tags</Button>}
      </header>
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">{profile.tags.length ? profile.tags.map((t) => <TagChip key={t.id} tag={t} />) : <span className="text-[13.5px] text-muted">No tags.</span>}</div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.06em] text-faint"><UsersRound size={13} strokeWidth={1.4} /> Teams</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.teams.length ? profile.teams.map((t) => (
              <span key={t.id} className="inline-flex h-[24px] items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px] text-ink/80">
                <span className="h-2 w-2 rounded-sm" style={{ background: t.color || "#6366f1" }} />{t.name}{t.is_lead && <Badge tone="accent" className="!h-[18px] !px-1.5 !text-[11px]">Lead</Badge>}
              </span>
            )) : <span className="text-[13.5px] text-muted">Not in a team.</span>}
          </div>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} size="md" busy={saving} title="Tags"
        description="Tags with sub-tags group people for filters, reports and announcements."
        footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
        <Field label="Tags"><MultiSelect<number> value={value} onChange={setValue} options={opts} placeholder="Pick tags" /></Field>
      </Modal>
    </section>
  );
}
