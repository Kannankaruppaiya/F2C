import { z } from "zod";
import { apiHandler, queryObject } from "@/server/api/handler";
import { createClient, listClients } from "@/server/services/clients";
import { clientCreateSchema } from "@/server/validation/schemas";

const listQuery = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  sort: z.enum(["name", "contractValue", "outstanding", "lastActivity"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

export const GET = apiHandler(({ ctx, query }) => listClients(ctx, listQuery.parse(queryObject(query))));
export const POST = apiHandler(async ({ ctx, body }) => createClient(ctx, await body(clientCreateSchema)), { status: 201 });
