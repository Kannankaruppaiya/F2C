import { describe, expect, it } from "vitest";
import { computeHealth, type HealthInput } from "./health";
import { currentPhase, projectProgress, taskProgress } from "./progress";
import { computeFinancials, paymentState } from "./finance";

const baseHealth: HealthInput = {
  today: "2026-10-05",
  status: "ACTIVE",
  startDate: "2026-09-01",
  dueDate: "2026-12-01",
  progress: 40,
  overdueTasks: [],
  blockedTasks: 0,
  estimatedHours: 200,
  actualHours: 80,
  overdueApprovals: [],
  pendingApprovals: [],
  pendingChangeRequests: 0,
  overdueInvoices: [],
  openCriticalBugs: 0,
};

describe("progress", () => {
  it("weights tasks by estimate and gives partial credit", () => {
    expect(taskProgress([])).toBe(0);
    expect(taskProgress([{ status: "DONE", estimatedHours: 3 }, { status: "TODO", estimatedHours: 1 }])).toBe(75);
    expect(taskProgress([{ status: "IN_PROGRESS", estimatedHours: 0 }])).toBeCloseTo(40);
  });

  it("treats completed phases as 100% regardless of tasks", () => {
    const p = projectProgress([
      { id: "a", position: 1, status: "COMPLETED", estimatedHours: 10, tasks: [] },
      { id: "b", position: 2, status: "NOT_STARTED", estimatedHours: 10, tasks: [{ status: "TODO", estimatedHours: 10 }] },
    ]);
    expect(p).toBe(50);
  });

  it("picks the earliest active phase as current", () => {
    const phases = [
      { position: 1, status: "COMPLETED" as const },
      { position: 3, status: "IN_PROGRESS" as const },
      { position: 2, status: "NOT_STARTED" as const },
    ];
    expect(currentPhase(phases)?.position).toBe(3);
    expect(currentPhase([{ position: 1, status: "COMPLETED" as const }])).toBeNull();
  });
});

describe("health", () => {
  it("is healthy with no signals", () => {
    expect(computeHealth(baseHealth).level).toBe("HEALTHY");
  });

  it("does not flag a project for a pending approval alone", () => {
    const r = computeHealth({ ...baseHealth, pendingApprovals: [{ title: "UI Design v3" }] });
    expect(r.level).toBe("HEALTHY");
    expect(r.summary).toContain("UI Design v3");
  });

  it("is at risk with an overdue high-priority task and mentions approvals", () => {
    const r = computeHealth({ ...baseHealth, overdueTasks: [{ priority: "HIGH" }], pendingApprovals: [{ title: "UI v3" }] });
    expect(r.level).toBe("AT_RISK");
    expect(r.reasons.map((x) => x.message)).toContain("Client approval pending for UI v3");
  });

  it("is critical past the deadline", () => {
    const r = computeHealth({ ...baseHealth, dueDate: "2026-10-01", progress: 70 });
    expect(r.level).toBe("CRITICAL");
    expect(r.summary).toMatch(/Deadline passed 4 days ago/);
  });

  it("flags effort overrun against earned value", () => {
    // 50% of 200h earned = 100h; 130h actual = 30% over → critical.
    expect(computeHealth({ ...baseHealth, progress: 50, actualHours: 130, dueDate: "2027-06-01" }).level).toBe("CRITICAL");
    expect(computeHealth({ ...baseHealth, progress: 50, actualHours: 115, dueDate: "2027-06-01" }).level).toBe("AT_RISK");
  });

  it("escalates on unresolved critical bugs", () => {
    expect(computeHealth({ ...baseHealth, openCriticalBugs: 2 }).reasons[0]?.message).toBe("2 critical bugs unresolved");
    expect(computeHealth({ ...baseHealth, openCriticalBugs: 3 }).level).toBe("CRITICAL");
  });

  it("does not score completed projects on schedule", () => {
    expect(computeHealth({ ...baseHealth, status: "COMPLETED", dueDate: "2026-01-01" }).level).toBe("HEALTHY");
  });
});

describe("finance", () => {
  it("computes outstanding, overdue and profit from records", () => {
    const f = computeFinancials({
      today: "2026-10-05",
      contractValue: 150000,
      approvedChangeRequestValue: 8000,
      invoices: [
        { number: "INV-1", total: 50000, paid: 50000, status: "PAID", dueDate: "2026-08-01" },
        { number: "INV-2", total: 40000, paid: 10000, status: "PARTIALLY_PAID", dueDate: "2026-09-30" },
        { number: "INV-3", total: 30000, paid: 0, status: "DRAFT", dueDate: "2026-09-01" },
      ],
      expenses: [{ category: "HOSTING", amount: 2000 }, { category: "API", amount: 3000 }],
      laborCost: 25000,
      estimatedHours: 100,
      actualHours: 50,
      hourlyCost: 500,
    });
    expect(f.contractValue).toBe(158000);
    expect(f.invoiced).toBe(90000);
    expect(f.paid).toBe(60000);
    expect(f.outstanding).toBe(30000);
    expect(f.overdue).toBe(30000);
    expect(f.overdueInvoices[0]).toEqual({ number: "INV-2", amount: 30000, daysOverdue: 5 });
    expect(f.actualCost).toBe(30000);
    expect(f.actualProfit).toBe(30000);
    expect(f.marginPct).toBe(50);
    expect(f.estimatedCost).toBe(55000);
    expect(paymentState(f)).toBe("OVERDUE");
  });
});
