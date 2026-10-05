import { apiHandler, readUpload } from "@/server/api/handler";
import { uploadVersion } from "@/server/services/documents";
import { maxUploadBytes } from "@/server/storage/config";

/** multipart/form-data: file, changeSummary?, share? — the version number is always assigned by the server. */
export const POST = apiHandler<{ id: string }>(
  async ({ ctx, params, req }) => {
    const { fields, file } = await readUpload(req, maxUploadBytes());
    const v = await uploadVersion(ctx, params.id, { changeSummary: fields.changeSummary, share: fields.share }, file);
    return { id: v.id, versionNumber: v.versionNumber };
  },
  { status: 201 },
);
