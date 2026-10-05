import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { notFound } from "@/server/errors";
import { cancelApproval, decideApproval } from "@/server/services/approvals";

const body = z.object({ comment: z.string().max(5000).optional() });

/** POST /approvals/:id/approve | reject | request-changes | cancel */
export const POST = apiHandler<{ id: string; action: string }>(async ({ ctx, params, req }) => {
  const input = body.parse(await req.json().catch(() => ({})));
  switch (params.action) {
    case "approve":
      return decideApproval(ctx, params.id, "approve", input);
    case "reject":
      return decideApproval(ctx, params.id, "reject", input);
    case "request-changes":
      return decideApproval(ctx, params.id, "request_changes", input);
    case "cancel":
      await cancelApproval(ctx, params.id);
      return { status: "CANCELLED" };
    default:
      throw notFound("Action");
  }
});
