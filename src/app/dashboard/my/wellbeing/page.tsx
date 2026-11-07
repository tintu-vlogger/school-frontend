"use client";

/*
 * Portal: a child's infirmary visits, merit and demerit points with their house standing,
 * and basic health details. Parents with several children switch between them.
 */
import { Award, HeartPulse, Ruler, Stethoscope, Trophy } from "lucide-react";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Badge, KeyValue, Select, Skeleton } from "@/components/ui-kit";
import { PointsBadge, STROKE, useGet, useMyChild } from "@/components/wellbeing/common";

type Summary = {
  visits: { uuid: string; visit_at: string; complaint: string; treatment: string | null; medicine_given: string | null; sent_home: boolean }[];
  points_total: number; merits: number; demerits: number;
  points: { uuid: string; points: number; reason: string; category: string | null; awarded_on: string }[];
  house: { name: string; color: string | null; points: number } | null;
  health: { height_cm: number | null; weight_kg: number | null; bmi: number | null; measured_on: string | null; allergies: string | null; blood_group: string | null };
};

export default function MyWellbeingPage() {
  const { term } = useInstitution();
  const child = useMyChild();
  const { data, loading } = useGet<Summary>(child.studentId ? `/wellbeing/portal/summary?student_id=${child.studentId}` : null);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Health & merits" description="Infirmary visits, merit points and health details."
        actions={(child.children?.length ?? 0) > 1 ? (
          <div className="w-full sm:w-60">
            <Select value={child.studentId} onChange={(v) => v && child.pick(v)} options={(child.children ?? []).map((c) => ({ value: c.id, label: c.name, description: c.section_label ?? undefined }))} />
          </div>
        ) : child.current ? <p className="text-[13px] text-muted">{child.current.name}</p> : undefined} />
      {!child.ready || loading ? (
        <div className="space-y-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" /></div>
      ) : !child.studentId ? (
        <p className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-[14px] text-muted">No {term("student").toLowerCase()} is linked to this sign-in yet.</p>
      ) : !data ? (
        <p className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-[14px] text-muted">Couldn&apos;t load this right now.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={Award} label="Points" value={<PointsBadge value={data.points_total} />} />
            <Tile icon={Award} label="Merits" value={<span className="text-emerald-700">+{data.merits}</span>} />
            <Tile icon={Trophy} label={data.house ? data.house.name : "House"} value={data.house ? data.house.points : "—"} />
          </div>

          <Card title="Merit points" icon={Award}>
            {data.points.length === 0 ? <Empty>No points yet.</Empty> : (
              <ul className="divide-y divide-line">
                {data.points.map((p) => (
                  <li key={p.uuid} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-10 text-right text-[15px]"><PointsBadge value={p.points} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{p.reason}</span>
                      <span className="block text-[12.5px] text-muted">{[p.category, formatDate(p.awarded_on)].filter(Boolean).join(" · ")}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Infirmary visits" icon={Stethoscope}>
            {data.visits.length === 0 ? <Empty>No visits to the infirmary.</Empty> : (
              <ul className="divide-y divide-line">
                {data.visits.map((v) => (
                  <li key={v.uuid} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[14px] text-ink">{v.complaint}</span>
                      {v.sent_home && <Badge tone="warn">Sent home</Badge>}
                    </div>
                    <p className="text-[12.5px] text-muted">{formatDateTime(v.visit_at)}</p>
                    {(v.treatment || v.medicine_given) && <p className="mt-1 text-[13px] text-ink/80">{[v.treatment, v.medicine_given && `Given ${v.medicine_given}`].filter(Boolean).join(". ")}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Health" icon={HeartPulse}>
            <div className="px-5 py-4">
              <KeyValue columns={3} items={[
                { label: "Height", value: data.health.height_cm ? `${data.health.height_cm} cm` : null },
                { label: "Weight", value: data.health.weight_kg ? `${data.health.weight_kg} kg` : null },
                { label: "BMI", value: data.health.bmi },
                { label: "Blood group", value: data.health.blood_group },
                { label: "Allergies", value: data.health.allergies, span: 2 },
              ]} />
              {data.health.measured_on && <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-faint"><Ruler size={13} strokeWidth={STROKE} />Measured {formatDate(data.health.measured_on)}. Tell the office if anything has changed.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 truncate text-[12.5px] text-muted"><Icon size={14} strokeWidth={STROKE} />{label}</p>
      <p className="mt-2 text-[24px] font-extralight tabular text-ink">{value}</p>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Award; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-[15px] text-ink"><Icon size={16} strokeWidth={STROKE} className="text-primary" />{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-center text-[13.5px] text-faint">{children}</p>;
}
