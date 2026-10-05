"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Mail, Phone, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import type { ActionState } from "@/server/action-state";
import { addContactAction, removeContactAction } from "./actions";

interface Contact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export function Contacts({ clientId, contacts, canEdit }: { clientId: string; contacts: Contact[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addContactAction.bind(null, clientId), { ok: false } as ActionState);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAdding(false);
    }
  }, [state]);
  const fe = state.fieldErrors ?? {};

  return (
    <div>
      {contacts.length === 0 && !adding && <EmptyState title="No contacts yet." description="Add the people you work with at this client." />}
      <ul className="divide-y divide-line">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                {c.name}
                {c.isPrimary && <Star className="size-3 fill-warn text-warn" aria-label="Primary contact" />}
              </p>
              {c.role && <p className="text-xs text-ink-3">{c.role}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-2">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <Mail className="size-3" /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <Phone className="size-3" /> {c.phone}
                  </a>
                )}
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                className="rounded p-1 text-ink-4 hover:bg-bad-soft hover:text-bad"
                aria-label={`Remove ${c.name}`}
                onClick={() => confirm(`Remove ${c.name}?`) && startTransition(() => removeContactAction(c.id))}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && adding && (
        <form ref={formRef} action={action} className="grid gap-3 border-t border-line bg-subtle/50 p-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><FormError message={state.ok ? null : state.error} /></div>
          <Field label="Name" htmlFor="c-name" error={fe.name} required><Input id="c-name" name="name" autoFocus /></Field>
          <Field label="Role" htmlFor="c-role" error={fe.role}><Input id="c-role" name="role" placeholder="e.g. Product Owner" /></Field>
          <Field label="Email" htmlFor="c-email" error={fe.email}><Input id="c-email" name="email" type="email" /></Field>
          <Field label="Phone" htmlFor="c-phone" error={fe.phone}><Input id="c-phone" name="phone" type="tel" /></Field>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" name="isPrimary" className="accent-accent" /> Primary contact
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add contact"}</Button>
          </div>
        </form>
      )}
      {canEdit && !adding && (
        <div className="border-t border-line px-4 py-2.5">
          <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add contact
          </Button>
        </div>
      )}
    </div>
  );
}
