import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-edge bg-surface-1 shadow-[var(--glow)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  hint,
  actions,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-3">{hint}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink border-transparent hover:brightness-105 active:brightness-95",
  secondary: "bg-surface-2 text-ink border-edge hover:border-edge-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-transparent text-bad border-bad/50 hover:bg-bad/10",
};

type ButtonSize = "sm" | "md" | "lg";

/** Shared so links can wear button styling without a polymorphic component. */
export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl border font-medium",
    "transition-all disabled:cursor-not-allowed disabled:opacity-40",
    size === "sm" && "px-3 py-1.5 text-xs",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-6 py-3.5 text-[15px]",
    BUTTON_STYLES[variant],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs leading-relaxed text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  className,
  mono,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-edge bg-surface-0 px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-ink-3 focus:border-brand focus:outline-none",
        mono && "tnum",
        className,
      )}
    />
  );
}

export type BadgeTone = "neutral" | "good" | "warn" | "bad" | "held" | "brand";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "text-ink-2 bg-surface-2 border-edge",
  good: "text-good bg-good/10 border-good/25",
  warn: "text-warn bg-warn/10 border-warn/25",
  bad: "text-bad bg-bad/10 border-bad/25",
  held: "text-held bg-held/10 border-held/25",
  brand: "text-brand bg-brand/10 border-brand/25",
};

/** Always carries its label — status is never colour alone. */
export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A labelled figure. The value wears a text token, never a series colour — a
 * swatch beside the label carries identity instead.
 */
export function Stat({
  label,
  value,
  unit,
  swatch,
  detail,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  swatch?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {swatch ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[3px]"
            style={{ background: swatch }}
          />
        ) : null}
        <span className="truncate text-xs text-ink-3">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum truncate text-lg font-medium text-ink">{value}</span>
        {unit ? <span className="text-xs text-ink-3">{unit}</span> : null}
      </div>
      {detail ? <div className="mt-0.5 text-[11px] text-ink-3">{detail}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} aria-hidden />;
}

export function Alert({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn";
  children: ReactNode;
}) {
  const styles = {
    good: "border-good/30 bg-good/10 text-good",
    bad: "border-bad/30 bg-bad/10 text-bad",
    warn: "border-warn/30 bg-warn/10 text-warn",
  } as const;
  return (
    <p
      role="status"
      className={cn("rounded-xl border px-4 py-3 text-xs leading-relaxed", styles[tone])}
    >
      {children}
    </p>
  );
}
