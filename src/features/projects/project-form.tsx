"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, FormSection, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { PRIORITY, PROJECT_STATUS, ROLE, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import type { Role } from "@prisma/client";
import { saveProjectAction } from "./actions";

export interface ProjectFormInitial {
  name: string;
  clientId: string;
  description: string | null;
  projectType: string | null;
  priority: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  contractValue: number | null;
  paymentTerms: string | null;
  repositoryUrl: string | null;
  productionUrl: string | null;
  stagingUrl: string | null;
  hostingProvider: string | null;
  scopeSummary: string | null;
  outOfScope: string | null;
  projectManagerId: string | null;
  memberIds: string[];
}

export function ProjectForm({
  projectId,
  initial,
  clients,
  team,
  showFinance,
  defaultClientId,
}: {
  projectId: string | null;
  initial?: ProjectFormInitial;
  clients: { id: string; name: string }[];
  team: { id: string; name: string; role: Role; avatarColor: string | null }[];
  showFinance: boolean;
  defaultClientId?: string;
}) {
  const [state, action, pending] = useActionState(saveProjectAction.bind(null, projectId), { ok: false } as ActionState);
  const fe = state.fieldErrors ?? {};
  const v = (k: keyof ProjectFormInitial): string => {
    if (state.values && k in state.values) return state.values[k] ?? "";
    const val = initial?.[k];
    return val === null || val === undefined ? "" : String(val);
  };
  const members = new Set(initial?.memberIds ?? []);
  const inv = (k: string) => ({ "aria-invalid": !!fe[k] });

  return (
    <form action={action} noValidate className="rounded-lg border border-line bg-surface">
      {state.error && <div className="border-b border-line p-4"><FormError message={state.error} /></div>}

      <FormSection title="Project" description="What you're building and for whom.">
        <Field label="Project name" htmlFor="name" error={fe.name} required>
          <Input id="name" name="name" defaultValue={v("name")} {...inv("name")} autoFocus={!projectId} />
        </Field>
        <Field label="Client" htmlFor="clientId" error={fe.clientId} required hint={clients.length === 0 ? <Link href="/clients/new" className="text-accent">Create a client first</Link> : undefined}>
          <Select id="clientId" name="clientId" defaultValue={v("clientId") || defaultClientId || ""} {...inv("clientId")}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Project type" htmlFor="projectType" error={fe.projectType} hint="e.g. Web App, Mobile App, AI Integration">
          <Input id="projectType" name="projectType" defaultValue={v("projectType")} />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={v("priority") || "MEDIUM"}>
            {options(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        {!projectId && (
          <Field label="Initial status" htmlFor="status">
            <Select id="status" name="status" defaultValue="PLANNING">
              {options(PROJECT_STATUS).filter((o) => ["LEAD", "PLANNING", "ACTIVE"].includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Description" htmlFor="description" error={fe.description} className="sm:col-span-2">
          <Textarea id="description" name="description" rows={3} defaultValue={v("description")} />
        </Field>
      </FormSection>

      <FormSection title="Scope" description="The agreed scope protects you when change requests arrive.">
        <Field label="In scope" htmlFor="scopeSummary" error={fe.scopeSummary} className="sm:col-span-2">
          <Textarea id="scopeSummary" name="scopeSummary" rows={4} defaultValue={v("scopeSummary")} />
        </Field>
        <Field label="Out of scope" htmlFor="outOfScope" error={fe.outOfScope} className="sm:col-span-2">
          <Textarea id="outOfScope" name="outOfScope" rows={2} defaultValue={v("outOfScope")} />
        </Field>
      </FormSection>

      <FormSection title="Schedule & commercials">
        <Field label="Start date" htmlFor="startDate" error={fe.startDate}>
          <Input id="startDate" name="startDate" type="date" defaultValue={v("startDate")} {...inv("startDate")} />
        </Field>
        <Field label="Expected delivery" htmlFor="dueDate" error={fe.dueDate}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={v("dueDate")} {...inv("dueDate")} />
        </Field>
        {showFinance && (
          <>
            <Field label="Contract value" htmlFor="contractValue" error={fe.contractValue} hint="Excluding tax">
              <Input id="contractValue" name="contractValue" type="number" min="0" step="1" defaultValue={v("contractValue")} {...inv("contractValue")} />
            </Field>
            <Field label="Payment terms" htmlFor="paymentTerms" error={fe.paymentTerms}>
              <Input id="paymentTerms" name="paymentTerms" placeholder="e.g. 30% advance, Net 15" defaultValue={v("paymentTerms")} />
            </Field>
          </>
        )}
      </FormSection>

      <FormSection title="Environments" description="Where the code and builds live.">
        <Field label="Repository URL" htmlFor="repositoryUrl" error={fe.repositoryUrl}>
          <Input id="repositoryUrl" name="repositoryUrl" type="url" placeholder="https://github.com/…" defaultValue={v("repositoryUrl")} {...inv("repositoryUrl")} />
        </Field>
        <Field label="Hosting provider" htmlFor="hostingProvider" error={fe.hostingProvider}>
          <Input id="hostingProvider" name="hostingProvider" defaultValue={v("hostingProvider")} />
        </Field>
        <Field label="Staging URL" htmlFor="stagingUrl" error={fe.stagingUrl}>
          <Input id="stagingUrl" name="stagingUrl" type="url" placeholder="https://" defaultValue={v("stagingUrl")} {...inv("stagingUrl")} />
        </Field>
        <Field label="Production URL" htmlFor="productionUrl" error={fe.productionUrl}>
          <Input id="productionUrl" name="productionUrl" type="url" placeholder="https://" defaultValue={v("productionUrl")} {...inv("productionUrl")} />
        </Field>
      </FormSection>

      <FormSection title="Team" description="Developers, designers and QA only see projects they're members of.">
        <Field label="Project manager" htmlFor="projectManagerId" error={fe.projectManagerId}>
          <Select id="projectManagerId" name="projectManagerId" defaultValue={v("projectManagerId")}>
            <option value="">None</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-medium text-ink-2">Team members</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {team.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px] hover:bg-subtle has-checked:border-accent/40 has-checked:bg-accent-soft/50">
                <input type="checkbox" name="memberIds" value={m.id} defaultChecked={members.has(m.id)} className="accent-accent" />
                <Avatar name={m.name} color={m.avatarColor} size="xs" />
                <span className="truncate">{m.name}</span>
                <span className="ml-auto text-2xs text-ink-4">{ROLE[m.role]}</span>
              </label>
            ))}
          </div>
        </div>
        {!projectId && (
          <label className="flex items-start gap-2 rounded-md border border-line bg-subtle/60 p-3 text-[13px] sm:col-span-2">
            <input type="checkbox" name="standardPhases" defaultChecked className="mt-0.5 accent-accent" />
            <span>
              <span className="font-medium">Start with standard delivery phases</span>
              <span className="block text-xs text-ink-3">Discovery → UI/UX → Backend → Frontend → AI Integration → QA → Client UAT → Deployment → Handover → Maintenance. You can rename, reorder or delete them.</span>
            </span>
          </label>
        )}
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">
        <Link href={projectId ? `/projects/${projectId}` : "/projects"} className={buttonClass("secondary")}>Cancel</Link>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : projectId ? "Save changes" : "Create project"}</Button>
      </div>
    </form>
  );
}
