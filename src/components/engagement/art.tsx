"use client";

/*
 * Drawn artwork for engagement cards, all inline SVG (no images to download):
 *   <CoverArt cover={a.cover} />            announcement / survey covers (presets or an upload)
 *   <CelebrationArt theme="cosmic" kind="birthday" />   decor behind celebration cards
 *   <BuzzHeroArt />                         the soft illustration in the Buzz header
 * Shapes are seeded from the theme name so a card always looks the same.
 */
import { useId } from "react";
import { resolveImageUrl } from "@/lib/api";
import type { Cover } from "./types";

export const COVER_PRESETS: Record<string, { label: string; from: string; via: string; to: string; motif: "waves" | "dots" | "rays" | "leaves" | "rangoli" | "rain" | "grid" }> = {
  aurora: { label: "Aurora", from: "#134e4a", via: "#0f766e", to: "#1e3a8a", motif: "waves" },
  sunrise: { label: "Sunrise", from: "#fde68a", via: "#fb923c", to: "#e11d48", motif: "rays" },
  ocean: { label: "Ocean", from: "#0891b2", via: "#0e7490", to: "#134e4a", motif: "waves" },
  meadow: { label: "Meadow", from: "#bef264", via: "#4ade80", to: "#15803d", motif: "leaves" },
  lavender: { label: "Lavender", from: "#c4b5fd", via: "#8b5cf6", to: "#4c1d95", motif: "dots" },
  ember: { label: "Ember", from: "#f59e0b", via: "#ea580c", to: "#7c2d12", motif: "rays" },
  slate: { label: "Slate", from: "#475569", via: "#334155", to: "#0f172a", motif: "grid" },
  festive: { label: "Festive", from: "#4c1d95", via: "#be185d", to: "#f59e0b", motif: "rangoli" },
  monsoon: { label: "Monsoon", from: "#93c5fd", via: "#3b82f6", to: "#1e3a8a", motif: "rain" },
  saffron: { label: "Saffron", from: "#fed7aa", via: "#f97316", to: "#9a3412", motif: "dots" },
};

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Motif({ motif, seed }: { motif: string; seed: string }) {
  const r = rng(seed);
  const W = 800, H = 300;
  if (motif === "waves" || motif === "rain") {
    return (
      <g fill="none" stroke="#fff" strokeLinecap="round">
        {motif === "waves" ? [0, 1, 2, 3].map((i) => (
          <path key={i} strokeOpacity={0.12 + i * 0.05} strokeWidth={2 + i}
            d={`M0 ${190 + i * 22} C ${200} ${140 + i * 30 - r() * 40}, ${420} ${250 + i * 10}, ${W} ${170 + i * 26}`} />
        )) : Array.from({ length: 46 }, (_, i) => {
          const x = r() * W, y = r() * H;
          return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 26} strokeOpacity={0.25} strokeWidth={2} />;
        })}
      </g>
    );
  }
  if (motif === "rays") {
    return (
      <g>
        <circle cx={640} cy={250} r={120} fill="#fff" fillOpacity={0.25} />
        {Array.from({ length: 14 }, (_, i) => {
          const a = Math.PI + (i * Math.PI) / 13;
          return <line key={i} x1={640} y1={250} x2={640 + Math.cos(a) * 420} y2={250 + Math.sin(a) * 420}
            stroke="#fff" strokeOpacity={0.12} strokeWidth={10} />;
        })}
      </g>
    );
  }
  if (motif === "leaves") {
    return (
      <g fill="#fff">
        {Array.from({ length: 18 }, (_, i) => {
          const x = r() * W, y = r() * H, s = 10 + r() * 22, rot = r() * 180;
          return <ellipse key={i} cx={x} cy={y} rx={s} ry={s / 2.6} fillOpacity={0.18} transform={`rotate(${rot} ${x} ${y})`} />;
        })}
      </g>
    );
  }
  if (motif === "rangoli") {
    return (
      <g fill="none" stroke="#fff">
        {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={650} cy={150} r={30 + i * 26} strokeOpacity={0.12 + i * 0.04} strokeWidth={3} strokeDasharray={i % 2 ? "4 10" : undefined} />)}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <ellipse key={i} cx={650 + Math.cos(a) * 70} cy={150 + Math.sin(a) * 70} rx={18} ry={8} fill="#fde68a" fillOpacity={0.35}
            stroke="none" transform={`rotate(${(a * 180) / Math.PI} ${650 + Math.cos(a) * 70} ${150 + Math.sin(a) * 70})`} />;
        })}
        {Array.from({ length: 30 }, (_, i) => <circle key={`d${i}`} cx={r() * 500} cy={r() * H} r={2 + r() * 3} fill="#fff" fillOpacity={0.3} stroke="none" />)}
      </g>
    );
  }
  if (motif === "grid") {
    return (
      <g stroke="#fff" strokeOpacity={0.08}>
        {Array.from({ length: 20 }, (_, i) => <line key={`v${i}`} x1={i * 44} y1={0} x2={i * 44} y2={H} />)}
        {Array.from({ length: 8 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 44} x2={W} y2={i * 44} />)}
        <circle cx={620} cy={140} r={90} fill="#818cf8" fillOpacity={0.25} stroke="none" />
      </g>
    );
  }
  return (
    <g fill="#fff">
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={r() * W} cy={r() * H} r={3 + r() * 16} fillOpacity={0.06 + r() * 0.16} />)}
    </g>
  );
}

