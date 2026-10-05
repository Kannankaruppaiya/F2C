// Approval state machine (docs/ARCHITECTURE.md §10.4). Pure.
import type { ApprovalStatus, DocumentStatus } from "@prisma/client";

export type ApprovalAction = "approve" | "reject" | "request_changes" | "cancel";

export const APPROVAL_TRANSITIONS: Record<ApprovalAction, { from: ApprovalStatus[]; to: ApprovalStatus; by: "approver" | "internal" }> = {
  approve: { from: ["PENDING"], to: "APPROVED", by: "approver" },
  reject: { from: ["PENDING"], to: "REJECTED", by: "approver" },
  request_changes: { from: ["PENDING"], to: "CHANGES_REQUESTED", by: "approver" },
  cancel: { from: ["PENDING"], to: "CANCELLED", by: "internal" },
};

export function canTransitionApproval(status: ApprovalStatus, action: ApprovalAction): boolean {
  return APPROVAL_TRANSITIONS[action].from.includes(status);
}

export function isApprovalFinal(status: ApprovalStatus): boolean {
  return status !== "PENDING";
}

/**
 * Effect of a decision on the reviewed version and (only if it is still current) on the document.
 * Returns null fields when nothing should change.
 */
export function approvalEffects(action: ApprovalAction, versionIsCurrent: boolean): { version: DocumentStatus | null; document: DocumentStatus | null } {
  switch (action) {
    case "approve":
      return { version: "APPROVED", document: versionIsCurrent ? "APPROVED" : null };
    case "reject":
      return { version: "REJECTED", document: versionIsCurrent ? "REJECTED" : null };
    case "request_changes":
      return { version: null, document: versionIsCurrent ? "INTERNAL_REVIEW" : null };
    case "cancel":
      return { version: null, document: versionIsCurrent ? "INTERNAL_REVIEW" : null };
  }
}
