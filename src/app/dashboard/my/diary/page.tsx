"use client";

/* Portal class diary: the class teacher's daily notes for the child's section. */
import { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Skeleton, formatDisplayDate, toISODate } from "@/components/ui-kit";
import { AttachmentList, ChildSwitcher, useChild, type FileRef } from "@/components/comms/shared";

type Entry = { uuid: string; date: string; body: string; attachments: FileRef[]; author_name: string | null };

export default function MyDiaryPage() {
  const { term } = useInstitution();
  const child = useChild();
  const [data, setData] = useState<{ id: number; rows: Entry[] } | null>(null);
  useEffect(() => {
    const id = child.studentId;
    if (!id) return;
    api.get<Entry[]>(`/comms/portal/diary?student_id=${id}`).then((r) => setData({ id, rows: r })).catch(() => setData({ id, rows: [] }));
  }, [child.studentId]);
  const rows: Entry[] | null = child.ready && !child.studentId ? [] : data && data.id === child.studentId ? data.rows : null;
  const today = toISODate(new Date());
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Class diary" description={`Daily notes from the class ${term("teacher").toLowerCase()}: homework, things to bring and reminders.`} actions={<ChildSwitcher child={child} />} />
      {rows === null ? <Skeleton className="h-48 w-full rounded-2xl" /> : rows.length === 0 ? (
        <Paper><EmptyState icon={NotebookPen} title="No diary notes yet" hint={`Notes from the class ${term("teacher").toLowerCase()} appear here.`} /></Paper>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.uuid}>
              <Paper className="p-5">
                <p className="mb-1.5 text-[13px] text-muted">{e.date === today ? "Today" : formatDisplayDate(e.date)}</p>
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink/90">{e.body}</p>
                <div className="mt-2"><AttachmentList files={e.attachments} /></div>
                {e.author_name && <p className="mt-2 text-[12px] text-faint">{e.author_name}</p>}
              </Paper>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
