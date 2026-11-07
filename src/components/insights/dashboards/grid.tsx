"use client";

/*
 * The dashboard grid: 12 columns, rows of ROW px, each widget at x, y, w, h.
 * In edit mode a widget moves by dragging its header and resizes from the bottom-right
 * corner; the others fall into place (gravity packing, the moved one wins its row).
 */
import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ExternalLink, GripVertical, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Menu, Skeleton, type MenuItem } from "@/components/ui-kit";
import { WidgetChart, type WidgetData } from "@/components/insights/charts";
import { GAP, ROW, contentKey, type Widget } from "./types";

type Box = { id: string; x: number; y: number; w: number; h: number };

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Gravity packing: every widget sinks as high as it can, in reading order. `moved` wins ties in its row. */
export function pack(items: Widget[], moved?: Box): Widget[] {
  const list = items.map((i) => (moved && i.id === moved.id ? { ...i, x: moved.x, y: moved.y, w: moved.w, h: moved.h } : i));
  const key = (i: Widget) => i.y - (moved && i.id === moved.id ? 0.5 : 0);
  const order = [...list].sort((a, b) => key(a) - key(b) || a.x - b.x);
  const placed: Widget[] = [];
  for (const it of order) {
    const x = Math.max(0, Math.min(12 - it.w, it.x));
    let y = 0;
    while (placed.some((p) => overlap(p, { ...it, x, y }))) y++;
    placed.push({ ...it, x, y });
  }
  const byId = new Map(placed.map((p) => [p.id, p]));
  return list.map((i) => byId.get(i.id)!);
}

export const boxHeight = (h: number) => h * ROW + (h - 1) * GAP;

/* ── One widget ───────────────────────────────────────────────── */

type CardProps = {
  widget: Widget;
  dashUuid: string;
  saved: boolean;
  editing: boolean;
  tick: number;
  height: number;
  onEdit: (w: Widget) => void;
  onRemove: (w: Widget) => void;
  onOpenReport: (uuid: string) => void;
  onGrab?: (e: ReactPointerEvent, id: string, mode: "move" | "resize") => void;
};

const legendTypes = new Set(["bar", "stacked_bar", "line", "area"]);

export const WidgetCard = memo(function WidgetCard({ widget, dashUuid, saved, editing, tick, height, onEdit, onRemove, onOpenReport, onGrab }: CardProps) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [own, setOwn] = useState(0);
  const ckey = contentKey(widget);
  const latest = useRef(widget);
  useEffect(() => { latest.current = widget; });

  useEffect(() => {
    let live = true;
    setData(null);
    const w = latest.current;
    const req = saved
      ? api.get<WidgetData>(`/dashboards/${dashUuid}/widgets/${encodeURIComponent(w.id)}/data`)
      : api.post<WidgetData>("/dashboards/widget-preview", { widget: w });
    req.then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setData({ type: w.type, status: "error", message: e instanceof Error ? e.message : "Couldn't load this widget" }); });
    return () => { live = false; };
  }, [ckey, saved, tick, own, dashUuid]);

  const items: MenuItem[] = [{ label: "Refresh", icon: RefreshCw, onSelect: () => setOwn((n) => n + 1) }];
  if (widget.report_uuid) items.push({ label: "Open as report", icon: ExternalLink, onSelect: () => onOpenReport(widget.report_uuid!) });
  if (editing) items.push("separator", { label: "Edit", icon: Pencil, onSelect: () => onEdit(widget) }, { label: "Remove", icon: Trash2, danger: true, onSelect: () => onRemove(widget) });

  const scope = data?.status === "ok" && data.scope_label && data.scope_label !== "Everyone" ? data.scope_label : null;
  const hasLegend = !!data && legendTypes.has(widget.type) && (!!data.series || (data.measures?.length ?? 0) > 1);
  const bodyH = Math.max(60, height - 46 - 14 - (hasLegend ? 26 : 0));

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-surface ${editing ? "border-line-strong" : "border-line"}`}>
      <div
        onPointerDown={editing && onGrab ? (e) => onGrab(e, widget.id, "move") : undefined}
        className={`flex h-[46px] shrink-0 items-center gap-2 pl-4 pr-2 ${editing ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}>
        {editing && <GripVertical size={14} strokeWidth={1.4} className="-ml-1.5 shrink-0 text-faint" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-ink">{widget.title}</p>
        </div>
        {scope && <span className="hidden shrink-0 truncate text-[11.5px] text-faint sm:inline">{scope}</span>}
        <span onPointerDown={(e) => e.stopPropagation()}>
          <Menu items={items} label={`Actions for ${widget.title}`} />
        </span>
      </div>
      <div className="relative min-h-0 flex-1 px-4 pb-3.5">
        {!data ? (
          <div className="flex h-full flex-col justify-end gap-2 pb-1">
            {widget.type === "kpi" ? <><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-16" /></> : <Skeleton className="h-full min-h-[40px] w-full" />}
          </div>
        ) : data.status !== "ok" ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-[13px] text-faint">{data.message || "Nothing to show"}</div>
        ) : (
          <div className="h-full overflow-auto">
            <ChartBody data={data} height={bodyH} />
          </div>
        )}
      </div>
      {editing && onGrab && (
        <span
          onPointerDown={(e) => onGrab(e, widget.id, "resize")}
          aria-hidden
          className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-faint hover:text-primary">
          <svg width="9" height="9" viewBox="0 0 9 9"><path d="M8 1 L1 8 M8 5 L5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </span>
      )}
    </div>
  );
});

