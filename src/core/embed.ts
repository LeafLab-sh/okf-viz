// "<", ">", "&", and the line and paragraph separators U+2028 and U+2029.
const UNSAFE = /[<>&\u2028\u2029]/g;

const toEscape = (character: string) =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;

/**
 * JSON that is safe inside a script element: the characters that could end
 * the element, open a comment or be read as an entity are written as \u
 * escapes, which JSON.parse reads back unchanged (SPEC §6).
 */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE, toEscape);
}
