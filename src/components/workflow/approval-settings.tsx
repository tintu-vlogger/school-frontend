"use client";

/*
 * Company-wide approval settings: who decides when no approver is found or an approver
 * leaves, reminders, one-click email links, and cancelling approved requests.
 *   <ApprovalSettingsModal onClose={...} />
 */
import { useEffect, useState } from "react";
import { ArrowRightLeft, Mail, ShieldQuestion, Undo2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, Skeleton, Toggle, type SelectOption,
} from "@/components/ui-kit";

type Opt = { value: string; label: string };
type Settings = {
  no_approver: { action: string; value: string | number | null };
  on_exit: { action: string };
  fallback: { approver_type: string; approver_value: string | number | null };
  nudge_cooldown_hours: number;
  email_actions: boolean;
  email_link_hours: number;
  revoke: Record<string, string>;
  options: { no_approver: Opt[]; on_exit: Opt[]; revoke_modes: Opt[]; revocable_types: { key: string; label: string }[] };
};

const ROLES: SelectOption[] = [
  { value: "hr", label: "HR" }, { value: "admin", label: "HR admin" }, { value: "manager", label: "Manager" },
];
const FALLBACK: SelectOption[] = [
  { value: "owner", label: "The company owner" }, { value: "role", label: "Everyone with a role" },
  { value: "employee", label: "A named person" },
];

async function loadEmployees(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

function PersonPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [opt, setOpt] = useState<SelectOption<number> | null>(null);
  useEffect(() => {
    if (value && !opt) {
      api.get<{ value: number; label: string }[]>(`/employees/lookup?ids=${value}`)
        .then((r) => r[0] && setOpt({ value: r[0].value, label: r[0].label })).catch(() => {});
    }
  }, [value, opt]);
  return <Select<number> value={value} selectedOption={opt} loadOptions={loadEmployees} placeholder="Search by name"
    onChange={(v, o) => { setOpt(o); onChange(v); }} />;
}

function Block({ icon: Icon, title, hint, children }: { icon: typeof Users; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon size={16} strokeWidth={1.4} />
        </span>
        <div>
          <p className="text-[14.5px] text-ink">{title}</p>
          <p className="text-[12.5px] text-muted">{hint}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function ApprovalSettingsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [handing, setHanding] = useState(false);

  useEffect(() => {
    api.get<Settings>("/workflow/settings").then((r) => { setS(r); setInitial(JSON.stringify(r)); })
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load the settings"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = !!s && JSON.stringify(s) !== initial;
  const set = (patch: Partial<Settings>) => setS((x) => (x ? { ...x, ...patch } : x));

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const out = await api.put<Settings>("/workflow/settings", {
        no_approver: s.no_approver, on_exit: s.on_exit, fallback: s.fallback, nudge_cooldown_hours: s.nudge_cooldown_hours,
        email_actions: s.email_actions, email_link_hours: s.email_link_hours, revoke: s.revoke,
      });
      setInitial(JSON.stringify({ ...s, ...out }));
      toast.success("Approval settings saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function handOver() {
    setHanding(true);
    try {
      const r = await api.post<{ moved: number }>("/workflow/approvers/hand-over");
      toast.success(r.moved ? `${r.moved} approval${r.moved === 1 ? "" : "s"} handed over` : "Nothing to hand over");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't hand over"); }
    finally { setHanding(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg" dirty={dirty} busy={saving} title="Approval settings"
      description="Rules that apply to every approval flow."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!s} onClick={save}>Save settings</Button></>}>
      {!s ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : (
        <div className="space-y-5">
          <Block icon={ShieldQuestion} title="When no approver is found" hint="For example, someone has no manager on record.">
            <FormGrid>
              <Field label="Who decides">
                <Select value={s.no_approver.action} options={s.options.no_approver}
                  onChange={(v) => set({ no_approver: { action: String(v ?? "owner"), value: v === "role" ? "hr" : null } })} />
              </Field>
              {s.no_approver.action === "role" && (
                <Field label="Role"><Select value={String(s.no_approver.value ?? "hr")} options={ROLES}
                  onChange={(v) => set({ no_approver: { ...s.no_approver, value: v } })} /></Field>
              )}
              {s.no_approver.action === "employee" && (
                <Field label="Person"><PersonPicker value={s.no_approver.value ? Number(s.no_approver.value) : null}
                  onChange={(v) => set({ no_approver: { ...s.no_approver, value: v } })} /></Field>
              )}
            </FormGrid>
          </Block>

          <Block icon={Users} title="When an approver leaves" hint="Their pending approvals move at once, the day they leave.">
            <Field label="Approvals go to">
              <Select value={s.on_exit.action} options={s.options.on_exit} onChange={(v) => set({ on_exit: { action: String(v ?? "manager") } })} />
            </Field>
            <FormGrid>
              <Field label="Fallback" hint="Also used when the first choice finds nobody.">
                <Select value={s.fallback.approver_type} options={FALLBACK}
                  onChange={(v) => set({ fallback: { approver_type: String(v ?? "owner"), approver_value: v === "role" ? "hr" : null } })} />
              </Field>
              {s.fallback.approver_type === "role" && (
                <Field label="Role"><Select value={String(s.fallback.approver_value ?? "hr")} options={ROLES}
                  onChange={(v) => set({ fallback: { ...s.fallback, approver_value: v } })} /></Field>
              )}
              {s.fallback.approver_type === "employee" && (
                <Field label="Person"><PersonPicker value={s.fallback.approver_value ? Number(s.fallback.approver_value) : null}
                  onChange={(v) => set({ fallback: { ...s.fallback, approver_value: v } })} /></Field>
              )}
            </FormGrid>
            <Button variant="ghost" size="sm" icon={ArrowRightLeft} loading={handing} onClick={handOver}>
              Hand over approvals of people who have left now
            </Button>
          </Block>

          <Block icon={Mail} title="Reminders and email" hint="How people are reminded, and deciding straight from the email.">
            <FormGrid>
              <Field label="Requesters can send a reminder every (hours)">
                <NumberInput value={s.nudge_cooldown_hours} min={1} onChange={(v) => set({ nudge_cooldown_hours: Math.max(1, Math.round(v ?? 24)) })} />
              </Field>
              <Field label="Email links work for (hours)">
                <NumberInput value={s.email_link_hours} min={1} disabled={!s.email_actions}
                  onChange={(v) => set({ email_link_hours: Math.max(1, Math.round(v ?? 72)) })} />
              </Field>
            </FormGrid>
            <Toggle checked={s.email_actions} onChange={(v) => set({ email_actions: v })} label="Approve or reject from the email"
              description="Approval emails carry one-time links. Each link works once, expires, and is recorded in the audit log." />
          </Block>

          <Block icon={Undo2} title="Cancelling approved requests" hint="Whether people can cancel a request after it was approved.">
            {s.options.revocable_types.length === 0 ? (
              <p className="text-[13px] text-faint">No kind of request supports this yet.</p>
            ) : s.options.revocable_types.map((t) => (
              <FormGrid key={t.key}>
                <div className="flex items-center text-[14px] text-ink">{t.label}</div>
                <Select value={s.revoke[t.key] ?? "off"} options={s.options.revoke_modes}
                  onChange={(v) => set({ revoke: { ...s.revoke, [t.key]: String(v ?? "off") } })} />
              </FormGrid>
            ))}
            <p className="text-[12px] text-faint">Leave has its own cancellation request on the leave pages.</p>
          </Block>
        </div>
      )}
    </Modal>
  );
}
