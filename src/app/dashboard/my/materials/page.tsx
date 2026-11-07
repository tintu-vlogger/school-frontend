"use client";

/* Study materials (portal): notes, files, videos and links shared with the learner's class. */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Modal, Select, Skeleton, TextInput } from "@/components/ui-kit";
import { ChildSwitcher, useChild } from "@/components/lms/shared";
import { KIND_ICON, KIND_LABEL, MaterialPreview } from "@/components/lms/material-preview";
import type { Material } from "@/components/lms/lib";

export default function MyMaterialsPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const child = useChild();
  const [subject, setSubject] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ sid: number; items: Material[] } | null>(null);
  const [open, setOpen] = useState<{ uuid: string; m: Material | null } | null>(null);
  const sid = child.studentId;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    api.get<{ items: Material[] }>(`/lms/portal/materials?student_id=${sid}`).then((r) => live && setData({ sid, items: r.items }))
      .catch((e) => { toast.error(e.message); if (live) setData({ sid, items: [] }); });
    return () => { live = false; };
  }, [sid, toast]);
  const all = data?.sid === sid ? data.items : null;
  const subjects = useMemo(() => [...new Map((all ?? []).map((m) => [m.subject_id, m.subject_name ?? ""])).entries()].map(([value, label]) => ({ value, label })), [all]);
  const items = (all ?? []).filter((m) => (!subject || m.subject_id === subject) && (!q || `${m.title} ${m.topic ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => {
    const g = new Map<string, Material[]>();
    for (const m of items) g.set(m.subject_name ?? "", [...(g.get(m.subject_name ?? "") ?? []), m]);
    return [...g.entries()];
  }, [items]);

  function view(m: Material) {
    setOpen({ uuid: m.uuid, m: null });
    api.get<Material>(`/lms/portal/materials/${m.uuid}?student_id=${sid}`).then((full) => setOpen({ uuid: m.uuid, m: full })).catch((e) => { toast.error(e.message); setOpen(null); });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Study materials" description="Notes, worksheets, videos and links from your teachers." actions={<ChildSwitcher child={child} />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <TextInput leading={Search} value={q} onValueChange={setQ} placeholder="Search materials" />
        <Select value={subject} onChange={setSubject} clearable placeholder={`All ${term("subjects").toLowerCase()}`} options={subjects} />
      </div>
      {!all ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div> : items.length === 0 ? (
        <Paper><EmptyState icon={BookOpen} title="No materials yet" hint="Your teachers' notes, videos and links will appear here." /></Paper>
      ) : groups.map(([name, rows]) => (
        <section key={name} className="mb-5">
          <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">{name}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((m) => {
              const Icon = KIND_ICON[m.kind];
              return (
                <li key={m.uuid}>
                  <button type="button" onClick={() => view(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Icon size={16} strokeWidth={1.4} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{m.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[KIND_LABEL[m.kind], m.topic, formatDate(m.created_at)].filter(Boolean).join(" · ")}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.m?.title ?? "Material"} description={open?.m ? [open.m.subject_name, open.m.topic, open.m.created_by_name].filter(Boolean).join(" · ") : undefined}>
        {open?.m ? <MaterialPreview m={open.m} /> : <Skeleton className="h-40 w-full" />}
      </Modal>
    </div>
  );
}
