"use client";

/*
 * Reading an announcement: cover, rich text, acknowledgement and (for managers) who has
 * read and acknowledged it.
 *   <AnnouncementView uuid={u} onClose={...} onEdit={(a) => ...} onChanged={() => ...} />
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, MessageCircle, Pencil, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Avatar, Badge, Button, DataTable, Modal, Skeleton, Tabs, type Column } from "@/components/ui-kit";
import { CoverArt } from "./art";
import { withImages } from "./rich-editor";
import type { AnnouncementCard, Audience, Paged, Person } from "./types";

export type AnnouncementDetail = AnnouncementCard & {
  body_html: string; audience: Audience; audience_label: string; pinned: boolean; show_on_kiosk: boolean;
  allow_comments: boolean; send_email: boolean; publish_at: string | null; can_manage: boolean; post_uuid: string | null;
  stats?: { audience: number; read: number; acknowledged: number };
};
type Receipt = { person: Person; status: "unread" | "read" | "acknowledged"; read_at: string | null; acknowledged_at: string | null };

export const ANNOUNCEMENT_BODY_CLASS =
  "text-[15px] leading-relaxed text-ink [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[20px] [&_h2]:font-light [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[17px] [&_hr]:my-4 [&_hr]:border-line [&_img]:my-4 [&_img]:max-h-[420px] [&_img]:rounded-xl [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_b]:![font-weight:500] [&_strong]:![font-weight:500] [&_ul]:list-disc [&_ul]:pl-6";

function Receipts({ uuid }: { uuid: string }) {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Receipt> | null>(null);
  useEffect(() => {
    setData(null);
    api.get<Paged<Receipt>>(`/engagement/announcements/${uuid}/receipts?page=${page}&size=10${status !== "all" ? `&status=${status}` : ""}`).then(setData).catch(() => {});
  }, [uuid, status, page]);
  const cols: Column<Receipt>[] = [
    { key: "name", header: "Person", cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.person.name} src={r.person.image} size={28} /><span><span className="block text-ink">{r.person.name}</span><span className="block text-[12px] text-faint">{r.person.department}</span></span></span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "acknowledged" ? "good" : r.status === "read" ? "info" : "neutral"} dot>{r.status === "acknowledged" ? "Acknowledged" : r.status === "read" ? "Read" : "Not opened"}</Badge> },
    { key: "when", header: "When", cell: (r) => <span className="text-muted">{r.acknowledged_at ? formatDateTime(r.acknowledged_at) : r.read_at ? formatDateTime(r.read_at) : "—"}</span> },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[["pending", "Not acknowledged"], ["unread", "Not opened"], ["acknowledged", "Acknowledged"], ["all", "Everyone"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setStatus(k); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-[12.5px] ${status === k ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>{l}</button>
        ))}
      </div>
      <DataTable<Receipt> columns={cols} rows={data?.items ?? []} loading={!data} rowKey={(r) => r.person.uuid ?? r.person.name}
        emptyTitle="Nobody here" pagination={data ? { page, size: 10, total: data.total, onPageChange: setPage } : undefined} />
    </div>
  );
}

export function AnnouncementView({ uuid, onClose, onEdit, onChanged }: {
  uuid: string | null; onClose: () => void; onEdit?: (a: AnnouncementDetail) => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const [a, setA] = useState<AnnouncementDetail | null>(null);
  const [tab, setTab] = useState("read");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!uuid) return;
    api.get<AnnouncementDetail>(`/engagement/announcements/${uuid}`).then(setA).catch((e) => { toast.error((e as Error).message); onClose(); });
  }, [uuid, toast, onClose]);
  useEffect(() => { setA(null); setTab("read"); load(); }, [load]);

  async function ack() {
    setBusy(true);
    try { await api.post(`/engagement/announcements/${uuid}/acknowledge`); toast.success("Thanks for confirming"); load(); onChanged?.(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const s = a?.stats;
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" flush title={a ? a.kind_label : "Announcement"}
      headerActions={a?.can_manage && onEdit && a.status !== "archived" ? <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(a)}>Edit</Button> : undefined}
      footer={a ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-faint">{a.author_name}{a.published_at ? ` · ${formatDateTime(a.published_at)}` : ""}</span>
          <span className="flex items-center gap-2">
            {a.post_uuid && a.allow_comments && <Link href={`/dashboard/buzz?post=${a.post_uuid}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] text-muted hover:bg-sunken"><MessageCircle size={15} strokeWidth={1.4} /> Discuss on Buzz</Link>}
            {a.requires_ack && !a.can_manage && (a.acknowledged
              ? <span className="inline-flex items-center gap-1.5 text-[13.5px] text-emerald-700"><CheckCircle2 size={16} strokeWidth={1.5} /> You acknowledged this {a.acknowledged_at ? formatRelative(a.acknowledged_at) : ""}</span>
              : <Button variant="primary" icon={ShieldCheck} loading={busy} onClick={ack}>I have read and understood</Button>)}
          </span>
        </div>
      ) : undefined}>
      {!a ? <div className="space-y-3 p-6"><Skeleton className="h-40" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /></div> : (
        <div>
          <CoverArt cover={a.cover} className="h-44" />
          <div className="px-6 pb-6 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              {a.status !== "published" && <Badge tone={a.status === "scheduled" ? "info" : a.status === "draft" ? "neutral" : "warn"}>{a.status[0].toUpperCase() + a.status.slice(1)}</Badge>}
              {a.requires_ack && <Badge tone="warn">Needs acknowledgement{a.ack_due_on ? ` by ${formatDate(a.ack_due_on, {}, "UTC")}` : ""}</Badge>}
              <span className="inline-flex items-center gap-1 text-[12.5px] text-faint"><Users size={13} strokeWidth={1.5} /> {a.audience_label}</span>
            </div>
            <h2 className="mt-3 text-[26px] font-light leading-tight text-ink">{a.title}</h2>
            {a.can_manage && s && (
              <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
                {[["Audience", s.audience, Users], ["Read", s.read, Eye], ["Acknowledged", a.requires_ack ? s.acknowledged : "—", CheckCircle2]].map(([l, v, I]) => {
                  const Icon = I as typeof Users;
                  const pct = typeof v === "number" && s.audience && l !== "Audience" ? Math.round((v * 100) / s.audience) : null;
                  return (
                    <div key={l as string} className="bg-surface px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon size={13} strokeWidth={1.5} /> {l as string}</p>
                      <p className="mt-1 text-[22px] font-extralight tabular text-ink">{v as number}{pct !== null && <span className="ml-1.5 text-[13px] text-faint">{pct}%</span>}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {a.can_manage && a.status !== "draft" && a.status !== "scheduled" && (
              <Tabs className="mt-5" value={tab} onChange={setTab} items={[{ value: "read", label: "Announcement" }, { value: "who", label: a.requires_ack ? "Acknowledgements" : "Readers" }]} />
            )}
            {tab === "read" ? <div className={`mt-4 ${ANNOUNCEMENT_BODY_CLASS}`} dangerouslySetInnerHTML={{ __html: withImages(a.body_html) }} />
              : <div className="mt-4"><Receipts uuid={a.uuid} /></div>}
          </div>
        </div>
      )}
    </Modal>
  );
}
