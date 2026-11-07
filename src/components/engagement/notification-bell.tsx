"use client";

/*
 * The bell in the app header: unread count (checked every 30 s and when the tab comes
 * back into view), and a dropdown with the latest notifications. Clicking one marks it
 * read and goes to its page.
 *   <NotificationBell className={iconBtn} />
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign, Award, Bell, CheckCheck, ClipboardList, Flag, Heart, Inbox, Megaphone, MessageCircle, PartyPopper, Reply, ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { Avatar } from "@/components/ui-kit";

type Item = {
  uuid: string; kind: string; title: string; body: string | null; link: string | null; actor_name: string | null;
  actor_image: string | null; read: boolean; created_at: string;
};
type Inbox = { items: Item[]; total: number; unread: number };

const ICONS: Record<string, { icon: typeof Bell; tint: string }> = {
  mention: { icon: AtSign, tint: "bg-indigo-500" }, reaction: { icon: Heart, tint: "bg-pink-500" },
  comment: { icon: MessageCircle, tint: "bg-sky-500" }, reply: { icon: Reply, tint: "bg-sky-500" },
  kudos: { icon: Award, tint: "bg-amber-500" }, announcement: { icon: Megaphone, tint: "bg-violet-500" },
  survey: { icon: ClipboardList, tint: "bg-teal-500" }, celebration: { icon: PartyPopper, tint: "bg-pink-500" },
  approval: { icon: Inbox, tint: "bg-indigo-500" }, moderation: { icon: ShieldCheck, tint: "bg-slate-500" },
  report: { icon: Flag, tint: "bg-rose-500" },
};

export function NotificationBell({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [data, setData] = useState<Inbox | null>(null);
  const [page, setPage] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  const count = useCallback(() => {
    if (document.hidden) return;
    api.get<{ count: number }>("/notifications/unread-count").then((r) => setUnread(r.count)).catch(() => {});
  }, []);
  useEffect(() => {
    count();
    const t = setInterval(count, 30_000);
    const vis = () => { if (!document.hidden) count(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [count]);

  const load = useCallback((p: number, which: "all" | "unread") => {
    api.get<Inbox>(`/notifications/inbox?page=${p}&size=15${which === "unread" ? "&unread=true" : ""}`).then((r) => {
      setData((d) => (p === 1 || !d ? r : { ...r, items: [...d.items, ...r.items] }));
      setUnread(r.unread);
    }).catch(() => setData({ items: [], total: 0, unread }));
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    load(1, tab);
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  async function markAll() {
    const r = await api.post<{ unread: number }>("/notifications/read", {});
    setUnread(r.unread);
    setData((d) => d && { ...d, items: d.items.map((i) => ({ ...i, read: true })) });
  }
  async function openItem(i: Item) {
    if (!i.read) {
      api.post<{ unread: number }>("/notifications/read", { uuids: [i.uuid] }).then((r) => setUnread(r.unread)).catch(() => {});
      setData((d) => d && { ...d, items: d.items.map((x) => (x.uuid === i.uuid ? { ...x, read: true } : x)) });
    }
    if (i.link) { setOpen(false); router.push(i.link); }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={`relative ${className}`} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}>
        <Bell size={18} strokeWidth={1.4} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10.5px] leading-none text-white ring-2 ring-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[15px] text-ink">Notifications</p>
            {unread > 0 && <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-[12.5px] text-primary hover:text-primary-dark"><CheckCheck size={14} /> Mark all read</button>}
          </div>
          <div className="flex gap-1 border-b border-line px-3 py-1.5">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-[12.5px] ${tab === t ? "bg-ink text-white" : "text-muted hover:bg-sunken"}`}>
                {t === "all" ? "All" : `Unread${unread ? ` (${unread})` : ""}`}
              </button>
            ))}
          </div>
          <ul className="hr-scroll max-h-[420px] overflow-y-auto">
            {data === null ? <li className="px-4 py-8 text-center text-[13px] text-faint">Loading…</li>
              : data.items.length === 0 ? (
                <li className="px-4 py-10 text-center">
                  <CheckCheck size={24} strokeWidth={1.2} className="mx-auto text-faint" />
                  <p className="mt-2 text-[13.5px] text-muted">You&apos;re all caught up.</p>
                </li>
              ) : data.items.map((i) => {
                const meta = ICONS[i.kind] ?? { icon: Bell, tint: "bg-slate-500" };
                const Icon = meta.icon;
                return (
                  <li key={i.uuid}>
                    <button type="button" onClick={() => openItem(i)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken ${i.read ? "" : "bg-primary-soft/40"}`}>
                      <span className="relative shrink-0">
                        {i.actor_name ? <Avatar name={i.actor_name} src={i.actor_image} size={38} />
                          : <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-sunken text-muted"><Icon size={17} strokeWidth={1.4} /></span>}
                        <span className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white ring-2 ring-surface ${meta.tint}`}><Icon size={10} strokeWidth={2} /></span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 block text-[13.5px] leading-snug ${i.read ? "text-muted" : "text-ink"}`}>{i.title}</span>
                        {i.body && <span className="mt-0.5 line-clamp-1 block text-[12.5px] text-faint">{i.body}</span>}
                        <span className="mt-0.5 block text-[11.5px] text-faint">{formatRelative(i.created_at)}</span>
                      </span>
                      {!i.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            {data && data.items.length < data.total && (
              <li className="border-t border-line"><button type="button" onClick={() => { const p = page + 1; setPage(p); load(p, tab); }} className="w-full py-2.5 text-[13px] text-muted hover:text-ink">Show older</button></li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
