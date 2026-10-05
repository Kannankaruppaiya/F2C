import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Create workspace" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-base font-semibold">Create your workspace</h1>
      <p className="mb-5 mt-0.5 text-xs text-ink-3">You&apos;ll be the owner. Invite your team later.</p>
      <RegisterForm />
    </>
  );
}
