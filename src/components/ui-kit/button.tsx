"use client";

/*
 * Button and IconButton.
 *   <Button variant="primary" icon={Plus} loading={saving}>Add employee</Button>
 *   <IconButton icon={MoreHorizontal} label="More actions" onClick={...} />
 * Variants: primary (the one indigo accent), secondary (paper + hairline), ghost
 * (text only), danger. Sizes: sm (32px), md (36px). Forwards all <button> attributes.
 */
import type { ButtonHTMLAttributes, ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { cx, ICON_STROKE } from "./internal";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type IconType = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark border border-transparent",
  secondary: "border border-line bg-surface text-ink hover:border-line-strong hover:bg-sunken/60",
  ghost: "border border-transparent text-muted hover:bg-sunken hover:text-ink",
  danger: "border border-transparent bg-rose-600 text-white hover:bg-rose-700",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconType;
  iconRight?: IconType;
  loading?: boolean;
};

export function Button({
  variant = "secondary", size = "md", icon: Icon, iconRight: IconRight, loading, disabled, className, children, type = "button", ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[14px]",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} strokeWidth={ICON_STROKE} className="animate-spin" /> : Icon && <Icon size={15} strokeWidth={ICON_STROKE} />}
      {children}
      {IconRight && <IconRight size={15} strokeWidth={ICON_STROKE} />}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconType;
  /** Accessible name; also shown as the tooltip. */
  label: string;
  size?: "sm" | "md";
};

export function IconButton({ icon: Icon, label, size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        className,
      )}
      {...rest}
    >
      <Icon size={size === "sm" ? 15 : 16} strokeWidth={ICON_STROKE} />
    </button>
  );
}
