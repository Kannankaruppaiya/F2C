// Change request state machine (docs/ARCHITECTURE.md §10.5). Pure.
import type { ChangeRequestStatus } from "@prisma/client";

export type ChangeRequestAction = "submit" | "send" | "withdraw" | "approve" | "reject" | "cancel" | "implement";

export const CR_TRANSITIONS: Record<ChangeRequestAction, { from: ChangeRequestStatus[]; to: ChangeRequestStatus }> = {
  submit: { from: ["DRAFT"], to: "UNDER_REVIEW" },
  send: { from: ["DRAFT", "UNDER_REVIEW"], to: "PENDING_CLIENT_APPROVAL" },
  withdraw: { from: ["PENDING_CLIENT_APPROVAL"], to: "UNDER_REVIEW" },
  approve: { from: ["PENDING_CLIENT_APPROVAL"], to: "APPROVED" },
  reject: { from: ["PENDING_CLIENT_APPROVAL"], to: "REJECTED" },
  cancel: { from: ["DRAFT", "UNDER_REVIEW", "PENDING_CLIENT_APPROVAL"], to: "CANCELLED" },
  implement: { from: ["APPROVED"], to: "IMPLEMENTED" },
};

export const CR_EDITABLE: ChangeRequestStatus[] = ["DRAFT", "UNDER_REVIEW"];
export const CR_TERMINAL: ChangeRequestStatus[] = ["REJECTED", "CANCELLED", "IMPLEMENTED"];
/** Statuses whose scope counts as agreed. */
export const CR_IN_SCOPE: ChangeRequestStatus[] = ["APPROVED", "IMPLEMENTED"];

export function canTransitionCR(status: ChangeRequestStatus, action: ChangeRequestAction): boolean {
  return CR_TRANSITIONS[action].from.includes(status);
}

export function availableCRActions(status: ChangeRequestStatus): ChangeRequestAction[] {
  return (Object.keys(CR_TRANSITIONS) as ChangeRequestAction[]).filter((a) => canTransitionCR(status, a));
}

/** Only approved (not yet implemented, rejected or cancelled) CRs can generate implementation tasks. */
export function canCreateImplementationTasks(status: ChangeRequestStatus): boolean {
  return status === "APPROVED";
}

/** Requirements before a CR may be sent to the client. Returns problems (empty = ready). */
export function sendReadiness(cr: { impact: string | null; estimatedHours: number; requestedChange: string | null }): string[] {
  const problems: string[] = [];
  if (!cr.requestedChange?.trim()) problems.push("Describe the requested change");
  if (!cr.impact?.trim()) problems.push("Add an impact analysis");
  if (!(cr.estimatedHours > 0)) problems.push("Estimate the additional hours");
  return problems;
}
