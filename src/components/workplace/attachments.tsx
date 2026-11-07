"use client";

/*
 * Attachments for cases, grievances, tasks and comments.
 *   <AttachmentPicker value={files} onChange={setFiles} />   // uploads as soon as files are picked
 *   <AttachmentList items={case.attachments} />              // chips with open / download links
 * `value` holds uploaded FileRefs; send `value.map((f) => f.uuid)` to the API.
 */
import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { formatBytes } from "@/components/ui-kit";
import { fileHref, uploadFile, type FileRef } from "./files";

const ICON = 1.4;

export function AttachmentList({ items, className = "" }: { items?: FileRef[] | null; className?: string }) {
  if (!items?.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((f) => {
        const Icon = f.content_type?.startsWith("image/") ? ImageIcon : FileText;
        return (
          <a key={f.uuid} href={fileHref(f.url)} target="_blank" rel="noreferrer"
            className="group inline-flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink transition-colors hover:border-line-strong hover:bg-sunken/60">
            <Icon size={14} strokeWidth={ICON} className="shrink-0 text-muted" />
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-faint">{formatBytes(f.size)}</span>
          </a>
        );
      })}
    </div>
  );
}

export function AttachmentPicker({ value, onChange, max = 5, compact = false, disabled = false }: {
  value: FileRef[]; onChange: (files: FileRef[]) => void; max?: number; compact?: boolean; disabled?: boolean;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(0, max - value.length));
    if (!files.length) { toast.info(`Up to ${max} files`); return; }
    setBusy((n) => n + files.length);
    const done: FileRef[] = [];
    for (const f of files) {
      try { done.push(await uploadFile(f)); }
      catch (e) { toast.error(`Couldn't attach ${f.name}`, { description: e instanceof Error ? e.message : undefined }); }
      finally { setBusy((n) => n - 1); }
    }
    onChange([...value, ...done]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt,.csv,.zip" />
      <button type="button" disabled={disabled || value.length >= max} onClick={() => input.current?.click()}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40 ${compact ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]"}`}>
        {busy ? <Loader2 size={14} strokeWidth={ICON} className="animate-spin" /> : <Paperclip size={14} strokeWidth={ICON} />}
        {busy ? "Uploading…" : "Attach files"}
      </button>
      {value.map((f) => (
        <span key={f.uuid} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-line bg-sunken/50 py-1 pl-2.5 pr-1 text-[12.5px] text-ink">
          <span className="truncate">{f.name}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(value.filter((x) => x.uuid !== f.uuid))}
            className="rounded p-0.5 text-faint hover:bg-surface hover:text-ink"><X size={13} strokeWidth={ICON} /></button>
        </span>
      ))}
    </div>
  );
}
