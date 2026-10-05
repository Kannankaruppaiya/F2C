import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-base font-semibold">Sign in</h1>
      <p className="mb-5 mt-0.5 text-xs text-ink-3">Welcome back. Pick up where you left off.</p>
      <LoginForm next={next} />
    </>
  );
}
