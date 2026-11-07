"use client";

/*
 * Hostel > Roll-call: pick a block, a date and night or morning, mark each boarder present,
 * absent or on leave (approved leave is filled in), then save. Wardens hear about absentees.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { Paper, EmptyState } from "@/components/shell/page";
import { Badge, Button, DateInput, Select, Skeleton, Tabs, TextInput } from "@/components/ui-kit";
import { errText, STROKE, useApiData } from "@/components/transport/common";
import type { Block } from "./types";

type Mark = "present" | "absent" | "leave";
type Row = { student_id: number; student_name: string; admission_no: string; room: string; bed: string; on_leave: boolean; status: Mark | null; remark: string | null };
type Sheet = { block: string; day: string; session: string; taken: boolean; items: Row[]; counts: Record<string, number> };

const MARKS: { value: Mark; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { value: "absent", label: "Absent", on: "border-rose-300 bg-rose-50 text-rose-700" },
  { value: "leave", label: "Leave", on: "border-sky-300 bg-sky-50 text-sky-700" },
];

export function RollCallTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const blocks = useApiData<{ items: Block[] }>("/hostel/blocks");
  const [blockUuid, setBlockUuid] = useState<string | null>(null);
  const block = (blocks.data?.items ?? []).find((b) => b.uuid === blockUuid) ?? blocks.data?.items[0] ?? null;
  const [day, setDay] = useState(todayISO());
  const [session, setSession] = useState<"night" | "morning">("night");
  const sheet = useApiData<Sheet>(block ? `/hostel/blocks/${block.uuid}/roll-call?day=${day}&session=${session}` : null);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.items.map((r) => [r.student_id, r.status ?? (r.on_leave ? "leave" : "present")])));
    setRemarks(Object.fromEntries(sheet.data.items.filter((r) => r.remark).map((r) => [r.student_id, r.remark!])));
  }, [sheet.data]);
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, leave: 0 };
    Object.values(marks).forEach((m) => { c[m] += 1; });
    return c;
  }, [marks]);

  async function save() {
    if (!block) return;
    setSaving(true);
    try {
      const res = await api.post<{ saved: number; absent: number[] }>(`/hostel/blocks/${block.uuid}/roll-call`, { day, session, marks, remarks });
      toast.success("Roll-call saved", { description: res.absent.length ? `${res.absent.length} absent; the warden is told.` : "Everyone accounted for." });
      sheet.reload();
    } catch (e) { toast.error("Couldn't save the roll-call", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  if (blocks.data && !blocks.data.items.length) return <Paper><EmptyState icon={Moon} title="No hostel blocks yet" hint="Add a block and its rooms first." /></Paper>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-56"><Select value={block?.uuid ?? null} onChange={setBlockUuid} options={(blocks.data?.items ?? []).map((b) => ({ value: b.uuid, label: b.name }))} placeholder="Block" /></div>
        <div className="w-44"><DateInput value={day} onChange={(x) => setDay(x || todayISO())} max={todayISO()} /></div>
        <Tabs variant="pill" value={session} onChange={setSession} items={[{ value: "night", label: "Night", icon: Moon }, { value: "morning", label: "Morning", icon: Sun }]} />
        <div className="ml-auto flex items-center gap-2 text-[13px]">
          <Badge tone="good">{counts.present} present</Badge><Badge tone="bad">{counts.absent} absent</Badge><Badge tone="info">{counts.leave} on leave</Badge>
        </div>
      </div>
      {sheet.loading ? <Skeleton className="h-64 w-full rounded-2xl" /> : !sheet.data?.items.length ? (
        <Paper><EmptyState icon={Moon} title="No boarders in this block" hint="Allocate beds to see them here." /></Paper>
      ) : (
        <Paper>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <p className="text-[13.5px] text-muted">{sheet.data.taken ? "Already taken; changes update it." : "Not taken yet. Everyone starts as present."}</p>
            {canManage && <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => setMarks(Object.fromEntries(sheet.data!.items.map((r) => [r.student_id, r.on_leave ? "leave" : "present"])))}>All present</Button>}
          </div>
          <ul className="divide-y divide-line">
            {sheet.data.items.map((r) => (
              <li key={r.student_id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="text-[14px] text-ink">{r.student_name}{r.on_leave && <span className="ml-2 text-[12px] text-sky-700">on approved leave</span>}</p>
                  <p className="text-[12.5px] text-muted">Room {r.room} · Bed {r.bed}</p>
                </div>
                <div className="flex gap-1.5">
                  {MARKS.map((m) => (
                    <button key={m.value} type="button" disabled={!canManage} onClick={() => setMarks((x) => ({ ...x, [r.student_id]: m.value }))}
                      className={`h-8 rounded-lg border px-3 text-[12.5px] transition-colors ${marks[r.student_id] === m.value ? m.on : "border-line text-muted hover:border-line-strong"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {marks[r.student_id] === "absent" && (
                  <div className="w-full sm:w-56"><TextInput value={remarks[r.student_id] ?? ""} disabled={!canManage} placeholder="Remark"
                    onValueChange={(x) => setRemarks((m) => ({ ...m, [r.student_id]: x }))} /></div>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button variant="primary" onClick={save} loading={saving}>Save roll-call</Button>
            </div>
          )}
        </Paper>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-faint"><Moon size={13} strokeWidth={STROKE} /> Leave covering 10 pm of the night is marked automatically.</p>
    </div>
  );
}
