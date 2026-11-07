/*
 * Org chart export: lays a tree out on paper and draws it as SVG, then as PNG (canvas) or
 * a one-page PDF (the PNG embedded as a JPEG; no extra libraries).
 *
 *   const svg = chartSvg(tree, { title: "Acme · Reporting lines" });   // { svg, width, height }
 *   await downloadPng(svg, "org-chart.png");
 *   await downloadPdf(svg, "org-chart.pdf");
 *
 * Photos are drawn as initials so the canvas never needs images from other sites.
 */

export type ChartNode = { id: number | string; title: string; subtitle?: string | null; meta?: string | null; badge?: string | null; children: ChartNode[] };
export type ChartSvg = { svg: string; width: number; height: number };

const W = 210, H = 78, GAP_X = 18, GAP_Y = 46, PAD = 32, HEAD = 56;
const TINTS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string | null | undefined, n: number) => { const t = (s ?? "").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const tint = (s: string) => TINTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

type Placed = { node: ChartNode; x: number; y: number; kids: Placed[]; stacked: boolean };

/** Four or more reports who have no reports themselves are stacked in one column. */
const STACK_MIN = 4, STACK_INDENT = 22, STACK_GAP = 10;
const stacks = (n: ChartNode) => n.children.length >= STACK_MIN && n.children.every((c) => !c.children.length);

function widthOf(n: ChartNode, memo: Map<ChartNode, number>): number {
  const hit = memo.get(n);
  if (hit != null) return hit;
  const w = !n.children.length ? W : stacks(n) ? W + STACK_INDENT
    : Math.max(W, n.children.reduce((s, c) => s + widthOf(c, memo), 0) + GAP_X * (n.children.length - 1));
  memo.set(n, w);
  return w;
}

function place(n: ChartNode, left: number, top: number, memo: Map<ChartNode, number>): Placed {
  const w = widthOf(n, memo);
  if (stacks(n)) {
    const x = left + (w - W - STACK_INDENT) / 2;
    const kids = n.children.map((c, i) => ({ node: c, x: x + STACK_INDENT, y: top + H + GAP_Y / 2 + i * (H + STACK_GAP), kids: [], stacked: false }));
    return { node: n, x, y: top, kids, stacked: true };
  }
  let cursor = left + (w - (n.children.reduce((s, c) => s + widthOf(c, memo), 0) + GAP_X * Math.max(0, n.children.length - 1))) / 2;
  const kids = n.children.map((c) => { const p = place(c, cursor, top + H + GAP_Y, memo); cursor += widthOf(c, memo) + GAP_X; return p; });
  return { node: n, x: left + w / 2 - W / 2, y: top, kids, stacked: false };
}

/** Draw the trees (one per root) side by side. */
export function chartSvg(roots: ChartNode[], opts: { title?: string; subtitle?: string } = {}): ChartSvg {
  const memo = new Map<ChartNode, number>();
  let left = 0, bottom = H;
  const placed = roots.map((r) => { const p = place(r, left, 0, memo); left += widthOf(r, memo) + GAP_X * 2; return p; });
  const walk = (p: Placed) => { bottom = Math.max(bottom, p.y + H); p.kids.forEach(walk); };
  placed.forEach(walk);
  const head = opts.title ? HEAD : 0;
  const width = Math.max(left - GAP_X * 2, W) + PAD * 2;
  const height = bottom + PAD * 2 + head;
  const ox = PAD, oy = PAD + head;
  const lines: string[] = [], boxes: string[] = [];
  const draw = (p: Placed) => {
    const x = ox + p.x, y = oy + p.y, cx = x + W / 2;
    if (p.kids.length && p.stacked) {
      const lx = x + STACK_INDENT / 2, last = oy + p.kids[p.kids.length - 1].y + H / 2;
      lines.push(`<path d="M${lx} ${y + H} V${last}"/>`);
      p.kids.forEach((k) => lines.push(`<path d="M${lx} ${oy + k.y + H / 2} H${ox + k.x}"/>`));
    } else if (p.kids.length) {
      const midY = y + H + GAP_Y / 2;
      lines.push(`<path d="M${cx} ${y + H} V${midY}"/>`);
      const xs = p.kids.map((k) => ox + k.x + W / 2);
      if (xs.length > 1) lines.push(`<path d="M${Math.min(...xs)} ${midY} H${Math.max(...xs)}"/>`);
      xs.forEach((kx) => lines.push(`<path d="M${kx} ${midY} V${midY + GAP_Y / 2}"/>`));
    }
    const n = p.node, col = tint(n.title);
    boxes.push(`<g transform="translate(${x} ${y})">`
      + `<rect width="${W}" height="${H}" rx="12" fill="#ffffff" stroke="#d9d9e3"/>`
      + `<circle cx="30" cy="${H / 2}" r="17" fill="${col}" fill-opacity="0.14"/>`
      + `<text x="30" y="${H / 2 + 4.5}" text-anchor="middle" font-size="12" fill="${col}">${esc(initials(n.title))}</text>`
      + `<text x="56" y="25" font-size="13" fill="#1b1b22">${esc(cut(n.title, 22))}</text>`
      + (n.subtitle ? `<text x="56" y="43" font-size="11" fill="#5b5b6b">${esc(cut(n.subtitle, 26))}</text>` : "")
      + (n.meta ? `<text x="56" y="59" font-size="10" fill="#8a8a99">${esc(cut(n.meta, 28))}</text>` : "")
      + (n.badge ? `<text x="${W - 10}" y="${H - 9}" text-anchor="end" font-size="9.5" fill="#b45309">${esc(cut(n.badge, 14))}</text>` : "")
      + `</g>`);
    p.kids.forEach(draw);
  };
  placed.forEach(draw);
  const title = opts.title
    ? `<text x="${PAD}" y="${PAD + 18}" font-size="18" fill="#1b1b22">${esc(opts.title)}</text>`
      + (opts.subtitle ? `<text x="${PAD}" y="${PAD + 38}" font-size="11.5" fill="#8a8a99">${esc(opts.subtitle)}</text>` : "")
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
    + `font-family="Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="400">`
    + `<rect width="100%" height="100%" fill="#ffffff"/>${title}`
    + `<g fill="none" stroke="#b9b9c8" stroke-width="1.2">${lines.join("")}</g>${boxes.join("")}</svg>`;
  return { svg, width, height };
}

/** Largest canvas side most browsers accept. */
const MAX_SIDE = 16000;

async function toCanvas(chart: ChartSvg, scale = 2): Promise<HTMLCanvasElement> {
  const s = Math.max(0.25, Math.min(scale, MAX_SIDE / chart.width, MAX_SIDE / chart.height));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.svg)}`;
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Couldn't draw the chart")); img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(chart.width * s);
  canvas.height = Math.round(chart.height * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the chart");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function downloadPng(chart: ChartSvg, name: string) {
  const canvas = await toCanvas(chart, 2);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Couldn't make the image");
  save(blob, name);
}

export function downloadSvg(chart: ChartSvg, name: string) {
  save(new Blob([chart.svg], { type: "image/svg+xml" }), name);
}

/** A one-page PDF sized to the chart (landscape or portrait), with the chart as a JPEG. */
export async function downloadPdf(chart: ChartSvg, name: string) {
  const canvas = await toCanvas(chart, 2);
  const jpeg = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "");
  // Page in points: fit the chart on A4/A3-ish paper, keeping its shape.
  const longSide = Math.max(chart.width, chart.height) > 2400 ? 1191 : 842; // A3 or A4 long side
  const shortSide = longSide === 1191 ? 842 : 595;
  const landscape = chart.width >= chart.height;
  const pw = landscape ? longSide : shortSide, ph = landscape ? shortSide : longSide;
  const margin = 24;
  const fit = Math.min((pw - margin * 2) / chart.width, (ph - margin * 2) / chart.height);
  const iw = chart.width * fit, ih = chart.height * fit;
  const ix = (pw - iw) / 2, iy = (ph - ih) / 2;
  const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im0 Do Q`;
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  // Build as a binary string (each char is one byte), recording offsets for the xref table.
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  save(new Blob([bytes], { type: "application/pdf" }), name);
}

/** Today's date for file names, e.g. 2026-11-07. */
export const stamp = () => new Date().toISOString().slice(0, 10);
