"use client";

/*
 * Nine-box (performance admins see everyone; managers see their own teams).
 *   Rows are potential (high at the top), columns are performance on the cycle's
 *   rating scale (low on the left). Box numbers follow the server: (potential-1)*3 + level.
 *   A person opens a small dialog to change their potential; people without a potential
 *   or a rating are listed below the grid.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Grid3x3 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Avatar, Button, Modal, ModalCancel, RadioCards, Select, Skeleton } from "@/components/ui-kit";
import { PerformanceTabs, PersonInline, RatingPill, useData, useDepartments, usePerfMe } from "@/components/performance/shared";
import type { NineBox, ParticipantRow } from "@/components/performance/types";
import { CycleSelect, CycleStatus, pickDefaultCycle, useCycles } from "@/components/performance/reviews/misc";

const POTENTIAL_LABEL: Record<number, string> = { 3: "High potential", 2: "Medium potential", 1: "Low potential" };
const PERF_LABEL = ["Low performance", "Moderate performance", "High performance"];
// background tint per box, from "act now" (1) to "star" (9)
const BOX_TONE: Record<number, string> = {
  1: "bg-rose-50/70 border-rose-200", 2: "bg-amber-50/60 border-amber-200", 3: "bg-sky-50/60 border-sky-200",
  4: "bg-amber-50/60 border-amber-200", 5: "bg-sky-50/60 border-sky-200", 6: "bg-emerald-50/60 border-emerald-200",
  7: "bg-sky-50/60 border-sky-200", 8: "bg-emerald-50/60 border-emerald-200", 9: "bg-primary-soft/60 border-primary/25",
};

export default function NineBoxPage() {
  return <Suspense fallback={null}><NineBoxView /></Suspense>;
}

function NineBoxView() {
  const router = useRouter();
  const params = useSearchParams();
  const { me } = usePerfMe();
  const { cycles } = useCycles();
  const departments = useDepartments();
  const [department, setDepartment] = useState<number | null>(null);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);

  const cycleId = params.get("cycle") ?? pickDefaultCycle(cycles, ["calibration", "published", "active", "closed"]);
  const path = cycleId ? `/performance/cycles/${cycleId}/nine-box${department ? `?department_id=${department}` : ""}` : null;
  const { data, refresh } = useData<NineBox>(path, "Couldn't load the nine-box");
  const scale = data?.cycle.rating_scale?.points ?? [];
  const byBox = new Map((data?.boxes ?? []).map((b) => [b.box, b]));
  const placed = (data?.boxes ?? []).reduce((n, b) => n + b.people.length, 0);

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Nine-box" description="Performance against potential, to plan succession and development." />
      <PerformanceTabs me={me} />

      {cycles && !cycles.some((c) => c.status !== "draft") ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={Grid3x3} title="No review cycles yet" hint="People are placed once they have a rating and a potential." />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {cycles ? <CycleSelect cycles={cycles} value={cycleId} onChange={(u) => router.replace(`/dashboard/performance/nine-box?cycle=${u}`)} /> : <Skeleton className="h-9 w-[300px]" />}
            <Select<number> className="w-[220px]" value={department} onChange={setDepartment} options={departments} placeholder="All departments" clearable />
            {data && <CycleStatus status={data.cycle.status} />}
            {data && <span className="ml-auto text-[13px] text-muted tabular">{placed} placed · {data.unplaced.length} not placed</span>}
          </div>

          {!data ? <Skeleton className="h-[560px]" /> : (
            <>
              <div className="overflow-x-auto">
                <div className="grid min-w-[760px] grid-cols-[28px_1fr_1fr_1fr] gap-3">
                  {[3, 2, 1].map((pot) => (
                    <Row key={pot} pot={pot}>
                      {[1, 2, 3].map((lvl) => {
                        const n = (pot - 1) * 3 + lvl;
                        const b = byBox.get(n);
                        return <Box key={n} n={n} label={b?.label ?? null} people={b?.people ?? []} onPick={setEditing} />;
                      })}
                    </Row>
                  ))}
                  <span />
                  {PERF_LABEL.map((l) => <p key={l} className="text-center text-[12.5px] text-muted">{l}</p>)}
                </div>
              </div>

              {data.unplaced.length > 0 && (
                <section className="rounded-2xl border border-line bg-surface p-5">
                  <h2 className="text-[16px] font-light text-ink">Not placed yet</h2>
                  <p className="mt-0.5 text-[13px] text-muted">They need a rating and a potential. Pick someone to set their potential.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {data.unplaced.map((p) => (
                      <button key={p.uuid} type="button" onClick={() => setEditing(p)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left hover:border-line-strong">
                        <PersonInline person={p.employee} sub={p.potential ? POTENTIAL_LABEL[p.potential] : "No potential set"} />
                        <RatingPill value={p.current_rating} scale={scale} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
      <PotentialModal row={editing} onClose={() => setEditing(null)} onDone={refresh} />
    </div>
  );
}

function Row({ pot, children }: { pot: number; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap text-[12.5px] text-muted">{POTENTIAL_LABEL[pot]}</span>
      </div>
      {children}
    </>
  );
}

function Box({ n, label, people, onPick }: {
  n: number; label: string | null; people: ParticipantRow[]; onPick: (p: ParticipantRow) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? people : people.slice(0, 6);
  return (
    <div className={`flex min-h-[170px] flex-col rounded-2xl border p-4 ${BOX_TONE[n]}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[14px] text-ink">{label ?? `Box ${n}`}</p>
        <span className="text-[22px] font-extralight leading-none text-ink tabular">{people.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {shown.map((p) => (
          <button key={p.uuid} type="button" onClick={() => onPick(p)} title={`${p.employee?.name} · ${p.current_label ?? ""}`}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface/90 py-0.5 pl-0.5 pr-2.5 text-[12.5px] text-ink/85 hover:border-line-strong">
            <Avatar name={p.employee?.name ?? ""} src={p.employee?.photo} size={20} />
            <span className="truncate">{p.employee?.name}</span>
          </button>
        ))}
        {people.length > 6 && (
          <button type="button" onClick={() => setAll((x) => !x)} className="rounded-full px-2 py-0.5 text-[12.5px] text-primary hover:underline">
            {all ? "Show fewer" : `+${people.length - 6} more`}
          </button>
        )}
      </div>
      {!people.length && <p className="mt-auto text-[12px] text-faint">Nobody here</p>}
    </div>
  );
}

function PotentialModal({ row, onClose, onDone }: { row: ParticipantRow | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if (row && last !== row.uuid) { setLast(row.uuid); setValue(row.potential ? String(row.potential) : null); }

  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      await api.put(`/performance/participants/${row.uuid}/potential`, { potential: value ? Number(value) : null });
      toast.success("Potential saved");
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={!!row} onClose={() => { setLast(null); onClose(); }} size="md" busy={busy} title="Potential"
      description={row ? `${row.employee?.name}${row.current_label ? ` · rated ${row.current_label}` : ""}` : undefined}
      footerStart={row?.potential ? <Button variant="ghost" disabled={busy} onClick={() => setValue(null)}>Clear</Button> : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <RadioCards<string> columns={1} value={value} onChange={setValue} options={[
        { value: "3", label: "High potential", description: "Ready for a bigger role within a year or two." },
        { value: "2", label: "Medium potential", description: "Can grow within the current role or the next level." },
        { value: "1", label: "Low potential", description: "Best suited to the current role for now." },
      ]} />
    </Modal>
  );
}
