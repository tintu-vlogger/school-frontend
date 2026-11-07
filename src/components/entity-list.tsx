"use client";

import { useState } from "react";
import { Search, LayoutGrid, List, Plus, X, Loader2, Users } from "lucide-react";
import { useI18n } from "@/i18n/provider";

/* ── Avatar ── */
const AVATAR_BG = ["#8b5cf6","#0d9488","#ec4899","#f59e0b","#0ea5e9","#ef4444","#22c55e","#6366f1","#e11d48","#06b6d4","#d946ef","#f97316"];

export function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

export function getInitials(name: string) {
  const { t } = useI18n();
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function EntityAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-[11px]", lg: "h-11 w-11 text-sm" };
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-normal ${sizes[size]}`} style={{ background: getAvatarColor(name) + "1f", color: getAvatarColor(name) }}>
      {getInitials(name)}
    </div>
  );
}

/* ── Toolbar ── */
export function EntityToolbar({
  searchPlaceholder = "Search...",
  search, onSearchChange,
  view, onViewChange,
  filterOptions, filterValue, onFilterChange,
  actionLabel = "New",
  onAction,
  extraActions,
}: {
  searchPlaceholder?: string;
  search: string;
  onSearchChange: (v: string) => void;
  view: "table" | "card";
  onViewChange: (v: "table" | "card") => void;
  filterOptions?: { value: string; label: string }[];
  filterValue?: string;
  onFilterChange?: (v: string) => void;
  actionLabel?: string;
  onAction?: () => void;
  extraActions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder={searchPlaceholder} value={search} onChange={(e) => onSearchChange(e.target.value)}
            className="w-56 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        {filterOptions && onFilterChange && (
          <select value={filterValue} onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
            {filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 overflow-hidden">
          <button onClick={() => onViewChange("table")} className={`px-2.5 py-2 ${view === "table" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}><List size={16} /></button>
          <button onClick={() => onViewChange("card")} className={`px-2.5 py-2 border-l border-gray-300 ${view === "card" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}><LayoutGrid size={16} /></button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onAction && actionLabel && (
          <button onClick={onAction} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-normal text-white transition hover:brightness-110">
            <Plus size={16} /> {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Table ── */
export interface TableColumn<T> {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  render: (item: T) => React.ReactNode;
}

export function EntityTable<T extends { uuid?: string; id?: number }>({
  items,
  columns,
  actions,
  keyField = "uuid",
}: {
  items: T[];
  columns: TableColumn<T>[];
  actions?: (item: T) => React.ReactNode;
  keyField?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white">
      <table className="min-w-full divide-y divide-gray-100">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-6 py-3 text-[12px] font-light text-gray-500 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                {col.label}
              </th>
            ))}
            {actions && <th className="px-6 py-3 text-right text-[12px] font-light text-gray-500">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {items.map((item) => (
            <tr key={(item as Record<string, unknown>)[keyField] as string} className="transition-colors hover:bg-gray-50/70">
              {columns.map((col) => (
                <td key={col.key} className={`px-6 py-3.5 whitespace-nowrap text-[13.5px] font-light text-gray-800 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}`}>
                  {col.render(item)}
                </td>
              ))}
              {actions && <td className="px-6 py-3.5 whitespace-nowrap text-right text-[13px] font-light">{actions(item)}</td>}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="px-6 py-12 text-center text-sm text-gray-500">No items found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Card Grid ── */
export interface CardMeta {
  icon: React.ReactNode;
  iconBg: string;
  text: string;
}

export function EntityCardGrid<T extends { uuid?: string; id?: number }>({
  items,
  getName,
  getSubtext,
  getAccentColor,
  getMeta,
  getFooterLeft,
  getFooterRight,
  actions,
  onNameClick,
  keyField = "uuid",
}: {
  items: T[];
  getName: (item: T) => string;
  getSubtext?: (item: T) => string;
  getAccentColor?: (item: T) => string;
  getMeta?: (item: T) => CardMeta[];
  getFooterLeft?: (item: T) => React.ReactNode;
  getFooterRight?: (item: T) => React.ReactNode;
  actions?: (item: T) => React.ReactNode;
  onNameClick?: (item: T) => void;
  keyField?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" style={{ gridAutoRows: "1fr" }}>
      {items.map((item) => {
        const name = getName(item);
        const color = getAccentColor ? getAccentColor(item) : getAvatarColor(name);
        const meta = getMeta ? getMeta(item) : [];
        return (
          <div key={(item as Record<string, unknown>)[keyField] as string} className="group flex flex-col">
            <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white transition-colors hover:border-gray-300" data-accent={color}>

              <div className="relative flex flex-1 flex-col p-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <EntityAvatar name={name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => onNameClick?.(item)}
                      className={`text-[14.5px] font-normal text-gray-900 ${onNameClick ? "cursor-pointer hover:text-primary" : ""} text-left block leading-snug truncate w-full transition-colors`}
                    >
                      {name}
                    </button>
                    {getSubtext && <p className="mt-0.5 truncate text-[12px] font-light text-gray-500">{getSubtext(item)}</p>}
                  </div>
                  {actions && (
                    <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {actions(item)}
                    </div>
                  )}
                </div>

                {/* Separator */}
                <div className="mb-1 mt-3 border-t border-gray-100" />

                {/* Meta rows */}
                <div className="flex-1 flex flex-col justify-end">
                  {meta.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-1.5" style={i > 0 ? { borderTop: "1px solid rgba(0,0,0,0.03)" } : undefined}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#3a4557] [&_svg]:!text-[#3a4557] [&_svg]:!stroke-[1.5]" data-bg={m.iconBg}>
                        {m.icon}
                      </span>
                      <span className="truncate text-[12.5px] font-light text-gray-600">{m.text}</span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                {(getFooterLeft || getFooterRight) && (
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                    {getFooterLeft ? getFooterLeft(item) : <span />}
                    {getFooterRight ? getFooterRight(item) : <span />}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Card Action Buttons (for use in actions prop) ── */
export function CardEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800" title="Edit">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
    </button>
  );
}

export function CardDeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
    </button>
  );
}

/* ── Table Action Links ── */
export function TableEditLink({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="mr-3 text-gray-400 hover:text-gray-800">Edit</button>;
}

export function TableDeleteLink({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="text-gray-400 hover:text-red-600">Delete</button>;
}

/* ── Empty State ── */
export function EntityEmpty({ message = "No items found", hint, onAction, actionLabel }: {
  message?: string; hint?: string; onAction?: () => void; actionLabel?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-4"><Users size={28} /></div>
      <p className="text-[13.5px] font-normal text-gray-600">{message}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {onAction && actionLabel && (
        <button onClick={onAction} className="mt-3 text-[13px] font-normal text-primary hover:brightness-110">{actionLabel}</button>
      )}
    </div>
  );
}

/* ── Loading ── */
export function EntityLoading() {
  return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-300" /></div>;
}

/* ── Confirm Modal ── */
export function ConfirmModal({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger", loading, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string;
  variant?: "danger" | "primary"; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  const btnCls = variant === "danger" ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-normal text-gray-900">{title}</h3>
        <p className="mt-1.5 text-sm text-gray-500">{message}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading} className={`flex-1 rounded-lg py-2 text-[13px] font-normal text-white disabled:opacity-50 ${btnCls}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Form Modal ── */
export function FormModal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h3 className="text-[15px] font-normal text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

/* ── Badge ── */
export function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal ${color}`}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", display: "inline-block", background: "currentColor" }} />
      {label}
    </span>
  );
}
