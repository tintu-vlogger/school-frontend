"use client";

/*
 * Learner leave requests. Class teachers see requests waiting for them (approve or reject
 * here or in Approvals); the office sees all and can record leave for a learner (approved at
 * once). Row click opens the details modal.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, Check, Eye, Paperclip, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateRangeInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Select, Tabs,
  Textarea, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { LEAVE_LABEL, LEAVE_TONE, type AttStatus, type LeaveRow } from "@/components/student_attendance/lib";

type Page = { items: LeaveRow[]; total: number; page: number; size: number; counts: Record<string, number> };

function span(r: { from_date: string; to_date: string }) {
  return r.from_date === r.to_date ? formatDate(r.from_date) : `${formatDate(r.from_date, { year: undefined })} – ${formatDate(r.to_date)}`;
}

export default function LeavePage() {
  const { term } = useInstitution();
  const { can } = useAccess();
  const toast = useToast();
  const manager = can("attendance.leave.manage");
  const [tab, setTab] = useState<"mine" | "all">("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["pending"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<Page | null>(null);
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<LeaveRow | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [mineCount, setMineCount] = useState(0);

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) qs.set("q", search);
    if (filters.status?.[0]) qs.set("status", filters.status[0]);
    if (tab === "mine") qs.set("mine", "true");
    setData(null);
    api.get<Page>(`/student-attendance/leave?${qs}`).then((r) => live && setData(r)).catch((e) => {
      if (live) { setData({ items: [], total: 0, page: 1, size, counts: {} }); toast.error("Couldn't load leave requests", { description: (e as Error).message }); }
    });
    return () => { live = false; };
  }, [page, size, search, filters, tab, nonce, toast]);
  useEffect(() => {
    api.get<Page>("/student-attendance/leave?mine=true&status=pending&size=1").then((r) => {
      setMineCount(r.total);
      if (r.total > 0 && nonce === 0) setTab("mine");
    }).catch(() => {});
  }, [nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const columns: Column<LeaveRow>[] = [
    { key: "student", header: term("student"), cell: (r) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={r.student_name ?? ""} size={30} />
        <div className="min-w-0"><p className="truncate text-ink">{r.student_name}</p><p className="truncate text-[12.5px] text-muted">{r.section_label}</p></div></div>) },
    { key: "dates", header: "Dates", cell: (r) => <div><p className="text-ink/90">{span(r)}</p><p className="text-[12.5px] text-muted">{r.days} day{r.days === 1 ? "" : "s"}</p></div> },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (r) => <span className="line-clamp-2 text-[13px] text-muted">{r.reason}{r.attachments.length ? <Paperclip size={12} strokeWidth={1.4} className="ml-1 inline" /> : null}</span> },
    { key: "by", header: "Asked by", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted">{r.requested_by_name}{r.requested_by_kind === "staff" ? " (office)" : ""}</span> },
    { key: "status", header: "Status", cell: (r) => (
      <div><Badge tone={LEAVE_TONE[r.status]} dot>{LEAVE_LABEL[r.status]}</Badge>
        {r.status === "pending" && r.waiting_for?.length ? <p className="mt-0.5 text-[11.5px] text-faint">With {r.waiting_for.join(", ")}</p> : null}</div>) },
  ];

  return (
    <div>
      <PageHeader eyebrow="Teaching" title="Leave requests" description={`Leave asked for by ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()}. Approved days show as leave in the register.`}
        actions={manager ? <Button variant="primary" icon={Plus} onClick={() => setRecordOpen(true)}>Record leave</Button> : undefined} />
      <div className="mb-4">
        <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }}
          items={[{ value: "mine", label: "Waiting for me", count: mineCount || undefined }, { value: "all", label: manager || can("attendance.view") ? "All requests" : `My ${term("sections").toLowerCase()}` }]} />
      </div>
      <FilterBar searchPlaceholder={`Search by ${term("student").toLowerCase()} name or admission no.`} onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: Object.entries(LEAVE_LABEL).map(([value, label]) => ({ value, label })) }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={!data} onRowClick={setViewing}
        rowActions={(r) => [{ label: "View details", icon: Eye, onSelect: () => setViewing(r) }]}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={CalendarX2} emptyTitle={tab === "mine" ? "Nothing waiting for you" : "No leave requests here"}
        emptyHint={tab === "mine" ? `Requests from ${term("guardians").toLowerCase()} of your ${term("section").toLowerCase()} appear here.` : "Try another status or search."} />
      <LeaveDetail row={viewing} onClose={() => setViewing(null)} manager={manager} onChanged={() => { setViewing(null); refresh(); }} />
      <RecordLeave open={recordOpen} onClose={() => setRecordOpen(false)} onSaved={() => { setRecordOpen(false); refresh(); }} />
    </div>
  );
}

function LeaveDetail({ row, onClose, manager, onChanged }: { row: LeaveRow | null; onClose: () => void; manager: boolean; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [full, setFull] = useState<LeaveRow | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFull(null); setComment("");
    if (row) api.get<LeaveRow>(`/student-attendance/leave/${row.uuid}`).then(setFull).catch(() => setFull(row));
  }, [row]);
  const r = full ?? row;
  async function decide(decision: "approve" | "reject") {
    if (!r) return;
    if (decision === "reject" && !comment.trim()) { toast.error("Add a comment saying why"); return; }
    setBusy(true);
    try {
      await api.post(`/student-attendance/leave/${r.uuid}/decide`, { decision, comment: comment.trim() || null });
      toast.success(decision === "approve" ? "Leave approved" : "Leave not approved");
      onChanged();
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!r) return;
    const ok = await confirm({ title: "Cancel this leave?", message: r.status === "approved" ? "Days already marked as leave go back to absent." : "The request is withdrawn.", confirmLabel: "Cancel leave", tone: "danger" });
    if (!ok) return;
    try { await api.post(`/student-attendance/leave/${r.uuid}/cancel`, {}); toast.success("Leave cancelled"); onChanged(); }
    catch (e) { toast.error("Couldn't cancel", { description: (e as Error).message }); }
  }
  return (
    <Modal open={!!row} onClose={onClose} busy={busy} size="md" title={r?.student_name ?? "Leave"} description={r?.section_label ?? undefined}
      leading={r ? <Avatar name={r.student_name ?? ""} size={36} /> : undefined}
      footerStart={manager && r && (r.status === "approved" || r.status === "pending") ? <Button variant="ghost" icon={X} onClick={cancel}>Cancel leave</Button> : undefined}
      footer={r?.can_decide ? <>
        <Button icon={X} onClick={() => decide("reject")} disabled={busy}>Don&apos;t approve</Button>
        <Button variant="primary" icon={Check} loading={busy} onClick={() => decide("approve")}>Approve</Button>
      </> : <ModalCancel>Close</ModalCancel>}>
      {r && (
        <div className="space-y-5">
          <KeyValue columns={2} items={[
            { label: "Dates", value: span(r) }, { label: "School days", value: String(r.days) },
            { label: "Status", value: <Badge tone={LEAVE_TONE[r.status]} dot>{LEAVE_LABEL[r.status]}</Badge> },
            { label: "Kind", value: r.status_code },
            { label: "Asked by", value: `${r.requested_by_name ?? ""}${r.requested_by_kind === "staff" ? " (office)" : ` (${r.requested_by_kind === "student" ? term("student").toLowerCase() : term("guardian").toLowerCase()})`}` },
            { label: "Asked on", value: r.created_at ? formatDateTime(r.created_at) : null },
            { label: "Reason", value: r.reason, span: 2 },
            ...(r.status === "pending" ? [{ label: "Waiting for", value: r.waiting_for?.join(", ") || "—", span: 2 as const }] : []),
            ...(r.decided_by_name ? [{ label: "Decided by", value: `${r.decided_by_name}${r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ""}`, span: 2 as const }] : []),
            ...(r.decision_note ? [{ label: "Note", value: r.decision_note, span: 2 as const }] : []),
          ]} />
          {r.attachments.length > 0 && (
            <div>
              <p className="mb-2 text-[12.5px] text-muted">Attachments</p>
              <ul className="space-y-1">{r.attachments.map((a) => (
                <li key={a.uuid}><a href={a.url ? (a.url.startsWith("/api/") ? `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "")}${a.url}` : a.url) : undefined} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13.5px] text-primary hover:underline"><Paperclip size={13} strokeWidth={1.4} />{a.name}</a></li>))}</ul>
            </div>
          )}
          {r.can_decide && (
            <Field label="Comment" hint="Needed when you don't approve. The family sees it.">
              <Textarea value={comment} onValueChange={setComment} rows={2} />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

function RecordLeave({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<number | null>(null);
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [kind, setKind] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [kinds, setKinds] = useState<AttStatus[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setStudent(null); setReason(""); setRange({ from: todayISO(), to: todayISO() });
    api.get<{ items: AttStatus[] }>("/student-attendance/statuses?all=true").then((r) => {
      const k = r.items.filter((s) => s.is_leave && s.active);
      setKinds(k); setKind(k[0]?.code ?? null);
    }).catch(() => {});
  }, [open]);
  const search = async (q: string): Promise<SelectOption<number>[]> => {
    const r = await api.get<{ items: { id: number; name: string; section_label: string | null; admission_no: string }[] }>(`/students?size=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    return r.items.map((s) => ({ value: s.id, label: s.name, description: [s.section_label, s.admission_no].filter(Boolean).join(" · ") }));
  };
  async function save() {
    if (!student || !range.from || !reason.trim()) { toast.error(`Pick the ${term("student").toLowerCase()}, dates and reason`); return; }
    setBusy(true);
    try {
      await api.post("/student-attendance/leave", { student_id: student, from_date: range.from, to_date: range.to || range.from, reason: reason.trim(), status_code: kind });
      toast.success("Leave recorded");
      onSaved();
    } catch (e) { toast.error("Couldn't record leave", { description: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="md" title="Record leave" description="For leave told to the office. It is approved at once and shows in the register."
      dirty={!!student || !!reason} footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Record leave</Button></>}>
      <div className="space-y-4">
        <Field label={term("student")} required><Select value={student} onChange={(v) => setStudent(v as number | null)} loadOptions={search} placeholder={`Search ${term("students").toLowerCase()}`} /></Field>
        <FormGrid columns={2}>
          <Field label="Dates" required><DateRangeInput value={range} onChange={setRange} /></Field>
          <Field label="Kind"><Select value={kind} onChange={(v) => setKind(v as string | null)} options={kinds.map((k) => ({ value: k.code, label: k.name }))} /></Field>
        </FormGrid>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={3} /></Field>
      </div>
    </Modal>
  );
}
