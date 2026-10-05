import { apiHandler } from "@/server/api/handler";
import { deleteClient, getClient, updateClient } from "@/server/services/clients";
import { clientUpdateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getClient(ctx, params.id));
export const PATCH = apiHandler<{ id: string }>(async ({ ctx, params, body }) => updateClient(ctx, params.id, await body(clientUpdateSchema)));
export const DELETE = apiHandler<{ id: string }>(({ ctx, params }) => deleteClient(ctx, params.id));
