"use client";

/*
 * Portal child picker shared by the attendance, leave and timetable portal pages.
 *   const child = useMyChild();             // { children, studentId, current, pick, ready, isParent }
 *   <MyChildSwitcher child={child} />       // a Select for parents with several children, else the name
 * The pick is remembered for the browser session (same key as the other portal pages).
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { Select, Skeleton } from "@/components/ui-kit";

export type MyChild = { id: number; uuid: string; name: string; first_name: string; section_id: number | null; section_label: string | null; roll_no: string | null; photo_url: string | null };

export function useMyChild() {
  const { portalRole } = useAccess();
  const [children, setChildren] = useState<MyChild[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get<MyChild[]>("/students/mine").then((r) => {
      if (!live) return;
      const rows = Array.isArray(r) ? r : [];
      setChildren(rows);
      let saved: number | null = null;
      try { saved = Number(sessionStorage.getItem("portal_child")) || null; } catch { /* storage blocked */ }
      setPicked(rows.find((c) => c.id === saved)?.id ?? rows[0]?.id ?? null);
    }).catch(() => { if (live) setChildren([]); });
    return () => { live = false; };
  }, []);
  const pick = (id: number) => { setPicked(id); try { sessionStorage.setItem("portal_child", String(id)); } catch { /* ignore */ } };
  const current = useMemo(() => children?.find((c) => c.id === picked) ?? null, [children, picked]);
  return { children, studentId: picked, current, pick, ready: children !== null, isParent: portalRole === "parent" };
}

export function MyChildSwitcher({ child }: { child: ReturnType<typeof useMyChild> }) {
  if (!child.ready) return <Skeleton className="h-9 w-48" />;
  if (!child.isParent || (child.children?.length ?? 0) < 2) {
    return child.current ? <p className="text-[13px] text-muted">{child.current.name}{child.current.section_label ? ` · ${child.current.section_label}` : ""}</p> : null;
  }
  return (
    <div className="w-full sm:w-64">
      <Select value={child.studentId} onChange={(v) => v && child.pick(v as number)} aria-label="Child"
        options={(child.children ?? []).map((c) => ({ value: c.id, label: c.name, description: c.section_label ?? undefined }))} />
    </div>
  );
}
