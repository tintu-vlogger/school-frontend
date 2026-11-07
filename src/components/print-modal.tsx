"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, Download, X, Loader2 } from "lucide-react";

/** One print preview for any document: pick a paper size, preview, print. Each size
 *  supplies its own loader returning a URL (PDF object URL or an HTML data URL). */
export interface PrintSize { id: string; label: string; load: () => Promise<string> }

export function PrintModal({ title, sizes, onClose, storageKey }: { title: string; sizes: PrintSize[]; onClose: () => void; storageKey?: string }) {
  const [sizeId, setSizeId] = useState(sizes[0].id);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const key = storageKey || `hrms_print_${title.toLowerCase().replace(/\s+/g, "_")}`;

  useEffect(() => {
    try { const saved = localStorage.getItem(key); if (saved && sizes.some((s) => s.id === saved)) setSizeId(saved); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true; let objectUrl: string | null = null;
    setLoading(true); setError(null);
    const size = sizes.find((s) => s.id === sizeId) || sizes[0];
    size.load().then((u) => { if (!alive) return; objectUrl = u; setUrl(u); }).catch((e) => alive && setError(e instanceof Error ? e.message : "Not available")).finally(() => alive && setLoading(false));
    return () => { alive = false; if (objectUrl && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function choose(id: string) { setSizeId(id); try { localStorage.setItem(key, id); } catch { /* ignore */ } }
  function print() { const win = frameRef.current?.contentWindow; if (win) { win.focus(); win.print(); } else if (url) window.open(url, "_blank"); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
            {sizes.map((s) => (
              <button key={s.id} type="button" onClick={() => choose(s.id)} className={`px-3 py-1.5 font-medium transition ${sizeId === s.id ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}>{s.label}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {url && url.startsWith("blob:") && <a href={url} download className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Download size={14} /> PDF</a>}
            <button type="button" onClick={print} disabled={!url} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"><Printer size={14} /> Print</button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 bg-gray-100">
          {loading ? <div className="flex h-full items-center justify-center text-gray-400"><Loader2 size={22} className="animate-spin" /></div>
            : error ? <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-600">{error}</div>
            : url ? <iframe ref={frameRef} src={url.startsWith("blob:") ? `${url}#toolbar=0&view=FitH` : url} title={title} className="h-full w-full border-0" /> : null}
        </div>
      </div>
    </div>
  );
}
