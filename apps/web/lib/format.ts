/**
 * Formatting.
 *
 * All contract amounts are stroops — the asset's smallest unit, 7 decimal places
 * for anything on Stellar. Conversion to a human figure happens here and nowhere
 * else, which is the same split the contract insists on: decimals are the
 * asset's, and the contract never formats.
 */

export const STROOPS_PER_UNIT = 10_000_000n;
export const DECIMALS = 7;

/**
 * Stroops to a display string, without going through a float.
 *
 * `12345678n` → `"1.2345678"`. Integer and fraction are split with BigInt
 * arithmetic, so a balance beyond `Number.MAX_SAFE_INTEGER` still renders
 * exactly.
 */
export function formatAmount(
  stroops: bigint,
  { maxDecimals = 7, groupThousands = true }: FormatOptions = {},
): string {
  const negative = stroops < 0n;
  const magnitude = negative ? -stroops : stroops;

  const whole = magnitude / STROOPS_PER_UNIT;
  const fraction = magnitude % STROOPS_PER_UNIT;

  let wholeText = whole.toString();
  if (groupThousands) {
    wholeText = wholeText.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  let fractionText = fraction.toString().padStart(DECIMALS, "0");
  if (maxDecimals < DECIMALS) fractionText = fractionText.slice(0, maxDecimals);
  fractionText = fractionText.replace(/0+$/, "");

  const sign = negative ? "-" : "";
  return fractionText ? `${sign}${wholeText}.${fractionText}` : `${sign}${wholeText}`;
}

interface FormatOptions {
  maxDecimals?: number;
  groupThousands?: boolean;
}

/** Parse a typed amount into stroops, rejecting anything lossy. */
export function parseAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > DECIMALS) return null;
  const padded = fraction.padEnd(DECIMALS, "0");
  return BigInt(whole || "0") * STROOPS_PER_UNIT + BigInt(padded || "0");
}

/** `GABC…WXYZ` — enough to recognise an address, short enough to sit in a table. */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/** "in 3 days" / "2 hours ago", relative to ledger time rather than the browser. */
export function relativeTime(target: bigint, now: bigint): string {
  const delta = Number(target - now);
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(delta) >= seconds || unit === "second") {
      return RELATIVE.format(Math.round(delta / seconds), unit);
    }
  }
  return "now";
}

const ABSOLUTE = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function absoluteTime(timestamp: bigint): string {
  return ABSOLUTE.format(new Date(Number(timestamp) * 1000));
}

/** A duration in seconds as "30d 4h", for stream windows. */
export function formatDuration(seconds: bigint): string {
  const total = Number(seconds);
  if (total <= 0) return "0s";
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function percent(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}
