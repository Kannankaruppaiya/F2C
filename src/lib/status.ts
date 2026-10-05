// Single source of truth for every status/enum shown in the UI:
// label, visual tone, ordering, and allowed transitions.
import type {
  BugSeverity,
  BugStatus,
  ClientStatus,
  FeatureStatus,
  InvoiceStatus,
  ApprovalStatus,
  ChangeRequestStatus,
  PhaseStatus,
  Priority,
  ProjectStatus,
  Role,
  TaskStatus,
  DocumentStatus,
  DocumentCategory,
  DeploymentStatus,
  HandoverItemStatus,
} from "@prisma/client";

export type Tone = "neutral" | "blue" | "violet" | "amber" | "green" | "red" | "muted";

export interface StatusDef {
  label: string;
  tone: Tone;
}

type Defs<T extends string> = Record<T, StatusDef>;

export const CLIENT_STATUS: Defs<ClientStatus> = {
  LEAD: { label: "Lead", tone: "violet" },
  ACTIVE: { label: "Active", tone: "green" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "muted" },
};

export const PROJECT_STATUS: Defs<ProjectStatus> = {
  LEAD: { label: "Lead", tone: "violet" },
  PLANNING: { label: "Planning", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "blue" },
  ON_HOLD: { label: "On Hold", tone: "amber" },
  CLIENT_REVIEW: { label: "Client Review", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  MAINTENANCE: { label: "Maintenance", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

/** Statuses that count as "currently being delivered". */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = ["PLANNING", "ACTIVE", "ON_HOLD", "CLIENT_REVIEW"];

/** Allowed project status transitions (business rules 17 & 18). */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  LEAD: ["PLANNING", "CANCELLED"],
  PLANNING: ["ACTIVE", "ON_HOLD", "CANCELLED", "LEAD"],
  ACTIVE: ["ON_HOLD", "CLIENT_REVIEW", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "PLANNING", "CANCELLED"],
  CLIENT_REVIEW: ["ACTIVE", "COMPLETED", "ON_HOLD"],
  COMPLETED: ["MAINTENANCE", "ACTIVE"],
  MAINTENANCE: ["COMPLETED", "ACTIVE"],
  CANCELLED: ["PLANNING"],
};

export const PRIORITY: Defs<Priority> = {
  LOW: { label: "Low", tone: "muted" },
  MEDIUM: { label: "Medium", tone: "neutral" },
  HIGH: { label: "High", tone: "amber" },
  CRITICAL: { label: "Critical", tone: "red" },
};
export const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export const PHASE_STATUS: Defs<PhaseStatus> = {
  NOT_STARTED: { label: "Not Started", tone: "muted" },
  IN_PROGRESS: { label: "In Progress", tone: "blue" },
  BLOCKED: { label: "Blocked", tone: "red" },
  REVIEW: { label: "Review", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
};

export const FEATURE_STATUS: Defs<FeatureStatus> = {
  BACKLOG: { label: "Backlog", tone: "muted" },
  PLANNED: { label: "Planned", tone: "neutral" },
  IN_DEVELOPMENT: { label: "In Development", tone: "blue" },
  REVIEW: { label: "Review", tone: "violet" },
  TESTING: { label: "Testing", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "green" },
  REJECTED: { label: "Rejected", tone: "muted" },
};

export const TASK_STATUS: Defs<TaskStatus> = {
  BACKLOG: { label: "Backlog", tone: "muted" },
  TODO: { label: "Todo", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "blue" },
  BLOCKED: { label: "Blocked", tone: "red" },
  REVIEW: { label: "Review", tone: "violet" },
  TESTING: { label: "Testing", tone: "amber" },
  DONE: { label: "Done", tone: "green" },
};
export const OPEN_TASK_STATUSES: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "TESTING"];

export const BUG_SEVERITY: Defs<BugSeverity> = {
  CRITICAL: { label: "Critical", tone: "red" },
  HIGH: { label: "High", tone: "amber" },
  MEDIUM: { label: "Medium", tone: "neutral" },
  LOW: { label: "Low", tone: "muted" },
};

export const BUG_STATUS: Defs<BugStatus> = {
  OPEN: { label: "Open", tone: "red" },
  IN_PROGRESS: { label: "In Progress", tone: "blue" },
  FIXED: { label: "Fixed", tone: "violet" },
  RETEST: { label: "Retest", tone: "amber" },
  REOPENED: { label: "Reopened", tone: "red" },
  CLOSED: { label: "Closed", tone: "green" },
};
export const OPEN_BUG_STATUSES: BugStatus[] = ["OPEN", "IN_PROGRESS", "FIXED", "RETEST", "REOPENED"];

export const INVOICE_STATUS: Defs<InvoiceStatus> = {
  DRAFT: { label: "Draft", tone: "muted" },
  SENT: { label: "Sent", tone: "blue" },
  PARTIALLY_PAID: { label: "Partially Paid", tone: "amber" },
  PAID: { label: "Paid", tone: "green" },
  OVERDUE: { label: "Overdue", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const APPROVAL_STATUS: Defs<ApprovalStatus> = {
  PENDING: { label: "Pending", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  CHANGES_REQUESTED: { label: "Changes Requested", tone: "violet" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const CHANGE_REQUEST_STATUS: Defs<ChangeRequestStatus> = {
  DRAFT: { label: "Draft", tone: "muted" },
  UNDER_REVIEW: { label: "Under Review", tone: "neutral" },
  PENDING_CLIENT_APPROVAL: { label: "Pending Client", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  IMPLEMENTED: { label: "Implemented", tone: "blue" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const DOCUMENT_STATUS: Defs<DocumentStatus> = {
  DRAFT: { label: "Draft", tone: "muted" },
  INTERNAL_REVIEW: { label: "Internal Review", tone: "neutral" },
  SENT_TO_CLIENT: { label: "Sent to Client", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  ARCHIVED: { label: "Archived", tone: "muted" },
};

export const DOCUMENT_CATEGORY: Record<DocumentCategory, string> = {
  REQUIREMENTS: "Requirements",
  PROPOSAL: "Proposal",
  SCOPE: "Scope",
  UI_UX: "UI/UX",
  TECHNICAL: "Technical",
  API: "API",
  DATABASE: "Database",
  QA: "QA",
  APPROVAL: "Approval",
  INVOICE: "Invoice",
  DEPLOYMENT: "Deployment",
  HANDOVER: "Handover",
  OTHER: "Other",
};

export const DEPLOYMENT_STATUS: Defs<DeploymentStatus> = {
  PENDING: { label: "Pending", tone: "muted" },
  DEPLOYING: { label: "Deploying", tone: "blue" },
  SUCCESSFUL: { label: "Successful", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  ROLLED_BACK: { label: "Rolled Back", tone: "amber" },
};

export const HANDOVER_STATUS: Defs<HandoverItemStatus> = {
  PENDING: { label: "Pending", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "green" },
  SKIPPED: { label: "Skipped", tone: "muted" },
};

export type HealthLevel = "HEALTHY" | "AT_RISK" | "CRITICAL";
export const HEALTH: Defs<HealthLevel> = {
  HEALTHY: { label: "Healthy", tone: "green" },
  AT_RISK: { label: "At Risk", tone: "amber" },
  CRITICAL: { label: "Critical", tone: "red" },
};

export const ROLE: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  DEVELOPER: "Developer",
  DESIGNER: "Designer",
  QA: "QA",
  FINANCE: "Finance",
  CLIENT: "Client",
};

export function options<T extends string>(defs: Defs<T>): { value: T; label: string }[] {
  return (Object.keys(defs) as T[]).map((value) => ({ value, label: defs[value].label }));
}
