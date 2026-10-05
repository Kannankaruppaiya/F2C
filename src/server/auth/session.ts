import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "@/server/db";

export const SESSION_COOKIE = "pcc_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === "true";
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string, workspaceId: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      workspaceId,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      ipAddress: clientIp(h),
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export interface CurrentSession {
  sessionId: string;
  user: { id: string; name: string; email: string; avatarColor: string | null };
  workspace: { id: string; name: string; currency: string; locale: string; timezone: string } | null;
  role: Role | null;
  clientId: string | null;
}

async function readToken(): Promise<string | null> {
  const jar = await cookies();
  const fromCookie = jar.get(SESSION_COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return null;
}

/** Resolves the current session (memoized per request). Returns null when unauthenticated. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = await readToken();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  // Resolve workspace membership: the session's workspace if still a member, else the first one.
  const memberships = await db.workspaceMember.findMany({
    where: { userId: session.userId },
    include: { workspace: { select: { id: true, name: true, currency: true, locale: true, timezone: true } } },
    orderBy: { createdAt: "asc" },
  });
  const membership = memberships.find((m) => m.workspaceId === session.workspaceId) ?? memberships[0] ?? null;

  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS || membership?.workspaceId !== session.workspaceId) {
    await db.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
        workspaceId: membership?.workspaceId ?? null,
      },
    });
  }

  return {
    sessionId: session.id,
    user: session.user,
    workspace: membership?.workspace ?? null,
    role: membership?.role ?? null,
    clientId: membership?.clientId ?? null,
  };
});
