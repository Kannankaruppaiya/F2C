import { apiHandler } from "@/server/api/handler";
import { getApproval } from "@/server/services/approvals";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getApproval(ctx, params.id));
