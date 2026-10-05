// Pure progress calculations. Progress is derived from task state, never stored,
// so it cannot drift from reality.
import type { PhaseStatus, TaskStatus } from "@prisma/client";

/** Partial credit per task status. A task in testing is mostly built; one in progress is not. */
export const TASK_STATUS_CREDIT: Record<TaskStatus, number> = {
  BACKLOG: 0,
  TODO: 0,
  BLOCKED: 0,
  IN_PROGRESS: 0.4,
  REVIEW: 0.7,
  TESTING: 0.85,
  DONE: 1,
};

export interface ProgressTask {
  status: TaskStatus;
  estimatedHours: number;
}

/** Estimate-weighted progress (0–100). Tasks without an estimate weigh 1h. */
export function taskProgress(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;
  let total = 0;
  let earned = 0;
  for (const t of tasks) {
    const w = t.estimatedHours > 0 ? t.estimatedHours : 1;
    total += w;
    earned += w * TASK_STATUS_CREDIT[t.status];
  }
  return total === 0 ? 0 : (earned / total) * 100;
}

export interface ProgressPhase {
  id: string;
  position: number;
  status: PhaseStatus;
  estimatedHours: number;
  tasks: ProgressTask[];
}

export function phaseProgress(phase: ProgressPhase): number {
  if (phase.status === "COMPLETED") return 100;
  return taskProgress(phase.tasks);
}

function phaseWeight(phase: ProgressPhase): number {
  const taskHours = phase.tasks.reduce((s, t) => s + (t.estimatedHours > 0 ? t.estimatedHours : 1), 0);
  return Math.max(phase.estimatedHours, taskHours, 1);
}

/** Project progress: phase progress weighted by phase size. */
export function projectProgress(phases: ProgressPhase[]): number {
  if (phases.length === 0) return 0;
  let total = 0;
  let earned = 0;
  for (const p of phases) {
    const w = phaseWeight(p);
    total += w;
    earned += (w * phaseProgress(p)) / 100;
  }
  return (earned / total) * 100;
}

/** The phase work is currently happening in: the earliest active phase, else the earliest unstarted one. */
export function currentPhase<T extends { position: number; status: PhaseStatus }>(phases: T[]): T | null {
  const sorted = [...phases].sort((a, b) => a.position - b.position);
  return (
    sorted.find((p) => p.status === "IN_PROGRESS" || p.status === "BLOCKED" || p.status === "REVIEW") ??
    sorted.find((p) => p.status === "NOT_STARTED") ??
    null
  );
}
