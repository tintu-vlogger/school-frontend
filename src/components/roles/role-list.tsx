"use client";

/*
 * Roles tab: one card per role with its permission coverage, member count and actions
 * (edit or view, copy, reset to defaults, delete).
 */
import { Copy, Eye, Lock, Pencil, RotateCcw, Shield, ShieldCheck, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Menu, Skeleton, useConfirm, type MenuItem } from "@/components/ui-kit";
import { errorText, plural, type Role } from "./types";

const STROKE = 1.4;

export function RoleList({
  roles, loading, onOpen, onChanged, onCloned,
}: {
  roles: Role[];
  loading: boolean;
  onOpen: (role: Role) => void;
  onChanged: () => void;
  onCloned: (role: Role) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  async function clone(r: Role) {
    try {
      const copy = await api.post<Role>(`/roles/${r.id}/clone`, { display_name: `${r.display_name} (copy)` });
      toast.success(`Copied as ${copy.display_name}`);
      onCloned(copy);
    } catch (e) {
      toast.error(errorText(e, "Couldn't copy the role"));
    }
  }

  async function reset(r: Role) {
    await confirm({
      title: `Reset ${r.display_name}?`,
      message: "Its permissions, data scope and sensitive-field access go back to the defaults. People keep the role.",
      confirmLabel: "Reset",
      onConfirm: async () => {
        try {
          await api.post(`/roles/${r.id}/reset`);
          toast.success(`${r.display_name} reset to defaults`);
          onChanged();
        } catch (e) {
          toast.error(errorText(e, "Couldn't reset the role"));
          throw e;
        }
      },
    });
  }

  async function remove(r: Role) {
    await confirm({
      title: `Delete ${r.display_name}?`,
      message: r.member_count > 0
        ? `${plural(r.member_count, "person has", "people have")} this role. They lose what it gives them.`
        : "This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await api.delete(`/roles/${r.id}`);
          toast.success(`${r.display_name} deleted`);
          onChanged();
        } catch (e) {
          toast.error(errorText(e, "Couldn't delete the role"));
          throw e;
        }
      },
    });
  }

  function actions(r: Role): MenuItem[] {
    const items: MenuItem[] = [
      r.locked
        ? { label: "View", icon: Eye, onSelect: () => onOpen(r) }
        : { label: "Edit", icon: Pencil, onSelect: () => onOpen(r) },
      { label: "Make a copy", icon: Copy, onSelect: () => clone(r) },
    ];
    if (r.is_system && r.customised && !r.locked) items.push({ label: "Reset to defaults", icon: RotateCcw, onSelect: () => reset(r) });
    if (!r.is_system) items.push("separator", { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(r) });
    return items;
  }

  if (loading && roles.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-3.5 w-32" /></div>
            <Skeleton className="mt-4 h-3 w-4/5" />
            <Skeleton className="mt-6 h-1.5 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {roles.map((r) => {
        const pct = r.total_permissions ? Math.round((r.permission_count / r.total_permissions) * 100) : 0;
        const Icon = r.locked ? Lock : r.is_system ? ShieldCheck : Shield;
        return (
          <article key={r.id}
            className="group relative flex cursor-pointer flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a,[data-no-card-click]")) onOpen(r); }}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.is_system ? "bg-primary-soft text-primary" : "bg-sunken text-muted"}`}>
                <Icon size={16} strokeWidth={STROKE} />
              </span>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onOpen(r)} className="block max-w-full truncate text-left text-[15.5px] text-ink outline-none hover:text-primary focus-visible:text-primary">
                  {r.display_name}
                </button>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.is_system ? <Badge tone="accent">System</Badge> : <Badge>Custom</Badge>}
                  {r.locked && <Badge tone="neutral">View only</Badge>}
                  {r.is_system && r.customised && <Badge tone="warn">Changed</Badge>}
                </div>
              </div>
              <div data-no-card-click className="-mr-2 -mt-1">
                <Menu items={actions(r)} label={`Actions for ${r.display_name}`} />
              </div>
            </div>

            <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[13.5px] leading-[1.3em] text-muted">
              {r.description || "No description"}
            </p>

            <div className="mt-auto pt-5">
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="text-muted">Permissions</span>
                <span className="tabular text-ink">{r.permission_count} <span className="text-faint">of {r.total_permissions}</span></span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Users size={14} strokeWidth={STROKE} /> {plural(r.member_count, "person", "people")}</span>
                <span className="inline-flex items-center gap-1 text-faint transition-colors group-hover:text-primary">
                  {r.locked ? <><Eye size={14} strokeWidth={STROKE} /> View</> : <><Pencil size={13} strokeWidth={STROKE} /> Edit</>}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
