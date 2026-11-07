"use client";

/*
 * My notification settings: for each kind of message, whether it also comes by email or
 * to the phone app. In-app notifications always arrive.
 */
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import { Button, Skeleton } from "@/components/ui-kit";
import { ChannelGrid } from "@/components/notifications/channel-grid";

type Pref = {
  category: string; label: string; description: string; email: boolean; push: boolean;
  default_email: boolean; default_push: boolean; customised: boolean;
};
type Prefs = { items: Pref[]; email_enabled: boolean; push_enabled: boolean };

export default function MyNotificationsPage() {
  const toast = useToast();
  const [p, setP] = useState<Prefs | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Prefs>("/notifications/preferences").then((r) => { setP(r); setInitial(JSON.stringify(r.items)); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your settings"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = !!p && JSON.stringify(p.items) !== initial;

  async function save() {
    if (!p) return;
    setSaving(true);
    try {
      const r = await api.put<{ items: Pref[] }>("/notifications/preferences",
        { items: p.items.map((i) => ({ category: i.category, email: i.email, push: i.push })) });
      setP({ ...p, items: r.items });
      setInitial(JSON.stringify(r.items));
      toast.success("Notification settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Home" title="My notifications"
        description="Choose how you hear about things. Notifications always appear under the bell; you can also get them by email or on your phone."
        actions={<>
          <Button variant="ghost" icon={RotateCcw} disabled={!p}
            onClick={() => p && setP({ ...p, items: p.items.map((i) => ({ ...i, email: i.default_email, push: i.default_push })) })}>
            Company defaults
          </Button>
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save</Button>
        </>} />
      {!p ? <Paper className="p-5"><Skeleton className="h-64" /></Paper> : (
        <>
          {!p.email_enabled && <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-muted">Your company has switched email notifications off.</p>}
          <ChannelGrid emailOff={!p.email_enabled} pushOff={!p.push_enabled}
            rows={p.items.map((i) => ({ key: i.category, label: i.label, description: i.description, email: i.email, push: i.push }))}
            onChange={(key, patch) => setP({ ...p, items: p.items.map((i) => (i.category === key ? { ...i, ...patch } : i)) })} />
          <p className="text-[12.5px] text-faint">
            Approval emails let you approve or reject with one click. Managers and HR also get a short summary each morning
            while approvals are waiting; it follows the Approvals email switch.
          </p>
        </>
      )}
    </div>
  );
}
