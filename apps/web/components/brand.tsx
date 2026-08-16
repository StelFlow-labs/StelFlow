import { cn } from "@/lib/cn";

/**
 * The mark: three streams with the middle one interrupted by a gate. The outer
 * two run straight through, which is the design's actual claim — a gate holds
 * its own tranche and reaches nothing else.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round">
        <path d="M10 18 H54" opacity={0.9} />
        <path d="M10 32 H26" />
        <path d="M42 32 H54" opacity={0.35} />
        <path d="M10 46 H54" opacity={0.9} />
        <path d="M34 22 V42" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Mark className="size-6 text-brand" />
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        StelFlow
      </span>
    </span>
  );
}
