"use client";

/*
 * Notices & circulars. "For me" lists notices sent to the signed-in staff member; "Sent" lists
 * what they (or, for managers, anyone) wrote, with drafts and scheduled ones. Row click opens
 * the notice with read receipts; New / Edit open the form with the audience builder.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive, CalendarClock, Check, CheckCheck, Copy, Eye, Megaphone, Pencil, Pin, PinOff, Plus, RotateCw, Send, Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, Select, Tabs,
  TextInput, Textarea, TimeInput, Toggle, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  AttachmentList, AttachmentPicker, AudienceBuilder, AudiencePreview, EMPTY_AUDIENCE, Markdown, categoryTone, errText,
  normAudience, type Audience, type FileRef, type Notice, type Paged,
} from "@/components/comms/shared";
import { CommsSettingsModal } from "@/components/comms/settings-modal";

type Meta = {
  notice_categories: { value: string; label: string }[]; staff_roles: string[]; my_section_ids: number[];
  channels: Record<string, { ready: boolean; label: string; hint?: string | null }>;
  settings: { default_channels: string[] };
  can: Record<string, boolean>;
};

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "info"> = { draft: "neutral", scheduled: "info", published: "good", archived: "neutral" };

export default function NoticesPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><NoticesInner /></Suspense>;
}

function NoticesInner() {
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAccess();
  const [meta, setMeta] = useState<Meta | null>(null);
  const writer = can("comms.notices.manage", "comms.notices.section");
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Paged<Notice> } | null>(null);
  const [viewing, setViewing] = useState<string | null>(() => params.get("view"));
  const [formFor, setFormFor] = useState<Notice | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<Meta>("/comms/meta").then(setMeta).catch(() => {}); }, []);

  const key = `${tab}|${q}|${JSON.stringify(filters)}|${page}|${size}|${nonce}`;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set("q", q);
    if (filters.category?.length) p.set("category", filters.category.join(","));
    if (tab === "sent" && filters.status?.[0]) p.set("status", filters.status[0]);
    if (tab === "inbox" && filters.status?.[0] === "unread") p.set("unread", "true");
    api.get<Paged<Notice>>(`/comms/notices${tab === "inbox" ? "/inbox" : ""}?${p}`)
      .then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load notices", { description: errText(e) }); } });
    return () => { live = false; };
  }, [key, tab, q, filters, page, size, toast]);
  const loading = data?.key !== key;
  const rows = data?.page.items ?? [];

  const openForm = (n: Notice | "new") => { setFormKey((k) => k + 1); setFormFor(n); };

  async function archive(n: Notice) {
    if (!(await confirm({ title: `Archive “${n.title}”?`, message: "It disappears from everyone's notice board. Read receipts are kept.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.post(`/comms/notices/${n.uuid}/archive`); toast.success("Notice archived"); setViewing(null); refresh(); } catch (e) { toast.error(errText(e)); }
  }
  async function pin(n: Notice) {
    try { await api.post(`/comms/notices/${n.uuid}/pin`, { pinned: !n.pinned }); refresh(); } catch (e) { toast.error(errText(e)); }
  }
  async function duplicate(n: Notice) {
    try { const c = await api.post<Notice>(`/comms/notices/${n.uuid}/duplicate`); toast.success("Copy made"); setTab("sent"); openForm(c); refresh(); } catch (e) { toast.error(errText(e)); }
  }

  const columns: Column<Notice>[] = [
    {
      key: "title", header: "Notice", cell: (n) => (
        <div className="flex min-w-0 items-start gap-2.5">
          {tab === "inbox" && <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`} aria-label={n.read_at ? undefined : "Unread"} />}
          <div className="min-w-0">
            <p className={`flex items-center gap-1.5 truncate ${tab === "inbox" && !n.read_at ? "text-ink" : "text-ink/85"}`}>
              {n.pinned && <Pin size={13} strokeWidth={1.4} className="shrink-0 text-primary" />}{n.title}
            </p>
            <p className="truncate text-[12.5px] text-muted">{n.excerpt || n.audience_label}</p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", hideBelow: "md", cell: (n) => <Badge tone={categoryTone(n.category)}>{n.category_label}</Badge> },
    ...(tab === "sent" ? [
      { key: "audience", header: "Audience", hideBelow: "lg", cell: (n: Notice) => <span className="line-clamp-1 text-[13px] text-muted">{n.audience_label || "Not chosen"}</span> } as Column<Notice>,
      {
        key: "reads", header: "Read", align: "right", hideBelow: "sm", cell: (n: Notice) => n.status === "published" && n.stats?.recipients
          ? <span className="tabular text-[13px] text-muted">{n.stats.read}/{n.stats.recipients}</span> : <span className="text-faint">—</span>,
      } as Column<Notice>,
      { key: "status", header: "Status", cell: (n: Notice) => <Badge tone={n.expired ? "neutral" : STATUS_TONE[n.status]} dot>{n.expired ? "Expired" : n.status === "scheduled" ? `Scheduled` : n.status[0].toUpperCase() + n.status.slice(1)}</Badge> } as Column<Notice>,
    ] : [
      { key: "from", header: "From", hideBelow: "md", cell: (n: Notice) => <span className="text-[13px] text-muted">{n.author_name}</span> } as Column<Notice>,
      { key: "ack", header: "", hideBelow: "sm", cell: (n: Notice) => n.require_ack ? (n.acknowledged_at ? <Badge tone="good">Acknowledged</Badge> : <Badge tone="warn">Needs acknowledgement</Badge>) : null } as Column<Notice>,
    ]),
    { key: "when", header: "When", align: "right", hideBelow: "sm", cell: (n) => <span className="text-[13px] text-muted">{n.published_at ? formatRelative(n.published_at) : n.publish_at ? formatDateTime(n.publish_at) : "—"}</span> },
  ];

  const filterDefs = [
    { key: "category", label: "Category", multiple: true, options: meta?.notice_categories ?? [] },
    tab === "sent"
      ? { key: "status", label: "Status", options: [{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "published", label: "Sent" }, { value: "expired", label: "Expired" }, { value: "archived", label: "Archived" }] }
      : { key: "status", label: "Show", options: [{ value: "unread", label: "Unread only" }] },
  ];

  return (
    <div>
      <PageHeader eyebrow="Communicate" title="Notices & circulars" description="Send notices to staff, parents and students, and see who has read them."
        actions={<>
          {meta?.can.settings_manage && <Button icon={Settings2} onClick={() => setSettingsOpen(true)}>Settings</Button>}
          {writer && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New notice</Button>}
        </>} />
      {writer && (
        <Tabs className="mb-4" value={tab} onChange={(v) => { setTab(v); setPage(1); setFilters({}); }}
          items={[{ value: "inbox", label: "For me" }, { value: "sent", label: meta?.can.notices_manage ? "All notices" : "Sent by me" }]} />
      )}
      <FilterBar searchPlaceholder="Search notices" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={filterDefs} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={rows} rowKey={(n) => n.uuid} columns={columns} loading={loading}
        onRowClick={(n) => tab === "sent" && n.status !== "published" ? openForm(n) : setViewing(n.uuid)}
        rowActions={(n) => [
          { label: "Open", icon: Eye, onSelect: () => setViewing(n.uuid) },
          ...(tab === "sent" ? [
            ...(n.status !== "published" && n.status !== "archived" ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(n) }] : []),
            { label: n.pinned ? "Unpin" : "Pin to top", icon: n.pinned ? PinOff : Pin, onSelect: () => pin(n) },
            { label: "Duplicate", icon: Copy, onSelect: () => duplicate(n) },
            ...(n.status !== "archived" ? ["separator" as const, { label: "Archive", icon: Archive, danger: true, onSelect: () => archive(n) }] : []),
          ] : []),
        ]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Megaphone}
        emptyTitle={tab === "inbox" ? "No notices for you" : "No notices yet"}
        emptyHint={tab === "inbox" ? "Notices sent to you by the institution appear here." : "Write a notice for a class, all parents or the staff."}
        emptyAction={tab === "sent" && writer ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New notice</Button> : undefined} />

      <NoticeDetail uuid={viewing} onClose={() => { setViewing(null); refresh(); }}
        onEdit={(n) => { setViewing(null); openForm(n); }} onArchive={archive} />
      {meta && formFor && (
        <NoticeForm key={formKey} target={formFor} meta={meta} open={!!formFor} onClose={() => setFormFor(null)}
          onSaved={() => { setFormFor(null); setTab("sent"); refresh(); }} />
      )}
      <CommsSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function splitLocal(iso: string | null): { d: string; t: string } {
  if (!iso) return { d: "", t: "" };
  const x = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { d: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, t: `${pad(x.getHours())}:${pad(x.getMinutes())}` };
}
const joinLocal = (d: string, t: string) => (d ? new Date(`${d}T${t || "08:00"}:00`).toISOString() : null);

function NoticeForm({ target, meta, open, onClose, onSaved }: { target: Notice | "new"; meta: Meta; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const editing = target !== "new" ? target : null;
  const teacherOnly = !meta.can.notices_manage;
  const sched = splitLocal(editing?.publish_at ?? null);
  const exp = splitLocal(editing?.expires_at ?? null);
  const initial = {
    title: editing?.title ?? "", body: editing?.body ?? "", category: editing?.category ?? "general",
    audience: editing ? normAudience(editing.audience) : { ...EMPTY_AUDIENCE, learners: { ...EMPTY_AUDIENCE.learners, section_ids: teacherOnly ? meta.my_section_ids.slice(0, 1) : [] } } as Audience,
    channels: editing?.channels ?? meta.settings.default_channels ?? ["in_app"],
    pinned: editing?.pinned ?? false, require_ack: editing?.require_ack ?? false,
    when: editing?.status === "scheduled" ? "schedule" : "now", sd: sched.d, st: sched.t, ed: exp.d, et: exp.t,
    attachments: (editing?.attachments ?? []) as FileRef[],
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState<"" | "draft" | "send">("");
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function save(send: boolean) {
    if (!v.title.trim()) { setErr("Give the notice a title"); return; }
    setSaving(send ? "send" : "draft");
    try {
      const payload = {
        title: v.title.trim(), body: v.body, category: v.category, audience: v.audience, channels: v.channels,
        pinned: v.pinned, require_ack: v.require_ack, attachments: v.attachments.map((f) => f.uuid),
        expires_at: joinLocal(v.ed, v.et || "23:59"), publish_at: v.when === "schedule" ? joinLocal(v.sd, v.st) : null,
      };
      const n = editing ? await api.put<Notice>(`/comms/notices/${editing.uuid}`, payload) : await api.post<Notice>("/comms/notices", payload);
      if (send) {
        await api.post(`/comms/notices/${n.uuid}/publish`, { when: v.when, publish_at: payload.publish_at });
        toast.success(v.when === "schedule" ? "Notice scheduled" : "Notice sent");
      } else toast.success("Draft saved");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save the notice", { description: errText(e) });
    } finally { setSaving(""); }
  }

  const toggleChannel = (c: string, on: boolean) => set("channels", on ? [...new Set([...v.channels, c])] : v.channels.filter((x) => x !== c));
  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={!!saving}
      title={editing ? "Edit notice" : "New notice"} description={teacherOnly ? `Goes to the ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()} of your ${term("sections").toLowerCase()}.` : undefined}
      footerStart={<Button variant="ghost" onClick={() => save(false)} loading={saving === "draft"}>Save draft</Button>}
      footer={<><ModalCancel /><Button variant="primary" icon={v.when === "schedule" ? CalendarClock : Send} onClick={() => save(true)} loading={saving === "send"}>{v.when === "schedule" ? "Schedule" : "Send now"}</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Field label="Title" required error={err}>
            <TextInput autoFocusInModal value={v.title} onValueChange={(x) => { set("title", x); setErr(""); }} maxLength={200} placeholder="e.g. Sports day on Friday" />
          </Field>
          <Field label="Message" hint="Use **bold**, *italics*, - lists and [links](https://…).">
            <Textarea value={v.body} onValueChange={(x) => set("body", x)} rows={9} autoGrow maxRows={20} placeholder="Write the notice" />
          </Field>
          <Field label="Attachments" aside="Up to 10">
            <AttachmentPicker value={v.attachments} onChange={(x) => set("attachments", x)} max={10} onError={(m) => toast.error(m)} />
          </Field>
          <Section title="Who gets it">
            <AudienceBuilder value={v.audience} onChange={(a) => set("audience", a)} teacherOnly={teacherOnly} mySectionIds={meta.my_section_ids} staffRoles={meta.staff_roles} />
            <div className="mt-3"><AudiencePreview audience={v.audience} /></div>
          </Section>
        </div>
        <div className="space-y-5 lg:border-l lg:border-line lg:pl-6">
          <Field label="Category">
            <Select value={v.category} onChange={(x) => x && set("category", x)} options={meta.notice_categories} />
          </Field>
          <div>
            <p className="mb-2 text-[13px] text-muted">Send by</p>
            <div className="space-y-2.5">
              {Object.entries(meta.channels).map(([k, c]) => (
                <Toggle key={k} size="sm" checked={k === "in_app" || v.channels.includes(k)} disabled={k === "in_app" || !c.ready}
                  onChange={(on) => toggleChannel(k, on)} label={c.label} description={!c.ready ? c.hint ?? undefined : k === "in_app" ? "Always on" : undefined} />
              ))}
            </div>
            {v.category === "emergency" && <p className="mt-2 text-[12.5px] text-amber-700">Emergency notices also go by the institution&rsquo;s emergency channels.</p>}
          </div>
          <div className="space-y-2.5">
            <Toggle size="sm" checked={v.pinned} onChange={(x) => set("pinned", x)} label="Pin to the top" />
            <Toggle size="sm" checked={v.require_ack} onChange={(x) => set("require_ack", x)} label="Ask for acknowledgement" description="People confirm they have read it" />
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted">When</p>
            <div className="flex gap-2">
              {(["now", "schedule"] as const).map((w) => (
                <button key={w} type="button" onClick={() => set("when", w)}
                  className={`h-8 rounded-full border px-3 text-[13px] ${v.when === w ? "border-primary/40 bg-primary-soft/60 text-primary" : "border-line text-muted hover:text-ink"}`}>
                  {w === "now" ? "Send now" : "Schedule"}
                </button>
              ))}
            </div>
            {v.when === "schedule" && (
              <FormGrid className="mt-3"><DateInput value={v.sd} onChange={(x) => set("sd", x)} /><TimeInput value={v.st} onChange={(x) => set("st", x)} /></FormGrid>
            )}
          </div>
          <Field label="Expires" aside="Optional" hint="Hidden from notice boards after this date">
            <DateInput value={v.ed} onChange={(x) => set("ed", x)} clearable />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ── Details with read receipts ────────────────────────────────────────── */

