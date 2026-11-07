"use client";

/*
 * The institution's own address (<slug>.campusly.app/) shows its public website.
 * The proxy rewrites "/" here on institution addresses. If the website is switched off,
 * people go straight to sign-in.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { publicFetch, useCompanySlug } from "@/components/recruitment/public";
import type { SiteData } from "@/components/site/shared";
import { SiteView } from "@/components/site/view";

export default function CompanySite() {
  const slug = useCompanySlug();
  const router = useRouter();
  const [data, setData] = useState<SiteData | null>(null);
  const [failed, setFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    try { setSignedIn(!!localStorage.getItem("hrms_token")); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (slug === undefined) return;
    if (!slug) { router.replace("/login"); return; }
    publicFetch<SiteData>(`/public/companies/${encodeURIComponent(slug)}/site`)
      .then((d) => {
        if (!d.site.published) { router.replace(signedIn ? "/dashboard" : "/login"); return; }
        document.title = d.company.name;
        setData(d);
      })
      .catch(() => setFailed(true));
  }, [slug, router, signedIn]);

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f6f7f9] p-6 text-center font-light text-[#14171f]">
        <p className="text-[18px]">This page could not load.</p>
        <a href="/login" className="text-[15px] text-[#4f46e5] underline underline-offset-4">Go to sign in</a>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen bg-[#f6f7f9]" />;
  return <SiteView data={data} signedIn={signedIn} />;
}
