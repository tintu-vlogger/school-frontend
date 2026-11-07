"use client";

/*
 * Portal events: the school calendar as it applies to the family (or the student), with RSVP
 * and a private calendar link to subscribe from a phone.
 */
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui-kit";
import { CalendarToolbar, CalendarView, useCalendar } from "@/components/comms/calendar";
import { EventDetail } from "@/components/comms/event-detail";
import { ChildSwitcher, errText, useChild, type CalEvent } from "@/components/comms/shared";

export default function MyEventsPage() {
  const toast = useToast();
  const child = useChild();
  const cal = useCalendar("agenda");
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; items: CalEvent[] } | null>(null);
  const [viewing, setViewing] = useState<CalEvent | null>(null);
  const key = `${cal.range.start}|${cal.range.end}|${child.studentId}|${nonce}`;
  useEffect(() => {
    if (!child.ready) return;
    let live = true;
    const p = new URLSearchParams({ start: cal.range.start, end: cal.range.end });
    if (child.isParent && child.studentId) p.set("student_id", String(child.studentId));
    api.get<{ items: CalEvent[] }>(`/comms/portal/events?${p}`).then((r) => { if (live) setData({ key, items: r.items }); })
      .catch((e) => { if (live) { setData({ key, items: [] }); toast.error(errText(e)); } });
    return () => { live = false; };
  }, [key, cal.range, child.ready, child.isParent, child.studentId, toast]);

  async function subscribe() {
    try {
      const r = await api.get<{ path: string }>("/comms/portal/events/feed-link");
      await navigator.clipboard.writeText(new URL(r.path, API_BASE).toString());
      toast.success("Calendar link copied", { description: "Add it to Google Calendar or your phone's calendar to see school events there." });
    } catch (e) { toast.error(errText(e)); }
  }
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Events" description="Holidays, exams, meetings and events at school." actions={<><ChildSwitcher child={child} /><Button icon={Link2} onClick={subscribe}>Add to my calendar</Button></>} />
      <CalendarToolbar cal={cal} />
      <CalendarView cal={cal} events={data?.items ?? []} loading={data?.key !== key} onEvent={setViewing} />
      <EventDetail event={viewing} open={!!viewing} onClose={() => setViewing(null)} rsvpBase="/comms/portal/events" onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
