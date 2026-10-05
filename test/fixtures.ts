import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import type { AuthContext } from "@/server/authz/context";

export const PDF = (label = "doc") => Buffer.from(`%PDF-1.4\n% ${label} ${randomUUID()}\n1 0 obj<<>>endobj\n%%EOF`);
export const pdfFile = (name = "Requirements.pdf", label?: string) => ({ name, type: "application/pdf", bytes: PDF(label ?? name) });

export function ctxFor(user: { id: string; name: string }, workspaceId: string, role: Role, clientId: string | null = null): AuthContext {
  return { userId: user.id, userName: user.name, workspaceId, role, clientId, timezone: "Asia/Kolkata", currency: "INR", locale: "en-IN" };
}

/**
 * An isolated workspace: owner, PM, a developer who is NOT a project member, two clients each with
 * a project and a client user. Returns ready-made auth contexts.
 */
export async function makeWorkspace(tag = randomUUID().slice(0, 8)) {
  const ws = await db.workspace.create({ data: { name: `WS ${tag}`, slug: `ws-${tag}-${randomUUID().slice(0, 6)}` } });
  const user = async (name: string, role: Role, clientId: string | null = null) => {
    const u = await db.user.create({ data: { email: `${name.toLowerCase().replace(/\s/g, ".")}.${tag}.${randomUUID().slice(0, 6)}@test.dev`, name, passwordHash: "x" } });
    await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role, clientId } });
    return u;
  };
  const clientA = await db.client.create({ data: { workspaceId: ws.id, name: "Client A" } });
  const clientB = await db.client.create({ data: { workspaceId: ws.id, name: "Client B" } });
  const owner = await user("Owner", "OWNER");
  const pm = await user("Pat Manager", "PROJECT_MANAGER");
  const dev = await user("Dee Veloper", "DEVELOPER");
  const anil = await user("Anil Client", "CLIENT", clientA.id);
  const bina = await user("Bina Client", "CLIENT", clientB.id);
  const project = (name: string, clientId: string, code: string) =>
    db.project.create({
      data: {
        workspaceId: ws.id, clientId, name, code, status: "ACTIVE", projectManagerId: pm.id,
        members: { create: [{ userId: pm.id, workspaceId: ws.id }] },
        phases: { create: [{ name: "Build", position: 1, workspaceId: ws.id }, { name: "QA", position: 2, workspaceId: ws.id }] },
      },
      include: { phases: { orderBy: { position: "asc" } } },
    });
  const pA = await project("Project A", clientA.id, "PRJ-A");
  const pB = await project("Project B", clientB.id, "PRJ-B");
  const featureA = await db.feature.create({ data: { workspaceId: ws.id, projectId: pA.id, phaseId: pA.phases[0]!.id, name: "Email login", estimatedHours: 10 } });
  return {
    ws, clientA, clientB, pA, pB, featureA,
    users: { owner, pm, dev, anil, bina },
    ctx: {
      owner: ctxFor(owner, ws.id, "OWNER"),
      pm: ctxFor(pm, ws.id, "PROJECT_MANAGER"),
      dev: ctxFor(dev, ws.id, "DEVELOPER"),
      anil: ctxFor(anil, ws.id, "CLIENT", clientA.id),
      bina: ctxFor(bina, ws.id, "CLIENT", clientB.id),
    },
  };
}

export type Fixture = Awaited<ReturnType<typeof makeWorkspace>>;
