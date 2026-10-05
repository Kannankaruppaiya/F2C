import { apiHandler } from "@/server/api/handler";
import { listApprovers } from "@/server/services/approvals";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => listApprovers(ctx, params.id));
