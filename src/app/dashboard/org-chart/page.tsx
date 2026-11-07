"use client";

/*
 * Org chart: an interactive tree by reporting line (zoom, drag to pan, search, expand and
 * collapse, click a person to open their profile) and a department view (department tree
 * with heads and head count). Data: GET /organization/org-chart.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, ChevronDown, ChevronUp, Download, FileImage, FileText, Focus, Maximize2, Minus, Network, Plus, Printer, Users } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, IconButton, Menu, Select, Skeleton, Tabs, useToast, type SelectOption } from "@/components/ui-kit";
import { chartSvg, downloadPdf, downloadPng, stamp } from "@/components/org/chart-export";
import { deptTree, peopleTree } from "@/components/org/org-tree";
import { ProfileModal } from "@/components/people/profile-modal";
import { STATUS } from "@/components/people/types";

type Node = {
  id: number; uuid: string; name: string; preferred_name: string | null; photo: string | null; code: string | null;
  designation: string | null; department_id: number | null; department: string | null; location: string | null;
  manager_id: number | null; reports: number; status: string;
};
type Dept = { id: number; uuid: string; name: string; code: string | null; parent_id: number | null; head: { uuid: string; name: string; photo: string | null } | null; count: number };

export default function OrgChartPage() {
  return <Suspense fallback={null}><OrgChart /></Suspense>;
}

function OrgChart() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [data, setData] = useState<{ nodes: Node[]; departments: Dept[] } | null>(null);
  const [mode, setMode] = useState<"people" | "departments">("people");
  const [scale, setScale] = useState(0.9);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const viewId = params.get("view");
  const scroller = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const setView = useCallback((uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("view", uuid); else sp.delete("view");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    api.get<{ nodes: Node[]; departments: Dept[] }>("/organization/org-chart").then((d) => {
      setData(d);
      // open the top two levels
      const roots = d.nodes.filter((n) => n.manager_id === null).map((n) => n.id);
      const second = d.nodes.filter((n) => n.manager_id !== null && roots.includes(n.manager_id)).map((n) => n.id);
      setOpen((prev) => (prev.size ? prev : new Set([...roots, ...second])));
    }).catch(() => setData({ nodes: [], departments: [] }));
  }, [nonce]);

  const children = useMemo(() => {
    const m = new Map<number | null, Node[]>();
    for (const n of data?.nodes ?? []) m.set(n.manager_id, [...(m.get(n.manager_id) ?? []), n]);
    // people with reports first, then by name
    for (const list of m.values()) list.sort((a, b) => (b.reports > 0 ? 1 : 0) - (a.reports > 0 ? 1 : 0) || a.name.localeCompare(b.name));
    return m;
  }, [data]);
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const roots = children.get(null) ?? [];
  const searchOptions: SelectOption<number>[] = useMemo(() => (data?.nodes ?? []).map((n) => ({ value: n.id, label: n.name, description: [n.designation, n.department].filter(Boolean).join(" · ") })), [data]);

  function toggle(id: number) { setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function expandAll() { setOpen(new Set((data?.nodes ?? []).filter((n) => n.reports > 0).map((n) => n.id))); }
  function collapseAll() { setOpen(new Set(roots.map((r) => r.id))); }

  function jumpTo(id: number | null) {
    if (id == null) return;
    const path = new Set(open);
    let cur = byId.get(id);
    while (cur && cur.manager_id !== null) { path.add(cur.manager_id); cur = byId.get(cur.manager_id); }
    setOpen(path);
    setFocus(id);
    setMode("people");
    setTimeout(() => document.getElementById(`org-node-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 120);
    setTimeout(() => setFocus(null), 3000);
  }

  // Download what is on screen: expanded reporting lines, or every department.
  async function exportChart(kind: "png" | "pdf") {
    if (!data?.nodes.length) return;
    setExporting(true);
    try {
      const people = mode === "people";
      const tree = people ? peopleTree(data.nodes, { open }) : deptTree(data.departments);
      const chart = chartSvg(tree, { title: people ? "Org chart · Reporting lines" : "Org chart · Departments", subtitle: `As on ${stamp()}` });
      const name = `org-chart-${people ? "people" : "departments"}-${stamp()}.${kind}`;
      if (kind === "png") await downloadPng(chart, name); else await downloadPdf(chart, name);
      toast.success("Downloaded", { description: people ? "The branches you have open are included." : undefined });
    } catch (e) { toast.error("Couldn't make the file", { description: e instanceof Error ? e.message : undefined }); } finally { setExporting(false); }
  }
  function openPrint() {
    const sp = new URLSearchParams({ mode });
    if (mode === "people") sp.set("open", [...open].join(","));
    window.open(`/dashboard/org-chart/print?${sp.toString()}`, "_blank", "noopener");
  }

  // Start with the top of the chart in view (the tree can be much wider than the screen).
  const rootId = roots.find((r) => r.reports > 0)?.id ?? roots[0]?.id;
  useEffect(() => {
    if (!data || mode !== "people" || rootId == null) return;
    const t = setTimeout(() => {
      const el = scroller.current, node = document.getElementById(`org-node-${rootId}`);
      if (!el || !node) return;
      const a = el.getBoundingClientRect(), b = node.getBoundingClientRect();
      el.scrollLeft += b.left + b.width / 2 - (a.left + a.width / 2);
      el.scrollTop = 0;
    }, 80);
    return () => clearTimeout(t);
  }, [data, mode, rootId]);

  // drag to pan
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("button,a")) return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  };
  const onMove = (e: ReactMouseEvent) => {
    const d = drag.current, el = scroller.current;
    if (!d || !el) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((s) => Math.min(1.6, Math.max(0.4, s - e.deltaY * 0.002)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data, mode]);

  const renderNode = (n: Node, depth: number): React.ReactNode => {
    const kids = children.get(n.id) ?? [];
    const expanded = open.has(n.id) && kids.length > 0;
    const st = STATUS[n.status];
    return (
      <li key={n.id} className="org-li">
        <div id={`org-node-${n.id}`} className={`relative mx-auto w-[220px] rounded-2xl border bg-surface px-4 pb-3 pt-4 text-center transition-shadow ${focus === n.id ? "border-primary shadow-[0_0_0_4px_rgb(99_102_241/0.15)]" : "border-line hover:border-line-strong"}`}>
          <button type="button" onClick={() => setView(n.uuid)} className="flex w-full flex-col items-center">
            <Avatar name={n.name} src={n.photo} size={depth === 0 ? 56 : 46} />
            <span className="mt-2 block max-w-full truncate text-[14px] text-ink">{n.name}</span>
            <span className="block max-w-full truncate text-[12.5px] text-muted">{n.designation ?? "—"}</span>
            <span className="block max-w-full truncate text-[11.5px] text-faint">{[n.department, n.location].filter(Boolean).join(" · ")}</span>
          </button>
          {st && !["confirmed"].includes(n.status) && <div className="mt-1.5"><Badge tone={st.tone}>{st.label}</Badge></div>}
          {kids.length > 0 && (
            <button type="button" onClick={() => toggle(n.id)} aria-label={expanded ? "Hide reports" : "Show reports"}
              className="absolute -bottom-3 left-1/2 z-[1] flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-2 text-[11.5px] text-muted hover:border-primary/40 hover:text-primary">
              {kids.length} {expanded ? <ChevronUp size={12} strokeWidth={1.6} /> : <ChevronDown size={12} strokeWidth={1.6} />}
            </button>
          )}
        </div>
        {expanded && <ul className="org-ul">{kids.map((k) => renderNode(k, depth + 1))}</ul>}
      </li>
    );
  };

  const deptChildren = useMemo(() => {
    const ids = new Set((data?.departments ?? []).map((d) => d.id));
    const m = new Map<number | null, Dept[]>();
    for (const d of data?.departments ?? []) { const p = d.parent_id && ids.has(d.parent_id) ? d.parent_id : null; m.set(p, [...(m.get(p) ?? []), d]); }
    return m;
  }, [data]);
  const deptTotal = (d: Dept): number => d.count + (deptChildren.get(d.id) ?? []).reduce((s, c) => s + deptTotal(c), 0);
  const renderDept = (d: Dept): React.ReactNode => {
    const kids = deptChildren.get(d.id) ?? [];
    return (
      <li key={d.id} className="org-li">
        <div className="mx-auto w-[230px] rounded-2xl border border-line bg-surface p-4 text-left">
          <div className="flex items-center gap-2.5">
            <Avatar name={d.name} size={34} square />
            <div className="min-w-0"><p className="truncate text-[14px] text-ink">{d.name}</p><p className="text-[12px] text-faint">{d.code ?? ""}</p></div>
          </div>
          {d.head ? (
            <button type="button" onClick={() => setView(d.head!.uuid)} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-sunken/70">
              <Avatar name={d.head.name} src={d.head.photo} size={24} /><span className="min-w-0"><span className="block truncate text-[13px] text-ink/80">{d.head.name}</span><span className="block text-[11.5px] text-faint">Head</span></span>
            </button>
          ) : <p className="mt-3 text-[12.5px] text-faint">No head</p>}
          <Link href={`/dashboard/staff?department=${d.id}`} className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted hover:text-primary">
            <Users size={13} strokeWidth={1.4} /> {d.count} {d.count === 1 ? "person" : "people"}{kids.length ? ` · ${deptTotal(d)} with sub-departments` : ""}
          </Link>
        </div>
        {kids.length > 0 && <ul className="org-ul">{kids.map(renderDept)}</ul>}
      </li>
    );
  };

  return (
    <div>
      <PageHeader eyebrow="People" title="Org chart" description="Who reports to whom, and how departments fit together." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs variant="pill" value={mode} onChange={setMode} items={[{ value: "people", label: "Reporting lines", icon: Network }, { value: "departments", label: "Departments", icon: Building2 }]} />
        <div className="w-full sm:ml-2 sm:w-72"><Select<number> value={null} onChange={(id) => jumpTo(id)} options={searchOptions} placeholder="Find a person" /></div>
        <div className="ml-auto flex items-center gap-1">
          {mode === "people" && <><Button size="sm" variant="ghost" onClick={expandAll}>Expand all</Button><Button size="sm" variant="ghost" onClick={collapseAll}>Collapse</Button></>}
          <IconButton icon={Minus} label="Zoom out" size="sm" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))} />
          <span className="w-12 text-center text-[12.5px] text-muted tabular">{Math.round(scale * 100)}%</span>
          <IconButton icon={Plus} label="Zoom in" size="sm" onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} />
          <IconButton icon={Maximize2} label="Reset zoom" size="sm" onClick={() => setScale(0.9)} />
          <Menu align="end" label="Download or print" trigger={<Button size="sm" icon={Download} loading={exporting} disabled={!data?.nodes.length}>Export</Button>}
            items={[
              { label: "Download as PNG", icon: FileImage, onSelect: () => exportChart("png"), hint: "Image" },
              { label: "Download as PDF", icon: FileText, onSelect: () => exportChart("pdf"), hint: "One page" },
              "separator",
              { label: "Print view", icon: Printer, onSelect: openPrint },
            ]} />
        </div>
      </div>
      <div ref={scroller} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
        className="hr-scroll relative h-[calc(100vh-250px)] min-h-[440px] cursor-grab overflow-auto rounded-2xl border border-line bg-[radial-gradient(circle,rgb(27_27_34/0.07)_1px,transparent_1px)] [background-size:18px_18px] active:cursor-grabbing">
        {!data ? (
          <div className="flex justify-center gap-6 p-16">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-52 rounded-2xl" />)}</div>
        ) : data.nodes.length === 0 ? (
          <p className="p-16 text-center text-[14px] text-muted">No one here yet. Add employees and their managers to see the chart.</p>
        ) : (
          <div className="inline-block min-w-full p-10" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
            <ul className="org-ul org-root">{mode === "people" ? roots.map((r) => renderNode(r, 0)) : (deptChildren.get(null) ?? []).map(renderDept)}</ul>
          </div>
        )}
        <span className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-1.5 text-[12px] text-faint"><Focus size={13} strokeWidth={1.4} /> Drag to move · Ctrl + scroll to zoom</span>
      </div>
      <style>{`
        .org-ul { display: flex; justify-content: center; padding-top: 28px; position: relative; }
        .org-root { padding-top: 0; }
        .org-li { position: relative; padding: 28px 10px 0; display: flex; flex-direction: column; align-items: center; }
        .org-root > .org-li { padding-top: 0; }
        .org-li::before, .org-li::after { content: ""; position: absolute; top: 0; width: 50%; height: 28px; border-top: 1px solid var(--color-line-strong); }
        .org-li::before { right: 50%; }
        .org-li::after { left: 50%; border-left: 1px solid var(--color-line-strong); }
        .org-li:only-child::before, .org-li:only-child::after { display: none; }
        .org-li:only-child { padding-top: 28px; }
        .org-root > .org-li:only-child { padding-top: 0; }
        .org-li:first-child::before, .org-li:last-child::after { border: 0 none; }
        .org-li:last-child::before { border-right: 1px solid var(--color-line-strong); border-radius: 0 10px 0 0; }
        .org-li:first-child::after { border-radius: 10px 0 0 0; }
        .org-ul .org-ul::before { content: ""; position: absolute; top: 0; left: 50%; height: 28px; border-left: 1px solid var(--color-line-strong); }
        .org-li:only-child > div:first-child::before { content: ""; position: absolute; top: -28px; left: 50%; height: 28px; border-left: 1px solid var(--color-line-strong); }
        .org-root > .org-li:only-child > div:first-child::before { display: none; }
      `}</style>
      <ProfileModal uuid={viewId} onClose={() => setView(null)} onOpenPerson={setView} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
