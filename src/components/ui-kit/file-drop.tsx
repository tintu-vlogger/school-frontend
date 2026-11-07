"use client";

/*
 * FileDrop: drag-and-drop (or click) upload area with a removable file list.
 *   <FileDrop value={files} onChange={setFiles} accept="image/*,.pdf" multiple maxSizeMb={5} />
 * Files over maxSizeMb or not matching `accept` are skipped and reported via onReject.
 * The component only collects File objects; upload them yourself on save.
 */
import { useRef, useState } from "react";
import { FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { cx, ICON_STROKE } from "./internal";
import { useField } from "./fields";

export type FileDropProps = {
  value: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  maxFiles?: number;
  title?: string;
  hint?: string;
  disabled?: boolean;
  onReject?: (reasons: string[]) => void;
  id?: string;
  className?: string;
};

function matches(file: File, accept?: string) {
  if (!accept) return true;
  return accept.split(",").map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith(".") ? file.name.toLowerCase().endsWith(a) : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileDrop({ value, onChange, accept, multiple, maxSizeMb, maxFiles, title, hint, disabled, onReject, id, className }: FileDropProps) {
  const f = useField({ id });
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function add(list: FileList | null) {
    if (!list || disabled) return;
    const reasons: string[] = [];
    const ok: File[] = [];
    for (const file of Array.from(list)) {
      if (!matches(file, accept)) reasons.push(`${file.name}: this file type isn't allowed`);
      else if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) reasons.push(`${file.name}: larger than ${maxSizeMb} MB`);
      else ok.push(file);
    }
    let next = multiple ? [...value, ...ok] : ok.slice(0, 1);
    if (maxFiles && next.length > maxFiles) { reasons.push(`Only ${maxFiles} files can be added`); next = next.slice(0, maxFiles); }
    if (reasons.length) onReject?.(reasons);
    if (ok.length) onChange(next);
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={f.describedBy}
        aria-disabled={disabled || undefined}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
          over ? "border-primary bg-primary-soft/50" : "border-line-strong bg-sunken/40 hover:border-faint hover:bg-sunken",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cx("mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-surface transition-colors", over ? "border-primary/40 text-primary" : "border-line text-muted")}>
          <UploadCloud size={18} strokeWidth={ICON_STROKE} />
        </span>
        <p className="text-[14px] text-ink">{title ?? (over ? "Drop to add" : <>Drag files here or <span className="text-primary">browse</span></>)}</p>
        <p className="mt-1 text-[12.5px] text-faint">{hint ?? [accept?.replace(/,/g, ", "), maxSizeMb && `up to ${maxSizeMb} MB`].filter(Boolean).join(" · ")}</p>
        <input ref={input} id={f.id} type="file" className="hidden" accept={accept} multiple={multiple} disabled={disabled}
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {value.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {value.map((file, i) => {
            const Icon = file.type.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5">
                <Icon size={16} strokeWidth={ICON_STROKE} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{file.name}</span>
                <span className="shrink-0 text-[12px] text-faint tabular">{formatBytes(file.size)}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink">
                  <X size={14} strokeWidth={ICON_STROKE} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
