"use client";

/*
 * Catalogue: every title with its copies. Row click opens the title's details (copies,
 * holds, labels); "Add title" opens the form, which can fill itself from an ISBN.
 */
import { useMemo, useState } from "react";
import { Archive, BookPlus, Eye, Pencil, Plus, Printer, QrCode, ScanBarcode, Search, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { downloadWithAuth } from "@/components/people/types";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Menu, Modal, ModalCancel, NumberInput, Section,
  Select, TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  CopyStatus, Cover, KIND_LABEL, errMsg, inr, useGet, type Book, type BookDetail, type Copy, type Named, type Page,
} from "./common";

const KINDS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

export function CatalogueTab({ canManage }: { canManage: boolean }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const cats = useGet<Page<Named>>("/library/categories?all=true&active=true");
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) params.set("q", q);
  if (filters.category?.[0]) params.set("category_id", filters.category[0]);
  if (filters.kind?.[0]) params.set("kind", filters.kind[0]);
  if (filters.availability?.[0]) params.set("availability", filters.availability[0]);
  const list = useGet<Page<Book>>(`/library/books?${params}`);
  const [viewing, setViewing] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [form, setForm] = useState<{ open: boolean; book: Book | null; key: number }>({ open: false, book: null, key: 0 });
  const openForm = (book: Book | null) => setForm((f) => ({ open: true, book, key: f.key + 1 }));
  const catOptions = (cats.data?.items ?? []).map((c) => ({ value: String(c.id), label: c.name }));

  const columns: Column<Book>[] = [
    {
      key: "title", header: "Title", cell: (b) => (
        <div className="flex min-w-0 items-center gap-3">
          <Cover url={b.cover_url} title={b.title} size={30} />
          <div className="min-w-0">
            <p className="truncate text-ink">{b.title}</p>
            <p className="truncate text-[12.5px] text-muted">{b.authors || "Unknown author"}</p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", hideBelow: "md", cell: (b) => b.category_name || <span className="text-faint">—</span> },
    { key: "shelf", header: "Shelf", hideBelow: "md", cell: (b) => b.shelf ? <span className="font-mono text-[12.5px] text-muted">{b.shelf}</span> : <span className="text-faint">—</span> },
    {
      key: "copies", header: "On shelf", align: "right", cell: (b) => b.reference_only ? <Badge tone="neutral">Reference</Badge> : (
        <span className={`tabular ${b.available ? "text-ink" : "text-rose-700"}`}>{b.available}<span className="text-faint"> / {b.copies}</span></span>
      ),
    },
  ];
  const filtered = !!q || Object.values(filters).some((v) => v?.length);

  return (
    <div>
      <FilterBar
        searchPlaceholder="Search title, author, ISBN or accession no."
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "category", label: "Category", options: catOptions },
          { key: "kind", label: "Type", options: KINDS },
          { key: "availability", label: "Availability", options: [{ value: "available", label: "On shelf" }, { value: "out", label: "All copies out" }] },
        ]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add title</Button> : undefined}
      />
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={(b) => b.uuid}
        columns={columns}
        loading={list.loading}
        onRowClick={(b) => { setViewing(b.uuid); setViewOpen(true); }}
        rowActions={(b) => [
          { label: "View details", icon: Eye, onSelect: () => { setViewing(b.uuid); setViewOpen(true); } },
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(b) }] : []),
        ]}
        pagination={{ page, size, total: list.data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Search}
        emptyTitle={filtered ? "No titles match" : "The catalogue is empty"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add your first title. Type an ISBN to fill in the details."}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add title</Button>}
      />
      <BookDetailModal uuid={viewing} open={viewOpen} onClose={() => setViewOpen(false)} canManage={canManage}
        onEdit={(b) => { setViewOpen(false); openForm(b); }} onChanged={list.reload} />
      <BookFormModal key={form.key} open={form.open} book={form.book} categories={catOptions}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(uuid) => { setForm((f) => ({ ...f, open: false })); list.reload(); if (uuid) { setViewing(uuid); setViewOpen(true); } }} />
    </div>
  );
}

