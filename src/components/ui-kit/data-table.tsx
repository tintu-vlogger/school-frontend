"use client";

/*
 * DataTable: the list view for every entity page.
 *
 *   <DataTable
 *     rows={page.items} rowKey={(r) => r.uuid} loading={loading}
 *     columns={[
 *       { key: "name", header: "Name", cell: (r) => r.name, sortable: true, sortValue: (r) => r.name },
 *       { key: "dept", header: "Department", cell: (r) => r.dept ?? "—", hideBelow: "md" },
 *     ]}
 *     onRowClick={(r) => openDetails(r)}                        // row click opens the detail modal
 *     rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => edit(r) }, "separator", { label: "Delete", danger: true, onSelect: () => del(r) }]}
 *     selectable bulkActions={[{ label: "Deactivate", icon: Ban, onSelect: (rows) => ... }]}
 *     pagination={{ page, size, total, onPageChange: setPage, onSizeChange: setSize }}
 *     emptyTitle="No employees yet" emptyHint="Add your first employee" emptyAction={<Button .../>}
 *   />
 *
 * - Sorting: client-side via `sortValue` unless you pass `sort` + `onSortChange` (server sort).
 * - Pagination is 1-based and server-driven ({ page, size, total }); for client-side lists
 *   slice with `paginate(rows, page, size)`.
 * - Selection is internal unless you pass `selected` + `onSelectedChange` (keys). The bulk
 *   action bar floats at the bottom of the screen while rows are selected.
 * - Header is sticky (the table frame uses overflow: clip so it sticks to the page scroller).
 * - Loading with no rows shows skeleton rows; loading with rows dims them.
 */
import { useMemo, useState, type ReactNode, type KeyboardEvent, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, X } from "lucide-react";
import { Portal, cx, ICON_STROKE } from "./internal";
import { Checkbox } from "./fields";
import { Menu, type MenuItem } from "./menu";
import { Skeleton } from "./skeleton";
import type { IconType } from "./button";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** Value used for client-side sorting (defaults to nothing: column not client-sortable). */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  width?: string;
  align?: "left" | "right" | "center";
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export type Pagination = {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
  sizeOptions?: number[];
};

export type BulkAction<T> = { label: string; icon?: IconType; danger?: boolean; onSelect: (rows: T[], clear: () => void) => void };

export type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => MenuItem[];
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  selected?: (string | number)[];
  onSelectedChange?: (keys: (string | number)[]) => void;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  defaultSort?: SortState;
  pagination?: Pagination;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  emptyIcon?: IconType;
  skeletonRows?: number;
  rowClassName?: (row: T) => string | undefined;
  /** Distance from the top of the scroller where the header sticks (px). */
  stickyOffset?: number;
  className?: string;
};

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
const alignCls = { left: "text-left", right: "text-right", center: "text-center" };

/** Slice a client-side list for the current page (1-based). */
export function paginate<T>(rows: T[], page: number, size: number) {
  return rows.slice((page - 1) * size, page * size);
}

