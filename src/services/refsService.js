import { ProfileOption } from "../models/index.js";

const CACHE_TTL_MS = 60_000;
const typeCache = new Map(); // type -> { bySlug:Set, byLabel:Map<labelLower->slug>, exp:number }

async function primeType(type) {
  const now = Date.now();
  const hit = typeCache.get(type);
  if (hit && hit.exp > now) return hit;

  const rows = await ProfileOption.findAll({
    where: { type, is_active: true },
    attributes: ["slug", "label"],
    raw: true,
  });

  const bySlug = new Set(rows.map((r) => r.slug));
  const byLabel = new Map(rows.map((r) => [String(r.label).toLowerCase(), r.slug]));

  const entry = { bySlug, byLabel, exp: now + CACHE_TTL_MS };
  typeCache.set(type, entry);
  return entry;
}

/** Normalize one value into a canonical slug:
 * - if already a known slug -> return it
 * - else if matches a known label (case-insensitive) -> return its slug
 * - else return null
 */
export async function normalizeOne(type, val) {
  if (val == null) return null;
  const v = String(val).trim();
  if (!v) return null;

  const { bySlug, byLabel } = await primeType(type);
  if (bySlug.has(v)) return v;
  const labelSlug = byLabel.get(v.toLowerCase());
  if (labelSlug) return labelSlug;

  // allow legacy “high school” -> "high_school"
  const underscored = v.toLowerCase().replace(/\s+/g, "_");
  if (bySlug.has(underscored)) return underscored;

  return null;
}

/** Normalize an array into canonical slug array (deduped, filtered). */
export async function normalizeMany(type, arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const val of arr) {
    const slug = await normalizeOne(type, val);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

export async function ensureMember(type, slug) {
  if (!slug) return true;
  const { bySlug } = await primeType(type);
  return bySlug.has(slug);
}

export async function ensureAll(type, slugs = []) {
  if (!Array.isArray(slugs) || slugs.length === 0) return true;
  const { bySlug } = await primeType(type);
  for (const s of slugs) {
    if (!s || !bySlug.has(s)) return false;
  }
  return true;
}
