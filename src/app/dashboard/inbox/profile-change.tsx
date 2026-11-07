"use client";

/*
 * An employee asks to change personal details. Nothing changes until HR (or whoever the
 * approval flow names) approves; then the new details are applied.
 */
import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { allTimeZones } from "@/lib/datetime";
import { Button, Field, FormGrid, Modal, ModalCancel, Select, TextInput, Textarea } from "@/components/ui-kit";

type Me = { first_name: string; last_name: string; phone: string | null; greeting: string | null; timezone: string | null };
const FIELDS = ["greeting", "first_name", "last_name", "phone", "timezone"] as const;
type Key = (typeof FIELDS)[number];

export function ProfileChangeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [v, setV] = useState<Record<Key, string>>({ greeting: "", first_name: "", last_name: "", phone: "", timezone: "" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => [{ value: "", label: "Same as the company" }, ...allTimeZones().map((z) => ({ value: z, label: z.replace(/_/g, " ") }))], []);

  useEffect(() => {
    api.get<Me>("/me/profile").then((m) => {
      setMe(m);
      setV({ greeting: m.greeting ?? "", first_name: m.first_name, last_name: m.last_name, phone: m.phone ?? "", timezone: m.timezone ?? "" });
    }).catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load your details"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changes = me ? Object.fromEntries(FIELDS.filter((k) => (me[k] ?? "") !== v[k]).map((k) => [k, v[k] || null])) : {};
  const changed = Object.keys(changes).length > 0;

  async function send() {
    setSaving(true);
    try {
      const r = await api.post<{ reference_no: string; status: string }>("/me/profile-change", { changes, reason: reason || null });
      toast.success(r.status === "approved" ? "Your details were updated" : "Request sent for approval", { description: r.reference_no });
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the request");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: Key) => (val: string) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={changed || !!reason}
      title="Request a change of details" description="HR checks the change before it is applied to your record."
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} disabled={!changed} onClick={send}>Send request</Button></>}>
      {!me ? <div className="h-48 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-5">
          <FormGrid>
            <Field label="Title"><Select value={v.greeting} onChange={(x) => set("greeting")(String(x ?? ""))} clearable
              options={["Mr", "Ms", "Mrs", "Dr"].map((g) => ({ value: g, label: g }))} placeholder="None" /></Field>
            <div />
            <Field label="First name"><TextInput value={v.first_name} onValueChange={set("first_name")} data-autofocus /></Field>
            <Field label="Last name"><TextInput value={v.last_name} onValueChange={set("last_name")} /></Field>
            <Field label="Phone"><TextInput value={v.phone} onValueChange={set("phone")} inputMode="tel" /></Field>
            <Field label="Timezone"><Select value={v.timezone} onChange={(x) => set("timezone")(String(x ?? ""))} options={zones} /></Field>
          </FormGrid>
          <Field label="Reason" hint="e.g. Name changed after marriage">
            <Textarea value={reason} onValueChange={setReason} rows={2} autoGrow />
          </Field>
        </div>
      )}
    </Modal>
  );
}