/* ── Add / edit a title ──────────────────────────────────────────── */

type Draft = {
  title: string; subtitle: string; authors: string; isbn: string; publisher: string; edition: string; year: number | null;
  category_id: string | null; subject: string; language: string; pages: number | null; shelf: string; cover_url: string;
  description: string; kind: string; price: number | null; reference_only: boolean; copies: number | null; acquired_on: string; source: string;
};

function BookFormModal({ open, book, categories, onClose, onSaved }: {
  open: boolean; book: Book | null; categories: { value: string; label: string }[]; onClose: () => void; onSaved: (uuid?: string) => void;
}) {
  const toast = useToast();
  const initial: Draft = useMemo(() => ({
    title: book?.title ?? "", subtitle: book?.subtitle ?? "", authors: book?.authors ?? "", isbn: book?.isbn ?? "",
    publisher: book?.publisher ?? "", edition: book?.edition ?? "", year: book?.year ?? null,
    category_id: book?.category_id ? String(book.category_id) : null, subject: book?.subject ?? "", language: book?.language ?? "English",
    pages: book?.pages ?? null, shelf: book?.shelf ?? "", cover_url: book?.cover_url ?? "", description: book?.description ?? "",
    kind: book?.kind ?? "book", price: book?.price ? Number(book.price) : null, reference_only: book?.reference_only ?? false,
    copies: 1, acquired_on: "", source: "",
  }), [book]);
  const [v, setV] = useState<Draft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const set = <K extends keyof Draft>(k: K, x: Draft[K]) => setV((d) => ({ ...d, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function lookup() {
    if (!v.isbn.trim()) { toast.info("Type an ISBN first"); return; }
    setLooking(true);
    try {
      const r = await api.get<Partial<Record<keyof Draft, string | number | null>>>(`/library/isbn/${encodeURIComponent(v.isbn.trim())}`);
      setV((d) => ({
        ...d, isbn: String(r.isbn ?? d.isbn), title: String(r.title ?? d.title), subtitle: String(r.subtitle ?? d.subtitle),
        authors: String(r.authors ?? d.authors), publisher: String(r.publisher ?? d.publisher), year: (r.year as number) ?? d.year,
        pages: (r.pages as number) ?? d.pages, subject: String(r.subject ?? d.subject), cover_url: String(r.cover_url ?? d.cover_url),
      }));
      toast.success("Details filled from Open Library");
    } catch (e) {
      toast.error("No details found", { description: errMsg(e) });
    } finally { setLooking(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) { setError("Give the title"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: v.title.trim(), subtitle: v.subtitle || null, authors: v.authors || null, isbn: v.isbn || null, publisher: v.publisher || null,
        edition: v.edition || null, year: v.year, category_id: v.category_id ? Number(v.category_id) : null, subject: v.subject || null,
        language: v.language || null, pages: v.pages, shelf: v.shelf || null, cover_url: v.cover_url || null, description: v.description || null,
        kind: v.kind, price: v.price === null ? null : v.price.toFixed(2), reference_only: v.reference_only || v.kind === "reference",
      };
      if (book) {
        await api.put(`/library/books/${book.uuid}`, body);
        toast.success("Title updated");
        onSaved();
      } else {
        const r = await api.post<Book>("/library/books", { ...body, copies: v.copies ?? 0, acquired_on: v.acquired_on || null, source: v.source || null });
        toast.success("Title added", { description: `${v.copies ?? 0} ${v.copies === 1 ? "copy" : "copies"} with accession numbers` });
        onSaved(r.uuid);
      }
    } catch (err) {
      toast.error("Couldn't save the title", { description: errMsg(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={book ? `Edit ${book.title}` : "Add title"}
      description={book ? undefined : "Type the ISBN and press Look up to fill in the details."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="book-form" loading={saving}>{book ? "Save changes" : "Add title"}</Button></>}>
      <form id="book-form" onSubmit={submit} noValidate className="space-y-6">
        <FormGrid>
          <Field label="ISBN" aside="Optional" className="sm:col-span-2">
            <div className="flex gap-2">
              <TextInput value={v.isbn} onValueChange={(x) => set("isbn", x)} placeholder="978…" leading={ScanBarcode} className="flex-1 font-mono" />
              <Button type="button" icon={Search} loading={looking} onClick={lookup}>Look up</Button>
            </div>
          </Field>
          <Field label="Title" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.title} onValueChange={(x) => { set("title", x); setError(""); }} />
          </Field>
          <Field label="Subtitle" aside="Optional"><TextInput value={v.subtitle} onValueChange={(x) => set("subtitle", x)} /></Field>
          <Field label="Authors" hint="Separate names with commas"><TextInput value={v.authors} onValueChange={(x) => set("authors", x)} /></Field>
          <Field label="Publisher"><TextInput value={v.publisher} onValueChange={(x) => set("publisher", x)} /></Field>
          <Field label="Edition"><TextInput value={v.edition} onValueChange={(x) => set("edition", x)} placeholder="e.g. 3rd" /></Field>
          <Field label="Year"><NumberInput value={v.year} onChange={(x) => set("year", x)} min={1000} max={2200} /></Field>
          <Field label="Pages"><NumberInput value={v.pages} onChange={(x) => set("pages", x)} min={1} /></Field>
          <Field label="Category">
            <Select value={v.category_id} onChange={(x) => set("category_id", x)} options={categories} clearable placeholder="Pick a category" />
          </Field>
          <Field label="Type"><Select value={v.kind} onChange={(x) => set("kind", x || "book")} options={KINDS} /></Field>
          <Field label="Subject"><TextInput value={v.subject} onValueChange={(x) => set("subject", x)} /></Field>
          <Field label="Language"><TextInput value={v.language} onValueChange={(x) => set("language", x)} /></Field>
          <Field label="Shelf" hint="Where the copies are kept"><TextInput value={v.shelf} onValueChange={(x) => set("shelf", x)} placeholder="e.g. F-2" className="font-mono" /></Field>
          <Field label="Price" hint="Used for lost-book fines"><NumberInput value={v.price} onChange={(x) => set("price", x)} min={0} step={10} suffix="₹" /></Field>
          <Field label="Cover image link" aside="Optional" className="sm:col-span-2"><TextInput value={v.cover_url} onValueChange={(x) => set("cover_url", x)} placeholder="https://…" /></Field>
          <div className="sm:col-span-2">
            <Toggle checked={v.reference_only || v.kind === "reference"} onChange={(x) => set("reference_only", x)}
              label="Reference only" description="Read in the library; can't be taken out" />
          </div>
          <Field label="Description" aside="Optional" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={3} /></Field>
        </FormGrid>
        {!book && (
          <FormGrid columns={3}>
            <Field label="Copies" hint="Each gets an accession number"><NumberInput value={v.copies} onChange={(x) => set("copies", x)} min={0} max={200} /></Field>
            <Field label="Received on" aside="Optional"><DateInput value={v.acquired_on} onChange={(x) => set("acquired_on", x)} clearable /></Field>
            <Field label="Source" aside="Optional"><TextInput value={v.source} onValueChange={(x) => set("source", x)} placeholder="Purchase, donation…" /></Field>
          </FormGrid>
        )}
      </form>
    </Modal>
  );
}

/* ── Title details ───────────────────────────────────────────────── */

const COPY_STATUSES = [
  { value: "available", label: "On shelf" }, { value: "damaged", label: "Damaged" }, { value: "repair", label: "In repair" },
  { value: "withdrawn", label: "Withdrawn" }, { value: "lost", label: "Lost" },
];

function BookDetailModal({ uuid, open, onClose, canManage, onEdit, onChanged }: {
  uuid: string | null; open: boolean; onClose: () => void; canManage: boolean; onEdit: (b: Book) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const d = useGet<BookDetail>(uuid && open ? `/library/books/${uuid}` : null);
  const b = d.data && d.data.uuid === uuid ? d.data : null;
  const [adding, setAdding] = useState(false);
  const [editCopy, setEditCopy] = useState<Copy | null>(null);
  const changed = () => { d.reload(); onChanged(); };

  async function labels(kind: "barcode" | "qr") {
    if (!b) return;
    try { await downloadWithAuth(`/library/labels.pdf?book_uuid=${b.uuid}&kind=${kind}`, "labels.pdf", true); }
    catch (e) { toast.error("Couldn't make the labels", { description: errMsg(e) }); }
  }
  async function archive() {
    if (!b) return;
    if (!(await confirm({ title: `Remove ${b.title}?`, message: "It disappears from the catalogue. Loan history is kept.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/library/books/${b.uuid}`); toast.success("Removed from the catalogue"); onClose(); onChanged(); }
    catch (e) { toast.error("Couldn't remove it", { description: errMsg(e) }); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={b?.title ?? "Loading…"} description={b?.authors || undefined}
      leading={b && <Cover url={b.cover_url} title={b.title} size={34} />}
      headerActions={b && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(b)}>Edit</Button>}
      footerStart={b && canManage && <Button variant="ghost" icon={Archive} onClick={archive}>Remove title</Button>}
      footer={b && (
        <div className="flex flex-wrap gap-2">
          <Menu label="Print labels" align="end" trigger={<span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13.5px] text-ink hover:bg-sunken/60"><Printer size={15} strokeWidth={1.4} />Print labels</span>}
            items={[{ label: "Barcode labels", icon: ScanBarcode, onSelect: () => labels("barcode") }, { label: "QR code labels", icon: QrCode, onSelect: () => labels("qr") }]} />
          {canManage && <Button variant="primary" icon={BookPlus} onClick={() => setAdding(true)}>Add copies</Button>}
        </div>
      )}>
      {!b ? <p className="py-10 text-center text-[13.5px] text-faint">Loading…</p> : (
        <>
          <Section title="About this title">
            <KeyValue columns={3} items={[
              { label: "ISBN", value: b.isbn && <span className="font-mono">{b.isbn}</span> },
              { label: "Publisher", value: [b.publisher, b.year].filter(Boolean).join(", ") },
              { label: "Edition", value: b.edition },
              { label: "Category", value: b.category_name },
              { label: "Shelf", value: b.shelf && <span className="font-mono">{b.shelf}</span> },
              { label: "Type", value: b.reference_only ? "Reference only" : KIND_LABEL[b.kind] ?? b.kind },
              { label: "Language", value: b.language },
              { label: "Price", value: b.price && inr(b.price) },
              { label: "Times borrowed", value: <span className="tabular">{b.times_borrowed}</span> },
              ...(b.description ? [{ label: "Description", value: b.description, span: 3 as const }] : []),
            ]} />
          </Section>
          <Section title="Copies" description={`${b.available} of ${b.copies} on the shelf`} className="border-t border-line">
            {b.copy_list.length === 0 ? <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">No copies yet. Add copies to give them accession numbers.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {b.copy_list.map((c) => (
                  <li key={c.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <span className="w-28 font-mono text-[13px] text-ink">{c.accession_no}</span>
                    <CopyStatus status={c.status} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                      {c.loan ? <>With {c.loan.member} · due {formatDate(c.loan.due_on)}</> : [c.condition && `Condition ${c.condition}`, c.shelf && `Shelf ${c.shelf}`].filter(Boolean).join(" · ")}
                    </span>
                    {canManage && c.status !== "issued" && c.status !== "on_hold" && (
                      <Button size="sm" variant="ghost" icon={Wrench} onClick={() => setEditCopy(c)}>Change</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {b.holds.length > 0 && (
            <Section title="Waiting list" className="border-t border-line">
              <ul className="divide-y divide-line rounded-xl border border-line">
                {b.holds.map((h, i) => (
                  <li key={h.uuid} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="tabular w-5 text-faint">{i + 1}</span>
                    <span className="flex-1 text-ink">{h.member_name}</span>
                    {h.status === "ready" ? <Badge tone="accent">Ready · {h.accession_no}</Badge> : <Badge tone="neutral">Waiting</Badge>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {b && <AddCopiesModal open={adding} book={b} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
      <CopyModal copy={editCopy} onClose={() => setEditCopy(null)} onSaved={() => { setEditCopy(null); changed(); }} />
    </Modal>
  );
}

function AddCopiesModal({ open, book, onClose, onSaved }: { open: boolean; book: BookDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [count, setCount] = useState<number | null>(1);
  const [numbers, setNumbers] = useState("");
  const [acquired, setAcquired] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const list = numbers.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
      const r = await api.post<Copy[]>(`/library/books/${book.uuid}/copies`, { count: Math.max(count ?? 1, list.length || 1), accession_nos: list, acquired_on: acquired || null, source: source || null });
      toast.success(`${r.length} ${r.length === 1 ? "copy" : "copies"} added`, { description: r.map((c) => c.accession_no).join(", ") });
      onSaved();
    } catch (err) { toast.error("Couldn't add copies", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Add copies" description={book.title} zIndex={70}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="copies-form" loading={saving}>Add</Button></>}>
      <form id="copies-form" onSubmit={submit} className="space-y-4">
        <Field label="How many"><NumberInput value={count} onChange={setCount} min={1} max={200} /></Field>
        <Field label="Accession numbers" aside="Optional" hint="Leave empty to number them automatically">
          <Textarea value={numbers} onValueChange={setNumbers} rows={2} className="font-mono" />
        </Field>
        <Field label="Received on" aside="Optional"><DateInput value={acquired} onChange={setAcquired} clearable /></Field>
        <Field label="Source" aside="Optional"><TextInput value={source} onValueChange={setSource} placeholder="Purchase, donation…" /></Field>
      </form>
    </Modal>
  );
}

function CopyModal({ copy, onClose, onSaved }: { copy: Copy | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [shelf, setShelf] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cur = {
    status: status ?? copy?.status ?? "available", condition: condition ?? copy?.condition ?? "good",
    shelf: shelf ?? copy?.shelf ?? "", notes: notes ?? copy?.notes ?? "",
  };
  const close = () => { setStatus(null); setCondition(null); setShelf(null); setNotes(null); onClose(); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!copy) return;
    setSaving(true);
    try {
      await api.put(`/library/copies/${copy.uuid}`, { status: cur.status, condition: cur.condition, shelf: cur.shelf || null, notes: cur.notes || null });
      toast.success("Copy updated");
      setStatus(null); setCondition(null); setShelf(null); setNotes(null);
      onSaved();
    } catch (err) { toast.error("Couldn't update the copy", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!copy} onClose={close} size="sm" busy={saving} title={copy ? `Copy ${copy.accession_no}` : ""} zIndex={70}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="copy-form" loading={saving}>Save</Button></>}>
      <form id="copy-form" onSubmit={submit} className="space-y-4">
        <Field label="Status"><Select value={cur.status} onChange={(x) => setStatus(x)} options={COPY_STATUSES} /></Field>
        <Field label="Condition">
          <Select value={cur.condition} onChange={(x) => setCondition(x)} options={[{ value: "new", label: "New" }, { value: "good", label: "Good" }, { value: "fair", label: "Fair" }, { value: "poor", label: "Poor" }]} />
        </Field>
        <Field label="Shelf" hint="Leave empty to use the title's shelf"><TextInput value={cur.shelf} onValueChange={setShelf} className="font-mono" /></Field>
        <Field label="Notes"><Textarea value={cur.notes} onValueChange={setNotes} rows={2} /></Field>
      </form>
    </Modal>
  );
}
