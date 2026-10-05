import { apiHandler } from "@/server/api/handler";
import { getDocument, updateDocument } from "@/server/services/documents";
import { documentUpdateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getDocument(ctx, params.id));
export const PATCH = apiHandler<{ id: string }>(async ({ ctx, params, body }) => {
  const d = await updateDocument(ctx, params.id, await body(documentUpdateSchema));
  return { id: d.id };
});
