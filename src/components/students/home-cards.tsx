"use client";

/*
 * Home page cards for the students module.
 *   <StaffHomeCard />                     // active students, new admissions this month, by class, gender split
 *   <PortalHomeCard studentId={id} />     // a child's photo, class, roll number and class teacher
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, UserRoundPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Avatar, Skeleton } from "@/components/ui-kit";

type Stats = {
  active: number; new_this_month: number; by_gender: Record<string, number>; by_program: { program: string; count: number }[];
};

export function StaffHomeCard() {
  const { term } = useInstitution();
  const [s, setS] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<Stats>("/students/stats").then(setS).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  const max = Math.max(1, ...(s?.by_program ?? []).map((p) => p.count));
  const female = s?.by_gender?.female ?? 0;
  const male = s?.by_gender?.male ?? 0;
  const other = s ? Object.entries(s.by_gender).filter(([k]) => k !== "female" && k !== "male").reduce((a, [, v]) => a + v, 0) : 0;
  const total = female + male + other || 1;
  return (
    <Paper>
      <PaperHeader title={term("students")} action={<Link href="/dashboard/students" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24 w-full" /></div> : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><GraduationCap size={15} strokeWidth={1.4} />Active</p>
              <p className="tabular mt-1 text-[30px] font-extralight leading-none text-ink">{s.active}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><UserRoundPlus size={15} strokeWidth={1.4} />New this month</p>
              <p className="tabular mt-1 text-[30px] font-extralight leading-none text-ink">{s.new_this_month}</p>
            </div>
          </div>
          {s.by_program.length > 0 && (
            <div>
              <p className="mb-2 text-[12.5px] text-muted">By {term("program").toLowerCase()}</p>
              <div className="flex h-20 items-end gap-1" role="img" aria-label={s.by_program.map((p) => `${p.program}: ${p.count}`).join(", ")}>
                {s.by_program.map((p) => (
                  <div key={p.program} title={`${p.program}: ${p.count}`} className="min-w-[4px] flex-1 rounded-t bg-primary/70 hover:bg-primary"
                    style={{ height: `${Math.max(4, (p.count / max) * 100)}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-faint">
                <span>{s.by_program[0].program}</span><span>{s.by_program[s.by_program.length - 1].program}</span>
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
              <span>Girls {female}</span><span>Boys {male}{other ? ` · Other ${other}` : ""}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
              <div className="bg-rose-400/80" style={{ width: `${(female / total) * 100}%` }} />
              <div className="bg-sky-500/80" style={{ width: `${(male / total) * 100}%` }} />
            </div>
          </div>
        </div>
      )}
    </Paper>
  );
}

type Summary = {
  id: number; uuid: string; name: string; admission_no: string; photo_url: string | null; section_label: string | null;
  program_name: string | null; roll_no: string | null; class_teacher_name: string | null; house_name: string | null;
  session_name: string | null;
};

export function PortalHomeCard({ studentId }: { studentId: number }) {
  const { term } = useInstitution();
  const [s, setS] = useState<{ id: number; data: Summary } | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Summary>(`/students/portal/summary?student_id=${studentId}`).then((d) => { if (live) setS({ id: studentId, data: d }); }).catch(() => {});
    return () => { live = false; };
  }, [studentId]);
  const d = s?.id === studentId ? s.data : null;
  return (
    <Paper>
      {!d ? <div className="flex items-center gap-4 p-5"><Skeleton className="h-14 w-14 rounded-full" /><Skeleton className="h-10 flex-1" /></div> : (
        <Link href="/dashboard/my/profile" className="flex items-center gap-4 p-5 hover:bg-sunken/30">
          <Avatar name={d.name} src={d.photo_url} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-light text-ink">{d.name}</p>
            <p className="text-[13px] text-muted">{[d.section_label ?? d.program_name, d.roll_no ? `${term("roll")} ${d.roll_no}` : null].filter(Boolean).join(" · ") || `Not enrolled in a ${term("section").toLowerCase()} yet`}</p>
            {d.class_teacher_name && <p className="mt-0.5 text-[13px] text-muted">{term("teacher")}: <span className="text-ink/80">{d.class_teacher_name}</span></p>}
          </div>
        </Link>
      )}
    </Paper>
  );
}
