"use client";

/*
 * Inbox: thread list + conversation pane, shared by the staff and portal message pages.
 *   <Inbox side="staff" base="/comms/messages" box="mine" onNew={...} />
 *   <Inbox side="portal" base="/comms/portal/messages" studentId={id} onNew={...} />
 * On a phone the list and the conversation take turns filling the screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Lock, MessagesSquare, RotateCcw, Search, SendHorizontal, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatRelative, formatTime } from "@/lib/datetime";
import { EmptyState } from "@/components/shell/page";
import { Avatar, Badge, Button, Skeleton, Textarea } from "@/components/ui-kit";
import { AttachmentList, AttachmentPicker, errText, type FileRef, type Paged, type Thread, type ThreadFull } from "./shared";

export function Inbox({ side, base, box, studentId, status, reloadKey, initialThread, onNewClick, emptyHint }: {
  side: "staff" | "portal"; base: string; box?: string; studentId?: number | null; status?: string; reloadKey?: number;
  initialThread?: string | null; onNewClick?: () => void; emptyHint?: string;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Thread[] | null>(null);
  const [active, setActive] = useState<string | null>(initialThread ?? null);
  const [tick, setTick] = useState(0);
  const refreshList = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ size: "100" });
    if (box) p.set("box", box);
    if (status) p.set("status", status);
    if (side === "staff" && q) p.set("q", q);
    if (side === "portal" && studentId) p.set("student_id", String(studentId));
    api.get<Paged<Thread>>(`${base}/threads?${p}`).then((r) => { if (live) setList(r.items); })
      .catch((e) => { if (live) { setList([]); toast.error("Couldn't load messages", { description: errText(e) }); } });
    return () => { live = false; };
  }, [base, box, status, q, studentId, side, tick, reloadKey, toast]);

  // light polling so new replies show up without a reload
  useEffect(() => {
    const t = setInterval(refreshList, 30000);
    return () => clearInterval(t);
  }, [refreshList]);

  const shown = side === "portal" && q
    ? (list ?? []).filter((t) => [t.subject, t.staff_name].some((x) => x.toLowerCase().includes(q.toLowerCase())))
    : list ?? [];

  return (
    <div className="grid h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[340px_1fr]">
      <aside className={`flex min-h-0 flex-col border-line md:border-r ${active ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-line p-3">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-sunken/40 px-3 focus-within:border-primary/40">
            <Search size={15} strokeWidth={1.4} className="text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list === null ? (
            <div className="space-y-4 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /></div></div>)}</div>
          ) : shown.length === 0 ? (
            <EmptyState icon={MessagesSquare} title={q ? "Nothing matches" : "No conversations yet"} hint={q ? "Try another search." : emptyHint}
              action={!q && onNewClick ? <Button variant="primary" size="sm" onClick={onNewClick}>New message</Button> : undefined} />
          ) : (
            <ul>
              {shown.map((t) => {
                const who = side === "staff" ? t.party_name : t.staff_name;
                return (
                  <li key={t.uuid}>
                    <button type="button" onClick={() => setActive(t.uuid)}
                      className={`flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors ${active === t.uuid ? "bg-primary-soft/40" : "hover:bg-sunken/50"}`}>
                      <Avatar name={who || "?"} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[14px] ${t.unread ? "text-ink [font-weight:500]" : "text-ink/85"}`}>{who}</span>
                          <span className="shrink-0 text-[11.5px] text-faint">{t.last_message_at ? formatRelative(t.last_message_at) : ""}</span>
                        </span>
                        <span className="block truncate text-[13px] text-ink/75">{t.subject}</span>
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{t.last_message_preview}</span>
                          {t.unread > 0 && <span className="tabular flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] text-white">{t.unread}</span>}
                          {t.status === "closed" && <Lock size={12} strokeWidth={1.5} className="text-faint" />}
                        </span>
                        {side === "staff" && t.about_student_name && t.party_kind === "parent" && <span className="block truncate text-[11.5px] text-faint">About {t.about_student_name}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      <section className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
        {active ? <Conversation key={active} side={side} base={base} uuid={active} onBack={() => setActive(null)} onChange={refreshList} />
          : <div className="flex flex-1 items-center justify-center"><EmptyState icon={MessagesSquare} title="Pick a conversation" hint="Choose one on the left, or start a new message." /></div>}
      </section>
    </div>
  );
}

function Conversation({ side, base, uuid, onBack, onChange }: { side: "staff" | "portal"; base: string; uuid: string; onBack: () => void; onChange: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<ThreadFull | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.get<ThreadFull>(`${base}/threads/${uuid}`).then((r) => { setT(r); onChange(); }).catch((e) => toast.error(errText(e)));
  }, [base, uuid, onChange, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [t?.messages.length]);

  async function send() {
    if (!body.trim() && !files.length) return;
    setSending(true);
    try {
      const r = await api.post<ThreadFull>(`${base}/threads/${uuid}/messages`, { body, attachments: files.map((f) => f.uuid) });
      setT(r); setBody(""); setFiles([]); onChange();
    } catch (e) { toast.error("Couldn't send", { description: errText(e) }); } finally { setSending(false); }
  }
  async function setStatus(status: "open" | "closed") {
    try { const r = await api.post<ThreadFull>(`${base}/threads/${uuid}/status`, { status }); setT(r); onChange(); } catch (e) { toast.error(errText(e)); }
  }

  if (!t) return <div className="space-y-3 p-5"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-16 w-2/3" /></div>;
  const other = side === "staff" ? t.party_name : t.staff_name;
  let lastDay = "";
  const oh = t.office_hours;
  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-sunken md:hidden" aria-label="Back"><ArrowLeft size={18} strokeWidth={1.4} /></button>
        <Avatar name={other || "?"} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-ink">{t.subject}</p>
          <p className="truncate text-[12.5px] text-muted">
            {other}{side === "staff" && t.party_kind === "student" ? " (student)" : ""}{t.about_student_name && t.party_kind === "parent" ? ` · about ${t.about_student_name}` : ""}
            {t.is_broadcast ? " · from a class message" : ""}
          </p>
        </div>
        {t.status === "closed" && <Badge>Closed</Badge>}
        {side === "staff" && t.can_reply && (t.status === "open"
          ? <Button size="sm" variant="ghost" icon={Lock} onClick={() => setStatus("closed")}>Close</Button>
          : <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setStatus("open")}>Reopen</Button>)}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas/40 px-4 py-4">
        {t.messages.map((m) => {
          const day = formatDate(m.created_at);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.uuid}>
              {sep && <p className="my-2 text-center text-[11.5px] text-faint">{day}</p>}
              <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%] ${m.mine ? "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-line bg-surface text-ink"}`}>
                  {!m.mine && <p className="mb-0.5 text-[11.5px] text-muted">{m.sender_name}</p>}
                  {m.body && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{m.body}</p>}
                  {m.attachments.length > 0 && <div className="mt-2"><AttachmentList files={m.attachments} tone={m.mine ? "dark" : "light"} /></div>}
                  <p className={`mt-1 text-right text-[11px] ${m.mine ? "text-white/70" : "text-faint"}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {t.can_reply ? (
        <footer className="border-t border-line p-3">
          {side === "portal" && oh?.enabled && !oh.within && (
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-amber-700"><Clock size={13} strokeWidth={1.5} />It&rsquo;s outside office hours ({oh.label}). Expect a reply when the office opens.</p>
          )}
          {files.length > 0 && <div className="mb-2"><AttachmentPicker value={files} onChange={setFiles} portal={side === "portal"} compact /></div>}
          <div className="flex items-end gap-2">
            {files.length === 0 && <AttachmentPicker value={files} onChange={setFiles} portal={side === "portal"} compact onError={(m) => toast.error(m)} />}
            <Textarea value={body} onValueChange={setBody} rows={1} autoGrow maxRows={6} placeholder="Write a message" className="flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
            <Button variant="primary" icon={SendHorizontal} onClick={send} loading={sending} disabled={!body.trim() && !files.length} aria-label="Send">Send</Button>
          </div>
        </footer>
      ) : (
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3 text-[13px] text-muted">
          {side === "staff" ? <><ShieldCheck size={15} strokeWidth={1.4} />{t.read_only_reason}</> : <><Lock size={15} strokeWidth={1.4} />This conversation is closed. Start a new message if you need anything else.</>}
        </footer>
      )}
    </>
  );
}
