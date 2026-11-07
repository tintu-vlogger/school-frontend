"use client";

/*
 * Give kudos: pick colleagues, a company value (badge) and say what they did.
 *   <GiveKudosModal open onClose onGiven={(k) => ...} to={optional preselected person} />
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Avatar, Button, Field, Modal, ModalCancel, MultiSelect, Textarea, type SelectOption } from "@/components/ui-kit";
import type { KudosCard, KudosValue, Person } from "./types";

let valuesCache: KudosValue[] | null = null;
export function useKudosValues() {
  const [values, setValues] = useState<KudosValue[] | null>(valuesCache);
  useEffect(() => {
    api.get<KudosValue[]>("/engagement/kudos/values").then((v) => { valuesCache = v; setValues(v); }).catch(() => setValues([]));
  }, []);
  return values;
}

async function loadPeople(q: string): Promise<SelectOption<string>[]> {
  const rows = await api.get<Person[]>(`/engagement/people?limit=10&q=${encodeURIComponent(q)}`);
  return rows.filter((p) => p.uuid).map((p) => ({ value: p.uuid!, label: p.name, description: p.title ?? undefined,
    icon: <Avatar name={p.name} src={p.image} size={22} /> }));
}

export function GiveKudosModal({ open, onClose, onGiven, to }: {
  open: boolean; onClose: () => void; onGiven?: (k: KudosCard) => void; to?: Person | null;
}) {
  const toast = useToast();
  const values = useKudosValues();
  const [people, setPeople] = useState<string[]>([]);
  const [picked, setPicked] = useState<SelectOption<string>[]>([]);
  const [value, setValue] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(""); setValue(null);
    setPeople(to?.uuid ? [to.uuid] : []);
    setPicked(to?.uuid ? [{ value: to.uuid, label: to.name }] : []);
  }, [open, to]);
  useEffect(() => { if (values?.length && !value) setValue(values[0].uuid); }, [values, value]);

  const chosen = values?.find((v) => v.uuid === value) ?? null;
  async function send() {
    setBusy(true);
    try {
      const k = await api.post<KudosCard>("/engagement/kudos", { recipients: people, value, message });
      toast.success(`Kudos sent to ${k.recipients.map((r) => r.name.split(" ")[0]).join(", ")} 🎉`);
      onGiven?.(k);
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const dirty = !!(people.length || message.trim());
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty && !busy} busy={busy}
      title={<span className="flex items-center gap-2"><span className="text-[22px]">👏</span> Give kudos</span>}
      description="Thank someone for great work. It shows on Buzz and on their profile."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={send} disabled={!people.length || message.trim().length < 3}>
        {chosen ? `Send ${chosen.name.toLowerCase()} kudos` : "Send kudos"}</Button></>}>
      <Field label="Who do you want to thank?" required>
        <MultiSelect<string> value={people} onChange={(v, o) => { setPeople(v); setPicked(o); }} loadOptions={loadPeople}
          selectedOptions={picked} placeholder="Search colleagues" max={10} aria-label="People" />
      </Field>
      <p className="mb-2 mt-5 text-[13px] text-muted">For which value?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(values ?? []).map((v) => {
          const on = v.uuid === value;
          return (
            <button key={v.uuid} type="button" onClick={() => setValue(v.uuid)} aria-pressed={on}
              className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors"
              style={{ borderColor: on ? v.accent : undefined, background: on ? v.soft : undefined }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[22px]" style={{ background: v.soft }}>{v.emoji}</span>
              <span className="min-w-0">
                <span className="block text-[14px] text-ink">{v.name} <span className="text-[12px] text-faint">+{v.points}</span></span>
                <span className="block text-[12.5px] leading-snug text-muted">{v.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Field label="What did they do?" required className="mt-5" hint="Be specific. It means more.">
        <Textarea value={message} onValueChange={setMessage} rows={4} maxLength={1000} placeholder="Thank you for…" />
      </Field>
    </Modal>
  );
}
