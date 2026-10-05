import { apiHandler, queryObject } from "@/server/api/handler";
import { createChangeRequest, listChangeRequests } from "@/server/services/change-requests";
import { changeRequestCreateSchema } from "@/server/validation/schemas";

export const GET = apiHandler(({ ctx, query }) => listChangeRequests(ctx, queryObject(query)));
export const POST = apiHandler(async ({ ctx, body }) => {
  const cr = await createChangeRequest(ctx, await body(changeRequestCreateSchema));
  return { id: cr.id, number: cr.number };
}, { status: 201 });
