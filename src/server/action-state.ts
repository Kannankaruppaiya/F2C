import "server-only";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";

export interface ActionState {
  ok: boolean;
  error?: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of submitted values so forms keep input after a failed submit. */
  values?: Record<string, string>;
}

export const initialActionState: ActionState = { ok: false };

/** Converts thrown errors into form state; unknown errors are logged and masked. */
export function errorState(err: unknown, formData?: FormData): ActionState {
  const values = formData ? formValues(formData) : undefined;
  if (err instanceof ZodError) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: err.flatten().fieldErrors as Record<string, string[]>, values };
  }
  if (err instanceof AppError) {
    return { ok: false, error: err.message, fieldErrors: err.details, values };
  }
  // Let Next.js redirects/notFound propagate.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
    throw err;
  }
  logger.error("action.failed", { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  return { ok: false, error: "Something went wrong. Please try again.", values };
}

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** FormData → plain object; repeated keys (multi-selects, checkboxes) become arrays when listed. */
export function formObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = arrays.includes(key) ? fd.getAll(key).filter((v) => typeof v === "string" && v !== "") : fd.get(key);
  }
  for (const a of arrays) out[a] ??= [];
  return out;
}
