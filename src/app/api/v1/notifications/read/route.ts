import { z } from "zod";
import { apiHandler } from "@/server/api/handler";
import { markNotificationsRead } from "@/server/services/notifications";

const schema = z.object({ ids: z.array(z.string().max(64)).max(200).optional() });

export const POST = apiHandler(async ({ ctx, body }) => {
  const { ids } = await body(schema);
  await markNotificationsRead(ctx, ids);
});
