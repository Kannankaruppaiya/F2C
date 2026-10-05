import { apiHandler } from "@/server/api/handler";
import { archiveDocument } from "@/server/services/documents";

export const POST = apiHandler<{ id: string }>(async ({ ctx, params }) => {
  await archiveDocument(ctx, params.id);
});
