"use client";

import { useActionState } from "react";
import Link from "@/components/ui/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, FormSection, Input, Select, Textarea } from "@/components/ui/field";
import { CLIENT_STATUS, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import { saveClientAction } from "./actions";

export interface ClientFormValues {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  status: string;
}

export function ClientForm({ clientId, initial }: { clientId: string | null; initial?: ClientFormValues }) {
  const [state, action, pending] = useActionState(saveClientAction.bind(null, clientId), { ok: false } as ActionState);
  const fe = state.fieldErrors ?? {};
  const v = (k: keyof ClientFormValues) => state.values?.[k] ?? initial?.[k] ?? "";
  const err = (k: string) => ({ "aria-invalid": !!fe[k], "aria-describedby": fe[k] ? `${k}-error` : undefined });

  return (
    <form action={action} noValidate className="rounded-lg border border-line bg-surface">
      {state.error && (
        <div className="border-b border-line p-4">
          <FormError message={state.error} />
        </div>
      )}
      <FormSection title="Client" description="Who you're delivering for.">
        <Field label="Client name" htmlFor="name" error={fe.name} required>
          <Input id="name" name="name" defaultValue={v("name")} {...err("name")} autoFocus={!clientId} />
        </Field>
        <Field label="Company" htmlFor="company" error={fe.company}>
          <Input id="company" name="company" defaultValue={v("company")} {...err("company")} />
        </Field>
        <Field label="Status" htmlFor="status" error={fe.status}>
          <Select id="status" name="status" defaultValue={v("status") || "ACTIVE"}>
            {options(CLIENT_STATUS).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </FormSection>
      <FormSection title="Contact details">
        <Field label="Email" htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" defaultValue={v("email")} {...err("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fe.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={v("phone")} {...err("phone")} />
        </Field>
        <Field label="Website" htmlFor="website" error={fe.website}>
          <Input id="website" name="website" type="url" placeholder="https://" defaultValue={v("website")} {...err("website")} />
        </Field>
        <Field label="Country" htmlFor="country" error={fe.country}>
          <Input id="country" name="country" defaultValue={v("country")} {...err("country")} />
        </Field>
        <Field label="Address" htmlFor="address" error={fe.address} className="sm:col-span-2">
          <Textarea id="address" name="address" rows={2} defaultValue={v("address")} {...err("address")} />
        </Field>
      </FormSection>
      <FormSection title="Notes" description="Internal only — never shown to the client.">
        <Field label="Notes" htmlFor="notes" error={fe.notes} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={4} defaultValue={v("notes")} {...err("notes")} />
        </Field>
      </FormSection>
      <div className="flex justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">
        <Link href={clientId ? `/clients/${clientId}` : "/clients"} className={buttonClass("secondary")}>Cancel</Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : clientId ? "Save changes" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
