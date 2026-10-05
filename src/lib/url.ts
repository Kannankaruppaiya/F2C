/** Builds an href from a base path and params, dropping empty values. */
export function hrefWith(base: string, params: Record<string, string | undefined | null>, overrides: Record<string, string | undefined | null> = {}): string {
  const merged = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function flatParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== "") out[k] = val;
  }
  return out;
}
