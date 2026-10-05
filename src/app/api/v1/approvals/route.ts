import { apiHandler, queryObject } from "@/server/api/handler";
import { listApprovals, requestApproval } from "@/server/services/approvals";
import { approvalRequestSchema } from "@/server/validation/schemas";

export const GET = apiHandler(({ ctx, query }) => listApprovals(ctx, queryObject(query)));
export const POST = apiHandler(async ({ ctx, body }) => {
  const a = await requestApproval(ctx, await body(approvalRequestSchema));
  return { id: a.id, title: a.title };
}, { status: 201 });
