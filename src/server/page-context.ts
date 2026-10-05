import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, type AuthContext } from "@/server/authz/context";
import { AppError } from "@/server/errors";
import type { MoneyFormat } from "@/lib/format";

/** For server components: resolves the auth context or redirects to login. */
export async function pageContext(): Promise<AuthContext> {
  try {
    return await getAuthContext();
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") redirect("/login");
    throw e;
  }
}

/** Runs a service call from a page, mapping NOT_FOUND/FORBIDDEN to the 404 page (no existence leaks). */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}

export function moneyFmt(ctx: AuthContext): MoneyFormat {
  return { currency: ctx.currency, locale: ctx.locale };
}
