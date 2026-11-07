"use client";

/* My kiosk PIN: set or change the PIN used with the employee ID at a clock-in kiosk. */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Badge, Button, Field, KeyValue, Modal, ModalCancel, Skeleton, TextInput } from "@/components/ui-kit";
import { errorText } from "./shared";

type PinStatus = { has_pin: boolean; set_at: string | null; locked: boolean; employee_code: string | null };

export function KioskPinModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [st, setSt] = useState<PinStatus | null>(null);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<PinStatus>("/attendance/me/kiosk-pin").then(setSt).catch((e) => { toast.error(errorText(e)); onClose(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const valid = /^\d{4,6}$/.test(pin);
  const mismatch = again.length >= pin.length && again !== pin && again.length > 0;

  async function save() {
    setSaving(true);
    try {
      const r = await api.put<PinStatus>("/attendance/me/kiosk-pin", { pin });
      setSt((s) => ({ ...(s as PinStatus), ...r }));
      toast.success("PIN saved", { description: "Use it with your employee ID at the office kiosk." });
      onClose();
    } catch (e) { toast.error(errorText(e, "Couldn't save")); } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="sm" busy={saving} dirty={!!pin} title="Kiosk PIN"
      description="Punch at the shared office tablet with your employee ID and this PIN."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!valid || pin !== again || !st?.employee_code} onClick={save}>{st?.has_pin ? "Change PIN" : "Set PIN"}</Button></>}>
      {!st ? <Skeleton className="h-32 w-full" /> : (
        <div className="space-y-4">
          <KeyValue columns={2} items={[
            { label: "Employee ID", value: st.employee_code || <span className="text-faint">Not set</span> },
            { label: "PIN", value: st.locked ? <Badge tone="bad">Locked for now</Badge> : st.has_pin ? <Badge tone="good" dot>Set {st.set_at ? formatDateTime(st.set_at) : ""}</Badge> : <Badge tone="neutral">Not set</Badge> },
          ]} />
          {!st.employee_code ? (
            <p className="text-[13px] text-muted">You have no employee ID yet, so you can't use a kiosk. Ask HR to add one.</p>
          ) : (
            <>
              <Field label={st.has_pin ? "New PIN" : "PIN"} hint="4 to 6 digits. Not easy ones like 1111 or 1234.">
                <TextInput type="password" inputMode="numeric" autoComplete="new-password" value={pin} onValueChange={(v) => setPin(digits(v))} autoFocusInModal />
              </Field>
              <Field label="Type it again" error={mismatch ? "The PINs don't match." : undefined}>
                <TextInput type="password" inputMode="numeric" autoComplete="new-password" value={again} onValueChange={(v) => setAgain(digits(v))} invalid={mismatch} />
              </Field>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