type Receipt = { id: number; key: string; kind: string; name: string | null; children: string[]; has_sign_in: boolean; read_at: string | null; acknowledged_at: string | null; send_count: number };

function NoticeDetail({ uuid, onClose, onEdit, onArchive }: { uuid: string | null; onClose: () => void; onEdit: (n: Notice) => void; onArchive: (n: Notice) => void }) {
  const toast = useToast();
  const [n, setN] = useState<Notice | null>(null);
  const [tabFor, setTabFor] = useState<{ uuid: string | null; tab: string }>({ uuid: null, tab: "notice" });
  const tab = tabFor.uuid === uuid ? tabFor.tab : "notice";
  const setTab = (t: string) => setTabFor({ uuid, tab: t });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Notice>(`/comms/notices/${uuid}`).then(async (r) => {
      if (!live) return;
      setN(r);
      if (r.is_recipient && !r.read_at) { try { await api.post(`/comms/notices/${uuid}/read`); } catch { /* ignore */ } }
    }).catch((e) => { toast.error(errText(e)); onClose(); });
    return () => { live = false; };
  }, [uuid, nonce, toast, onClose]);
  const cur = n && n.uuid === uuid ? n : null;

  async function ack() {
    try { await api.post(`/comms/notices/${uuid}/acknowledge`); toast.success("Acknowledged"); setNonce((x) => x + 1); } catch (e) { toast.error(errText(e)); }
  }
  async function resend() {
    try { const r = await api.post<{ sent: number }>(`/comms/notices/${uuid}/resend`); toast.success(r.sent ? `Sent again to ${r.sent} people` : "Everyone has read it"); setNonce((x) => x + 1); } catch (e) { toast.error(errText(e)); }
  }
  const showReceipts = !!cur?.can_edit && cur.status === "published";
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={cur?.title}
      description={cur ? <span className="flex flex-wrap items-center gap-2"><Badge tone={categoryTone(cur.category)}>{cur.category_label}</Badge>{cur.author_name}{cur.published_at && <> · {formatDateTime(cur.published_at)}</>}</span> : undefined}
      headerActions={cur?.can_edit && cur.status !== "published" && cur.status !== "archived" && <Button size="sm" icon={Pencil} onClick={() => onEdit(cur)}>Edit</Button>}
      footerStart={cur?.can_edit && cur.status !== "archived" ? <Button variant="ghost" icon={Archive} onClick={() => onArchive(cur)}>Archive</Button> : undefined}
      footer={cur && <>
        {showReceipts && <Button icon={RotateCw} onClick={resend}>Send again to unread</Button>}
        {cur.is_recipient && cur.require_ack && (cur.acknowledged_at
          ? <Badge tone="good"><CheckCheck size={13} strokeWidth={1.6} /> Acknowledged</Badge>
          : <Button variant="primary" icon={Check} onClick={ack}>I have read this</Button>)}
      </>}>
      {cur && (
        <>
          {showReceipts && <Tabs className="-mt-2 mb-5" value={tab} onChange={setTab} items={[{ value: "notice", label: "Notice" }, { value: "receipts", label: "Read receipts", count: cur.stats?.recipients }]} />}
          {tab === "notice" ? (
            <div className="space-y-5">
              <Markdown text={cur.body} />
              <AttachmentList files={cur.attachments} />
              <KeyValue columns={3} items={[
                { label: "Audience", value: cur.audience_label, span: 2 },
                { label: "Status", value: cur.expired ? "Expired" : cur.status === "scheduled" && cur.publish_at ? `Scheduled for ${formatDateTime(cur.publish_at)}` : cur.status },
                ...(cur.expires_at ? [{ label: "Expires", value: formatDateTime(cur.expires_at) }] : []),
                ...(cur.stats && cur.status === "published" && cur.can_edit ? [{ label: "Read", value: `${cur.stats.read} of ${cur.stats.recipients}` },
                  ...(cur.require_ack ? [{ label: "Acknowledged", value: `${cur.stats.acknowledged} of ${cur.stats.recipients}` }] : [])] : []),
                ...(cur.can_edit && cur.status === "published" ? [{ label: "Delivery", value: Object.entries(cur.delivery || {}).filter(([k]) => k !== "error").map(([k, d]) => `${k === "in_app" ? "App" : k.toUpperCase()}: ${d.sent ?? 0}${d.note ? ` (${d.note})` : ""}`).join(" · "), span: 3 as const }] : []),
              ]} />
            </div>
          ) : <Receipts uuid={cur.uuid} requireAck={cur.require_ack} />}
        </>
      )}
    </Modal>
  );
}

