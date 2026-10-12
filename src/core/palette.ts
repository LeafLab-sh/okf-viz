// The reference viewer's colours, and its grey for a concept with no type.
const FIXED_PALETTE: ReadonlyMap<string, string> = new Map([
  ["BigQuery Dataset", "#8b5cf6"],
  ["BigQuery Table", "#3b82f6"],
  ["Reference", "#10b981"],
  ["Unknown", "#94a3b8"],
]);

/**
 * Colours for every other type, each dark enough to carry the type chip's
 * white text. A type takes the one its name hashes to, so its colour is the
 * same in every run and every bundle (SPEC §5.2). Changing this list changes
 * the bytes of generated viewers.
 */
export const FALLBACK_COLORS: readonly string[] = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#65a30d",
  "#0d9488",
  "#0891b2",
  "#4f46e5",
  "#9333ea",
  "#db2777",
  "#e11d48",
  "#57534e",
  "#0284c7",
];

// FNV-1a, 32 bits, over UTF-16 code units.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function colorForType(type: string, overrides?: Record<string, string>): string {
  if (overrides !== undefined && Object.hasOwn(overrides, type)) {
    const override = overrides[type];
    if (typeof override === "string") return override;
  }
  return (
    FIXED_PALETTE.get(type) ?? (FALLBACK_COLORS[hash(type) % FALLBACK_COLORS.length] as string)
  );
}