export function PresetArt({ preset, className = "", children }: { preset: string; className?: string; children?: React.ReactNode }) {
  const p = COVER_PRESETS[preset] ?? COVER_PRESETS.aurora;
  const id = useId().replace(/:/g, "");
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={p.from} /><stop offset="0.55" stopColor={p.via} /><stop offset="1" stopColor={p.to} />
          </linearGradient>
        </defs>
        <rect width="800" height="300" fill={`url(#g${id})`} />
        <Motif motif={p.motif} seed={preset} />
      </svg>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

export function CoverArt({ cover, className = "", fallback = "aurora", children }: { cover: Cover; className?: string; fallback?: string; children?: React.ReactNode }) {
  if (cover?.url) {
    return (
      <div className={`relative overflow-hidden bg-sunken ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveImageUrl(cover.url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {children && <div className="relative">{children}</div>}
      </div>
    );
  }
  return <PresetArt preset={cover?.preset || fallback} className={className}>{children}</PresetArt>;
}

/* ── Celebration themes ─────────────────────────────────────────── */

export const CELEBRATION_THEMES: Record<string, { bg: string; decor: "fireworks" | "bubbles" | "cosmic" | "waves" | "confetti" }> = {
  golden: { bg: "radial-gradient(circle at 30% 20%, #6d4c1b, #2a1a05 70%)", decor: "confetti" },
  aurora: { bg: "linear-gradient(135deg, #134e4a, #0f766e 45%, #1e3a8a)", decor: "waves" },
  disco: { bg: "linear-gradient(135deg, #4c1d95, #be185d 60%, #1e1b4b)", decor: "confetti" },
  fireworks: { bg: "radial-gradient(circle at 70% 30%, #312e81, #0b1020 75%)", decor: "fireworks" },
  synthwave: { bg: "linear-gradient(160deg, #7c3aed, #db2777 55%, #0f172a)", decor: "fireworks" },
  bubble: { bg: "linear-gradient(135deg, #ec4899, #f97316)", decor: "bubbles" },
  cosmic: { bg: "radial-gradient(circle at 50% 0, #4338ca, #111827 80%)", decor: "cosmic" },
  sunset: { bg: "linear-gradient(150deg, #f59e0b, #dc2626 70%)", decor: "waves" },
  ocean: { bg: "linear-gradient(135deg, #0891b2, #134e4a)", decor: "bubbles" },
  lavender: { bg: "linear-gradient(135deg, #8b5cf6, #6d28d9 60%, #4c1d95)", decor: "cosmic" },
};
const PALETTE = ["#FFD166", "#EF9BD3", "#8EE3EF", "#B5E48C", "#F4978E", "#C9B6E4"];

export function CelebrationDecor({ theme, seed }: { theme: string; seed: string }) {
  const decor = CELEBRATION_THEMES[theme]?.decor ?? "confetti";
  const r = rng(seed + theme);
  const W = 800, H = 240;
  let body: React.ReactNode;
  if (decor === "fireworks") {
    body = (
      <g strokeLinecap="round">
        {[0, 1, 2].map((b) => {
          const cx = 90 + r() * 620, cy = 40 + r() * 120, len = 26 + r() * 30, n = 8 + Math.floor(r() * 5), col = PALETTE[b % PALETTE.length];
          return <g key={b}>{Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2;
            return <line key={i} x1={cx + Math.cos(a) * 8} y1={cy + Math.sin(a) * 8} x2={cx + Math.cos(a) * len} y2={cy + Math.sin(a) * len} stroke={col} strokeWidth={2.2} />;
          })}</g>;
        })}
        {Array.from({ length: 26 }, (_, i) => <circle key={i} cx={r() * W} cy={r() * H} r={1 + r() * 1.6} fill="#fff" className="buzz-twinkle" style={{ animationDelay: `${r() * 3}s` }} />)}
      </g>
    );
  } else if (decor === "bubbles") {
    body = <g>{Array.from({ length: 22 }, (_, i) => r() > 0.45
      ? <circle key={i} cx={r() * W} cy={r() * H} r={10 + r() * 12} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.6} />
      : <circle key={i} cx={r() * W} cy={r() * H} r={2 + r() * 4} fill={PALETTE[i % PALETTE.length]} />)}</g>;
  } else if (decor === "cosmic") {
    body = (
      <g>
        {Array.from({ length: 16 }, (_, i) => {
          const x = r() * W, y = r() * H, s = 3 + r() * 5;
          return <path key={i} d={`M${x} ${y - s} L${x + s / 3} ${y - s / 3} L${x + s} ${y} L${x + s / 3} ${y + s / 3} L${x} ${y + s} L${x - s / 3} ${y + s / 3} L${x - s} ${y} L${x - s / 3} ${y - s / 3}Z`} fill="#fff" fillOpacity={0.8} />;
        })}
        <circle cx={690} cy={70} r={26} fill="#C9B6E4" />
        <ellipse cx={690} cy={70} rx={46} ry={10} fill="none" stroke="#EF9BD3" strokeWidth={2.4} transform="rotate(-18 690 70)" />
        <circle cx={110} cy={60} r={20} fill="#fff" fillOpacity={0.85} /><circle cx={120} cy={54} r={18} fill="#312e63" />
      </g>
    );
  } else if (decor === "waves") {
    body = <g fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={2}>
      {[0, 1, 2].map((i) => <path key={i} d={`M0 ${150 + i * 24} Q 200 ${110 + i * 24} 400 ${150 + i * 24} T 800 ${150 + i * 24}`} />)}
    </g>;
  } else {
    body = <g>{Array.from({ length: 34 }, (_, i) => {
      const x = r() * W, y = r() * H;
      return r() > 0.3
        ? <rect key={i} x={x} y={y} width={7} height={12} rx={2} fill={PALETTE[i % PALETTE.length]} transform={`rotate(${r() * 180} ${x} ${y})`} />
        : <path key={i} d={`M${x} ${y} q 5 -8 10 0 t 10 0`} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} />;
    })}</g>;
  }
  return (
    <svg viewBox="0 0 800 240" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full opacity-70" aria-hidden>
      {body}
    </svg>
  );
}

/** Soft cut-paper scene for the Buzz header: people waving, a kite, sun and confetti. */
export function BuzzHeroArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 200" className={className} aria-hidden>
      <circle cx="350" cy="52" r="30" fill="#fde68a" />
      <path d="M0 170 C 90 130, 160 190, 260 150 S 380 140, 420 160 L420 200 L0 200Z" fill="#c7d2fe" />
      <path d="M0 182 C 120 160, 200 200, 300 176 S 400 172, 420 184 L420 200 L0 200Z" fill="#a5b4fc" />
      {/* kite */}
      <g transform="translate(250 30) rotate(12)">
        <path d="M0 0 L22 26 L0 56 L-22 26Z" fill="#f472b6" /><path d="M0 0 L0 56 M-22 26 L22 26" stroke="#fff" strokeWidth="1.4" />
        <path d="M0 56 q 8 14 -2 26 q -8 12 4 22" fill="none" stroke="#6366f1" strokeWidth="1.4" />
      </g>
      {/* three people */}
      {[{ x: 90, c: "#4f46e5", s: "#f9c9a0", h: "#1e1b4b" }, { x: 150, c: "#f59e0b", s: "#e0a97a", h: "#3f2a14" }, { x: 205, c: "#10b981", s: "#c68c5c", h: "#111827" }].map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${118 - (i === 1 ? 8 : 0)})`}>
          <path d="M-18 60 Q -18 18 0 18 Q 18 18 18 60Z" fill={p.c} />
          <circle cx="0" cy="6" r="13" fill={p.s} />
          <path d="M-13 4 Q -12 -10 0 -9 Q 13 -10 13 4 Q 6 -2 -13 4Z" fill={p.h} />
          <path d={i === 1 ? "M14 28 L30 2" : i === 0 ? "M-14 28 L-28 6" : "M14 30 L26 12"} stroke={p.c} strokeWidth="7" strokeLinecap="round"
            className={i === 1 ? "buzz-wave" : undefined} style={{ transformOrigin: "14px 28px" }} />
        </g>
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={20 + ((i * 53) % 380)} y={20 + ((i * 37) % 90)} width="5" height="9" rx="1.5"
          fill={["#f472b6", "#f59e0b", "#6366f1", "#10b981"][i % 4]} transform={`rotate(${i * 29} ${20 + ((i * 53) % 380)} ${20 + ((i * 37) % 90)})`} />
      ))}
    </svg>
  );
}
