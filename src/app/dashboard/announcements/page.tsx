"use client";

/*
 * Announcements. Everyone sees the current ones as cover cards, the ones waiting for
 * their acknowledgement and older ones; people who manage announcements also get the
 * Manage tab (drafts, scheduled, published, archived, with read and acknowledgement
 * progress) and the editor. ?open=<uuid> opens one, ?tab=manage|pending|past picks a tab.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive, CalendarClock, CheckCircle2, ClipboardList, Eye, Megaphone, Pencil, Pin, Plus, Search, Send, ShieldCheck, Trash2, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Avatar, Badge, Button, DataTable, FilterBar, Modal, Skeleton, Tabs, TextInput, useConfirm,
  type BadgeTone, type Column, type FilterValues, type MenuItem,
} from "@/components/ui-kit";
import { CoverArt } from "@/components/engagement/art";
import { AnnouncementEditor } from "@/components/engagement/announcement-editor";
import { AnnouncementView } from "@/components/engagement/announcement-view";
import { useEngagementMeta } from "@/components/engagement/context";
import type { AnnouncementCard, Paged, Person } from "@/components/engagement/types";

type Tab = "current" | "pending" | "past" | "manage";
type AdminRow = AnnouncementCard & {
  audience_label: string; publish_at: string | null; pinned: boolean; created_at: string;
  stats: { audience: number; read: number; acknowledged: number } | null;
};
type Receipt = { person: Person; status: "unread" | "read" | "acknowledged"; read_at: string | null; acknowledged_at: string | null };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "info" },
  published: { label: "Live", tone: "good" }, expired: { label: "Ended", tone: "warn" }, archived: { label: "Archived", tone: "neutral" },
};

/* ── Reader cards ───────────────────────────────────────────────── */

function StateChip({ a }: { a: AnnouncementCard }) {
  if (a.requires_ack && a.acknowledged) return <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700"><CheckCircle2 size={13} strokeWidth={1.8} /> Acknowledged</span>;
  if (a.requires_ack) return <span className="inline-flex items-center gap-1 text-[12px] text-amber-700"><ShieldCheck size={13} strokeWidth={1.8} /> Please acknowledge{a.ack_due_on ? ` by ${formatDate(a.ack_due_on, { day: "numeric", month: "short" }, "UTC")}` : ""}</span>;
  if (!a.read) return <span className="inline-flex items-center gap-1.5 text-[12px] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> New</span>;
  return null;
}

