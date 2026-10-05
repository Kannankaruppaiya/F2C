// Project health engine (see docs/ARCHITECTURE.md §8). Pure: takes facts, returns a verdict
// with human-readable reasons. Thresholds are named constants, not scattered literals.
import type { Priority, ProjectStatus } from "@prisma/client";
import { daysBetween, type ISODate } from "@/lib/dates";
import type { HealthLevel } from "@/lib/status";

export const HEALTH_THRESHOLDS = {
  scheduleSlipAtRisk: 15, // pts: % time elapsed minus % progress
  finalWeekDays: 7,
  finalWeekMinProgress: 85,
  overdueAnyAtRisk: 3,
  overdueHighCritical: 3,
  blockedCritical: 3,
  effortOverAtRisk: 0.1,
  effortOverCritical: 0.25,
  minEarnedHoursForEffort: 8,
  criticalBugsCritical: 3,
  invoiceOverdueCriticalDays: 30,
} as const;

export interface HealthInput {
  today: ISODate;
  status: ProjectStatus;
  startDate: ISODate | null;
  dueDate: ISODate | null;
  progress: number; // 0–100
  overdueTasks: { priority: Priority }[];
  blockedTasks: number;
  estimatedHours: number; // total planned effort
  actualHours: number; // tracked effort
  overdueApprovals: { title: string }[];
  pendingApprovals: { title: string }[];
  pendingChangeRequests: number;
  overdueInvoices: { number: string; daysOverdue: number }[];
  openCriticalBugs: number;
}

export interface HealthReason {
  severity: "AT_RISK" | "CRITICAL";
  message: string;
}

export interface HealthResult {
  level: HealthLevel;
  reasons: HealthReason[];
  summary: string;
}

const T = HEALTH_THRESHOLDS;

export function computeHealth(i: HealthInput): HealthResult {
  const reasons: HealthReason[] = [];
  const add = (severity: HealthReason["severity"], message: string) => reasons.push({ severity, message });

  // Projects that are not in delivery are not scored on delivery risk.
  const inDelivery = i.status === "ACTIVE" || i.status === "PLANNING" || i.status === "CLIENT_REVIEW" || i.status === "ON_HOLD";

  if (inDelivery && i.dueDate) {
    const daysLeft = daysBetween(i.today, i.dueDate);
    if (daysLeft < 0) {
      add("CRITICAL", `Deadline passed ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago at ${Math.round(i.progress)}% progress`);
    } else if (daysLeft <= T.finalWeekDays && i.progress < T.finalWeekMinProgress) {
      add("AT_RISK", `${daysLeft} day${daysLeft === 1 ? "" : "s"} to deadline with ${Math.round(i.progress)}% complete`);
    } else if (i.startDate) {
      const span = daysBetween(i.startDate, i.dueDate);
      const elapsed = daysBetween(i.startDate, i.today);
      if (span > 0 && elapsed > 0) {
        const timePct = Math.min(100, (elapsed / span) * 100);
        const slip = timePct - i.progress;
        if (slip > T.scheduleSlipAtRisk) {
          add("AT_RISK", `Behind schedule: ${Math.round(timePct)}% of time used, ${Math.round(i.progress)}% complete`);
        }
      }
    }
  }

  const highOverdue = i.overdueTasks.filter((t) => t.priority === "HIGH" || t.priority === "CRITICAL").length;
  if (highOverdue >= T.overdueHighCritical) {
    add("CRITICAL", `${highOverdue} high-priority tasks are overdue`);
  } else if (highOverdue >= 1) {
    add("AT_RISK", `${highOverdue} high-priority task${highOverdue === 1 ? " is" : "s are"} overdue`);
  } else if (i.overdueTasks.length >= T.overdueAnyAtRisk) {
    add("AT_RISK", `${i.overdueTasks.length} tasks are overdue`);
  }

  if (i.blockedTasks >= T.blockedCritical) add("CRITICAL", `${i.blockedTasks} tasks are blocked`);
  else if (i.blockedTasks >= 1) add("AT_RISK", `${i.blockedTasks} task${i.blockedTasks === 1 ? " is" : "s are"} blocked`);

  if (i.openCriticalBugs >= T.criticalBugsCritical) add("CRITICAL", `${i.openCriticalBugs} critical bugs unresolved`);
  else if (i.openCriticalBugs >= 1) add("AT_RISK", `${i.openCriticalBugs} critical bug${i.openCriticalBugs === 1 ? "" : "s"} unresolved`);

  // Effort variance against earned value: hours we "should" have spent for the progress made.
  const earned = (i.estimatedHours * i.progress) / 100;
  if (earned >= T.minEarnedHoursForEffort) {
    const over = i.actualHours / earned - 1;
    if (over > T.effortOverCritical) add("CRITICAL", `Effort is ${Math.round(over * 100)}% over estimate for work completed`);
    else if (over > T.effortOverAtRisk) add("AT_RISK", `Effort is ${Math.round(over * 100)}% over estimate for work completed`);
  }

  for (const a of i.overdueApprovals) add("AT_RISK", `Client approval overdue for ${a.title}`);
  if (i.overdueApprovals.length === 0 && i.pendingApprovals.length > 0) {
    const first = i.pendingApprovals[0]!;
    const more = i.pendingApprovals.length - 1;
    add("AT_RISK", `Client approval pending for ${first.title}${more > 0 ? ` (+${more} more)` : ""}`);
  }

  if (i.pendingChangeRequests > 0) {
    add("AT_RISK", `${i.pendingChangeRequests} scope change${i.pendingChangeRequests === 1 ? "" : "s"} awaiting client approval`);
  }

  for (const inv of i.overdueInvoices) {
    add(inv.daysOverdue > T.invoiceOverdueCriticalDays ? "CRITICAL" : "AT_RISK", `Invoice ${inv.number} overdue by ${inv.daysOverdue} days`);
  }

  // Pending approvals alone shouldn't flag a project: only escalate when combined with another signal.
  const meaningful = reasons.filter((r) => !r.message.startsWith("Client approval pending"));
  const level: HealthLevel = reasons.some((r) => r.severity === "CRITICAL")
    ? "CRITICAL"
    : meaningful.length > 0
      ? "AT_RISK"
      : "HEALTHY";

  const ordered = [...reasons].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1));
  const summary =
    level === "HEALTHY"
      ? ordered.length > 0
        ? `On track. ${ordered[0]!.message}.`
        : "On track. No blocking issues."
      : ordered
          .slice(0, 2)
          .map((r) => r.message)
          .join(" · ");

  return { level, reasons: ordered, summary };
}
