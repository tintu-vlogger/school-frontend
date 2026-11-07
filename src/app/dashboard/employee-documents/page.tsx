"use client";

/*
 * Employee documents across the company: what is waiting for a check, what is rejected,
 * and what expires soon. Row click opens the verify modal; the person opens their profile.
 * Data: GET /employees/documents?status=&expiry=&type_id=&q=
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Download, FileText, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, DataTable, FilterBar, type Column, type FilterValues } from "@/components/ui-kit";
import { ExpiryBadge, VERIFY_TONE, VerifyModal } from "@/components/people/documents";
import { ProfileModal } from "@/components/people/profile-modal";
import { day, downloadWithAuth, type DocumentRow } from "@/components/people/types";

export default function DocumentsPage() {
  return <Suspense fallback={null}><Documents /></Suspense>;
}

function Documents() {
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>((): FilterValues => {
    const s = params.get("status"), e = params.get("expiry");
    return { ...(s ? { status: [s] } : {}), ...(e ? { expiry: [e] } : {}) };
  });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [verify, setVerify] = useState<{ doc: DocumentRow; key: number } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const viewId = params.get("view");
  const setView = (uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("view", uuid); else sp.delete("view");
    router.replace(sp.toString() ? `${pathname}?${sp}` : pathname, { scroll: false });
  };

  useEffect(() => {
    api.getCached<{ items: { value: number; label: string; parent_id: number | null }[] }>("/masters/options/document_type?limit=200", 120)
      .then((r) => setTypes((r?.items ?? []).filter((x) => !x.parent_id).map((x) => ({ value: String(x.value), label: x.label })))).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) q.set("q", search);
    if (filters.status?.length) q.set("status", filters.status.join(","));
    if (filters.expiry?.[0]) q.set("expiry", filters.expiry[0]);
    if (filters.type?.[0]) q.set("type_id", filters.type[0]);
    return q.toString();
  }, [page, size, search, filters]);
  const key = `${query}|${nonce}`;
  const [result, setResult] = useState<{ key: string; rows: DocumentRow[]; total: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ items: DocumentRow[]; total: number }>(`/employees/documents?${query}`)
      .then((r) => { if (live) setResult({ key, rows: r.items, total: r.total }); })
      .catch((e) => { if (live) { setResult({ key, rows: [], total: 0 }); toast.error(e instanceof Error ? e.message : "Couldn't load documents"); } });
    return () => { live = false; };
  }, [key, query, toast]);

  const columns: Column<DocumentRow>[] = [
    { key: "who", header: "Employee", cell: (d) => d.employee ? (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={d.employee.name} src={d.employee.photo} size={32} />
        <div className="min-w-0"><p className="truncate text-ink">{d.employee.name}</p><p className="truncate font-mono text-[12px] text-faint">{d.employee.code}</p></div></div>) : "—" },
    { key: "type", header: "Document", cell: (d) => (
      <div className="flex min-w-0 items-center gap-2"><FileText size={15} strokeWidth={1.4} className="shrink-0 text-faint" />
        <div className="min-w-0"><p className="truncate text-ink/90">{d.document_type_name}</p>{d.document_number && <p className="truncate font-mono text-[12px] text-muted">{d.document_number}</p>}</div></div>) },
    { key: "issued", header: "Issued", hideBelow: "lg", cell: (d) => <span className="tabular text-muted">{day(d.issue_date) ?? "—"}</span> },
    { key: "expiry", header: "Expiry", hideBelow: "md", cell: (d) => d.expiry_date ? <ExpiryBadge d={d} /> : <span className="text-faint">—</span> },
    { key: "file", header: "File", hideBelow: "lg", cell: (d) => d.file ? <span className="text-muted">{d.file.filename}</span> : <span className="text-faint">Not uploaded</span> },
    { key: "status", header: "Status", cell: (d) => <Badge tone={VERIFY_TONE[d.verification_status]} dot>{d.verification_label}</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow="People" title="Employee documents" description="ID proofs, certificates and letters from every employee. Check new uploads and watch expiry dates." />
      <FilterBar
        searchPlaceholder="Search by person or document number"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting for check" }, { value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected" }] },
          { key: "expiry", label: "Expiry", options: [{ value: "expired", label: "Expired" }, { value: "30", label: "In 30 days" }, { value: "60", label: "In 60 days" }, { value: "90", label: "In 90 days" }] },
          { key: "type", label: "Kind", options: types },
        ]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        actions={result && <span className="text-[13px] text-faint tabular">{result.total} {result.total === 1 ? "document" : "documents"}</span>}
      />
      <DataTable
        rows={result?.rows ?? []}
        rowKey={(d) => d.uuid}
        columns={columns}
        loading={result?.key !== key}
        onRowClick={(d) => { setVerify({ doc: d, key: Date.now() }); setVerifyOpen(true); }}
        rowActions={(d) => [
          { label: "Verify", icon: BadgeCheck, onSelect: () => { setVerify({ doc: d, key: Date.now() }); setVerifyOpen(true); } },
          ...(d.file ? [{ label: "Download", icon: Download, onSelect: () => downloadWithAuth(`/employees/${d.employee!.uuid}/documents/${d.uuid}/file`, d.file!.filename).catch((e) => toast.error(e.message)) }] : []),
          ...(d.employee ? [{ label: "Open profile", icon: UserRound, onSelect: () => setView(d.employee!.uuid) }] : []),
        ]}
        pagination={{ page, size, total: result?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={FileText}
        emptyTitle="No documents match"
        emptyHint="Documents are added from each employee's profile."
      />
      {verify && verify.doc.employee && <VerifyModal key={verify.key} open={verifyOpen} doc={verify.doc} employeeUuid={verify.doc.employee.uuid}
        onClose={() => setVerifyOpen(false)} onSaved={() => { setVerifyOpen(false); setNonce((n) => n + 1); }} />}
      <ProfileModal uuid={viewId} onClose={() => setView(null)} onOpenPerson={setView} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
