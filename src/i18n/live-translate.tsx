"use client";

/*
 * Shows the interface in the chosen language. The English texts of the app were collected from
 * the source (scripts/i18n-extract.mjs) and translated with Google Translate into
 * public/i18n/<lang>.json. Here every text on screen that matches one of them is swapped for its
 * translation as pages render and change, and swapped back when English is chosen again.
 * Names and other data are not in the list, so they stay as typed.
 *
 * Texts with numbers in them ("3 days left") match their pattern ("{0} days left").
 * Anything inside [data-no-translate], inputs, code or editable areas is left alone.
 */
import { useEffect } from "react";
import { useI18n } from "./provider";

type Dict = Record<string, string>;
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "svg", "SVG"]);
const NUM = /\d+(?:[.,:]\d+)*/g;

const loaded = new Map<string, Promise<Dict>>();
export function loadDict(lang: string): Promise<Dict> {
  if (!loaded.has(lang)) {
    const p = fetch(`/i18n/${lang}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    loaded.set(lang, p);
  }
  return loaded.get(lang)!;
}

/** The translation for one piece of text, or null. Keeps the surrounding spaces. */
export function lookup(dict: Dict, raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || !/[A-Za-z]/.test(text)) return null;
  let tr = dict[text];
  if (tr === undefined) {
    // numbers in the text: try its pattern, then put the numbers back
    const nums = text.match(NUM);
    if (!nums) return null;
    let i = 0;
    const pattern = text.replace(NUM, () => `{${i++}}`);
    const t = dict[pattern];
    if (t === undefined) return null;
    tr = t.replace(/\{(\d+)\}/g, (_, k) => nums[Number(k)] ?? "");
  }
  const lead = raw.match(/^\s*/)?.[0] ?? "", trail = raw.match(/\s*$/)?.[0] ?? "";
  return lead + tr + trail;
}

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.hasAttribute("data-no-translate") || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

export function LiveTranslate() {
  const { locale } = useI18n();

  useEffect(() => {
    // what we changed, to put back: text node -> [english, shown], element -> attr -> [english, shown]
    const texts = new Map<Text, [string, string]>();
    const attrs = new Map<Element, Map<string, [string, string]>>();
    let dict: Dict | null = null;
    let dead = false;

    const doText = (n: Text) => {
      if (!dict) return;
      const v = n.nodeValue ?? "";
      const known = texts.get(n);
      if (known && v === known[1]) return;              // already ours
      if (skipped(n.parentElement)) return;
      const tr = lookup(dict, v);
      if (tr && tr !== v) { texts.set(n, [v, tr]); n.nodeValue = tr; }
      else if (known) texts.delete(n);
    };
    const doAttrs = (el: Element) => {
      if (!dict) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const known = attrs.get(el)?.get(a);
        if (known && v === known[1]) continue;
        if (skipped(el.parentElement) && el.tagName !== "INPUT") continue;
        const tr = lookup(dict, v);
        if (tr && tr !== v) {
          if (!attrs.has(el)) attrs.set(el, new Map());
          attrs.get(el)!.set(a, [v, tr]);
          el.setAttribute(a, tr);
        }
      }
    };
    const doTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const el = root as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      doAttrs(el);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
        else doAttrs(n as Element);
      }
    };

    // changes are gathered and handled once per frame
    let pending = new Set<Node>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      const nodes = pending;
      pending = new Set();
      nodes.forEach((n) => { if (n.isConnected) doTree(n); });
      // forget nodes that left the page
      if (texts.size > 5000) for (const n of texts.keys()) if (!n.isConnected) texts.delete(n);
    };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") pending.add(r.target);
        else if (r.type === "attributes") pending.add(r.target);
        else r.addedNodes.forEach((n) => pending.add(n));
      }
      if (!frame) frame = requestAnimationFrame(flush);
    });

    if (locale !== "en") {
      loadDict(locale).then((d) => {
        if (dead) return;
        dict = d;
        doTree(document.body);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      });
    }

    return () => {
      dead = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      // put English back
      texts.forEach(([en, shown], n) => { if (n.nodeValue === shown) n.nodeValue = en; });
      attrs.forEach((m, el) => m.forEach(([en, shown], a) => { if (el.getAttribute(a) === shown) el.setAttribute(a, en); }));
    };
  }, [locale]);

  return null;
}
