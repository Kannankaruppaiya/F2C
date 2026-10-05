import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api/handler";
import { getDownloadUrl } from "@/server/services/documents";

/** Authorizes, then redirects to a short-lived signed URL. ?inline=1 previews PDFs/images. */
export const GET = apiHandler<{ id: string; versionId: string }>(async ({ ctx, params, query, req }) => {
  const url = await getDownloadUrl(ctx, params.id, params.versionId, { inline: query.get("inline") === "1" });
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), { status: 302, headers: { "Cache-Control": "no-store" } });
});
