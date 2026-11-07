"use client";

/*
 * Settings > Integrations: outside services the company connects (AI model, email, SMS,
 * WhatsApp, accounting, sign-in, job boards) and MCP access for outside assistants.
 * People who aren't admins only see the MCP part (GET /integrations/ answers 403 for them).
 */
import { useEffect, useState } from "react";
import {
  BookOpenCheck, Briefcase, Building2, KeyRound, Mail, MessageCircle, MessageSquareText, Plug, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative, formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton, type IconType } from "@/components/ui-kit";
import { SetupModal } from "@/components/insights/integrations/setup-modal";
import { McpSection } from "@/components/insights/integrations/mcp-section";
import { GROUP_ORDER, STATUS, type Integration, type IntegrationsResponse } from "@/components/insights/integrations/types";

const ICONS: Record<string, IconType> = {
  ai_model: Sparkles, smtp: Mail, sms: MessageSquareText, whatsapp: MessageCircle, accounting: BookOpenCheck,
  google: KeyRound, microsoft: Building2, job_boards: Briefcase,
};
const GROUP_HINT: Record<string, string> = {
  AI: "Answers to questions about your people data.",
  Messages: "Emails and messages sent from the app.",
  Finance: "Payroll journals for your accounts.",
  "Sign-in": "Single sign-on with your work accounts.",
  Hiring: "Where openings are posted.",
};

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [denied, setDenied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<{ it: Integration; n: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<IntegrationsResponse>("/integrations/")
      .then((r) => { if (live) setData(r); })
      .catch(() => { if (live) setDenied(true); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const replace = (it: Integration) =>
    setData((d) => (d ? { ...d, integrations: d.integrations.map((x) => (x.kind === it.kind ? it : x)) } : d));

  const groups = (() => {
    const list = data?.integrations ?? [];
    const names = Array.from(new Set(list.map((i) => i.group)));
    names.sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
    return names.map((g) => ({ name: g, items: list.filter((i) => i.group === g) }));
  })();

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description={denied
          ? "Connect the assistants you use to your HR data with a personal token."
          : "Connect the services Campusly works with. Keys and passwords are stored encrypted."}
      />

      <div className="space-y-10">
        {!loaded && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface p-5"><Skeleton className="h-4 w-36" /><Skeleton className="mt-3 h-3 w-full" /><Skeleton className="mt-5 h-8 w-24" /></div>
            ))}
          </div>
        )}

        {data && groups.map((g) => (
          <section key={g.name}>
            <div className="mb-3">
              <h2 className="text-[17px] font-light text-ink">{g.name}</h2>
              {GROUP_HINT[g.name] && <p className="mt-0.5 text-[13px] text-muted">{GROUP_HINT[g.name]}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((it) => (
                <IntegrationCard key={it.kind} it={it} onOpen={() => { setEditing((e) => ({ it, n: (e?.n ?? 0) + 1 })); setEditOpen(true); }} />
              ))}
            </div>
          </section>
        ))}

        {loaded && <McpSection isAdmin={!!data} mcpPath={data?.mcp.path} ssePath={data?.mcp.sse_path} />}
      </div>

      {editing && (
        <SetupModal key={editing.n} integration={editing.it} open={editOpen} onClose={() => setEditOpen(false)} onSaved={replace} />
      )}
    </div>
  );
}

function IntegrationCard({ it, onOpen }: { it: Integration; onOpen: () => void }) {
  const Icon = ICONS[it.kind] ?? Plug;
  const st = STATUS[it.status] ?? STATUS.not_set_up;
  const setUp = it.status !== "not_set_up";
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${it.status === "connected" ? "bg-primary-soft/60 text-primary" : "bg-sunken text-muted"}`}>
          <Icon size={18} strokeWidth={1.4} />
        </span>
        <Badge tone={st.tone} dot>{st.label}</Badge>
      </div>
      <p className="mt-4 text-[15px] text-ink">{it.label}</p>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{it.description}</p>
      {it.status === "error" && it.last_message && (
        <p className="mt-3 line-clamp-2 text-[12.5px] text-rose-700">{it.last_message}</p>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[12px] text-faint" title={it.last_tested_at ? formatDateTime(it.last_tested_at) : undefined}>
          {it.last_tested_at ? `Tested ${formatRelative(it.last_tested_at)}` : setUp ? "Not tested yet" : ""}
        </span>
        <Button size="sm" variant={setUp ? "secondary" : "primary"} onClick={onOpen}>{setUp ? "Edit" : "Set up"}</Button>
      </div>
    </div>
  );
}
