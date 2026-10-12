/**
 * Compares two strings by code point (SPEC §4.3). The default sort compares
 * UTF-16 code units, which orders characters above U+FFFF before some below.
 */
export function compareCodePoints(a: string, b: string): number {
  const shorter = Math.min(a.length, b.length);
  let i = 0;
  while (i < shorter) {
    const x = a.codePointAt(i) as number;
    const y = b.codePointAt(i) as number;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

/** The number of code points in a string, as Python's `len` counts them. */
export function codePointLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // A low surrogate that follows a high one belongs to the same code point.
    if (unit >= 0xdc00 && unit <= 0xdfff && i > 0) {
      const previous = text.charCodeAt(i - 1);
      if (previous >= 0xd800 && previous <= 0xdbff) continue;
    }
    count++;
  }
  return count;
}
