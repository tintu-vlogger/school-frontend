"use client";

/*
 * New help desk case, with knowledge-base suggestions while the subject is typed.
 *   <NewCaseModal open me={me} categories={cats} onClose={...} onCreated={(uuid) => ...} />
 * ArticleModal shows one knowledge-base article with a "Was this helpful?" question.
 */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatRelative } from "@/lib/datetime";
import {
  Button, Field, FormGrid, MasterSelect, Modal, ModalCancel, Select, Skeleton, TextInput, Textarea, Toggle,
} from "@/components/ui-kit";
import { AttachmentPicker } from "@/components/workplace/attachments";
import type { FileRef } from "@/components/workplace/files";
import { PRIORITY_OPTIONS, loadEmployees } from "@/components/workplace/pickers";
import type { Category, HelpdeskMe } from "./types";
import { CustomFields, customFieldErrors, useCustomFieldLayout, type CustomValues } from "@/components/custom-fields";

const S = 1.4;
export type Article = {
  uuid: string; title: string; body: string; category_id: number | null; category_name: string | null; tags: string[];
  published: boolean; views: number; helpful_yes: number; helpful_no: number; author_name: string | null; updated_at: string;
};

export function ArticleModal({ uuid, open, onClose }: { uuid: string | null; open: boolean; onClose: () => void }) {
  const [a, setA] = useState<Article | null>(null);
  const [voted, setVoted] = useState(false);
  useEffect(() => {
    if (!open || !uuid) return;
    let live = true;
    setA(null); setVoted(false);
    api.get<Article>(`/helpdesk/articles/${uuid}`).then((r) => { if (live) setA(r); }).catch(() => {});
    return () => { live = false; };
  }, [open, uuid]);
  async function vote(helpful: boolean) {
    if (!a) return;
    await api.post(`/helpdesk/articles/${a.uuid}/helpful`, { helpful }).catch(() => {});
    setVoted(true);
  }
  return (
    <Modal open={open && !!uuid} onClose={onClose} size="md" zIndex={72} title={a?.title ?? "Article"}
      description={a ? [a.category_name, `Updated ${formatRelative(a.updated_at)}`].filter(Boolean).join(" · ") : undefined}
      leading={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><BookOpen size={18} strokeWidth={S} /></span>}
      footer={a && (voted ? <p className="text-[13px] text-muted">Thanks for letting us know.</p> : (
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[13px] text-muted">Was this helpful?</span>
          <div className="flex gap-2">
            <Button size="sm" icon={ThumbsUp} onClick={() => vote(true)}>Yes</Button>
            <Button size="sm" icon={ThumbsDown} onClick={() => vote(false)}>No</Button>
          </div>
        </div>
      ))}>
      {!a ? <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div> : (
        <div>
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink">{a.body}</p>
          {a.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{a.tags.map((t) => <span key={t} className="rounded-full bg-sunken px-2.5 py-0.5 text-[12px] text-muted">{t}</span>)}</div>}
        </div>
      )}
    </Modal>
  );
}

