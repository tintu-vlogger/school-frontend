"use client";

/*
 * Student directory: stats strip, FilterBar (class, section, status, house, gender) with search,
 * server-paginated DataTable. Row click opens the detail modal; Add opens the multi-step form;
 * Import reads a CSV/XLSX in the browser; Export downloads the filtered list as CSV.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, GraduationCap, Pencil, Plus, Upload, UserRoundPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { downloadFrom } from "@/components/workplace/files";
import {
  Avatar, Button, DataTable, FilterBar, StatCard, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, useList, useSectionOptions, type House, type Program } from "@/components/academics/shared";
import { STATUS_OPTIONS, StatusBadge, GENDERS, type StudentFull, type StudentRow } from "@/components/students/shared";
import { StudentFormModal } from "@/components/students/student-form";
import { StudentDetailModal } from "@/components/students/student-detail";
import { ImportStudentsModal } from "@/components/students/import-modal";

type Stats = { active: number; new_this_month: number; guardians: number; by_gender: Record<string, number>; by_status: Record<string, number> };
type Page = { items: StudentRow[]; total: number; page: number; size: number };

export default function StudentsPage() {
  const { term } = useInstitution();
  const { can } = useAccess();
  const canManage = can("students.manage");
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const programs = useList<Program>("/academics/programs").rows.filter((p) => p.active);
  const houses = useList<House>("/academics/houses").rows.filter((h) => h.active);
  const { sections } = useSectionOptions(null);
  const [viewUuid, setViewUuid] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [formFor, setFormFor] = useState<StudentFull | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    p.set("status", filters.status?.[0] ?? "");
    if (filters.program?.[0]) p.set("program_id", filters.program[0]);
    if (filters.section?.[0]) p.set("section_id", filters.section[0]);
    if (filters.house?.[0]) p.set("house_id", filters.house[0]);
    if (filters.gender?.[0]) p.set("gender", filters.gender[0]);
    return p.toString();
  }, [search, filters]);
  const key = `${query}&page=${page}&size=${size}&n=${nonce}`;

  useEffect(() => {
    let live = true;
    api.get<Page>(`/students?${query}&page=${page}&size=${size}`)
      .then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load the list", { description: errText(e) }); } });
    return () => { live = false; };
  }, [key, query, page, size, toast]);
  useEffect(() => {
    api.get<Stats>("/students/stats").then(setStats).catch(() => {});
  }, [nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const loading = data?.key !== key;
  const rows = data?.page.items ?? [];

  const openView = (r: { uuid: string }) => { setViewUuid(r.uuid); setViewOpen(true); };
  const openForm = (t: StudentFull | "new") => { setFormKey((k) => k + 1); setFormFor(t); setFormOpen(true); };
  async function editRow(r: StudentRow) {
    try { openForm(await api.get<StudentFull>(`/students/${r.uuid}`)); } catch (e) { toast.error("Couldn't open the record", { description: errText(e) }); }
  }
  async function exportCsv() {
    setExporting(true);
    try { await downloadFrom(`/students/export?${query}`, `${term("students").toLowerCase()}.csv`); }
    catch (e) { toast.error("Couldn't export", { description: errText(e) }); } finally { setExporting(false); }
  }

  const sectionChoices = sections.filter((s) => !filters.program?.[0] || String(s.program_id) === filters.program[0]);
  const columns: Column<StudentRow>[] = [
    {
      key: "name", header: term("student"), cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} src={r.photo_url} size={34} />
          <div className="min-w-0">
            <p className="truncate text-ink">{r.name}</p>
            <p className="truncate font-mono text-[12px] text-muted">{r.admission_no}</p>
          </div>
        </div>
      ),
    },
    { key: "class", header: `${term("program")} / ${term("section").toLowerCase()}`, cell: (r) => r.section_label ?? r.program_name ?? <span className="text-faint">Not enrolled</span> },
    { key: "roll", header: term("roll"), align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.roll_no ?? "—"}</span> },
    { key: "guardian", header: term("guardian"), hideBelow: "md", cell: (r) => r.guardian_name ? (
      <div className="min-w-0"><p className="truncate text-ink/80">{r.guardian_name}</p>{r.guardian_phone && <p className="text-[12.5px] text-muted">{r.guardian_phone}</p>}</div>
    ) : <span className="text-faint">—</span> },
    { key: "house", header: "House", hideBelow: "lg", cell: (r) => r.house_name ?? <span className="text-faint">—</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  const filtered = !!search || Object.entries(filters).some(([k, v]) => v.length && !(k === "status" && v[0] === "active"));
  const female = stats?.by_gender?.female ?? 0;
  const male = stats?.by_gender?.male ?? 0;
  return (
    <div>
      <PageHeader eyebrow={term("students")} title={term("students")}
        description={`Everyone enrolled, with their ${term("program").toLowerCase()}, ${term("guardians").toLowerCase()} and records.`}
        actions={<>
          <Button icon={Download} loading={exporting} onClick={exportCsv}>Export</Button>
          {canManage && <Button icon={Upload} onClick={() => setImportOpen(true)}>Import</Button>}
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Add {term("student").toLowerCase()}</Button>}
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Active ${term("students").toLowerCase()}`} value={stats?.active ?? "—"} icon={GraduationCap} />
        <StatCard label="New this month" value={stats?.new_this_month ?? "—"} icon={UserRoundPlus} hint="By admission date" />
        <StatCard label="Girls / boys" value={stats ? `${female} / ${male}` : "—"} icon={Users} />
        <StatCard label={term("guardians")} value={stats?.guardians ?? "—"} icon={Users} hint="On record" />
      </div>

      <FilterBar
        searchPlaceholder="Search by name, admission no., phone or email"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "program", label: term("program"), options: programs.map((p) => ({ value: String(p.id), label: p.name })) },
          { key: "section", label: term("section"), options: sectionChoices.map((s) => ({ value: String(s.id), label: s.label })) },
          { key: "status", label: "Status", options: STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })) },
          ...(houses.length ? [{ key: "house", label: "House", options: houses.map((h) => ({ value: String(h.id), label: h.name })) }] : []),
          { key: "gender", label: "Gender", options: GENDERS.map((o) => ({ value: String(o.value), label: o.label })) },
        ]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(r) => [
          { label: "View details", icon: Eye, onSelect: () => openView(r) },
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => editRow(r) }] : []),
        ]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={GraduationCap}
        emptyTitle={filtered ? `No ${term("students").toLowerCase()} match` : `No ${term("students").toLowerCase()} yet`}
        emptyHint={filtered ? "Try another search or clear the filters." : `Add ${term("students").toLowerCase()} one by one, or import them all at once from a spreadsheet.`}
        emptyAction={!filtered && canManage && (
          <div className="flex gap-2">
            <Button icon={Upload} onClick={() => setImportOpen(true)}>Import</Button>
            <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Add {term("student").toLowerCase()}</Button>
          </div>
        )}
      />

      <StudentDetailModal uuid={viewUuid} open={viewOpen} onClose={() => setViewOpen(false)} onChanged={refresh}
        onEdit={(s) => { setViewOpen(false); openForm(s); }} />
      <StudentFormModal key={formKey} open={formOpen} target={formFor} onClose={() => setFormOpen(false)}
        onSaved={(s) => {
          refresh();
          if (formFor !== "new") { setFormOpen(false); setViewUuid(s.uuid); setViewOpen(true); }
        }} />
      <ImportStudentsModal key={importOpen ? "open" : "closed"} open={importOpen} onClose={() => setImportOpen(false)} onDone={refresh} />
    </div>
  );
}
