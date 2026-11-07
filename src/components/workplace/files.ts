/*
 * File helpers for workplace pages (help desk, grievances, documents, letters, tasks).
 *   const ref = await uploadFile(file)            // POST /documents/uploads → { uuid, name, size, url }
 *   <a href={fileHref(ref.url)} target="_blank">  // signed, short-lived links from the API
 *   const url = await postForBlob("/letters/preview.pdf", body)  // object URL of a PDF/CSV
 */
import { API_BASE, resolveImageUrl } from "@/lib/api";

export type FileRef = {
  uuid: string; name: string; size: number; content_type: string; url?: string | null; download_url?: string | null;
};

const ROOTS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "nextgenhrms.com,lvh.me,localhost").split(",").map((s) => s.trim()).filter(Boolean);
const RESERVED = new Set(["www", "api", "admin", "app"]);

function companySlug(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  for (const root of ROOTS) {
    if (host === root) return null;
    if (host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      return !sub || RESERVED.has(sub) || sub.includes(".") ? null : sub;
    }
  }
  return null;
}

export function companyAddress(): string | null {
  return companySlug();
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  if (token) h.Authorization = `Bearer ${token}`;
  const slug = companySlug();
  if (slug) h["X-Company-Slug"] = slug;
  return h;
}

async function errorOf(res: Response) {
  const body = await res.json().catch(() => null);
  return new Error(body?.detail || `Request failed (${res.status})`);
}

export async function uploadFile(file: File): Promise<FileRef> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/documents/uploads`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw await errorOf(res);
  return res.json();
}

export function fileHref(url?: string | null): string {
  return url ? resolveImageUrl(url) : "";
}

/** POST JSON and get the binary answer (PDF, CSV) as an object URL. */
export async function postForBlob(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorOf(res);
  return URL.createObjectURL(await res.blob());
}

/** GET a file (e.g. CSV export) and save it. */
export async function downloadFrom(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw await errorOf(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read an image file as a data URL (logos and signatures inside header/footer designs). */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}
