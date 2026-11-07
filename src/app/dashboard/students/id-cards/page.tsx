"use client";

/*
 * Printable ID cards for a section: photo, name, class, admission number, blood group,
 * guardian phone, a QR code of the admission number, and the institution's logo and name.
 * Cards are drawn with inline styles so the print window (an isolated iframe) looks the same.
 */
import { useEffect, useRef, useState } from "react";
import { IdCard, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, resolveImageUrl } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, EmptyState } from "@/components/shell/page";
import { Button, Field, Select, Skeleton } from "@/components/ui-kit";
import { useSectionOptions } from "@/components/academics/shared";

type Card = {
  id: number; uuid: string; admission_no: string; name: string; photo_url: string | null; roll_no: string | null;
  section_label: string | null; program_name: string | null; blood_group: string | null; date_of_birth: string | null;
  guardian_name: string | null; guardian_phone: string | null; house_name: string | null;
};
type CardsOut = { section: { id: number; label: string; session_name: string | null }; students: Card[] };
type Company = { company_name: string; logo_url: string | null; address: string | null; city: string | null; phone: string | null };

const ACCENT = "#4f46e5";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function StudentCard({ c, company, session, roll, guardian }: { c: Card; company: Company | null; session: string | null; roll: string; guardian: string }) {
  const row = (label: string, value: string | null) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 8.5, lineHeight: "13px" }}>
      <span style={{ color: "#6b6b78" }}>{label}</span>
      <span style={{ color: "#1b1b22", textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
  return (
    <div className="idcard" style={{
      width: "54mm", height: "86mm", boxSizing: "border-box", border: "1px solid #dcdce3", borderRadius: 10, overflow: "hidden",
      background: "#fff", fontFamily: "Inter, system-ui, sans-serif", display: "flex", flexDirection: "column", breakInside: "avoid",
    }}>
      <div style={{ background: ACCENT, color: "#fff", padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        {company?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={resolveImageUrl(company.logo_url)} alt="" style={{ width: 20, height: 20, borderRadius: 4, background: "#fff", objectFit: "contain" }} />
          : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 500, lineHeight: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company?.company_name ?? ""}</div>
          <div style={{ fontSize: 7, opacity: 0.85 }}>Identity card{session ? ` · ${session}` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 8px 4px" }}>
        {c.photo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={resolveImageUrl(c.photo_url)} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", border: "1px solid #e6e6ec" }} />
          : <div style={{ width: 60, height: 60, borderRadius: 8, background: "#eef0ff", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{initials(c.name)}</div>}
        <div style={{ marginTop: 5, fontSize: 11, color: "#1b1b22", textAlign: "center", lineHeight: "14px" }}>{c.name}</div>
        <div style={{ fontSize: 8.5, color: "#6b6b78" }}>{c.section_label ?? c.program_name ?? ""}</div>
      </div>
      <div style={{ padding: "2px 9px", flex: 1 }}>
        {row("Admission no.", c.admission_no)}
        {row(roll, c.roll_no)}
        {row("Blood group", c.blood_group)}
        {row(guardian, c.guardian_phone)}
        {c.house_name && row("House", c.house_name)}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "4px 8px 7px" }}>
        <div style={{ fontSize: 6.5, color: "#8a8a96", maxWidth: "30mm", lineHeight: "9px" }}>
          {[company?.address, company?.city].filter(Boolean).join(", ")}{company?.phone ? ` · ${company.phone}` : ""}
        </div>
        <QRCodeSVG value={c.admission_no} size={46} level="M" />
      </div>
    </div>
  );
}

export default function IdCardsPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const { options, loading: sectionsLoading } = useSectionOptions(null);
  const [section, setSection] = useState<number | null>(null);
  const [data, setData] = useState<CardsOut | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { api.get<Company>("/company/profile").then(setCompany).catch(() => {}); }, []);
  useEffect(() => {
    if (!section) return;
    let live = true;
    api.get<CardsOut>(`/students/section/${section}/id-cards`).then((r) => { if (live) setData(r); })
      .catch(() => { if (live) toast.error("Couldn't load the cards"); });
    return () => { live = false; };
  }, [section, toast]);
  const cur = data && data.section.id === section ? data : null;

  function print() {
    if (!sheet.current || !cur) return;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><title>ID cards - ${cur.section.label}</title><style>
      @page { size: A4; margin: 10mm; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { display: flex; flex-wrap: wrap; gap: 5mm; }
    </style></head><body><div class="sheet">${sheet.current.innerHTML}</div></body></html>`);
    doc.close();
    const go = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); };
    const imgs = Array.from(doc.images);
    if (!imgs.length) setTimeout(go, 50);
    else Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })))).then(go);
  }

  return (
    <div>
      <PageHeader eyebrow={term("students")} title="ID cards"
        description={`Print identity cards for a whole ${term("section").toLowerCase()}. Each card carries a QR code of the admission number.`}
        actions={<Button variant="primary" icon={Printer} disabled={!cur?.students.length} onClick={print}>Print</Button>} />
      <div className="mb-5 max-w-sm">
        <Field label={term("section")} hint="A4 sheets, ten cards per page. Cut along the borders.">
          <Select value={section} onChange={setSection} options={options} placeholder={sectionsLoading ? "Loading" : `Pick a ${term("section").toLowerCase()}`} />
        </Field>
      </div>
      {!section ? (
        <Paper><EmptyState icon={IdCard} title={`Pick a ${term("section").toLowerCase()}`} hint="Missing photos show initials. Add photos from each student's details." /></Paper>
      ) : !cur ? (
        <div className="flex flex-wrap gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[325px] w-[204px] rounded-xl" />)}</div>
      ) : cur.students.length === 0 ? (
        <Paper><EmptyState icon={IdCard} title={`No ${term("students").toLowerCase()} in ${cur.section.label}`} hint={`Enrol ${term("students").toLowerCase()} first.`} /></Paper>
      ) : (
        <div ref={sheet} className="flex flex-wrap gap-4">
          {cur.students.map((c) => <StudentCard key={c.uuid} c={c} company={company} session={cur.section.session_name} roll={term("roll")} guardian={`${term("guardian")} phone`} />)}
        </div>
      )}
    </div>
  );
}