export function NewCaseModal({ open, me, categories, onClose, onCreated }: {
  open: boolean; me: HelpdeskMe; categories: Category[]; onClose: () => void; onCreated: (uuid: string) => void;
}) {
  const toast = useToast();
  const empty = { category: null as number | null, sub: null as number | null, type: null as number | null, subject: "", description: "",
    priority: null as string | null, forOther: false, requester: null as number | null, source: "phone" };
  const [v, setV] = useState(empty);
  const [files, setFiles] = useState<FileRef[]>([]);
  // Custom fields of a case: agents see them all; employees see (and fill) the ones meant for them.
  const audience = me.is_staff ? "hr" : "employee";
  const { layout: cfLayout } = useCustomFieldLayout("helpdesk_case");
  const [custom, setCustom] = useState<CustomValues>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [hits, setHits] = useState<{ q: string; items: Article[] }>({ q: "", items: [] });
  const [article, setArticle] = useState<string | null>(null);

  useEffect(() => { if (open) { setV(empty); setFiles([]); setErrors({}); setCustom({}); setCfErrors({}); setHits({ q: "", items: [] }); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mains = categories.filter((c) => c.parent_id === null && c.active);
  const subs = categories.filter((c) => c.parent_id === v.category && c.active);
  const cat = mains.find((c) => c.id === v.category);
  const showPriority = me.is_staff || !me.settings.hide_priority_from_requester;

  // knowledge-base suggestions while typing the subject
  useEffect(() => {
    const q = v.subject.trim();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      api.get<{ items: Article[] }>(`/helpdesk/articles?q=${encodeURIComponent(q)}&limit=4`)
        .then((r) => setHits({ q, items: r.items })).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [v.subject]);
  const suggestions = v.subject.trim().length >= 3 && hits.q === v.subject.trim() ? hits.items : [];

  const set = (patch: Partial<typeof v>) => { setV({ ...v, ...patch }); setErrors({}); };
  const dirty = !!(v.subject || v.description || files.length);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!v.category) err.category = "Pick a category";
    if (cat?.require_subcategory && subs.length && !v.sub) err.sub = "Pick a subcategory";
    if (!v.subject.trim()) err.subject = "Write a short subject";
    if (!v.description.trim()) err.description = "Describe your question or request";
    if (v.forOther && !v.requester) err.requester = "Pick the employee";
    setErrors(err);
    const cfe = customFieldErrors(cfLayout, custom, audience);
    setCfErrors(cfe);
    if (Object.keys(err).length || Object.keys(cfe).length) return;
    setSaving(true);
    try {
      const r = await api.post<{ uuid: string; reference_no: string }>("/helpdesk/cases", {
        category_id: v.category, subcategory_id: v.sub, case_type_id: v.type, subject: v.subject.trim(), description: v.description.trim(),
        priority: showPriority ? v.priority : null, attachments: files.map((f) => f.uuid),
        requester_employee_id: v.forOther ? v.requester : null, source: v.forOther ? v.source : "web",
        custom,
      });
      toast.success(`Case ${r.reference_no ?? ""} raised`.trim(), { description: "We'll reply here and let you know." });
      onCreated(r.uuid);
    } catch (err2) {
      toast.error("Couldn't raise the case", { description: err2 instanceof Error ? err2.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title="New case"
        description="Ask HR, payroll, IT or admin. You can follow the reply here."
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="hd-new-case" loading={saving}>Raise case</Button></>}>
        <form id="hd-new-case" onSubmit={submit} noValidate className="space-y-5">
          {me.is_staff && me.settings.raise_for_others && (
            <div className="rounded-xl border border-line p-4">
              <Toggle checked={v.forOther} onChange={(x) => set({ forOther: x })} label="Raise for an employee"
                description="For someone who called, wrote or walked in." />
              {v.forOther && (
                <FormGrid className="mt-4">
                  <Field label="Employee" required error={errors.requester}>
                    <Select value={v.requester} onChange={(x) => set({ requester: x })} loadOptions={loadEmployees} placeholder="Search people" />
                  </Field>
                  <Field label="Came in by">
                    <Select value={v.source} onChange={(x) => set({ source: x || "phone" })}
                      options={Object.entries(me.sources).filter(([k]) => k !== "web").map(([value, label]) => ({ value, label }))} />
                  </Field>
                </FormGrid>
              )}
            </div>
          )}
          <FormGrid>
            <Field label="Category" required error={errors.category}>
              <Select value={v.category} onChange={(x) => set({ category: x, sub: null })} placeholder="What is it about?"
                options={mains.map((c) => ({ value: c.id, label: c.name, description: c.description || undefined }))} />
            </Field>
            <Field label="Subcategory" required={!!cat?.require_subcategory && subs.length > 0} error={errors.sub}
              aside={!cat?.require_subcategory ? "Optional" : undefined}>
              <Select value={v.sub} onChange={(x) => set({ sub: x })} disabled={!subs.length} clearable
                placeholder={v.category && !subs.length ? "None for this category" : "Pick one"}
                options={subs.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
              <TextInput autoFocusInModal value={v.subject} onValueChange={(x) => set({ subject: x })} maxLength={250}
                placeholder="e.g. October payslip shows wrong HRA" />
            </Field>
          </FormGrid>
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-primary/15 bg-primary-soft/25 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] text-primary"><Lightbulb size={14} strokeWidth={S} />This might answer it</p>
              <ul className="space-y-1">
                {suggestions.map((a) => (
                  <li key={a.uuid}>
                    <button type="button" onClick={() => setArticle(a.uuid)} className="group w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface">
                      <span className="block text-[13.5px] text-ink group-hover:text-primary">{a.title}</span>
                      <span className="line-clamp-1 block text-[12.5px] text-muted">{a.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Details" required error={errors.description}>
            <Textarea value={v.description} onValueChange={(x) => set({ description: x })} rows={5} autoGrow
              placeholder="What happened, when, and anything we should know" />
          </Field>
          <FormGrid>
            <Field label="Type" aside="Optional">
              <MasterSelect type="case_type" value={v.type} onChange={(x) => set({ type: x })} clearable allowCreate={false} />
            </Field>
            {showPriority && (
              <Field label="Priority" aside="Optional">
                <Select value={v.priority} onChange={(x) => set({ priority: x })} options={PRIORITY_OPTIONS} clearable
                  placeholder={cat ? `Default: ${cat.default_priority}` : "Default"} />
              </Field>
            )}
          </FormGrid>
          <Field label="Attachments" aside="Optional">
            <AttachmentPicker value={files} onChange={setFiles} />
          </Field>
          <CustomFields entity="helpdesk_case" layout={cfLayout} audience={audience} values={custom}
            onChange={(x) => { setCustom(x); setCfErrors({}); }} errors={cfErrors} />
        </form>
      </Modal>
      <ArticleModal uuid={article} open={!!article} onClose={() => setArticle(null)} />
    </>
  );
}
