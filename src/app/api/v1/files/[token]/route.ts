import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/server/storage";
import type { LocalStorageProvider } from "@/server/storage/local";
import { contentDisposition } from "@/server/storage/validate";

/**
 * Serves local-driver files via HMAC-signed, expiring tokens (the local equivalent of an S3
 * presigned URL). The token itself is the authorization; it is only ever issued after the
 * documents service has authorized the caller.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const provider = getStorage();
  // Check by name, not instanceof: route bundles may hold distinct copies of the class.
  if (provider.name !== "local") return new NextResponse("Not found", { status: 404 });
  const storage = provider as LocalStorageProvider;
  const { token } = await params;
  const payload = storage.verify(token);
  if (!payload) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Link expired or invalid" } }, { status: 403 });
  let body: Buffer;
  try {
    body = await storage.read(payload.k);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": payload.t,
      "Content-Length": String(body.length),
      "Content-Disposition": contentDisposition(payload.d, payload.n),
      "X-Content-Type-Options": "nosniff",
      // Sandbox everything except inline PDFs: Chrome refuses to render a PDF under a sandbox CSP.
      // Only PDF/PNG/JPEG are ever served inline (allow-listed and content-sniffed at upload).
      "Content-Security-Policy": payload.d === "inline" && payload.t === "application/pdf" ? "default-src 'none'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=60",
      "Referrer-Policy": "no-referrer",
    },
  });
}