function Featured({ a, onOpen }: { a: AnnouncementCard; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group block w-full overflow-hidden rounded-3xl border border-line bg-surface text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <CoverArt cover={a.cover} className="h-56 md:h-64">
        <div className="flex h-56 flex-col justify-end bg-gradient-to-t from-black/55 via-black/10 to-transparent p-6 md:h-64 md:p-8">
          <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white backdrop-blur">
            <Megaphone size={12} strokeWidth={1.8} /> {a.kind_label}
          </span>
          <h2 className="max-w-3xl text-[28px] font-light leading-tight text-white [text-wrap:balance] md:text-[34px]">{a.title}</h2>
        </div>
      </CoverArt>
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-5 md:px-8">
        <p className="line-clamp-2 max-w-3xl text-[15px] text-muted">{a.summary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StateChip a={a} />
          <span className="text-[12.5px] text-faint">{a.author_name} · {a.published_at ? formatRelative(a.published_at) : ""}</span>
          <span className="rounded-full bg-ink px-4 py-2 text-[13px] text-white transition group-hover:bg-primary">Read</span>
        </div>
      </div>
    </button>
  );
}

function Card({ a, onOpen }: { a: AnnouncementCard; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <CoverArt cover={a.cover} className="h-32">
        <div className="flex h-32 items-start justify-between p-3">
          <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.12em] text-white backdrop-blur">{a.kind_label}</span>
          {!a.read && a.status === "published" && <span className="h-2.5 w-2.5 rounded-full bg-white ring-4 ring-white/30" title="New" />}
        </div>
      </CoverArt>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="line-clamp-2 text-[16.5px] leading-snug text-ink group-hover:text-primary">{a.title}</h3>
        <p className="mt-1.5 line-clamp-3 flex-1 text-[13.5px] text-muted">{a.summary}</p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="truncate text-[12px] text-faint">{a.published_at ? formatDate(a.published_at, { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
          <StateChip a={a} />
        </div>
      </div>
    </button>
  );
}

function ReaderList({ scope, onOpen, reloadKey }: { scope: "current" | "pending" | "past"; onOpen: (u: string) => void; reloadKey: number }) {
  const toast = useToast();
  const [items, setItems] = useState<AnnouncementCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);

  useEffect(() => {
    setItems(null); setPage(1);
    api.get<Paged<AnnouncementCard>>(`/engagement/announcements?scope=${scope}&size=13`)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => { toast.error((e as Error).message); setItems([]); });
  }, [scope, reloadKey, toast]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await api.get<Paged<AnnouncementCard>>(`/engagement/announcements?scope=${scope}&size=13&page=${page + 1}`);
      setItems((x) => [...(x ?? []), ...r.items]); setPage(page + 1);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMore(false); }
  }

  if (!items) return <div className="space-y-5"><Skeleton className="h-80 rounded-3xl" /><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div></div>;
  if (!items.length) {
    const copy = scope === "pending" ? ["You're all caught up", "Nothing is waiting for your acknowledgement."]
      : scope === "past" ? ["No older announcements", "Announcements that have ended show up here."]
        : ["No announcements right now", "Company news, policy updates and events will appear here."];
    return (
      <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{scope === "pending" ? <CheckCircle2 size={26} strokeWidth={1.3} /> : <Megaphone size={26} strokeWidth={1.3} />}</span>
        <p className="mt-4 text-[16px] text-ink">{copy[0]}</p>
        <p className="mt-1 text-[13.5px] text-muted">{copy[1]}</p>
      </div>
    );
  }
  const [first, ...rest] = scope === "current" ? items : [null, ...items];
  return (
    <div className="space-y-5">
      {first && <Featured a={first} onOpen={() => onOpen(first.uuid)} />}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(rest as AnnouncementCard[]).map((a) => <Card key={a.uuid} a={a} onOpen={() => onOpen(a.uuid)} />)}
      </div>
      {items.length < total && <div className="flex justify-center"><Button loading={more} onClick={loadMore}>Show more</Button></div>}
    </div>
  );
}

/* ── Manage ─────────────────────────────────────────────────────── */

function Progress({ value, total, tone }: { value: number; total: number; tone: string }) {
  const pct = total ? Math.round((value * 100) / total) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-9 text-[12px] tabular text-muted">{pct}%</span>
    </div>
  );
}

