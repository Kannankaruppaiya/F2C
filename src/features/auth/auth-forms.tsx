"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { loginAction, registerAction } from "./actions";

const initial: ActionState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormError message={state.error} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={!!state.fieldErrors?.email} autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-ink-3">
        New here?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Your name" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={v.name} aria-invalid={!!fe.name} autoFocus />
      </Field>
      <Field label="Work email" htmlFor="email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={!!fe.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 10 characters with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe.password} />
      </Field>
      <Field label="Workspace name" htmlFor="workspaceName" error={fe.workspaceName} hint="Your studio, agency or freelance business.">
        <Input id="workspaceName" name="workspaceName" defaultValue={v.workspaceName} aria-invalid={!!fe.workspaceName} />
      </Field>
      <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
      <p className="text-center text-xs text-ink-3">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
