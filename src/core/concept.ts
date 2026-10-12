import type { ActorEvent, TrustTier } from "../types.js";
import type { Document } from "./frontmatter.js";

export type Concept = {
  id: string;
  type: string;
  title: string;
  description: string;
  resource: string;
  tags: string[];
  body: string;
  status: string;
  generated: ActorEvent;
  verified: ActorEvent[];
  stale_after: string;
  sources: Array<Record<string, unknown>>;
  trust_tier: TrustTier;
};

type Mapping = Record<string, unknown>;

function isMapping(value: unknown): value is Mapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Python's truth test, which the reference applies with `value or default`.
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (isMapping(value)) return Object.keys(value).length > 0;
  return true;
}

// Python's str() for the values frontmatter holds. A list or mapping where
// text was expected is shown as JSON.
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "object" && value !== null) return JSON.stringify(jsonSafe(value));
  return String(value);
}

const textOr = (value: unknown, fallback: string) => (truthy(value) ? text(value) : fallback);

/**
 * A copy that JSON holds exactly: a number JSON can't write becomes null, and
 * a key named `__proto__` is copied as a key, not followed as a prototype.
 */
function jsonSafe(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (isMapping(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value ?? null;
}

const mappingCopy = (value: Mapping) => jsonSafe(value) as Mapping;

// OKF §5.2: a bare mapping is a one-element list.
function normalizeVerified(verified: unknown): ActorEvent[] {
  if (isMapping(verified)) return [mappingCopy(verified)];
  if (Array.isArray(verified)) return verified.filter(isMapping).map(mappingCopy);
  return [];
}

// OKF §5.3.
function trustTier(verified: ActorEvent[]): TrustTier {
  if (verified.length === 0) return "unverified";
  for (const event of verified) {
    if (textOr(event.by, "").startsWith("human:")) return "human-reviewed";
  }
  return "machine-confirmed";
}

/** A concept from its parsed file, with the reference viewer's defaults. */
export function toConcept(id: string, document: Document): Concept {
  const fm = document.frontmatter;

  const rawTags = truthy(fm.tags) ? fm.tags : [];
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  const rawSources = isMapping(fm.sources) ? [fm.sources] : fm.sources;
  const sources = Array.isArray(rawSources) ? rawSources.filter(isMapping).map(mappingCopy) : [];

  const verified = normalizeVerified(fm.verified);

  return {
    id,
    type: textOr(fm.type, "Unknown"),
    title: textOr(fm.title, id),
    description: textOr(fm.description, ""),
    resource: textOr(fm.resource, ""),
    tags: tags.map(text),
    body: document.body,
    status: textOr(fm.status, "stable"),
    generated: isMapping(fm.generated) ? mappingCopy(fm.generated) : {},
    verified,
    stale_after: textOr(fm.stale_after, ""),
    sources,
    trust_tier: trustTier(verified),
  };
}
