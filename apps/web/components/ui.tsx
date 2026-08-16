/**
 * Interface primitives.
 *
 * Small and hand-written rather than pulled from a component library: the whole
 * surface is a handful of shapes, and owning them keeps the visual language
 * consistent with the docs — restrained, technical, numbers first.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------

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
        "rounded-xl border border-edge bg-surface-1",
        "shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
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
        {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-surface-1 hover:opacity-90 disabled:opacity-40 border border-transparent",
  secondary:
    "bg-surface-2 text-ink border border-edge hover:border-edge-strong disabled:opacity-40",
  ghost:
    "bg-transparent text-ink-secondary border border-transparent hover:bg-surface-2 disabled:opacity-40",
  danger:
    "bg-transparent text-[var(--status-critical)] border border-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40",
};

export function Button({
  variant = "secondary",
  className,
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2",
        "text-sm font-medium transition-[opacity,background-color,border-color]",
        "disabled:cursor-not-allowed",
        BUTTON_STYLES[variant],
        className,
      )}
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

// ---------------------------------------------------------------------------

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
      <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-[var(--status-critical)]">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-ink-muted">{hint}</span>
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
        "w-full rounded-lg border border-edge bg-surface-0 px-3 py-2 text-sm text-ink",
        "placeholder:text-ink-muted",
        "focus:border-edge-strong focus:outline-none",
        mono && "tnum",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------

export type BadgeTone = "neutral" | "good" | "warning" | "critical" | "held";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "text-ink-secondary bg-surface-2 border-edge",
  good: "text-[var(--status-good)] bg-[var(--status-good)]/10 border-[var(--status-good)]/25",
  warning:
    "text-[var(--status-warning)] bg-[var(--status-warning)]/10 border-[var(--status-warning)]/25",
  critical:
    "text-[var(--status-critical)] bg-[var(--status-critical)]/10 border-[var(--status-critical)]/25",
  held: "text-held bg-held/10 border-held/25",
};

/**
 * A status chip.
 *
 * Always carries its label — status is never communicated by colour alone,
 * which is also what keeps it legible under forced-colors and to a
 * colour-blind reader.
 */
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------

/**
 * A labelled figure.
 *
 * The value wears a text token, never a series colour — a colour swatch beside
 * the label carries identity instead, so the number stays readable at any
 * contrast.
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
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: swatch }}
          />
        ) : null}
        <span className="truncate text-xs text-ink-muted">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum truncate text-lg font-medium text-ink">{value}</span>
        {unit ? <span className="text-xs text-ink-muted">{unit}</span> : null}
      </div>
      {detail ? (
        <div className="mt-0.5 text-[11px] text-ink-muted">{detail}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-sm text-xs text-ink-muted">{children}</div>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-surface-2", className)}
      aria-hidden
    />
  );
}
