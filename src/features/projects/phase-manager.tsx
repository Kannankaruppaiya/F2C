"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { formatDate, formatHours, formatMoneyCompact, type MoneyFormat } from "@/lib/format";
import { PHASE_STATUS, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import type { PhaseRow } from "@/server/services/phases";
import { deletePhaseAction, movePhaseAction, savePhaseAction, setPhaseStatusAction } from "./actions";

export function PhaseManager({ projectId, phases, canEdit, fmt, today }: { projectId: string; phases: PhaseRow[]; canEdit: boolean; fmt: MoneyFormat; today: string }) {
  const [editing, setEditing] = useState<PhaseRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = new Map(phases.map((p) => [p.id, p.name]));

  const run = (fn: () => Promise<ActionState | void>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r && !r.ok ? (r.error ?? "Action failed") : null);
    });

  return (
    <div>
      {error && <div className="mb-3"><FormError message={error} /></div>}
      <div className="rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold">{phases.length} phase{phases.length === 1 ? "" : "s"}</p>
          {canEdit && <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add phase</Button>}
        </div>
        {phases.length === 0 ? (
          <EmptyState title="No phases yet." description="Phases structure delivery: Discovery, UI/UX, Backend, QA, UAT, Deployment…" action={canEdit && <Button variant="primary" onClick={() => setEditing("new")}>Add first phase</Button>} />
        ) : (
          <ol className={cn("divide-y divide-line", pending && "opacity-60")}>
            {phases.map((p, i) => {
              const late = p.endDate && p.endDate < today && p.status !== "COMPLETED";
              const over = p.estimatedHours > 0 && p.actualHours > p.estimatedHours;
              return (
                <li key={p.id} className="grid gap-3 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                  <span className="tabular hidden text-sm font-semibold text-ink-4 md:block">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold">{p.name}</span>
                      {canEdit ? (
                        <select
                          aria-label={`Status of ${p.name}`}
                          value={p.status}
                          onChange={(e) => run(() => setPhaseStatusAction(projectId, p.id, e.target.value))}
                          className="h-6 rounded border border-line bg-surface px-1 text-2xs"
                        >
                          {options(PHASE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <StatusBadge defs={PHASE_STATUS} value={p.status} />
                      )}
                      {p.milestone && <Badge tone="green" className="hidden sm:inline-flex">Milestone · {formatMoneyCompact(p.milestone.amount, fmt)}</Badge>}
                    </div>
                    {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{p.description}</p>}
                    {p.dependsOnIds.length > 0 && <p className="mt-0.5 text-2xs text-ink-4">Depends on {p.dependsOnIds.map((d) => nameOf.get(d)).filter(Boolean).join(", ")}</p>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><ProgressBar value={p.progress} /><span className="tabular text-xs">{Math.round(p.progress)}%</span></div>
                    <p className="mt-0.5 text-2xs text-ink-4">{p.openTaskCount} open / {p.taskCount} tasks · {p.featureCount} features{p.openBugCount ? ` · ${p.openBugCount} bugs` : ""}</p>
                  </div>
                  <div className="text-xs">
                    <p className={cn("tabular", late ? "text-bad" : "text-ink-2")}>{formatDate(p.startDate)} → {formatDate(p.endDate)}</p>
                    <p className={cn("tabular text-2xs", over ? "font-medium text-bad" : "text-ink-4")}>
                      {formatHours(p.actualHours)} of {formatHours(p.estimatedHours)}
                      {p.budget !== null && ` · budget ${formatMoneyCompact(p.budget, fmt)}`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 md:justify-end">
                      <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-black/5 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => run(() => movePhaseAction(projectId, p.id, "up"))} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                      <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-black/5 hover:text-ink disabled:opacity-30" disabled={i === phases.length - 1} onClick={() => run(() => movePhaseAction(projectId, p.id, "down"))} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                      <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-black/5 hover:text-ink" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil className="size-3.5" /></button>
                      <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => confirm(`Delete phase "${p.name}"?`) && run(() => deletePhaseAction(projectId, p.id))} aria-label={`Delete ${p.name}`}><Trash2 className="size-3.5" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {editing && <PhaseDialog projectId={projectId} phase={editing === "new" ? null : editing} phases={phases} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PhaseDialog({ projectId, phase, phases, onClose }: { projectId: string; phase: PhaseRow | null; phases: PhaseRow[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(savePhaseAction.bind(null, projectId, phase?.id ?? null), { ok: false } as ActionState);
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  const fe = state.fieldErrors ?? {};
  const deps = new Set(phase?.dependsOnIds ?? []);
  return (
    <Dialog open onClose={onClose} title={phase ? `Edit ${phase.name}` : "Add phase"}>
      <form action={action} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={state.ok ? null : state.error} /></div>
        <Field label="Name" htmlFor="ph-name" error={fe.name} required><Input id="ph-name" name="name" defaultValue={phase?.name} autoFocus /></Field>
        <Field label="Status" htmlFor="ph-status">
          <Select id="ph-status" name="status" defaultValue={phase?.status ?? "NOT_STARTED"}>
            {options(PHASE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Start date" htmlFor="ph-start" error={fe.startDate}><Input id="ph-start" name="startDate" type="date" defaultValue={phase?.startDate ?? ""} /></Field>
        <Field label="End date" htmlFor="ph-end" error={fe.endDate}><Input id="ph-end" name="endDate" type="date" defaultValue={phase?.endDate ?? ""} /></Field>
        <Field label="Estimated hours" htmlFor="ph-hours" error={fe.estimatedHours} hint="Planned effort for this phase"><Input id="ph-hours" name="estimatedHours" type="number" min="0" step="0.5" defaultValue={phase?.plannedHours ?? ""} /></Field>
        <Field label="Budget" htmlFor="ph-budget" error={fe.budget} hint="Optional"><Input id="ph-budget" name="budget" type="number" min="0" defaultValue={phase?.budget ?? ""} /></Field>
        <Field label="Description" htmlFor="ph-desc" error={fe.description} className="sm:col-span-2"><Textarea id="ph-desc" name="description" rows={2} defaultValue={phase?.description ?? ""} /></Field>
        {phases.filter((p) => p.id !== phase?.id).length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-medium text-ink-2">Depends on</legend>
            <div className="flex flex-wrap gap-1.5">
              {phases.filter((p) => p.id !== phase?.id).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-xs has-checked:border-accent/40 has-checked:bg-accent-soft">
                  <input type="checkbox" name="dependsOnIds" value={p.id} defaultChecked={deps.has(p.id)} className="accent-accent" /> {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : phase ? "Save phase" : "Add phase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
