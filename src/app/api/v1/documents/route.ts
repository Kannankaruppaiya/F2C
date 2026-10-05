import { apiHandler, queryObject, readUpload } from "@/server/api/handler";
import { createDocument, listDocuments } from "@/server/services/documents";
import { maxUploadBytes } from "@/server/storage/config";

export const GET = apiHandler(({ ctx, query }) => listDocuments(ctx, queryObject(query)));

/** multipart/form-data: file + projectId|clientId, name, category, description?, phaseId?, featureId?, changeRequestId?, changeSummary?, share? */
export const POST = apiHandler(
  async ({ ctx, req }) => {
    const { fields, file } = await readUpload(req, maxUploadBytes());
    const doc = await createDocument(ctx, fields as never, file);
    return { id: doc.id, currentVersionId: doc.currentVersionId };
  },
  { status: 201 },
);
