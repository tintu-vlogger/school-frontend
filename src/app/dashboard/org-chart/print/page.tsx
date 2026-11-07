"use client";

/*
 * Org chart, print view: a paper-friendly chart (fitted to the page width) or an indented
 * list that runs over several pages. Pick reporting lines or departments, a branch and how
 * many levels, then Print (or Save as PDF from the print dialog).
 * Opened from the org chart's Export menu: ?mode=people|departments&open=1,2,3
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Button, Field, Select, Skeleton, Tabs, type SelectOption } from "@/components/ui-kit";
import { chartSvg, type ChartNode } from "@/components/org/chart-export";
import { countNodes, deptTree, peopleTree, type OrgData } from "@/components/org/org-tree";

export default function OrgChartPrintPage() {
  return <Suspense fallback={null}><PrintView /></Suspense>;
}

const LEVELS: SelectOption<number>[] = [
  { value: 0, label: "Every level" }, { value: 2, label: "2 levels" }, { value: 3, label: "3 levels" }, { value: 4, label: "4 levels" },
];

function PrintView() {
  const params = useSearchParams();
  const [data, setData] = useState<OrgData | null>(null);
  const [mode, setMode] = useState<"people" | "departments">(params.get("mode") === "departments" ? "departments" : "people");
  const [layout, setLayout] = useState<"chart" | "list">("chart");
  const [rootId, setRootId] = useState<number | null>(null);
  const [levels, setLevels] = useState<number>(0);
  const [onlyOpen, setOnlyOpen] = useState<boolean>(!!params.get("open"));
  const openIds = useMemo(() => new Set((params.get("open") ?? "").split(",").filter(Boolean).map(Number)), [params]);

  useEffect(() => { api.get<OrgData>("/organization/org-chart").then(setData).catch(() => setData({ nodes: [], departments: [] })); }, []);

  const tree: ChartNode[] = useMemo(() => {
    if (!data) return [];
    if (mode === "departments") return deptTree(data.departments);
    return peopleTree(data.nodes, { rootId, open: onlyOpen && openIds.size ? openIds : null, depth: levels || null });
  }, [data, mode, rootId, levels, onlyOpen, openIds]);
  const chart = useMemo(() => (tree.length ? chartSvg(tree) : null), [tree]);
  const people: SelectOption<number>[] = useMemo(() => (data?.nodes ?? []).filter((n) => n.reports > 0)
    .map((n) => ({ value: n.id, label: n.name, description: [n.designation, `${n.reports} reports`].filter(Boolean).join(" · ") })), [data]);
  const branch = rootId != null ? data?.nodes.find((n) => n.id === rootId)?.name : null;
  const heading = mode === "people" ? (branch ? `Reporting lines · ${branch}'s team` : "Reporting lines") : "Departments";

  return (
    <div>
      <div className="org-print-controls">
        <PageHeader eyebrow="Org chart" title="Print view" description="A clean copy of the chart for paper or PDF. Use Print, then pick Save as PDF if you want a file."
          actions={<Button variant="primary" icon={Printer} onClick={() => window.print()} disabled={!tree.length}>Print</Button>} />
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <Tabs variant="pill" value={mode} onChange={setMode} items={[{ value: "people", label: "Reporting lines" }, { value: "departments", label: "Departments" }]} />
          <Tabs variant="pill" value={layout} onChange={setLayout} items={[{ value: "chart", label: "Chart" }, { value: "list", label: "List" }]} />
          {mode === "people" && (
            <>
              <div className="w-64"><Field label="Branch"><Select<number> value={rootId} onChange={setRootId} options={people} placeholder="Whole company" clearable /></Field></div>
              <div className="w-40"><Field label="Levels"><Select<number> value={levels} onChange={(v) => setLevels(v ?? 0)} options={LEVELS} /></Field></div>
              {openIds.size > 0 && (
                <label className="flex h-10 items-center gap-2 text-[13.5px] text-muted">
                  <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="accent-[var(--color-primary)]" />
                  Only the branches I had open
                </label>
              )}
            </>
          )}
        </div>
      </div>

      <div id="org-print" className="rounded-2xl border border-line bg-white p-6 text-[#1b1b22]">
        <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-[#e5e5ec] pb-3">
          <div>
            <p className="text-[18px] font-light">{heading}</p>
            <p className="text-[12px] text-[#8a8a99]">{tree.length ? `${countNodes(tree)} ${mode === "people" ? "people" : "departments"}` : ""}</p>
          </div>
          <p className="text-[12px] text-[#8a8a99]">As on {formatDate(new Date().toISOString())}</p>
        </div>
        {!data ? (
          <div className="flex gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-48 rounded-xl" />)}</div>
        ) : !tree.length ? (
          <p className="py-10 text-center text-[14px] text-[#5b5b6b]">Nothing to show yet.</p>
        ) : layout === "chart" && chart ? (
          <div className="org-print-chart" style={{ aspectRatio: `${chart.width} / ${chart.height}` }}
            dangerouslySetInnerHTML={{ __html: chart.svg.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, 'width="100%" height="100%"') }} />
        ) : (
          <ul className="org-print-list">{tree.map((n) => <Row key={n.id} node={n} />)}</ul>
        )}
      </div>

      <style>{`
        .org-print-chart { width: 100%; }
        .org-print-chart svg { display: block; width: 100%; height: 100%; }
        .org-print-list, .org-print-list ul { list-style: none; margin: 0; padding: 0; }
        .org-print-list ul { margin-left: 14px; padding-left: 14px; border-left: 1px solid #d9d9e3; }
        .org-print-list li { break-inside: avoid; }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body * { visibility: hidden !important; }
          #org-print, #org-print * { visibility: visible !important; }
          #org-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; padding: 0 !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ node }: { node: ChartNode }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2 py-1">
        <span className="text-[13.5px]">{node.title}</span>
        {node.subtitle && <span className="text-[12.5px] text-[#5b5b6b]">{node.subtitle}</span>}
        {node.meta && <span className="text-[11.5px] text-[#8a8a99]">{node.meta}</span>}
        {node.badge && <span className="text-[11px] text-[#b45309]">{node.badge}</span>}
      </div>
      {node.children.length > 0 && <ul>{node.children.map((c) => <Row key={c.id} node={c} />)}</ul>}
    </li>
  );
}
