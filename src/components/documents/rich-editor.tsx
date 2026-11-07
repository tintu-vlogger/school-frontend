"use client";

/*
 * A small rich-text editor for letter templates and header/footer designs:
 * contentEditable with a toolbar (bold, italic, underline, headings, lists, alignment,
 * table, line) and an HTML source view. `ref.insert(text)` puts text at the caret.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Code2, Heading1, Heading2, ImagePlus, Italic, List, ListOrdered, Minus, Pilcrow, Table, Underline,
} from "lucide-react";

export type RichEditorHandle = { insert: (text: string) => void; insertHtml: (html: string) => void };

type Props = { value: string; onChange: (html: string) => void; minHeight?: number; onImage?: () => void; placeholder?: string };

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor({ value, onChange, minHeight = 420, onImage, placeholder }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [source, setSource] = useState(false);
  const last = useRef(value);

  // keep the DOM in step when the value changes from outside (switching templates)
  useEffect(() => {
    if (!source && el.current && value !== last.current) { el.current.innerHTML = value; last.current = value; }
  }, [value, source]);
  useEffect(() => { if (el.current && !source) el.current.innerHTML = value; /* first paint and back from source */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const emit = () => { const html = el.current?.innerHTML ?? ""; last.current = html; onChange(html); };
  const save = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    el.current?.focus();
    const sel = window.getSelection();
    if (sel && range.current) { sel.removeAllRanges(); sel.addRange(range.current); }
  };
  const exec = (cmd: string, arg?: string) => { restore(); document.execCommand(cmd, false, arg); save(); emit(); };

  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      if (source) { onChange(value + text); return; }
      restore();
      if (!range.current && el.current) { // no caret yet: append at the end
        const r = document.createRange(); r.selectNodeContents(el.current); r.collapse(false);
        const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
      }
      document.execCommand("insertText", false, text);
      save(); emit();
    },
    insertHtml: (html: string) => {
      if (source) { onChange(value + html); return; }
      restore(); document.execCommand("insertHTML", false, html); save(); emit();
    },
  }));

  const tools: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") },
    { icon: Underline, label: "Underline", run: () => exec("underline") },
    { icon: Heading1, label: "Heading", run: () => exec("formatBlock", "<h2>") },
    { icon: Heading2, label: "Sub-heading", run: () => exec("formatBlock", "<h3>") },
    { icon: Pilcrow, label: "Paragraph", run: () => exec("formatBlock", "<p>") },
    { icon: List, label: "Bullets", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: AlignLeft, label: "Align left", run: () => exec("justifyLeft") },
    { icon: AlignCenter, label: "Centre", run: () => exec("justifyCenter") },
    { icon: AlignRight, label: "Align right", run: () => exec("justifyRight") },
    { icon: Table, label: "Table", run: () => exec("insertHTML", "<table><tr><th>Item</th><th>Detail</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>") },
    { icon: Minus, label: "Line", run: () => exec("insertHorizontalRule") },
  ];

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface focus-within:border-primary/40">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-sunken/40 px-1.5 py-1">
        {!source && tools.map((t) => (
          <button key={t.label} type="button" title={t.label} aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={t.run}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink">
            <t.icon size={15} strokeWidth={1.4} />
          </button>
        ))}
        {!source && onImage && (
          <button type="button" title="Image" aria-label="Insert image" onMouseDown={(e) => { e.preventDefault(); save(); }} onClick={onImage}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"><ImagePlus size={15} strokeWidth={1.4} /></button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setSource((s) => !s)}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] ${source ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface hover:text-ink"}`}>
          <Code2 size={14} strokeWidth={1.4} /> HTML
        </button>
      </div>
      {source ? (
        <textarea value={value} onChange={(e) => { last.current = e.target.value; onChange(e.target.value); }} spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-surface p-4 font-mono text-[12.5px] leading-relaxed text-ink outline-none" style={{ minHeight }} />
      ) : (
        <div ref={el} contentEditable suppressContentEditableWarning onInput={() => { save(); emit(); }} onKeyUp={save} onMouseUp={save} onBlur={save}
          data-placeholder={placeholder}
          className="doc-editor min-h-0 flex-1 overflow-y-auto p-5 text-[14px] leading-relaxed text-ink outline-none [&_h2]:mb-2 [&_h2]:text-[18px] [&_h3]:mb-1.5 [&_h3]:text-[15.5px] [&_hr]:my-3 [&_hr]:border-line [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-sunken [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_img]:inline-block [&_img]:max-h-24"
          style={{ minHeight }} />
      )}
    </div>
  );
});
