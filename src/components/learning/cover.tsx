"use client";

/*
 * Course cover art: drawn, never downloaded. Each palette key (rose, amber, sky, violet,
 * emerald, orange, indigo, teal, slate) is a soft gradient with a motif chosen from the
 * course title, so the same course always looks the same.
 *   <CourseCover cover="rose" seed={course.title} kind="online" mandatory />
 */
import { useId } from "react";
import { resolveImageUrl } from "@/lib/api";

export const COVERS: Record<string, { label: string; from: string; to: string; ink: string; accent: string }> = {
  rose: { label: "Rose", from: "#fff1f2", to: "#fecdd3", ink: "#9f1239", accent: "#fb7185" },
  amber: { label: "Amber", from: "#fffbeb", to: "#fde68a", ink: "#92400e", accent: "#f59e0b" },
  sky: { label: "Sky", from: "#f0f9ff", to: "#bae6fd", ink: "#075985", accent: "#38bdf8" },
  violet: { label: "Violet", from: "#f5f3ff", to: "#ddd6fe", ink: "#5b21b6", accent: "#a78bfa" },
  emerald: { label: "Emerald", from: "#ecfdf5", to: "#a7f3d0", ink: "#065f46", accent: "#34d399" },
  orange: { label: "Orange", from: "#fff7ed", to: "#fed7aa", ink: "#9a3412", accent: "#fb923c" },
  indigo: { label: "Indigo", from: "#eef2ff", to: "#c7d2fe", ink: "#3730a3", accent: "#818cf8" },
  teal: { label: "Teal", from: "#f0fdfa", to: "#99f6e4", ink: "#115e59", accent: "#2dd4bf" },
  slate: { label: "Slate", from: "#f8fafc", to: "#cbd5e1", ink: "#1e293b", accent: "#94a3b8" },
};

export const COVER_KEYS = Object.keys(COVERS);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rand(seed: string) {
  let h = hash(seed);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function coverFor(cover: string | null | undefined, seed: string) {
  if (cover && COVERS[cover]) return COVERS[cover];
  return COVERS[COVER_KEYS[hash(seed) % COVER_KEYS.length]];
}

function Motif({ seed, accent, ink }: { seed: string; accent: string; ink: string }) {
  const r = rand(seed);
  const kind = hash(seed) % 4;
  if (kind === 0) {
    // concentric arcs from a corner
    const cx = 260 + r() * 60, cy = -20 + r() * 40;
    return (
      <g fill="none" stroke={ink} strokeOpacity="0.14">
        {Array.from({ length: 7 }, (_, i) => <circle key={i} cx={cx} cy={cy} r={30 + i * 22} strokeWidth="1.2" />)}
        <circle cx={cx} cy={cy} r="26" fill={accent} fillOpacity="0.35" stroke="none" />
      </g>
    );
  }
  if (kind === 1) {
    // dotted grid that fades out
    const dots = [];
    for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) {
      const o = Math.max(0, 0.5 - (x / 12) * 0.5) * (r() > 0.25 ? 1 : 0);
      if (o > 0.02) dots.push(<circle key={`${x}-${y}`} cx={190 + x * 14} cy={14 + y * 14} r="2" fill={ink} fillOpacity={o} />);
    }
    return <g>{dots}<rect x={230 + r() * 40} y={30} width="56" height="56" rx="14" fill={accent} fillOpacity="0.3" transform={`rotate(${12 + r() * 20} 260 60)`} /></g>;
  }
  if (kind === 2) {
    // layered waves
    return (
      <g>
        {[0, 1, 2].map((i) => {
          const y = 70 + i * 18, a = 10 + r() * 12;
          return <path key={i} d={`M0 ${y} C 80 ${y - a}, 160 ${y + a}, 240 ${y} S 360 ${y - a}, 400 ${y} V 160 H 0 Z`} fill={accent} fillOpacity={0.14 + i * 0.08} />;
        })}
      </g>
    );
  }
  // stacked leaves / pills
  return (
    <g>
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={200 + i * 26} y={20 + (i % 2) * 16 + r() * 10} width="18" height={60 + r() * 30} rx="9"
          fill={i % 2 ? accent : ink} fillOpacity={i % 2 ? 0.35 : 0.1} />
      ))}
    </g>
  );
}

export function CourseCover({ cover, seed, imageUrl, mandatory, children, className = "", height = 132 }: {
  cover: string | null | undefined; seed: string; imageUrl?: string | null; mandatory?: boolean; children?: React.ReactNode; className?: string; height?: number;
}) {
  const c = coverFor(cover, seed);
  const id = useId().replace(/:/g, "");
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height, background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveImageUrl(imageUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <radialGradient id={`g${id}`} cx="0.15" cy="0.1" r="0.9">
              <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="160" fill={`url(#g${id})`} />
          <Motif seed={seed} accent={c.accent} ink={c.ink} />
        </svg>
      )}
      {mandatory && (
        <span className="absolute right-0 top-3 rounded-l-full bg-white/85 py-0.5 pl-2.5 pr-2 text-[11.5px] tracking-wide backdrop-blur" style={{ color: c.ink }}>
          Mandatory
        </span>
      )}
      {children && <div className="absolute inset-0 flex flex-col justify-end p-4" style={{ color: c.ink }}>{children}</div>}
    </div>
  );
}
