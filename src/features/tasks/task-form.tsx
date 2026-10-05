"use client";

import { useActionState, useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, FormSection, Input, Select, Textarea } from "@/components/ui/field";
import { PRIORITY, TASK_STATUS, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import { saveTaskAction } from "./actions";

export interface TaskFormOptions {
  projects: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  features: { id: string; name: string; phaseId: string }[];
  tasks: { id: string; key: string; title: string }[];
  team: { id: string; name: string }[];
}

export interface TaskFormInitial {
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  phaseId: string;
  featureId: string | null;
  assigneeId: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  estimatedHours: number;
  blockedReason: string | null;
  dependsOnIds: string[];
}

export function TaskForm({
  taskId,
  projectId,
  initial,
  opts,
  canAssign,
  selfId,
  defaults,
}: {
  taskId: string | null;
  projectId: string | null;
  initial?: TaskFormInitial;
  opts: TaskFormOptions;
  canAssign: boolean;
  selfId: string;
  defaults?: { phaseId?: string; featureId?: string };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveTaskAction.bind(null, taskId, null), { ok: false } as ActionState);
  const fe = state.fieldErrors ?? {};
  const val = (k: keyof TaskFormInitial, fallback = ""): string => {
    if (state.values && k in state.values) return state.values[k] ?? "";
    const v = initial?.[k];
    return v === null || v === undefined ? fallback : String(v);
  };
  const [phaseId, setPhaseId] = useState(val("phaseId", defaults?.phaseId ?? opts.phases[0]?.id ?? ""));
  const [status, setStatus] = useState(val("status", "TODO"));
  const features = opts.features.filter((f) => f.phaseId === phaseId);
  const deps = new Set(initial?.dependsOnIds ?? []);
  const team = canAssign ? opts.team : opts.team.filter((m) => m.id === selfId || m.id === initial?.assigneeId);

  return (
    <form action={action} noValidate className="rounded-lg border border-line bg-surface">
      {state.error && <div className="border-b border-line p-4"><FormError message={state.error} /></div>}
      <FormSection title="Where" description="Tasks live under a phase, optionally inside a feature.">
        <Field label="Project" htmlFor="projectId" required>
          {taskId ? (
            <Input id="projectId" value={opts.projects.find((p) => p.id === projectId)?.name ?? ""} disabled />
          ) : (
            <Select id="projectId" name="projectId" value={projectId ?? ""} onChange={(e) => router.replace(`/tasks/new?projectId=${e.target.value}`)}>
              <option value="">Select project…</option>
              {opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Phase" htmlFor="phaseId" error={fe.phaseId} required hint={projectId && opts.phases.length === 0 ? "This project has no phases yet." : undefined}>
          <Select id="phaseId" name="phaseId" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!projectId}>
            {opts.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Feature" htmlFor="featureId" error={fe.featureId} hint="Optional">
          <Select id="featureId" name="featureId" defaultValue={val("featureId", defaults?.featureId ?? "")} key={phaseId} disabled={!projectId}>
            <option value="">Directly under phase</option>
            {features.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Task">
        <Field label="Title" htmlFor="title" error={fe.title} required className="sm:col-span-2">
          <Input id="title" name="title" defaultValue={val("title")} aria-invalid={!!fe.title} autoFocus={!taskId && !!projectId} />
        </Field>
        <Field label="Description" htmlFor="description" error={fe.description} className="sm:col-span-2">
          <Textarea id="description" name="description" rows={4} defaultValue={val("description")} />
        </Field>
        <Field label="Acceptance criteria" htmlFor="acceptanceCriteria" error={fe.acceptanceCriteria} className="sm:col-span-2" hint="How we know it's done.">
          <Textarea id="acceptanceCriteria" name="acceptanceCriteria" rows={3} defaultValue={val("acceptanceCriteria")} />
        </Field>
      </FormSection>

      <FormSection title="Planning">
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {options(TASK_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={val("priority", "MEDIUM")}>
            {options(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        {status === "BLOCKED" && (
          <Field label="Blocked because" htmlFor="blockedReason" error={fe.blockedReason} className="sm:col-span-2">
            <Input id="blockedReason" name="blockedReason" defaultValue={val("blockedReason")} placeholder="e.g. Waiting for client API credentials" />
          </Field>
        )}
        <Field label="Assignee" htmlFor="assigneeId" error={fe.assigneeId} hint={canAssign ? undefined : "You can assign tasks to yourself."}>
          <Select id="assigneeId" name="assigneeId" defaultValue={val("assigneeId")}>
            <option value="">Unassigned</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="dueDate" error={fe.dueDate}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={val("dueDate")} />
        </Field>
        <Field label="Estimated hours" htmlFor="estimatedHours" error={fe.estimatedHours}>
          <Input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={val("estimatedHours")} />
        </Field>
        {opts.tasks.length > 0 && (
          <Field label="Depends on" htmlFor="dependsOnIds" error={fe.dependsOnIds} hint="Can't be marked done until these are done. Ctrl/⌘-click for several." className="sm:col-span-2">
            <select id="dependsOnIds" name="dependsOnIds" multiple defaultValue={[...deps]} className="block h-28 w-full rounded-md border border-line-strong bg-surface p-1 text-[13px]">
              {opts.tasks.map((t) => <option key={t.id} value={t.id}>{t.key} · {t.title}</option>)}
            </select>
          </Field>
        )}
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">
        <Link href={taskId ? `/tasks/${taskId}` : projectId ? `/projects/${projectId}/tasks` : "/tasks"} className={buttonClass("secondary")}>Cancel</Link>
        <Button type="submit" variant="primary" disabled={pending || !projectId || !phaseId}>{pending ? "Saving…" : taskId ? "Save task" : "Create task"}</Button>
      </div>
    </form>
  );
}
