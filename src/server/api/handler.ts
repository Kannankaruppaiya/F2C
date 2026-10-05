import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getAuthContext, type AuthContext } from "@/server/authz/context";
import { apiLimiter } from "@/server/auth/rate-limit";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";

type Params = Record<string, string>;

interface HandlerArgs<P extends Params> {
  req: NextRequest;
  ctx: AuthContext;
  params: P;
  /** Parses and validates the JSON body with the given schema. */
  body: <T>(schema: ZodType<T>) => Promise<T>;
  query: URLSearchParams;
}

/**
 * Wraps a route handler with authentication, rate limiting, validation error mapping,
 * structured logging and a consistent JSON envelope: { data } or { error: { code, message, details } }.
 */
export function apiHandler<P extends Params = Params>(
  fn: (args: HandlerArgs<P>) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    let userId: string | undefined;
    try {
      const ctx = await getAuthContext();
      userId = ctx.userId;
      const limit = apiLimiter.hit(`api:${ctx.userId}`);
      if (!limit.allowed) throw new AppError("RATE_LIMITED", "Too many requests");
      const params = await route.params;
      const body = async <T,>(schema: ZodType<T>): Promise<T> => {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw new AppError("VALIDATION", "Request body must be valid JSON");
        }
        return schema.parse(json);
      };
      const data = await fn({ req, ctx, params, body, query: req.nextUrl.searchParams });
      logger.info("api.request", { requestId, method: req.method, path: req.nextUrl.pathname, status: opts.status ?? 200, ms: Date.now() - started, userId });
      if (data === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json({ data }, { status: opts.status ?? 200, headers: { "x-request-id": requestId } });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      const level = status >= 500 ? "error" : "warn";
      logger[level]("api.request", {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status,
        ms: Date.now() - started,
        userId,
        error: err instanceof Error ? err.message : String(err),
        ...(status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
      });
      return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
    }
  };
}

function toErrorResponse(err: unknown): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
  if (err instanceof ZodError) {
    return { status: 422, body: { error: { code: "VALIDATION", message: "Invalid request", details: err.flatten().fieldErrors } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } };
}

/** URLSearchParams → plain object for zod query schemas. */
export function queryObject(q: URLSearchParams): Record<string, string> {
  return Object.fromEntries(q.entries());
}
