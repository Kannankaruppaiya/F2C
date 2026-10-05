"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { PRIORITY, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import { createChangeRequestAction, updateChangeRequestAction } from "./actions";

export interface CRFormValues {
  title: string;
  description: string | null;
  originalScope: string | null;
  requestedChange: string | null;
  impact: string | null;
  estimatedHours: number;
  additionalCost: number;
  priority: string;
  requestedBy: string | null;
}

/** Fields shared by create and edit. Clients only describe the change; analysis is internal. */
function Fields({ fe, v, internal }: { fe: Record<string, string[] | undefined>; v: Partial<CRFormValues>; internal: boolean }) {
  return (
    <>
      <Field label="Title" htmlFor="cr-title" error={fe.title} required className="sm:col-span-2">
        <Input id="cr-title" name="title" defaultValue={v.title} placeholder="e.g. Google + Microsoft login" autoFocus />
      </Field>
      {internal && (
        <Field label="Original scope" htmlFor="cr-orig" error={fe.originalScope}>
          <Textarea id="cr-orig" name="originalScope" rows={2} defaultValue={v.originalScope ?? ""} placeholder="What was agreed, e.g. Email login" />
        </Field>
      )}
      <Field label="Requested change" htmlFor="cr-change" error={fe.requestedChange} className={internal ? "" : "sm:col-span-2"}>
        <Textarea id="cr-change" name="requestedChange" rows={2} defaultValue={v.requestedChange ?? ""} placeholder="What should change" />
      </Field>
      <Field label="Description" htmlFor="cr-desc" error={fe.description} className="sm:col-span-2">
        <Textarea id="cr-desc" name="description" rows={3} defaultValue={v.description ?? ""} placeholder="Context and reasoning" />
      </Field>
      {internal && (
        <>
          <Field label="Impact analysis" htmlFor="cr-impact" error={fe.impact} className="sm:col-span-2" hint="Effect on timeline, other features, risk. Required before sending to the client.">
            <Textarea id="cr-impact" name="impact" rows={2} defaultValue={v.impact ?? ""} />
          </Field>
          <Field label="Estimated hours" htmlFor="cr-hours" error={fe.estimatedHours}>
            <Input id="cr-hours" name="estimatedHours" type="number" min="0" step="0.5" defaultValue={v.estimatedHours || ""} />
          </Field>
          <Field label="Additional cost" htmlFor="cr-cost" error={fe.additionalCost} hint="Quoted to the client (excl. tax)">
            <Input id="cr-cost" name="additionalCost" type="number" min="0" step="1" defaultValue={v.additionalCost || ""} />
          </Field>
          <Field label="Requested by" htmlFor="cr-by" error={fe.requestedBy} hint="Who asked for it (e.g. client contact)">
            <Input id="cr-by" name="requestedBy" defaultValue={v.requestedBy ?? ""} />
          </Field>
        </>
      )}
      <Field label="Priority" htmlFor="cr-priority">
        <Select id="cr-priority" name="priority" defaultValue={v.priority ?? "MEDIUM"}>
          {options(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    </>
  );
}

export function NewChangeRequestButton({ projects, defaultProjectId, internal, openInitially = false }: { projects: { id: string; name: string }[]; defaultProjectId?: string; internal: boolean; openInitially?: boolean }) {
  const [open, setOpen] = useState(openInitially);
  const [state, action, pending] = useActionState(createChangeRequestAction, { ok: false } as ActionState);
  const fe = state.fieldErrors ?? {};
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} disabled={projects.length === 0}><Plus className="size-3.5" /> {internal ? "New change request" : "Request a change"}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={internal ? "New change request" : "Request a change"} description={internal ? "Starts as a draft. Add impact, hours and cost, then send it to the client." : "Describe what you'd like to change. The team will estimate the effort and cost for your approval."} size="lg">
        <form action={action} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><FormError message={state.error} /></div>
          <Field label="Project" htmlFor="cr-project" error={fe.projectId} required className="sm:col-span-2">
            <Select id="cr-project" name="projectId" defaultValue={defaultProjectId ?? projects[0]?.id}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Fields fe={fe} v={state.values ? (state.values as unknown as Partial<CRFormValues>) : {}} internal={internal} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating…" : internal ? "Create draft" : "Submit request"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function EditChangeRequestButton({ id, values }: { id: string; values: CRFormValues }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateChangeRequestAction.bind(null, id), { ok: false } as ActionState);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Edit</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit change request" size="lg">
        <form action={action} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><FormError message={state.ok ? null : state.error} /></div>
          <Fields fe={state.fieldErrors ?? {}} v={values} internal />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
