"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Users, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface SearchResult {
  type: "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG = {
  employee: { icon: Users, label: "Employees", color: "text-primary", bg: "bg-primary-soft" },
};

// Simple in-memory cache
const cache = new Map<string, { data: SearchResult[]; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

export function UniversalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Click outside to close
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Check cache
    const cacheKey = q.toLowerCase().trim();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setResults(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const encoded = encodeURIComponent(q);

      // Employees only (the employee list supports a search filter).
      const found = await api.get<unknown>(`/employees/?search=${encoded}&limit=8`).catch(() => []);
      type Row = { uuid?: string; id?: number; first_name?: string; last_name?: string; designation_name?: string; email?: string; phone?: string };
      const employees = (Array.isArray(found) ? found : (found as { data?: Row[] })?.data || []) as Row[];

      const mapped: SearchResult[] = employees.slice(0, 8).map((s) => ({
        type: "employee" as const,
        id: s.uuid || String(s.id),
        title: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Employee",
        subtitle: s.designation_name || s.email || s.phone || "",
        href: `/dashboard/staff/${s.uuid || s.id}`,
      }));

      cache.set(cacheKey, { data: mapped, ts: Date.now() });
      setResults(mapped);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search — 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Keyboard navigation
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex]);
    }
  }

  function navigate(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(-1);
    router.push(result.href);
  }

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md mx-4">
      {/* Search trigger */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`
          flex w-full items-center gap-2.5 h-9 rounded-lg border border-line bg-sunken px-3 text-[14px] text-faint transition-colors hover:bg-surface hover:border-line-strong
          ${open ? "bg-surface border-line-strong" : ""}
        `}
      >
        <Search size={15} className="shrink-0" />
        {!open && (
          <>
            <span className="flex-1 text-left">Search employees...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-faint">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </>
        )}
        {open && (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(-1); }}
            onKeyDown={onKeyDown}
            placeholder="Search by name, phone, email..."
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
            autoComplete="off"
          />
        )}
        {open && query && (
          <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} className="shrink-0 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </button>

      {/* Results dropdown */}
      {open && (query.length >= 2 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-line bg-surface shadow-xl overflow-hidden">
          {loading && results.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-80 overflow-y-auto py-1">
              {Object.entries(grouped).map(([type, items]) => {
                const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
                const Icon = config.icon;
                return (
                  <div key={type}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-widest text-gray-400">
                      {config.label}
                    </p>
                    {items.map((item) => {
                      const globalIdx = results.indexOf(item);
                      return (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => navigate(item)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={`
                            flex w-full items-center gap-3 px-3 py-2 text-left transition-colors
                            ${globalIdx === selectedIndex ? "bg-primary/5" : "hover:bg-gray-50"}
                          `}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                            <Icon size={14} className={config.color} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${globalIdx === selectedIndex ? "text-primary" : "text-gray-900"}`}>
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {results.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400 flex items-center gap-3">
              <span><kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">↵</kbd> select</span>
              <span><kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">esc</kbd> close</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
