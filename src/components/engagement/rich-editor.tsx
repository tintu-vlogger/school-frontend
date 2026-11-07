"use client";

/*
 * A small rich-text editor for announcements (contentEditable + a toolbar). The server
 * cleans the HTML again on save, so only simple formatting, links and our own uploaded
 * pictures survive.
 *   <RichEditor value={html} onChange={setHtml} placeholder="Write…" />
 *   withImages(html)   turns stored picture paths into full addresses for display
 */
import { useEffect, useRef, useState } from "react";
import {
  Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Minus, Quote, RemoveFormatting, Underline, Unlink,
} from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Button, Modal, TextInput } from "@/components/ui-kit";
import { uploadEngagementFile } from "./upload";

/** Stored announcement HTML keeps pictures as /api/v1/... paths; make them load from the API host. */
export function withImages(html: string | null | undefined): string {
  return (html ?? "").replace(/src="(\/api\/v1\/[^"]+)"/g, (_, p: string) => `src="${resolveImageUrl(p.replace(/&amp;/g, "&"))}"`);
}

type Cmd = { icon: typeof Bold; label: string; run: () => void; active?: () => boolean };

const exec = (cmd: string, arg?: string) => document.execCommand(cmd, false, arg);
const blockIs = (tag: string) => {
  try { return String(document.queryCommandValue("formatBlock")).toLowerCase() === tag; } catch { return false; }
};

export function RichEditor({ value, onChange, placeholder = "Write your announcement…", minHeight = 260 }: {
  value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number;
}) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = useRef<Range | null>(null);
  const [, force] = useState(0);
  const [empty, setEmpty] = useState(!value);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  // load outside changes (opening a different announcement) without fighting the caret
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value && document.activeElement !== el) {
      el.innerHTML = withImages(value);
      setEmpty(!el.textContent?.trim() && !el.querySelector("img"));
    }
  }, [value]);

  useEffect(() => {
    const onSel = () => { if (ref.current?.contains(document.getSelection()?.anchorNode ?? null)) force((n) => n + 1); };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img"));
    onChange(el.innerHTML);
  };
  const keep = () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    ref.current?.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
  };
  const run = (fn: () => void) => { ref.current?.focus(); fn(); emit(); force((n) => n + 1); };
  useEffect(() => {
    // paragraphs rather than <div>s, and <b>/<i> tags rather than inline styles (the server keeps tags only)
    try { exec("defaultParagraphSeparator", "p"); exec("styleWithCSS", "false"); } catch { /* older browsers */ }
  }, []);
  const block = (tag: string) => run(() => exec("formatBlock", blockIs(tag) ? "p" : tag));

  const groups: Cmd[][] = [
    [
      { icon: Bold, label: "Bold", run: () => run(() => exec("bold")), active: () => document.queryCommandState("bold") },
      { icon: Italic, label: "Italic", run: () => run(() => exec("italic")), active: () => document.queryCommandState("italic") },
      { icon: Underline, label: "Underline", run: () => run(() => exec("underline")), active: () => document.queryCommandState("underline") },
    ],
    [
      { icon: Heading2, label: "Heading", run: () => block("h2"), active: () => blockIs("h2") },
      { icon: Heading3, label: "Subheading", run: () => block("h3"), active: () => blockIs("h3") },
      { icon: Quote, label: "Quote", run: () => block("blockquote"), active: () => blockIs("blockquote") },
    ],
    [
      { icon: List, label: "Bullet list", run: () => run(() => exec("insertUnorderedList")), active: () => document.queryCommandState("insertUnorderedList") },
      { icon: ListOrdered, label: "Numbered list", run: () => run(() => exec("insertOrderedList")), active: () => document.queryCommandState("insertOrderedList") },
      { icon: Minus, label: "Divider", run: () => run(() => exec("insertHorizontalRule")) },
    ],
    [
      { icon: Link2, label: "Link", run: () => { keep(); setLink("https://"); } },
      { icon: Unlink, label: "Remove link", run: () => run(() => exec("unlink")) },
      { icon: ImagePlus, label: "Picture", run: () => { keep(); fileRef.current?.click(); } },
      { icon: RemoveFormatting, label: "Clear formatting", run: () => run(() => { exec("removeFormat"); exec("formatBlock", "p"); }) },
    ],
  ];

  async function addPicture(file: File) {
    setUploading(true);
    try {
      const card = await uploadEngagementFile(file);
      if (card.kind !== "image") throw new Error("That file isn't a picture.");
      restore();
      exec("insertHTML", `<img src="${resolveImageUrl(card.url)}" alt="${card.name.replace(/"/g, "")}"><p><br></p>`);
      emit();
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function applyLink() {
    const url = (link ?? "").trim();
    setLink(null);
    if (!/^(https?:\/\/|mailto:)\S+/i.test(url)) { toast.error("Enter a full link starting with https://"); return; }
    restore();
    const sel = document.getSelection();
    if (sel && sel.isCollapsed) exec("insertHTML", `<a href="${url.replace(/"/g, "%22")}">${url.replace(/</g, "&lt;")}</a>`);
    else exec("createLink", url);
    emit();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-sunken/60 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        {groups.map((g, gi) => (
          <span key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
            {g.map((c) => {
              const on = (() => { try { return !!c.active?.() && !!ref.current?.contains(document.getSelection()?.anchorNode ?? null); } catch { return false; } })();
              return (
                <button key={c.label} type="button" title={c.label} aria-label={c.label} aria-pressed={on}
                  onMouseDown={(e) => e.preventDefault()} onClick={c.run}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${on ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface hover:text-ink"}`}>
                  {c.label === "Picture" && uploading ? <Loader2 size={16} className="animate-spin" /> : <c.icon size={16} strokeWidth={1.6} />}
                </button>
              );
            })}
          </span>
        ))}
      </div>
      <div className="relative">
        {empty && <p className="pointer-events-none absolute left-4 top-3 text-[15px] text-faint">{placeholder}</p>}
        <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Announcement text"
          onInput={emit} onBlur={() => { keep(); emit(); }}
          onPaste={(e) => {
            // paste as plain text with line breaks, so styles from other apps don't come along
            const text = e.clipboardData.getData("text/plain");
            if (!text) return;
            e.preventDefault();
            const html = text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("");
            exec("insertHTML", html);
          }}
          className="hr-scroll max-h-[52vh] overflow-y-auto px-4 py-3 text-[15px] leading-relaxed text-ink outline-none [&_a]:text-primary [&_a]:underline [&_b]:![font-weight:600] [&_strong]:![font-weight:600] [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[20px] [&_h2]:font-light [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-[17px] [&_hr]:my-4 [&_hr]:border-line [&_img]:my-3 [&_img]:max-h-80 [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6"
          style={{ minHeight }} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addPicture(f); }} />
      <Modal open={link !== null} onClose={() => setLink(null)} size="sm" title="Add a link"
        footer={<><Button variant="ghost" onClick={() => setLink(null)}>Cancel</Button><Button variant="primary" onClick={applyLink}>Add link</Button></>}>
        <TextInput value={link ?? ""} onValueChange={setLink} autoFocusInModal placeholder="https://"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} />
        <p className="mt-2 text-[12.5px] text-faint">Select some text first to turn it into a link, or the address itself is added.</p>
      </Modal>
    </div>
  );
}
