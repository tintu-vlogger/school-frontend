"use client";

/*
 * Position chart: the tree of open positions by reports-to line, with who sits in each
 * seat, vacancies and the totals below each position. Expand or collapse branches, search,
 * or show one branch only. Clicking a card opens the position.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Focus, List, Minus, Network, Plus, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Avatar, Button, IconButton, Skeleton, TextInput } from "@/components/ui-kit";
import { PositionDetail, PositionForm } from "@/components/positions/position-modals";
import { usePositionsMeta } from "@/components/positions/shared";
import type { Position } from "@/components/positions/types";

export default function PositionChartPage() {
  const toast = useToast();
  const meta = usePositionsMeta();
  const [items, setItems] = useState<Position[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ position: Position; mode: "direct" | "request" } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    api.get<{ items: Position[] }>("/positions/tree").then((r) => {
      setItems(r.items);
      setOpen((prev) => prev.size ? prev : new Set(r.items.filter((p) => p.root || r.items.find((x) => x.id === p.parent_id)?.root).map((p) => p.id)));
    }).catch((e) => toast.error(e.message));
  }, [nonce, toast]);

  const kids = useMemo(() => {
    const m = new Map<number | null, Position[]>();
    for (const p of items ?? []) {
      const k = p.root ? null : p.parent_id;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [items]);
  const byId = useMemo(() => new Map((items ?? []).map((p) => [p.id, p])), [items]);

  // Search: open the path to every match.
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !items) return new Set<number>();
    return new Set(items.filter((p) => `${p.title} ${p.code} ${p.incumbents.map((i) => i.name).join(" ")}`.toLowerCase().includes(t)).map((p) => p.id));
  }, [q, items]);
  useEffect(() => {
    if (!matches.size) return;
    setOpen((prev) => {
      const next = new Set(prev);
      for (const id of matches) {
        let cur = byId.get(id);
        while (cur && cur.parent_id && byId.has(cur.parent_id)) { next.add(cur.parent_id); cur = byId.get(cur.parent_id); }
      }
      return next;
    });
  }, [matches, byId]);

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const roots = branch ? [byId.get(branch)].filter((x): x is Position => !!x) : kids.get(null) ?? [];
  const totals = (items ?? []).reduce((a, p) => ({ seats: a.seats + p.headcount, filled: a.filled + p.filled, vacant: a.vacant + p.vacant }), { seats: 0, filled: 0, vacant: 0 });

  return (
    <div>
      <PageHeader title="Position chart" description={items ? `${items.length} positions · ${totals.filled} filled · ${totals.vacant} vacant seats` : "Positions by reports-to line."}
        actions={<Link href="/dashboard/positions"><Button icon={List}>Position list</Button></Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs"><TextInput value={q} onValueChange={setQ} placeholder="Find a position or person" /></div>
        <Button size="sm" icon={Plus} onClick={() => setOpen(new Set((items ?? []).map((p) => p.id)))}>Expand all</Button>
        <Button size="sm" icon={Minus} onClick={() => setOpen(new Set())}>Collapse all</Button>
        {branch && <Button size="sm" icon={X} onClick={() => setBranch(null)}>Show whole chart</Button>}
        <span className="ml-auto flex items-center gap-3 text-[12px] text-faint">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500/70" />Filled</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Vacant seats</span>
          <span className="flex items-center gap-1.5"><Star size={12} strokeWidth={1.4} className="text-amber-500" />Key position</span>
        </span>
      </div>
      {!items ? <Skeleton className="h-96 rounded-2xl" /> : !items.length ? (
        <Paper><EmptyState icon={Network} title="No positions yet" hint="Add positions on the Positions page to see the chart." /></Paper>
      ) : (
        <Paper className="overflow-x-auto p-5">
          <div className="min-w-[640px] space-y-1.5">
            {roots.map((p) => <Node key={p.id} p={p} depth={0} kids={kids} open={open} toggle={toggle} matches={matches}
              onOpen={(x) => setViewing(x.uuid)} onBranch={(id) => { setBranch(id); setOpen((s) => new Set([...s, id])); }} />)}
          </div>
        </Paper>
      )}
      <PositionDetail uuid={viewing} meta={meta} onClose={() => setViewing(null)} onChanged={() => setNonce((n) => n + 1)}
        onEdit={(p) => setEditing({ position: p, mode: "direct" })} onRequestChange={(p) => setEditing({ position: p, mode: "request" })} />
      <PositionForm open={!!editing} position={editing?.position ?? null} mode={editing?.mode} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNonce((n) => n + 1); }} />
    </div>
  );
}

function Node({ p, depth, kids, open, toggle, matches, onOpen, onBranch }: {
  p: Position; depth: number; kids: Map<number | null, Position[]>; open: Set<number>; toggle: (id: number) => void;
  matches: Set<number>; onOpen: (p: Position) => void; onBranch: (id: number) => void;
}) {
  const children = kids.get(p.id) ?? [];
  const isOpen = open.has(p.id);
  const hit = matches.has(p.id);
  return (
    <div>
      <div className="flex items-stretch gap-1" style={{ paddingLeft: depth * 28 }}>
        <div className="flex w-6 shrink-0 items-center justify-center">
          {children.length > 0 && <IconButton size="sm" icon={isOpen ? ChevronDown : ChevronRight} label={isOpen ? "Collapse" : "Expand"} onClick={() => toggle(p.id)} />}
        </div>
        <button type="button" onClick={() => onOpen(p)}
          className={`group flex min-w-0 flex-1 items-center gap-4 rounded-xl border bg-surface px-4 py-2.5 text-left transition-colors hover:border-line-strong ${hit ? "border-primary/50 bg-primary-soft/30" : "border-line"}`}>
          <span className={`h-9 w-1 shrink-0 rounded-full ${p.vacant > 0 ? "bg-amber-400" : "bg-emerald-500/70"}`} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[14px] text-ink">{p.title}{p.is_critical && <Star size={13} strokeWidth={1.4} className="text-amber-500" />}
              {p.status === "budgeted" && <span className="text-[12px] text-faint">· budgeted</span>}</p>
            <p className="truncate text-[12px] text-faint">{[p.code, p.department, p.location].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            {p.incumbents.slice(0, 3).map((i) => <span key={i.seat_uuid} className="flex items-center gap-1.5 text-[13px] text-muted"><Avatar name={i.name} src={i.photo} size={22} /><span className="max-w-[120px] truncate">{i.name}</span></span>)}
            {p.incumbents.length > 3 && <span className="text-[12px] text-faint">+{p.incumbents.length - 3}</span>}
            {p.vacant > 0 && <span className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-[12px] text-amber-700">{p.vacant} vacant</span>}
          </div>
          <div className="w-28 shrink-0 text-right text-[12px] text-faint">
            <span className="tabular">{p.filled}/{p.headcount}</span> seats
            {(p.below ?? 0) > 0 && <><br /><span className="tabular">{p.below}</span> below{p.below_vacant ? <span className="text-amber-700"> · {p.below_vacant} open</span> : null}</>}
          </div>
        </button>
        <div className="flex w-9 shrink-0 items-center justify-center">{children.length > 0 && <IconButton size="sm" icon={Focus} label="Show this branch only" onClick={() => onBranch(p.id)} />}</div>
      </div>
      {isOpen && children.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {children.map((k) => <Node key={k.id} p={k} depth={depth + 1} kids={kids} open={open} toggle={toggle} matches={matches} onOpen={onOpen} onBranch={onBranch} />)}
        </div>
      )}
    </div>
  );
}
