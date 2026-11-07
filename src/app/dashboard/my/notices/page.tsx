"use client";

/*
 * Portal notices: notices sent to the parent (for the picked child) or the student, pinned
 * first. Opening one marks it read; notices that ask for it can be acknowledged.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, CheckCheck, Megaphone, Paperclip, Pin } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, Modal, Skeleton, Tabs } from "@/components/ui-kit";
import { AttachmentList, ChildSwitcher, Markdown, categoryTone, errText, useChild, type Notice, type Paged } from "@/components/comms/shared";

export default function MyNoticesPage() {
  const toast = useToast();
  const child = useChild();
  const [show, setShow] = useState("all");
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!child.ready) return;
    let live = true;
    const p = new URLSearchParams({ size: "100" });
    if (child.isParent && child.studentId) p.set("student_id", String(child.studentId));
    if (show === "unread") p.set("unread", "true");
    if (show === "old") p.set("include_expired", "true");
    api.get<Paged<Notice>>(`/comms/portal/notices?${p}`).then((r) => { if (live) setRows(r.items); }).catch((e) => { if (live) { setRows([]); toast.error(errText(e)); } });
    return () => { live = false; };
  }, [child.ready, child.isParent, child.studentId, show, nonce, toast]);

  const view = useCallback(async (uuid: string) => {
    try { setOpen(await api.get<Notice>(`/comms/portal/notices/${uuid}`)); setNonce((n) => n + 1); } catch (e) { toast.error(errText(e)); }
  }, [toast]);
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("view"); if (v) view(v); }, [view]);

  async function ack() {
    if (!open) return;
    setBusy(true);
    try { const r = await api.post<{ acknowledged_at: string }>(`/comms/portal/notices/${open.uuid}/acknowledge`); setOpen({ ...open, acknowledged_at: r.acknowledged_at }); setNonce((n) => n + 1); toast.success("Thanks, the school knows you've read it"); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notices" description="Circulars and announcements from the school." actions={<ChildSwitcher child={child} />} />
      <Tabs variant="pill" className="mb-4" value={show} onChange={setShow} items={[{ value: "all", label: "Current" }, { value: "unread", label: "Unread" }, { value: "old", label: "Including expired" }]} />
      {rows === null ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div> : rows.length === 0 ? (
        <Paper><EmptyState icon={Megaphone} title={show === "unread" ? "You're all caught up" : "No notices yet"} hint="Notices from the school appear here." /></Paper>
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => (
            <li key={n.uuid}>
              <button type="button" onClick={() => view(n.uuid)} className="block w-full text-left">
                <Paper className={`p-4 transition-colors hover:border-line-strong sm:p-5 ${n.category === "emergency" && !n.expired ? "border-rose-200" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.pinned && <Pin size={13} strokeWidth={1.4} className="text-primary" />}
                        <Badge tone={categoryTone(n.category)}>{n.category_label}</Badge>
                        {n.require_ack && (n.acknowledged_at ? <Badge tone="good">Acknowledged</Badge> : <Badge tone="warn">Please acknowledge</Badge>)}
                        <span className="ml-auto text-[12px] text-faint">{n.published_at ? formatRelative(n.published_at) : ""}</span>
                      </div>
                      <p className={`mt-1.5 text-[15.5px] ${n.read_at ? "text-ink/85" : "text-ink"}`}>{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[13.5px] text-muted">{n.excerpt}</p>
                      <p className="mt-1.5 flex items-center gap-2 text-[12px] text-faint">{n.author_name}{n.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} strokeWidth={1.4} />{n.attachments.length}</span>}</p>
                    </div>
                  </div>
                </Paper>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.title}
        description={open && <span className="flex flex-wrap items-center gap-2"><Badge tone={categoryTone(open.category)}>{open.category_label}</Badge>{open.author_name}{open.published_at && <> · {formatDateTime(open.published_at)}</>}</span>}
        footer={open?.require_ack ? (open.acknowledged_at
          ? <Badge tone="good"><CheckCheck size={13} strokeWidth={1.6} /> Acknowledged {formatRelative(open.acknowledged_at)}</Badge>
          : <Button variant="primary" icon={Check} onClick={ack} loading={busy}>I have read this</Button>) : undefined}>
        {open && <div className="space-y-5"><Markdown text={open.body} /><AttachmentList files={open.attachments} /></div>}
      </Modal>
    </div>
  );
}
