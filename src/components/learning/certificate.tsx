"use client";

/*
 * Certificate of completion, drawn like a real certificate and printable.
 *   <CertificateModal enrolmentUuid={uuid} onClose={...} />
 */
import { useEffect, useState } from "react";
import { Award, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { formatLongDate } from "@/lib/datetime";
import { Button, Modal, Skeleton } from "@/components/ui-kit";
import { errText } from "./shared";
import type { Certificate } from "./types";

function CertificateBody({ c }: { c: Certificate }) {
  return (
    <div className="relative mx-auto aspect-[1.414/1] w-full max-w-[860px] overflow-hidden bg-[#fffdf7] p-[3%] text-center" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="absolute inset-[2%] border-[3px] border-double border-[#b08d57]/70" />
      <div className="absolute inset-[3.4%] border border-[#b08d57]/40" />
      <svg className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 text-[#b08d57]/15" viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="50" cy="50" rx="48" ry="14" fill="none" stroke="currentColor" strokeWidth="0.6" transform={`rotate(${i * 15} 50 50)`} />)}
      </svg>
      <svg className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 text-[#b08d57]/15" viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="50" cy="50" rx="48" ry="14" fill="none" stroke="currentColor" strokeWidth="0.6" transform={`rotate(${i * 15} 50 50)`} />)}
      </svg>
      <div className="relative flex h-full flex-col items-center justify-center px-[8%]">
        <p className="text-[clamp(11px,1.5vw,14px)] uppercase tracking-[0.35em] text-[#8a6d3b]">{c.company}</p>
        <h2 className="mt-[2.5%] text-[clamp(22px,4vw,40px)] font-normal text-[#2b2620]">{c.title}</h2>
        <div className="mt-[2%] h-px w-24 bg-[#b08d57]/60" />
        <p className="mt-[3%] text-[clamp(11px,1.4vw,14px)] italic text-[#6b5f50]">This is awarded to</p>
        <p className="mt-[1.5%] text-[clamp(24px,4.6vw,46px)] text-[#3f2f1a]" style={{ fontStyle: "italic" }}>{c.employee}</p>
        <p className="mt-[2.5%] max-w-[560px] text-[clamp(11px,1.5vw,15px)] leading-relaxed text-[#4b4237]">{c.text}</p>
        <div className="mt-auto flex w-full items-end justify-between gap-6 pt-[4%] text-[clamp(10px,1.2vw,12.5px)] text-[#6b5f50]">
          <div className="text-left">
            <p>Certificate no. <span className="tabular">{c.certificate_no}</span></p>
            {c.completed_on && <p>Completed {formatLongDate(c.completed_on)}</p>}
            {c.expires_on && <p>Valid until {formatLongDate(c.expires_on)}</p>}
          </div>
          <div className="flex h-[clamp(52px,9vw,84px)] w-[clamp(52px,9vw,84px)] items-center justify-center rounded-full border-2 border-[#b08d57]/70 bg-[#f6ecd6] text-[#8a6d3b]">
            <Award strokeWidth={1.1} className="h-1/2 w-1/2" />
          </div>
          <div className="text-right">
            <div className="mb-1 h-px w-40 bg-[#6b5f50]/50" />
            <p>{c.signatory}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CertificateModal({ enrolmentUuid, onClose }: { enrolmentUuid: string | null; onClose: () => void }) {
  const [c, setC] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enrolmentUuid) return;
    let live = true;
    setC(null); setError(null);
    api.get<Certificate>(`/learning/enrolments/${enrolmentUuid}/certificate`).then((r) => live && setC(r)).catch((e) => live && setError(errText(e) ?? "Not available"));
    return () => { live = false; };
  }, [enrolmentUuid]);

  function print() {
    const el = document.getElementById("hrms-certificate");
    if (!el) return;
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return;
    w.document.write(`<html><head><title>${c?.course ?? "Certificate"}</title><style>@page{size:A4 landscape;margin:0}body{margin:0}</style>${Array.from(document.querySelectorAll("style,link[rel=stylesheet]")).map((n) => n.outerHTML).join("")}</head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  }

  return (
    <Modal open={!!enrolmentUuid} onClose={onClose} size="xl" title={c ? c.course : "Certificate"}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="primary" icon={Printer} disabled={!c} onClick={print}>Print or save as PDF</Button></>}>
      {error ? <p className="py-12 text-center text-[14px] text-muted">{error}</p>
        : c ? <div id="hrms-certificate" className="shadow-[0_1px_2px_rgb(0_0_0/0.06)]"><CertificateBody c={c} /></div>
        : <Skeleton className="aspect-[1.414/1] w-full" />}
    </Modal>
  );
}
