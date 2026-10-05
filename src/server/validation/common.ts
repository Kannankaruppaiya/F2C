import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Optional trimmed text; "" becomes null so PATCHes can clear values. */
export const optionalText = (max = 5000) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v), z.string().max(max).nullish());

export const requiredText = (max = 200) => z.string().trim().min(1, "Required").max(max);

export const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toLowerCase()) : v),
  z.string().email("Invalid email").max(254).nullish(),
);

export const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v),
  z
    .string()
    .max(500)
    .url("Must be a full URL, e.g. https://example.com")
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed")
    .nullish(),
);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");
export const optionalDate = z.preprocess((v) => (v === "" ? null : v), isoDate.nullish());

// Empty form inputs become undefined (not NaN) and then default to 0. Inside .partial() schemas an
// omitted key short-circuits before the transform, so PATCHes never zero out untouched fields.
export const money = z
  .preprocess(emptyToUndefined, z.coerce.number({ invalid_type_error: "Enter a number" }).min(0, "Must be ≥ 0").max(1e12).optional())
  .transform((v) => v ?? 0);
export const hours = z
  .preprocess(emptyToUndefined, z.coerce.number({ invalid_type_error: "Enter a number" }).min(0, "Must be ≥ 0").max(10000).optional())
  .transform((v) => v ?? 0);
export const optionalId = z.preprocess((v) => (v === "" ? null : v), z.string().min(1).max(64).nullish());
export const id = z.string().min(1).max(64);

export type FieldErrors = Record<string, string[] | undefined>;
