"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Lock, Search, ArrowRight } from "lucide-react";

const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "nextgenhrms.com,lvh.me,localhost")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** The main Next Gen HRMS address (without the company subdomain). */
function homeFor(host: string, protocol = "https:"): string {
  const [h, port] = host.split(":");
  const root = ROOT_DOMAINS.find((r) => h === r || h.endsWith(`.${r}`));
  return root ? `${protocol}//${root}${port ? ":" + port : ""}/` : "/";
}

/**
 * Full-page message for a company address that doesn't exist (typed wrong, or removed), or a
 * company that has been disabled. Used by the company login page and any
 * logged-in page whose company is gone.
 */
export default function CompanyNotFound({ variant = "gone", host = "" }: { variant?: "gone" | "disabled"; host?: string }) {
  const gone = variant === "gone";
  // the server passes the address; in the browser it is filled in after the first paint,
  // so both render the same HTML
  const [address, setAddress] = useState(host);
  const [home, setHome] = useState(host ? homeFor(host) : "/");
  useEffect(() => {
    setAddress(window.location.host);
    setHome(homeFor(window.location.host, window.location.protocol));
  }, []);
  const Icon = gone ? Building2 : Lock;

  // Not-found address: count down from 10, then go to the main Next Gen HRMS page.
  const REDIRECT_SECONDS = 10;
  const [left, setLeft] = useState(REDIRECT_SECONDS);
  useEffect(() => {
    if (!gone) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [gone]);
  useEffect(() => {
    if (gone && left === 0) window.location.href = home;
  }, [gone, left, home]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f8f6] px-6">
      {/* drifting soft shapes */}
      {[
        { c: "bg-[#5b9e8f]/15", s: "h-[420px] w-[420px]", x: "-left-32 -top-32", d: 18 },
        { c: "bg-sky-200/30", s: "h-[360px] w-[360px]", x: "-bottom-40 -right-24", d: 22 },
        { c: "bg-amber-100/50", s: "h-[220px] w-[220px]", x: "right-[18%] top-[12%]", d: 15 },
      ].map((b, i) => (
        <motion.div key={i} className={`pointer-events-none absolute rounded-full blur-3xl ${b.c} ${b.s} ${b.x}`}
          animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 1.08, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }} />
      ))}

      <div className="relative w-full max-w-md text-center">
        {/* illustration: the company, with a magnifier circling it */}
        <motion.div className="relative mx-auto h-40 w-40"
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: "easeOut" }}>
          <motion.div className="absolute inset-0 rounded-full border border-dashed border-[#5b9e8f]/40"
            animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute inset-4 rounded-full bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]"
            animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
            <div className="flex h-full w-full items-center justify-center">
              <Icon size={46} strokeWidth={1.25} className="text-[#3a4557]" />
            </div>
          </motion.div>
          {gone && (
            <motion.div className="absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10"
              animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}>
              <div className="absolute -top-[72px] flex h-10 w-10 items-center justify-center rounded-full bg-[#5b9e8f] text-white shadow-lg"
                style={{ transform: "rotate(0deg)" }}>
                <Search size={18} strokeWidth={2} />
              </div>
            </motion.div>
          )}
          {!gone && (
            <motion.span className="absolute -right-1 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-sm font-semibold text-white shadow-lg"
              animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>!</motion.span>
          )}
        </motion.div>

        <motion.h1 className="mt-8 text-[30px] font-light tracking-[-0.02em] text-gray-900"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
          {gone ? "Company not found" : "Company disabled"}
        </motion.h1>

        {address && (
          <motion.div className="mx-auto mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-4 py-1.5 font-mono text-[13px] text-gray-600 backdrop-blur"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}>
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${gone ? "bg-gray-300" : "bg-rose-400"}`} />
            <span className="truncate">{address}</span>
          </motion.div>
        )}

        <motion.p className="mx-auto mt-4 max-w-sm text-[15px] font-light leading-relaxed text-gray-500"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}>
          {gone
            ? "There's no company at this address. Check the spelling, or ask your HR team for the correct link."
            : "This company has been switched off for now. Please contact Next Gen HRMS support."}
        </motion.p>

        <motion.div className="mt-8 flex flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }}>
          <motion.a href={home} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            className="group inline-flex h-11 items-center gap-2 rounded-full bg-gray-900 px-6 text-sm text-white">
            Go to Next Gen HRMS
            <ArrowRight size={16} strokeWidth={1.75} className="transition-transform group-hover:translate-x-0.5" />
          </motion.a>
        </motion.div>

        {gone && (
          <motion.div className="mt-6 flex items-center justify-center gap-2.5 text-[13px] font-light text-gray-500"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }}>
            {/* ring that empties as the seconds run out */}
            <span className="relative flex h-8 w-8 items-center justify-center">
              <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
                <circle cx="16" cy="16" r="14" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="#5b9e8f" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={88} strokeDashoffset={88 * (1 - left / REDIRECT_SECONDS)}
                  style={{ transition: "stroke-dashoffset 1s linear" }} />
              </svg>
              <motion.span key={left} className="relative text-[13px] font-normal text-gray-800"
                initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
                {left}
              </motion.span>
            </span>
            Taking you to Next Gen HRMS in {left} second{left === 1 ? "" : "s"}…
          </motion.div>
        )}

        <motion.p className="mt-10 text-[12px] font-light text-gray-400"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }}>
          Next Gen HRMS · HR and payroll for Indian companies
        </motion.p>
      </div>
    </div>
  );
}
