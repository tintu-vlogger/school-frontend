"use client";

/*
 * Event details with RSVP. Staff managers also see the replies.
 *   <EventDetail event={e} open onClose rsvpPath="/comms/events" canManage onEdit onCancel onRemove onChanged />
 */
import { useEffect, useState } from "react";
import { Ban, CalendarDays, Check, MapPin, Pencil, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Button, KeyValue, Modal, NumberInput, Section, Skeleton, formatDisplayDate } from "@/components/ui-kit";
import { Markdown, categoryTone, errText, eventWhen, type CalEvent, type Paged } from "./shared";

type Rsvp = { name: string; response: string; guests: number; kind: string; note: string | null };

export function EventDetail({ event: e, open, onClose, rsvpBase, canManage, onEdit, onCancel, onRemove, onChanged }: {
  event: CalEvent | null; open: boolean; onClose: () => void; rsvpBase: string; canManage?: boolean;
  onEdit?: (e: CalEvent) => void; onCancel?: (e: CalEvent) => void; onRemove?: (e: CalEvent) => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const [local, setLocal] = useState<{ uuid: string; mine: CalEvent["my_rsvp"]; guests: number | null } | null>(null);
  const cur = local && e && local.uuid === e.uuid ? local : { uuid: e?.uuid ?? "", mine: e?.my_rsvp ?? null, guests: e?.my_rsvp?.guests ?? 0 };
  const mine = cur.mine;
  const guests = cur.guests;
  const setGuests = (g: number | null) => setLocal({ ...cur, guests: g });
  const [replies, setReplies] = useState<{ uuid: string; page: Paged<Rsvp> & { counts: Record<string, number> } } | null>(null);
  useEffect(() => {
    if (!e || !canManage || !e.rsvp_required) return;
    api.get<Paged<Rsvp> & { counts: Record<string, number> }>(`/comms/events/${e.uuid}/rsvps?size=200`).then((r) => setReplies({ uuid: e.uuid, page: r })).catch(() => {});
  }, [e, canManage]);

  async function reply(response: string) {
    if (!e) return;
    try {
      await api.post(`${rsvpBase}/${e.uuid}/rsvp`, { response, guests: guests ?? 0 });
      setLocal({ ...cur, mine: { response, guests: guests ?? 0, note: null } });
      toast.success("Reply saved");
      onChanged?.();
    } catch (err) { toast.error(errText(err)); }
  }
  const list = replies && e && replies.uuid === e.uuid ? replies.page : null;
  return (
    <Modal open={open && !!e} onClose={onClose} size="md" title={e?.title}
      description={e && <span className="flex flex-wrap items-center gap-2"><Badge tone={categoryTone(e.category)}>{e.category_label}</Badge>{e.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}</span>}
      headerActions={canManage && e && !e.ptm_day_id && onEdit && <Button size="sm" icon={Pencil} onClick={() => onEdit(e)}>Edit</Button>}
      footerStart={canManage && e && !e.ptm_day_id ? <>
        {onCancel && <Button variant="ghost" icon={Ban} onClick={() => onCancel(e)}>{e.status === "cancelled" ? "Restore" : "Cancel event"}</Button>}
        {onRemove && <Button variant="ghost" icon={Trash2} onClick={() => onRemove(e)}>Remove</Button>}
      </> : undefined}>
      {e && (
        <div className="space-y-5">
          <div className="space-y-1.5 text-[14px] text-ink/85">
            <p className="flex items-center gap-2"><CalendarDays size={15} strokeWidth={1.4} className="text-faint" />{eventWhen(e)}</p>
            {e.location && <p className="flex items-center gap-2"><MapPin size={15} strokeWidth={1.4} className="text-faint" />{e.location}</p>}
            {e.audience_label && <p className="flex items-center gap-2"><Users size={15} strokeWidth={1.4} className="text-faint" />{e.audience_label}</p>}
          </div>
          {e.description && <Markdown text={e.description} />}
          {e.rsvp_required && e.status === "active" && (
            <Section title="Will you attend?" description={e.rsvp_deadline ? `Reply by ${formatDisplayDate(e.rsvp_deadline)}` : undefined} className="border-t border-line">
              <div className="flex flex-wrap items-center gap-2">
                {(["yes", "maybe", "no"] as const).map((r) => (
                  <Button key={r} size="sm" variant={mine?.response === r ? "primary" : "secondary"} icon={mine?.response === r ? Check : undefined} onClick={() => reply(r)}>
                    {r === "yes" ? "Yes" : r === "no" ? "No" : "Maybe"}
                  </Button>
                ))}
                <span className="ml-2 flex items-center gap-2 text-[13px] text-muted">Guests <NumberInput value={guests} onChange={setGuests} min={0} max={10} className="w-24" /></span>
              </div>
            </Section>
          )}
          {canManage && e.rsvp_required && (
            <Section title="Replies" className="border-t border-line">
              {!list ? <Skeleton className="h-16 w-full" /> : (
                <>
                  <KeyValue columns={3} items={[{ label: "Yes", value: `${list.counts.yes ?? 0}${list.counts.guests ? ` (+${list.counts.guests} guests)` : ""}` }, { label: "Maybe", value: String(list.counts.maybe ?? 0) }, { label: "No", value: String(list.counts.no ?? 0) }]} />
                  {list.items.length > 0 && (
                    <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-[13.5px]">
                      {list.items.map((r, i) => <li key={i} className="flex items-center justify-between px-3 py-2"><span>{r.name} <span className="text-faint">· {r.kind}</span></span><Badge tone={r.response === "yes" ? "good" : r.response === "no" ? "bad" : "neutral"}>{r.response}{r.guests ? ` +${r.guests}` : ""}</Badge></li>)}
                    </ul>
                  )}
                </>
              )}
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}
