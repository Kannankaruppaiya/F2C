"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authLimiter } from "@/server/auth/rate-limit";
import { clientIp, destroySession } from "@/server/auth/session";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { login, register } from "@/server/services/auth";
import { logger } from "@/server/logger";

async function limited(key: string): Promise<boolean> {
  const ip = clientIp(await headers()) ?? "unknown";
  return !authLimiter.hit(`${ip}:${key}`).allowed;
}

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").toLowerCase();
  if (await limited(`login:${email}`)) return { ok: false, error: "Too many attempts. Try again in a few minutes.", values: { email } };
  try {
    const user = await login(formObject(fd) as { email: string; password: string });
    logger.info("auth.login", { userId: user.id });
  } catch (e) {
    const state = errorState(e, fd);
    delete state.values?.password;
    return state;
  }
  redirect(safeNext(fd.get("next")));
}

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (await limited("register")) return { ok: false, error: "Too many attempts. Try again later." };
  try {
    const user = await register(formObject(fd) as never);
    logger.info("auth.register", { userId: user.id });
  } catch (e) {
    const state = errorState(e, fd);
    delete state.values?.password;
    return state;
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