function ReceiptsModal({ row, onClose }: { row: AdminRow | null; onClose: () => void }) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Receipt> | null>(null);
  useEffect(() => { setStatus(row?.requires_ack ? "pending" : "all"); setQ(""); setPage(1); }, [row]);
  useEffect(() => {
    if (!row) return;
    setData(null);
    const p = new URLSearchParams({ page: String(page), size: "12" });
    if (status !== "all") p.set("status", status);
    if (q) p.set("q", q);
    const t = setTimeout(() => api.get<Paged<Receipt>>(`/engagement/announcements/${row.uuid}/receipts?${p}`).then(setData).catch(() => setData({ items: [], total: 0, page: 1, size: 12 })), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [row, status, q, page]);
  const filters: [string, string][] = row?.requires_ack
    ? [["pending", "Not acknowledged"], ["unread", "Not opened"], ["read", "Read only"], ["acknowledged", "Acknowledged"], ["all", "Everyone"]]
    : [["all", "Everyone"], ["read", "Read"], ["unread", "Not opened"]];
  const cols: Column<Receipt>[] = [
    { key: "name", header: "Person", cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.person.name} src={r.person.image} size={30} /><span className="min-w-0"><span className="block truncate text-ink">{r.person.name}</span><span className="block truncate text-[12px] text-faint">{[r.person.title, r.person.department].filter(Boolean).join(" · ")}</span></span></span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "acknowledged" ? "good" : r.status === "read" ? "info" : "neutral"} dot>{r.status === "acknowledged" ? "Acknowledged" : r.status === "read" ? "Read" : "Not opened"}</Badge> },
    { key: "when", header: "When", hideBelow: "sm", cell: (r) => <span className="text-muted">{r.acknowledged_at ? formatDateTime(r.acknowledged_at) : r.read_at ? formatDateTime(r.read_at) : "—"}</span> },
  ];
  const s = row?.stats;
  return (
    <Modal open={!!row} onClose={onClose} size="lg" title={row?.requires_ack ? "Acknowledgements" : "Readers"} description={row?.title}>
      {s && (
        <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {[["Audience", s.audience, Users], ["Read", s.read, Eye], ["Acknowledged", row?.requires_ack ? s.acknowledged : null, CheckCircle2]].map(([l, v, I]) => {
            const Icon = I as typeof Users;
            return (
              <div key={l as string} className="bg-surface px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon size={13} strokeWidth={1.5} /> {l as string}</p>
                <p className="mt-0.5 text-[22px] font-extralight tabular text-ink">{v === null ? "—" : v as number}
                  {typeof v === "number" && l !== "Audience" && s.audience ? <span className="ml-1.5 text-[13px] text-faint">{Math.round((v * 100) / s.audience)}%</span> : null}</p>
              </div>
            );
          })}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setStatus(k); setPage(1); }}
              className={`rounded-full border px-3 py-1 text-[12.5px] ${status === k ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>{l}</button>
          ))}
        </div>
        <TextInput leading={Search} value={q} onValueChange={(v) => { setQ(v); setPage(1); }} placeholder="Find a person" className="ml-auto w-full sm:w-52" />
      </div>
      <DataTable<Receipt> columns={cols} rows={data?.items ?? []} loading={!data} rowKey={(r) => r.person.uuid ?? r.person.name}
        emptyTitle="Nobody here" emptyHint={status === "pending" ? "Everyone has acknowledged it." : undefined}
        pagination={data ? { page, size: 12, total: data.total, onPageChange: setPage } : undefined} />
    </Modal>
  );
}

function Manage({ onOpen, onEdit, reloadKey, onChanged }: {
  onOpen: (u: string) => void; onEdit: (u: string) => void; reloadKey: number; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminRow> | null>(null);
  const [receipts, setReceipts] = useState<AdminRow | null>(null);
  const status = filters.status?.[0] ?? "";

  const load = useCallback(() => {
    const p = new URLSearchParams({ scope: "manage", page: String(page), size: "15" });
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    api.get<Paged<AdminRow>>(`/engagement/announcements?${p}`).then(setData).catch((e) => { toast.error((e as Error).message); setData({ items: [], total: 0, page: 1, size: 15 }); });
  }, [page, status, q, toast]);
  useEffect(() => { setData(null); load(); }, [load, reloadKey]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); load(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  };

  const actions = (r: AdminRow): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Open", icon: Eye, onSelect: () => onOpen(r.uuid) }];
    if (r.status !== "archived") items.push({ label: "Edit", icon: Pencil, onSelect: () => onEdit(r.uuid) });
    if (r.stats) items.push({ label: r.requires_ack ? "Acknowledgements" : "Readers", icon: Users, onSelect: () => setReceipts(r) });
    if (r.status === "draft" || r.status === "scheduled") {
      items.push({ label: "Publish now", icon: Send, onSelect: () => act(() => api.post(`/engagement/announcements/${r.uuid}/publish`), "Published") });
      items.push("separator", {
        label: r.status === "draft" ? "Delete draft" : "Delete", icon: Trash2, danger: true,
        onSelect: async () => { if (await confirm({ title: "Delete this announcement?", message: `“${r.title}” will be removed for good.`, confirmLabel: "Delete", tone: "danger" })) act(() => api.delete(`/engagement/announcements/${r.uuid}`), "Deleted"); },
      });
    } else if (r.status !== "archived") {
      items.push("separator", {
        label: "Archive", icon: Archive, danger: true,
        onSelect: async () => { if (await confirm({ title: "Archive this announcement?", message: "It comes off Buzz and kiosk screens. Read and acknowledgement records are kept.", confirmLabel: "Archive", tone: "danger" })) act(() => api.post(`/engagement/announcements/${r.uuid}/archive`), "Archived"); },
      });
    }
    return items;
  };

  const cols: Column<AdminRow>[] = [
    {
      key: "title", header: "Announcement", cell: (r) => (
        <span className="flex items-center gap-3">
          <CoverArt cover={r.cover} className="h-11 w-16 shrink-0 rounded-lg" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-ink"><span className="truncate">{r.title}</span>{r.pinned && <Pin size={12} strokeWidth={1.8} className="shrink-0 text-primary" />}</span>
            <span className="block truncate text-[12px] text-faint">{r.kind_label} · {r.audience_label}</span>
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS[r.status]?.tone ?? "neutral"} dot>{STATUS[r.status]?.label ?? r.status}</Badge> },
    {
      key: "when", header: "Date", hideBelow: "md", cell: (r) => (
        <span className="text-[13px] text-muted">
          {r.status === "scheduled" && r.publish_at ? <span className="inline-flex items-center gap-1 text-sky-700"><CalendarClock size={13} strokeWidth={1.6} /> {formatDateTime(r.publish_at)}</span>
            : r.published_at ? formatDate(r.published_at, { day: "numeric", month: "short", year: "numeric" }) : `Created ${formatRelative(r.created_at)}`}
          {r.expires_at && r.status !== "draft" && <span className="block text-[11.5px] text-faint">Ends {formatDate(r.expires_at, { day: "numeric", month: "short" })}</span>}
        </span>
      ),
    },
    { key: "read", header: "Read", hideBelow: "lg", cell: (r) => r.stats ? <Progress value={r.stats.read} total={r.stats.audience} tone="bg-sky-500" /> : <span className="text-faint">—</span> },
    { key: "ack", header: "Acknowledged", hideBelow: "lg", cell: (r) => r.stats && r.requires_ack ? <Progress value={r.stats.acknowledged} total={r.stats.audience} tone="bg-emerald-500" /> : <span className="text-faint">—</span> },
  ];

  return (
    <div className="space-y-4">
      <FilterBar search={q} onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search announcements"
        filters={[{ key: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable<AdminRow> columns={cols} rows={data?.items ?? []} loading={!data} rowKey={(r) => r.uuid}
        onRowClick={(r) => onOpen(r.uuid)} rowActions={actions} emptyIcon={Megaphone}
        emptyTitle={q || status ? "No announcements match" : "No announcements yet"}
        emptyHint={q || status ? undefined : "Write the first one: news, a policy update or an event."}
        pagination={data ? { page, size: 15, total: data.total, onPageChange: setPage } : undefined} />
      <ReceiptsModal row={receipts} onClose={() => setReceipts(null)} />
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

function AnnouncementsPage() {
  const meta = useEngagementMeta();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "current";
  const openId = params.get("open");
  const [editor, setEditor] = useState<{ open: boolean; uuid: string | null }>({ open: false, uuid: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const manager = !!meta?.can_manage_announcements;

  const setParam = useCallback((k: string, v: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v); else sp.delete(k);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const employee = meta?.me.employee_uuid;
  useEffect(() => {
    if (!employee) { setPending(null); return; }
    api.get<Paged<AnnouncementCard>>("/engagement/announcements?scope=pending&size=1").then((r) => setPending(r.total)).catch(() => {});
  }, [reloadKey, employee]);

  const tabs = useMemo(() => [
    { value: "current" as Tab, label: "Latest" },
    ...(meta?.me.employee_uuid ? [{ value: "pending" as Tab, label: "To acknowledge", count: pending || undefined }] : []),
    { value: "past" as Tab, label: "Older" },
    ...(manager ? [{ value: "manage" as Tab, label: "Manage", icon: ClipboardList }] : []),
  ], [meta, pending, manager]);

  const refresh = () => setReloadKey((k) => k + 1);
  const closeView = useCallback(() => setParam("open", null), [setParam]);

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line" style={{ background: "linear-gradient(120deg,#ecfeff 0%,#eef2ff 50%,#fdf4ff 100%)" }}>
        <svg viewBox="0 0 420 200" className="pointer-events-none absolute right-0 top-1/2 hidden h-[88%] w-auto -translate-y-1/2 md:block" aria-hidden>
          <circle cx="330" cy="70" r="90" fill="#c7d2fe" opacity=".45" />
          <circle cx="250" cy="150" r="60" fill="#a5f3fc" opacity=".45" />
          <g transform="translate(225 52) rotate(-12) scale(.85)">
            <path d="M0 40 L70 10 L70 110 L0 80 Z" fill="#6366f1" />
            <rect x="-26" y="40" width="28" height="40" rx="6" fill="#818cf8" />
            <rect x="-14" y="80" width="14" height="34" rx="4" fill="#4f46e5" />
            <ellipse cx="72" cy="60" rx="10" ry="50" fill="#4338ca" />
            {[0, 1, 2].map((i) => <path key={i} d={`M ${92 + i * 16} ${30 - i * 6} Q ${104 + i * 18} 60 ${92 + i * 16} ${90 + i * 6}`} stroke="#6366f1" strokeWidth="5" fill="none" strokeLinecap="round" opacity={0.7 - i * 0.2} />)}
          </g>
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x={160 + ((i * 53) % 240)} y={(i * 37) % 180} width="5" height="9" rx="1.5" fill={["#f472b6", "#f59e0b", "#818cf8", "#34d399"][i % 4]} opacity=".6" transform={`rotate(${i * 29} ${160 + ((i * 53) % 240)} ${(i * 37) % 180})`} />)}
        </svg>
        <div className="relative max-w-2xl px-6 py-7 md:px-8">
          <p className="text-[12px] uppercase tracking-[0.12em] text-primary/80">Engage</p>
          <h1 className="mt-1 text-[28px] font-light leading-tight text-ink">Announcements</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">
            {pending ? `${pending} announcement${pending === 1 ? " needs" : "s need"} your acknowledgement.` : "News, policy updates and events from across the company."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {manager && <Button variant="primary" icon={Plus} onClick={() => setEditor({ open: true, uuid: null })}>New announcement</Button>}
            {!!pending && tab !== "pending" && <Button icon={ShieldCheck} onClick={() => setParam("tab", "pending")}>Review now</Button>}
          </div>
        </div>
      </section>

      <Tabs items={tabs} value={tab} onChange={(v) => setParam("tab", v === "current" ? null : v)} className="mb-6" />

      {tab === "manage" && manager ? (
        <Manage onOpen={(u) => setParam("open", u)} onEdit={(u) => setEditor({ open: true, uuid: u })} reloadKey={reloadKey} onChanged={refresh} />
      ) : (
        <ReaderList scope={tab === "manage" ? "current" : tab} onOpen={(u) => setParam("open", u)} reloadKey={reloadKey} />
      )}

      <AnnouncementView uuid={openId} onClose={closeView} onChanged={refresh}
        onEdit={manager ? (a) => { closeView(); setEditor({ open: true, uuid: a.uuid }); } : undefined} />
      <AnnouncementEditor open={editor.open} uuid={editor.uuid} onClose={() => setEditor((e) => ({ ...e, open: false }))}
        onSaved={refresh} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><AnnouncementsPage /></Suspense>;
}
