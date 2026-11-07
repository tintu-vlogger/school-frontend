"use client";

/*
 * Company files: folders on the left (company, department and HR-only employee files),
 * the selected folder's files on the right. Also used for the personal locker (area="personal").
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Download, Eye, Folder as FolderIcon, FolderLock, FolderPlus, History, Pencil, Plus, Trash2, Upload, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import {
  Badge, Button, DataTable, DateInput, Field, FileDrop, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, Select,
  Skeleton, TextInput, Textarea, Toggle, formatBytes, formatDisplayDate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { fileHref, uploadFile } from "@/components/workplace/files";
import { AudiencePicker, FilePreview, audienceLabel, errText, loadDepartments, type Audience, type DocFile, type Folder } from "./shared";

type Page<T> = { items: T[]; total: number; page: number; size: number; can_add?: boolean };
const AREA_ICON = { company: FolderIcon, department: UsersRound, hr: FolderLock, personal: FolderLock };

export function FilesTab({ area = "files", canManage }: { area?: "files" | "personal"; canManage: boolean }) {
  const toast = useToast();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [current, setCurrent] = useState<Folder | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [data, setData] = useState<Page<DocFile> | null>(null);
  const [nonce, setNonce] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [folderForm, setFolderForm] = useState<Folder | "new" | null>(null);
  const confirm = useConfirm();

  const loadFolders = useCallback(() => {
    api.get<{ items: Folder[] }>(`/documents/folders${area === "personal" ? "?area=personal" : ""}`).then((r) => {
      const list = r.items.filter((f) => (area === "personal" ? f.area === "personal" : f.area !== "personal"));
      setFolders(list);
      setCurrent((c) => list.find((f) => f.uuid === c?.uuid) ?? list[0] ?? null);
    }).catch((e) => { setFolders([]); toast.error("Couldn't load folders", { description: errText(e) }); });
  }, [area, toast]);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  useEffect(() => {
    if (!current) return;
    let live = true;
    const p = new URLSearchParams({ folder: current.uuid, page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.state?.[0] === "archived") p.set("archived", "true");
    if (filters.state?.[0] === "expiring") p.set("expiring_days", "30");
    setData(null);
    api.get<Page<DocFile>>(`/documents/files?${p}`).then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) { setData({ items: [], total: 0, page: 1, size: 25 }); toast.error("Couldn't load files", { description: errText(e) }); } });
    return () => { live = false; };
  }, [current, page, q, filters, nonce, toast]);

  const refresh = () => { setNonce((n) => n + 1); loadFolders(); };
  const groups = useMemo(() => {
    const out: Record<string, Folder[]> = {};
    for (const f of folders ?? []) (out[f.area_label || f.area] ||= []).push(f);
    return Object.entries(out);
  }, [folders]);

  const columns: Column<DocFile>[] = [
    {
      key: "title", header: "File", sortable: true, sortValue: (f) => f.title,
      cell: (f) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{f.title}</p>
          <p className="truncate text-[12.5px] text-muted">
            {f.file?.name}{f.file ? ` · ${formatBytes(f.file.size)}` : ""}{f.employee_name ? ` · ${f.employee_name}` : ""}
          </p>
        </div>
      ),
    },
    { key: "version", header: "Version", hideBelow: "md", cell: (f) => <span className="tabular text-muted">v{f.version}</span> },
    ...(current?.area === "company" || current?.area === "department" ? [{ key: "aud", header: "Who sees it", hideBelow: "lg" as const, cell: (f: DocFile) => <span className="text-muted">{audienceLabel(f.audience)}</span> }] : []),
    {
      key: "exp", header: "Expires", hideBelow: "sm", sortable: true, sortValue: (f) => f.expires_on,
      cell: (f) => f.expires_on ? <span className={new Date(f.expires_on) < new Date() ? "text-rose-600" : "text-muted"}>{formatDisplayDate(f.expires_on)}</span> : <span className="text-faint">—</span>,
    },
    { key: "by", header: "Added", hideBelow: "lg", cell: (f) => <span className="text-muted">{formatDate(f.created_at)}{f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ""}</span> },
  ];

  async function archive(f: DocFile, undo = false) {
    if (!undo && !(await confirm({ title: `Archive ${f.title}?`, message: "It is hidden from everyone but kept, and can be restored.", confirmLabel: "Archive" }))) return;
    try { await api.post(`/documents/files/${f.uuid}/${undo ? "unarchive" : "archive"}`); toast.success(undo ? "File restored" : "File archived"); setViewing(null); refresh(); }
    catch (e) { toast.error("Couldn't change the file", { description: errText(e) }); }
  }

  async function removeFolder(f: Folder) {
    if (!(await confirm({ title: `Remove ${f.name}?`, message: "Only empty folders can be removed.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/documents/folders/${f.uuid}`); toast.success("Folder removed"); refresh(); }
    catch (e) { toast.error("Couldn't remove the folder", { description: errText(e) }); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
      <aside className="space-y-5">
        {!folders ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : groups.map(([label, list]) => (
          <div key={label}>
            <p className="mb-1.5 px-2 text-[11.5px] uppercase tracking-[0.07em] text-faint">{area === "personal" ? "Private to you" : label}</p>
            <ul className="space-y-0.5">
              {list.map((f) => {
                const Icon = AREA_ICON[f.area] ?? FolderIcon;
                const active = current?.uuid === f.uuid;
                return (
                  <li key={f.uuid}>
                    <button type="button" onClick={() => { setCurrent(f); setPage(1); }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${active ? "bg-primary-soft/70 text-primary" : "text-ink hover:bg-sunken"}`}>
                      <Icon size={16} strokeWidth={1.4} className={active ? "text-primary" : "text-muted"} />
                      <span className="min-w-0 flex-1 truncate">{f.name}{f.department_name ? <span className="text-faint"> · {f.department_name}</span> : null}</span>
                      <span className="tabular text-[12px] text-faint">{f.file_count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {canManage && area !== "personal" && <Button variant="ghost" size="sm" icon={FolderPlus} onClick={() => setFolderForm("new")}>New folder</Button>}
      </aside>

      <section className="min-w-0">
        {current && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-light text-ink">{current.name}</h2>
              <p className="text-[13px] text-muted">{current.description || (current.area === "personal" ? "Only you can open these files. HR sees only how much space you use." : current.area === "hr" ? "Confidential employee files. Employees see their own files here when they are shared with them." : "")}</p>
            </div>
            <div className="flex gap-2">
              {canManage && !current.is_system && current.area !== "personal" && <>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setFolderForm(current)}>Rename</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeFolder(current)}>Remove</Button>
              </>}
              {data?.can_add && <Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload</Button>}
            </div>
          </div>
        )}
        <FilterBar searchPlaceholder="Search files" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters}
          onChange={(v) => { setFilters(v); setPage(1); }}
          filters={[{ key: "state", label: "Show", options: [{ value: "expiring", label: "Expiring in 30 days" }, { value: "archived", label: "Archived" }] }]} />
        <DataTable rows={data?.items ?? []} rowKey={(f) => f.uuid} columns={columns} loading={!data && !!current}
          onRowClick={(f) => setViewing(f.uuid)}
          rowActions={(f) => [
            { label: "Open", icon: Eye, onSelect: () => setViewing(f.uuid) },
            ...(f.file?.download_url ? [{ label: "Download", icon: Download, onSelect: () => window.open(fileHref(f.file!.download_url), "_blank") }] : []),
            ...(data?.can_add ? ["separator" as const, f.archived ? { label: "Restore", icon: ArchiveRestore, onSelect: () => archive(f, true) } : { label: "Archive", icon: Archive, onSelect: () => archive(f) }] : []),
          ]}
          pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
          emptyIcon={FolderIcon} emptyTitle={q || filters.state?.length ? "No files match" : "No files here yet"}
          emptyHint={data?.can_add ? (area === "personal" ? "Keep your own copies of certificates, IDs and other papers here." : "Upload handbooks, forms or anything people need.") : undefined}
          emptyAction={data?.can_add && !q ? <Button variant="primary" icon={Plus} onClick={() => setUploading(true)}>Upload a file</Button> : undefined} />
      </section>

      {current && <UploadModal open={uploading} folder={current} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); refresh(); }} />}
      <FileDetailModal uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} onArchive={archive} />
      {folderForm && <FolderModal target={folderForm} onClose={() => setFolderForm(null)} onSaved={() => { setFolderForm(null); refresh(); }} />}
    </div>
  );
}

function UploadModal({ open, folder, onClose, onSaved }: { open: boolean; folder: Folder; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [expires, setExpires] = useState("");
  const [employee, setEmployee] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [download, setDownload] = useState(true);
  const [audience, setAudience] = useState<Audience>({ all: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setFiles([]); setTitle(""); setDesc(""); setExpires(""); setEmployee(null); setAudience({ all: true }); } }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) { toast.error("Pick a file"); return; }
    if (folder.area === "hr" && !employee) { toast.error("Pick the employee this file is about"); return; }
    setSaving(true);
    try {
      for (const f of files) {
        const ref = await uploadFile(f);
        await api.post("/documents/files", {
          folder_uuid: folder.uuid, upload_uuid: ref.uuid, title: files.length === 1 && title.trim() ? title.trim() : f.name.replace(/\.[^.]+$/, ""),
          description: desc.trim() || null, expires_on: expires || null, employee_id: employee, visible_to_employee: visible,
          allow_download: download, audience,
        });
      }
      toast.success(files.length > 1 ? `${files.length} files added` : "File added");
      onSaved();
    } catch (err) { toast.error("Couldn't upload", { description: errText(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={files.length > 0} title={`Upload to ${folder.name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="upload-form" loading={saving}>Upload</Button></>}>
      <form id="upload-form" onSubmit={save} className="space-y-5" noValidate>
        <FileDrop value={files} onChange={setFiles} multiple maxSizeMb={10} hint="PDF, Office files or images, up to 10 MB each" />
        <FormGrid>
          {files.length <= 1 && <Field label="Title" aside="Optional"><TextInput value={title} onValueChange={setTitle} placeholder="Taken from the file name" /></Field>}
          <Field label="Expires on" aside="Optional" hint="We remind the uploader 30 days before"><DateInput value={expires} onChange={setExpires} clearable /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={desc} onValueChange={setDesc} rows={2} /></Field>
          {folder.area === "hr" && <>
            <Field label="Employee" required><Select value={employee} onChange={setEmployee} loadOptions={loadEmployees} placeholder="Search people" /></Field>
            <Field label=" "><Toggle checked={visible} onChange={setVisible} label="Show to the employee" description="In their My documents" /></Field>
          </>}
        </FormGrid>
        {(folder.area === "company" || folder.area === "department") && (
          <Field label="Who can see it"><AudiencePicker value={audience} onChange={setAudience} /></Field>
        )}
        {folder.area !== "personal" && <Toggle checked={download} onChange={setDownload} label="Allow download" description="Otherwise people can only view it" />}
      </form>
    </Modal>
  );
}

function FileDetailModal({ uuid, onClose, onChanged, onArchive }: { uuid: string | null; onClose: () => void; onChanged: () => void; onArchive: (f: DocFile, undo?: boolean) => void }) {
  const toast = useToast();
  const [f, setF] = useState<DocFile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", expires_on: "", audience: { all: true } as Audience });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!uuid) return;
    api.get<DocFile>(`/documents/files/${uuid}`).then(setF).catch((e) => toast.error("Couldn't open the file", { description: errText(e) }));
  }, [uuid, toast]);
  useEffect(() => { setF(null); setEditing(false); load(); }, [load]);

  async function newVersion(file: File | undefined) {
    if (!file || !f) return;
    setBusy(true);
    try { const ref = await uploadFile(file); setF(await api.post<DocFile>(`/documents/files/${f.uuid}/versions`, { upload_uuid: ref.uuid })); toast.success("New version added"); onChanged(); }
    catch (e) { toast.error("Couldn't add the version", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  async function restore(v: number) {
    if (!f) return;
    try { setF(await api.post<DocFile>(`/documents/files/${f.uuid}/restore`, { version: v })); toast.success(`Version ${v} restored as the latest`); onChanged(); }
    catch (e) { toast.error("Couldn't restore", { description: errText(e) }); }
  }
  async function save() {
    if (!f) return;
    setBusy(true);
    try {
      setF(await api.put<DocFile>(`/documents/files/${f.uuid}`, { title: draft.title, description: draft.description || null, expires_on: draft.expires_on || null,
        ...(f.area === "company" || f.area === "department" ? { audience: draft.audience } : {}) }));
      setEditing(false); toast.success("Saved"); onChanged();
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy} title={f?.title ?? "File"}
      description={f ? `${f.folder_name} · version ${f.version}${f.employee_name ? ` · ${f.employee_name}` : ""}` : undefined}
      headerActions={f?.can_edit && !editing && <Button size="sm" icon={Pencil} onClick={() => { setDraft({ title: f.title, description: f.description ?? "", expires_on: f.expires_on ?? "", audience: f.audience }); setEditing(true); }}>Edit</Button>}
      footer={f && <>
        {f.can_edit && <Button icon={f.archived ? ArchiveRestore : Archive} onClick={() => onArchive(f, f.archived)}>{f.archived ? "Restore" : "Archive"}</Button>}
        {f.file?.download_url && <a href={fileHref(f.file.download_url)} className="inline-flex"><Button variant="primary" icon={Download} type="button">Download</Button></a>}
      </>}>
      {!f ? <Skeleton className="h-[420px] w-full" /> : editing ? (
        <div className="space-y-4">
          <FormGrid>
            <Field label="Title" required><TextInput value={draft.title} onValueChange={(v) => setDraft({ ...draft, title: v })} /></Field>
            <Field label="Expires on"><DateInput value={draft.expires_on} onChange={(v) => setDraft({ ...draft, expires_on: v })} clearable /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={draft.description} onValueChange={(v) => setDraft({ ...draft, description: v })} rows={2} /></Field>
          </FormGrid>
          {(f.area === "company" || f.area === "department") && <Field label="Who can see it"><AudiencePicker value={draft.audience} onChange={(a) => setDraft({ ...draft, audience: a })} /></Field>}
          <div className="flex justify-end gap-2"><Button onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <FilePreview file={f.file} height={540} />
          <div>
            <KeyValue columns={1} items={[
              { label: "Description", value: f.description },
              { label: "Who sees it", value: f.area === "hr" ? (f.visible_to_employee ? "HR and the employee" : "HR only") : f.area === "personal" ? "Only you" : audienceLabel(f.audience) },
              { label: "Expires", value: f.expires_on ? formatDisplayDate(f.expires_on) : null },
              { label: "Added by", value: f.uploaded_by_name },
              { label: "Status", value: f.archived ? <Badge>Archived</Badge> : <Badge tone="good" dot>Active</Badge> },
            ]} />
            <Section title="Versions" className="mt-6 border-t border-line" action={f.can_edit && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-primary hover:underline">
                <Upload size={14} strokeWidth={1.4} /> New version
                <input type="file" hidden onChange={(e) => newVersion(e.target.files?.[0])} />
              </label>)}>
              <ul className="space-y-2">
                {(f.versions ?? []).map((v) => (
                  <li key={v.version} className="flex items-start gap-2.5 text-[13px]">
                    <History size={14} strokeWidth={1.4} className="mt-0.5 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink">v{v.version}{v.version === f.version ? <span className="text-faint"> · current</span> : null}</p>
                      <p className="truncate text-[12px] text-muted">{v.note || v.file?.name} · {formatDate(v.created_at)}</p>
                    </div>
                    {v.file?.url && <a className="text-[12.5px] text-primary hover:underline" href={fileHref(v.file.url)} target="_blank" rel="noreferrer">Open</a>}
                    {f.can_edit && v.version !== f.version && <button type="button" className="text-[12.5px] text-muted hover:text-ink" onClick={() => restore(v.version)}>Restore</button>}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </Modal>
  );
}

function FolderModal({ target, onClose, onSaved }: { target: Folder | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const edit = target === "new" ? null : target;
  const [name, setName] = useState(edit?.name ?? "");
  const [area, setArea] = useState<string>(edit?.area ?? "company");
  const [dept, setDept] = useState<number | null>(edit?.department_id ?? null);
  const [desc, setDesc] = useState(edit?.description ?? "");
  const [saving, setSaving] = useState(false);
  const areas: SelectOption<string>[] = [{ value: "company", label: "Company files", description: "Shared with chosen people" },
    { value: "department", label: "Department files", description: "For one department" }, { value: "hr", label: "Employee files", description: "HR only" }];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, area, department_id: area === "department" ? dept : null, description: desc || null };
      if (edit) await api.put(`/documents/folders/${edit.uuid}`, body); else await api.post("/documents/folders", body);
      toast.success(edit ? "Folder saved" : "Folder added"); onSaved();
    } catch (err) { toast.error("Couldn't save the folder", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={edit ? `Rename ${edit.name}` : "New folder"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="folder-form" loading={saving}>Save</Button></>}>
      <form id="folder-form" onSubmit={save} className="space-y-4" noValidate>
        <Field label="Name" required><TextInput autoFocusInModal value={name} onValueChange={setName} placeholder="e.g. Travel forms" /></Field>
        {!edit && <Field label="Kind"><Select value={area} onChange={(v) => setArea(v ?? "company")} options={areas} /></Field>}
        {area === "department" && <Field label="Department" required><Select value={dept} onChange={setDept} loadOptions={loadDepartments} /></Field>}
        <Field label="Description" aside="Optional"><Textarea value={desc} onValueChange={setDesc} rows={2} /></Field>
      </form>
    </Modal>
  );
}