function Receipts({ uuid, requireAck }: { uuid: string; requireAck: boolean }) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; page: Paged<Receipt> } | null>(null);
  const key = `${uuid}|${q}|${JSON.stringify(filters)}|${page}`;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    if (filters.kind?.[0]) p.set("kind", filters.kind[0]);
    api.get<Paged<Receipt>>(`/comms/notices/${uuid}/receipts?${p}`).then((r) => { if (live) setData({ key, page: r }); }).catch(() => {});
    return () => { live = false; };
  }, [key, uuid, q, filters, page]);
  const cols: Column<Receipt>[] = [
    { key: "name", header: "Person", cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.name || "—"}</p>{r.children.length > 0 && <p className="truncate text-[12.5px] text-muted">{r.children.join(", ")}</p>}</div> },
    { key: "kind", header: "", hideBelow: "sm", cell: (r) => <Badge>{r.kind === "staff" ? "Staff" : r.kind === "parent" ? "Parent" : "Student"}</Badge> },
    { key: "read", header: "Read", cell: (r) => r.read_at ? <span className="text-[13px] text-emerald-700">{formatRelative(r.read_at)}</span> : <span className="text-[13px] text-faint">{r.has_sign_in ? "Not yet" : "No app sign-in"}</span> },
    ...(requireAck ? [{ key: "ack", header: "Acknowledged", cell: (r: Receipt) => r.acknowledged_at ? <Check size={15} strokeWidth={1.6} className="text-emerald-600" /> : <span className="text-faint">—</span> }] : []),
  ];
  return (
    <div>
      <FilterBar searchPlaceholder="Search people" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", options: [{ value: "read", label: "Read" }, { value: "unread", label: "Not read" }, ...(requireAck ? [{ value: "acknowledged", label: "Acknowledged" }, { value: "pending", label: "Not acknowledged" }] : [])] },
          { key: "kind", label: "Who", options: [{ value: "staff", label: "Staff" }, { value: "parent", label: "Parents" }, { value: "student", label: "Students" }] },
        ]} />
      <DataTable rows={data?.page.items ?? []} rowKey={(r) => r.id} columns={cols} loading={data?.key !== key}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }} emptyTitle="No one matches" emptyHint="Try another filter." />
    </div>
  );
}
