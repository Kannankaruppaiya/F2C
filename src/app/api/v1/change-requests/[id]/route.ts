import { apiHandler } from "@/server/api/handler";
import { getChangeRequest, updateChangeRequest } from "@/server/services/change-requests";
import { changeRequestUpdateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getChangeRequest(ctx, params.id));
export const PATCH = apiHandler<{ id: string }>(async ({ ctx, params, body }) => {
  await updateChangeRequest(ctx, params.id, await body(changeRequestUpdateSchema));
  return getChangeRequest(ctx, params.id);
});
