/*
 * Upload a picture or file for Buzz, announcements or surveys (multipart, so it goes
 * around api.request which always sends JSON). Returns the stored file card.
 *   const card = await uploadEngagementFile(file, (pct) => setProgress(pct));
 */
import { API_BASE } from "@/lib/api";
import type { FileCard } from "./types";

function companySlug(): string | null {
  const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost").split(",").map((s) => s.trim());
  const host = window.location.hostname.toLowerCase();
  for (const root of roots) {
    if (host !== root && host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && !sub.includes(".") && !["www", "api", "admin", "app"].includes(sub)) return sub;
    }
  }
  return null;
}

export function uploadEngagementFile(file: File, onProgress?: (pct: number) => void): Promise<FileCard> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/engagement/files`);
    const token = localStorage.getItem("hrms_token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const slug = companySlug();
    if (slug) xhr.setRequestHeader("X-Company-Slug", slug);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded * 100) / e.total)); };
    xhr.onload = () => {
      let body: { detail?: string } & Partial<FileCard> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as FileCard);
      else reject(new Error(body.detail || "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Unable to connect to server. Please check your connection and try again."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
