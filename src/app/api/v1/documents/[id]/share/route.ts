import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { shareVersion } from "@/server/services/documents";

const schema = z.object({ versionId: z.string().min(1).max(64) });

export const POST = apiHandler<{ id: string }>(async ({ ctx, params, body }) => {
  await shareVersion(ctx, params.id, (await body(schema)).versionId);
});
