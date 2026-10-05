import { apiHandler } from "@/server/api/handler";
import { restoreDocument } from "@/server/services/documents";

export const POST = apiHandler<{ id: string }>(async ({ ctx, params }) => {
  await restoreDocument(ctx, params.id);
});