const ChartBody = memo(function ChartBody({ data, height }: { data: WidgetData; height: number }) {
  return <WidgetChart data={data} height={height} />;
});

/* ── The grid ─────────────────────────────────────────────────── */

type Active = { id: string; mode: "move" | "resize"; start: Widget; preview: Widget[] };

export function DashboardGrid({ widgets, dashUuid, savedKeys, editing, tick, onChange, onEdit, onRemove, onOpenReport }: {
  widgets: Widget[];
  dashUuid: string;
  savedKeys: Map<string, string>;
  editing: boolean;
  tick: number;
  onChange: (widgets: Widget[]) => void;
  onEdit: (w: Widget) => void;
  onRemove: (w: Widget) => void;
  onOpenReport: (uuid: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [active, setActive] = useState<Active | null>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; start: Widget; target: Box; base: Widget[] } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const narrow = width > 0 && width < 720;
  const colW = (width - 11 * GAP) / 12;

  const onGrab = useCallback((e: ReactPointerEvent, id: string, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    const start = widgets.find((w) => w.id === id);
    const el = cards.current.get(id);
    if (!start || !el || colW <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, start, target: { id, x: start.x, y: start.y, w: start.w, h: start.h }, base: widgets };
    setActive({ id, mode, start, preview: widgets });
    const startW = start.w * colW + (start.w - 1) * GAP;
    const startH = boxHeight(start.h);

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      let t: Box;
      if (d.mode === "move") {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        const left = d.start.x * (colW + GAP) + dx;
        const top = d.start.y * (ROW + GAP) + dy;
        t = { id, w: d.start.w, h: d.start.h, x: Math.max(0, Math.min(12 - d.start.w, Math.round(left / (colW + GAP)))), y: Math.max(0, Math.round(top / (ROW + GAP))) };
      } else {
        const pw = Math.max(2 * colW + GAP, Math.min(12 * colW + 11 * GAP - d.start.x * (colW + GAP), startW + dx));
        const ph = Math.max(boxHeight(2), Math.min(boxHeight(10), startH + dy));
        el.style.width = `${pw}px`;
        el.style.height = `${ph}px`;
        t = { id, x: d.start.x, y: d.start.y,
          w: Math.max(2, Math.min(12 - d.start.x, Math.round((pw + GAP) / (colW + GAP)))),
          h: Math.max(2, Math.min(10, Math.round((ph + GAP) / (ROW + GAP)))) };
      }
      if (t.x !== d.target.x || t.y !== d.target.y || t.w !== d.target.w || t.h !== d.target.h) {
        d.target = t;
        const preview = pack(d.base, t);
        setActive((a) => (a ? { ...a, preview } : a));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = drag.current;
      drag.current = null;
      el.style.transform = "";
      el.style.width = "";
      el.style.height = "";
      setActive(null);
      if (d) {
        const moved = d.target.x !== d.start.x || d.target.y !== d.start.y || d.target.w !== d.start.w || d.target.h !== d.start.h;
        if (moved) onChange(pack(d.base, d.target));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [widgets, colW, onChange]);

  const layout = active ? active.preview : widgets;
  const rows = Math.max(1, ...layout.map((w) => w.y + w.h));
  const placeholder = active ? active.preview.find((w) => w.id === active.id) : null;

  if (narrow) {
    const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
      <div ref={box} className="flex flex-col" style={{ gap: GAP }}>
        {ordered.map((w) => {
          const h = w.type === "kpi" ? boxHeight(2) : boxHeight(Math.max(3, w.h));
          return (
            <div key={w.id} style={{ height: h }}>
              <WidgetCard widget={w} dashUuid={dashUuid} saved={savedKeys.get(w.id) === contentKey(w)} editing={editing} tick={tick}
                height={h} onEdit={onEdit} onRemove={onRemove} onOpenReport={onOpenReport} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={box} className="relative grid"
      style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: `${ROW}px`, gap: GAP, minHeight: boxHeight(rows + (editing ? 2 : 0)) }}>
      {editing && width > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid"
          style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: `${ROW}px`, gap: GAP }}>
          {Array.from({ length: 12 * (rows + 2) }, (_, i) => <div key={i} className="rounded-lg border border-dashed border-line/70" />)}
        </div>
      )}
      {placeholder && (
        <div aria-hidden className="rounded-2xl border border-dashed border-primary/50 bg-primary/[0.05] transition-all duration-150"
          style={{ gridColumn: `${placeholder.x + 1} / span ${placeholder.w}`, gridRow: `${placeholder.y + 1} / span ${placeholder.h}` }} />
      )}
      {layout.map((w) => {
        const isActive = active?.id === w.id;
        const pos = isActive ? active!.start : w;
        return (
          <div key={w.id}
            ref={(el) => { if (el) cards.current.set(w.id, el); else cards.current.delete(w.id); }}
            className={`relative min-w-0 ${isActive ? "z-20 opacity-95" : "z-[1]"}`}
            style={{ gridColumn: `${pos.x + 1} / span ${pos.w}`, gridRow: `${pos.y + 1} / span ${pos.h}` }}>
            <WidgetCard widget={w} dashUuid={dashUuid} saved={savedKeys.get(w.id) === contentKey(w)} editing={editing} tick={tick}
              height={boxHeight(pos.h)} onEdit={onEdit} onRemove={onRemove} onOpenReport={onOpenReport} onGrab={editing ? onGrab : undefined} />
          </div>
        );
      })}
    </div>
  );
}
