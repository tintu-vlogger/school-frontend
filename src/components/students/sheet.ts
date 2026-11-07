/*
 * Read the first sheet of a CSV or XLSX file in the browser, as rows of strings.
 *   const rows = await readSheet(file);   // [["Admission no", "First name", ...], ["A001", "Asha", ...]]
 * XLSX is unzipped with the browser's DecompressionStream (no library needed).
 */

export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  throw new Error("Use a .csv or .xlsx file.");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

type ZipEntry = { name: string; method: number; offset: number; compSize: number };

function zipEntries(buf: ArrayBuffer): ZipEntry[] {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file isn't a valid Excel workbook.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.push({ name, method, offset, compSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function entryText(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const v = new DataView(buf);
  const nameLen = v.getUint16(e.offset + 26, true);
  const extraLen = v.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buf, start, e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error("This workbook uses an unsupported compression.");
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't read .xlsx files. Save the sheet as CSV instead.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel stores dates as serial numbers; turn plausible ones in date-like columns into YYYY-MM-DD. */
export function excelDate(serial: string): string {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1000 || n > 80000) return serial;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const entries = zipEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const parser = new DOMParser();
  const shared: string[] = [];
  const ss = byName.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = parser.parseFromString(await entryText(buf, ss), "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    }
  }
  const sheet = byName.get("xl/worksheets/sheet1.xml") ??
    entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!sheet) throw new Error("The workbook has no sheets.");
  const doc = parser.parseFromString(await entryText(buf, sheet), "application/xml");
  const rows: string[][] = [];
  for (const r of Array.from(doc.getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const idx = ref ? colIndex(ref) : row.length;
      const t = c.getAttribute("t");
      let val = "";
      if (t === "s") val = shared[Number(c.getElementsByTagName("v")[0]?.textContent ?? -1)] ?? "";
      else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent ?? "").join("");
      else val = c.getElementsByTagName("v")[0]?.textContent ?? "";
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
}
