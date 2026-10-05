import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { loginSchema, registerSchema } from "@/server/validation/schemas";

// Unknown emails still pay the bcrypt cost, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("pcc-timing-equalizer"));

export async function login(input: z.input<typeof loginSchema>) {
  const { email, password } = loginSchema.parse(input);
  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  const membership = await db.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, membership?.workspaceId ?? null);
  return user;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
}

/** Creates a user and their own workspace (as OWNER). */
export async function register(input: z.input<typeof registerSchema>) {
  const data = registerSchema.parse(input);
  const exists = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw new AppError("CONFLICT", "An account with this email already exists", { email: ["Already registered"] });
  const passwordHash = await hashPassword(data.password);
  const { user, workspace } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: data.email, name: data.name, passwordHash } });
    const base = slugify(data.workspaceName);
    const taken = await tx.workspace.count({ where: { slug: { startsWith: base } } });
    const workspace = await tx.workspace.create({
      data: { name: data.workspaceName, slug: taken ? `${base}-${taken + 1}` : base, members: { create: { userId: user.id, role: "OWNER" } } },
    });
    await tx.activity.create({
      data: { workspaceId: workspace.id, actorId: user.id, entityType: "workspace", entityId: workspace.id, action: "workspace.created", summary: `Workspace ${workspace.name} created` },
    });
    return { user, workspace };
  });
  await createSession(user.id, workspace.id);
  return user;
}
