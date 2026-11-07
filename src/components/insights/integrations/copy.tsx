"use client";

/* Copy helpers: a read-only value with a copy button, and a copyable code block. */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton, useToast } from "@/components/ui-kit";

export function useCopy() {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, id = "x") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }
  return { copy, copied };
}

/** A single-line value (password, token, URL) with a copy button. */
export function CopyValue({ value, mono = true, large }: { value: string; mono?: boolean; large?: boolean }) {
  const { copy, copied } = useCopy();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/60 py-1 pl-3 pr-1">
      <code className={`min-w-0 flex-1 select-all break-all ${mono ? "font-mono" : ""} ${large ? "text-[15px]" : "text-[13px]"} text-ink`}>{value}</code>
      <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} size="sm" onClick={() => copy(value)} />
    </div>
  );
}

/** A multi-line snippet with a label and a copy button. */
export function CopyBlock({ label, value }: { label?: string; value: string }) {
  const { copy, copied } = useCopy();
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken/60 py-1 pl-3 pr-1">
        <span className="text-[12px] text-muted">{label}</span>
        <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} size="sm" onClick={() => copy(value)} />
      </div>
      <pre className="hr-scroll overflow-x-auto bg-surface px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">{value}</pre>
    </div>
  );
}