export function DataTable<T>({
  rows, columns, rowKey, loading, onRowClick, rowActions, selectable, bulkActions, selected, onSelectedChange,
  sort, onSortChange, defaultSort = null, pagination, emptyTitle = "Nothing here yet", emptyHint, emptyAction, emptyIcon: EmptyIcon = Inbox,
  skeletonRows = 6, rowClassName, stickyOffset = 0, className,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState>(defaultSort);
  const [innerSel, setInnerSel] = useState<(string | number)[]>([]);
  const sortState = onSortChange ? sort ?? null : innerSort;
  const selKeys = selected ?? innerSel;
  const setSel = (k: (string | number)[]) => (onSelectedChange ? onSelectedChange(k) : setInnerSel(k));

  const shown = useMemo(() => {
    if (onSortChange || !sortState) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sortState.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined || x === "") return 1;
      if (y === null || y === undefined || y === "") return -1;
      return (typeof x === "string" && typeof y === "string" ? x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) : x < y ? -1 : 1) * dir;
    });
  }, [rows, columns, sortState, onSortChange]);

  const keySet = new Set(selKeys);
  const selectedRows = rows.filter((r) => keySet.has(rowKey(r)));
  const allOnPage = rows.length > 0 && selectedRows.length === rows.length;
  const someOnPage = selectedRows.length > 0 && !allOnPage;

  function toggleSort(c: Column<T>) {
    const next: SortState = !sortState || sortState.key !== c.key ? { key: c.key, dir: "asc" } : sortState.dir === "asc" ? { key: c.key, dir: "desc" } : null;
    if (onSortChange) onSortChange(next); else setInnerSort(next);
  }
  function toggleRow(r: T) {
    const k = rowKey(r);
    setSel(keySet.has(k) ? selKeys.filter((x) => x !== k) : [...selKeys, k]);
  }
  function toggleAll() {
    const pageKeys = rows.map(rowKey);
    setSel(allOnPage ? selKeys.filter((k) => !pageKeys.includes(k)) : Array.from(new Set([...selKeys, ...pageKeys])));
  }

  function rowClick(e: MouseEvent, r: T) {
    if (!onRowClick) return;
    if ((e.target as HTMLElement).closest("a,button,input,label,[data-no-row-click]")) return;
    if (window.getSelection()?.toString()) return;
    onRowClick(r);
  }
  function rowKeyDown(e: KeyboardEvent, r: T) {
    if (onRowClick && e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); onRowClick(r); }
  }

  const colCount = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const th = "sticky z-[2] border-b border-line bg-surface/95 px-4 py-0 h-11 text-[12px] font-normal uppercase tracking-[0.06em] text-faint backdrop-blur-sm whitespace-nowrap";

  return (
    <div className={cx("rounded-2xl border border-line bg-surface", className)}>
      {/* overflow: clip keeps the sticky header working; small screens scroll sideways instead. */}
      <div className="hr-scroll relative rounded-2xl max-sm:overflow-x-auto sm:overflow-clip">
        {loading && rows.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-[3] h-[2px] overflow-hidden"><div className="h-full w-1/3 animate-[kit-progress_1s_ease-in-out_infinite] bg-primary/70" /></div>
        )}
        <table className="w-full border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr>
              {selectable && (
                <th className={cx(th, "w-12 pl-5 pr-0")} style={{ top: stickyOffset }}>
                  <Checkbox aria-label="Select all on this page" checked={allOnPage} indeterminate={someOnPage} onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => {
                const active = sortState?.key === c.key;
                const canSort = c.sortable && (onSortChange || c.sortValue);
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sortState?.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cx(th, alignCls[c.align ?? "left"], c.hideBelow && hide[c.hideBelow])} style={{ width: c.width, top: stickyOffset }}>
                    {canSort ? (
                      <button type="button" onClick={() => toggleSort(c)}
                        className={cx("group inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors hover:text-ink", active && "text-ink", c.align === "right" && "flex-row-reverse")}>
                        {c.header}
                        {active
                          ? (sortState?.dir === "asc" ? <ArrowUp size={13} strokeWidth={ICON_STROKE} /> : <ArrowDown size={13} strokeWidth={ICON_STROKE} />)
                          : <ChevronsUpDown size={13} strokeWidth={ICON_STROKE} className="opacity-0 transition-opacity group-hover:opacity-100" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
              {rowActions && <th className={cx(th, "w-14")} style={{ top: stickyOffset }}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className={cx(loading && rows.length > 0 && "opacity-60 transition-opacity")}>
            {loading && rows.length === 0 && Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk${i}`}>
                {selectable && <td className="border-b border-line py-4 pl-5"><Skeleton className="h-[18px] w-[18px] rounded-[5px]" /></td>}
                {columns.map((c, j) => (
                  <td key={c.key} className={cx("border-b border-line px-4 py-4", c.hideBelow && hide[c.hideBelow])}>
                    {j === 0 ? (
                      <div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-3 w-32" /><Skeleton className="h-2.5 w-20" /></div></div>
                    ) : <Skeleton className={cx("h-3", ["w-24", "w-16", "w-20", "w-28"][(i + j) % 4])} />}
                  </td>
                ))}
                {rowActions && <td className="border-b border-line" />}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-6 py-16 text-center">
                  <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-faint"><EmptyIcon size={20} strokeWidth={ICON_STROKE} /></span>
                  <p className="text-[15px] text-ink">{emptyTitle}</p>
                  {emptyHint && <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">{emptyHint}</p>}
                  {emptyAction && <div className="mt-5 flex justify-center">{emptyAction}</div>}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const k = rowKey(r);
              const isSel = keySet.has(k);
              return (
                <tr key={k}
                  onClick={(e) => rowClick(e, r)}
                  onKeyDown={(e) => rowKeyDown(e, r)}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cx(
                    "group/row outline-none transition-colors [&:last-child>td]:border-b-0",
                    isSel ? "bg-primary-soft/40" : "hover:bg-sunken/70 focus-visible:bg-sunken/70",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(r),
                  )}>
                  {selectable && (
                    <td className="w-12 border-b border-line py-3 pl-5 pr-0 align-middle">
                      <Checkbox aria-label="Select row" checked={isSel} onChange={() => toggleRow(r)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cx("border-b border-line px-4 py-3 align-middle text-ink", alignCls[c.align ?? "left"], c.hideBelow && hide[c.hideBelow], c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="w-14 border-b border-line pr-3 text-right align-middle" data-no-row-click>
                      <Menu items={rowActions(r)} className="opacity-60 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total > 0 && <Pager {...pagination} />}
      {selectable && bulkActions && bulkActions.length > 0 && (
        <BulkBar count={selectedRows.length} actions={bulkActions} rows={selectedRows} clear={() => setSel([])} />
      )}
    </div>
  );
}

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = Array.from(set).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

function Pager({ page, size, total, onPageChange, onSizeChange, sizeOptions = [10, 25, 50, 100] }: Pagination) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] tabular transition-colors";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-muted">
      <div className="flex items-center gap-3">
        <span className="tabular">{from}–{to} of {total}</span>
        {onSizeChange && (
          <label className="hidden items-center gap-2 sm:flex">
            <span className="text-faint">Rows</span>
            <select value={size} onChange={(e) => onSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-line bg-surface pl-2.5 text-[13px] text-ink focus:border-primary/60 focus:outline-none">
              {sizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-0.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={cx(btn, "text-muted hover:bg-sunken hover:text-ink disabled:opacity-30")}>
          <ChevronLeft size={16} strokeWidth={ICON_STROKE} />
        </button>
        {pageList(page, pages).map((p, i) => p === "…"
          ? <span key={`e${i}`} className="px-1 text-faint">…</span>
          : <button key={p} type="button" aria-current={p === page ? "page" : undefined} onClick={() => onPageChange(p)}
              className={cx(btn, p === page ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink")}>{p}</button>)}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className={cx(btn, "text-muted hover:bg-sunken hover:text-ink disabled:opacity-30")}>
          <ChevronRight size={16} strokeWidth={ICON_STROKE} />
        </button>
      </nav>
    </div>
  );
}

function BulkBar<T>({ count, actions, rows, clear }: { count: number; actions: BulkAction<T>[]; rows: T[]; clear: () => void }) {
  const reduce = useReducedMotion();
  return (
    <Portal>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            role="toolbar"
            aria-label="Bulk actions"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-xl bg-rail py-1.5 pl-4 pr-1.5 text-[13.5px] text-white shadow-[0_16px_40px_-12px_rgb(22_22_29/0.5)]"
          >
            <span className="mr-2 whitespace-nowrap tabular">{count} selected</span>
            <span className="mr-1 h-5 w-px bg-white/15" />
            {actions.map((a) => (
              <button key={a.label} type="button" onClick={() => a.onSelect(rows, clear)}
                className={cx("inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 transition-colors hover:bg-white/10", a.danger ? "text-rose-300" : "text-white")}>
                {a.icon && <a.icon size={15} strokeWidth={ICON_STROKE} />}{a.label}
              </button>
            ))}
            <button type="button" aria-label="Clear selection" onClick={clear} className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <X size={15} strokeWidth={ICON_STROKE} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
