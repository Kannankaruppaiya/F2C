import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pcc_session";
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Edge middleware: fast redirects for unauthenticated page loads and CSRF origin checks
 * for mutating API calls. Real authentication/authorization happens server-side in services.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOrigin(req)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-origin request blocked" } }, { status: 403 });
    }
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession && !PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && pathname !== "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function isSameOrigin(req: NextRequest): boolean {
  // Bearer-token API clients don't carry ambient cookies, so CSRF doesn't apply to them.
  if (req.headers.get("authorization")?.startsWith("Bearer ") && !req.cookies.has(SESSION_COOKIE)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([req.nextUrl.origin, ...(process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
