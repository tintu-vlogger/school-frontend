/*
 * Avatar: photo with an initials fallback on a soft, name-derived tint.
 *   <Avatar name="Asha Menon" src={url} size={36} />
 * Honorifics (Mr., Dr., ...) are skipped when picking initials. AvatarGroup stacks a few.
 */
import { cx } from "./internal";

const TINTS = ["#4f46e5", "#0e7490", "#7c3aed", "#be185d", "#b45309", "#047857", "#1d4ed8", "#9333ea", "#c2410c", "#0f766e"];

export function avatarTint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initialsOf(name: string) {
  const words = name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
}

export type AvatarProps = { name: string; src?: string | null; size?: number; className?: string; square?: boolean };

export function Avatar({ name, src, size = 32, className, square }: AvatarProps) {
  const radius = square ? "rounded-lg" : "rounded-full";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cx("shrink-0 object-cover", radius, className)} style={{ width: size, height: size }} />;
  }
  const c = avatarTint(name);
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 select-none items-center justify-center font-light tracking-wide", radius, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)), background: `${c}14`, color: c, boxShadow: `inset 0 0 0 1px ${c}22` }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarGroup({ people, max = 4, size = 28 }: { people: { name: string; src?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={i} className="-ml-1.5 first:ml-0 rounded-full ring-2 ring-surface"><Avatar name={p.name} src={p.src} size={size} /></span>
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-sunken text-[11px] text-muted ring-2 ring-surface" style={{ width: size, height: size }}>+{extra}</span>
      )}
    </div>
  );
}
