import { describe, expect, it } from "vitest";
import { phaseCreateSchema, phaseUpdateSchema, projectCreateSchema, taskCreateSchema, taskUpdateSchema } from "./schemas";

describe("form schemas", () => {
  it("treats empty numeric inputs as 0 on create", () => {
    const t = taskCreateSchema.parse({ title: "x", projectId: "p", phaseId: "ph", estimatedHours: "" });
    expect(t.estimatedHours).toBe(0);
    expect(phaseCreateSchema.parse({ name: "QA", budget: "" }).budget).toBeNull();
  });

  it("does not touch omitted fields on partial update", () => {
    expect(taskUpdateSchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
    expect(phaseUpdateSchema.parse({ status: "COMPLETED" }).budget).toBeUndefined();
  });

  it("rejects non-numeric and out-of-order input", () => {
    expect(taskCreateSchema.safeParse({ title: "x", projectId: "p", phaseId: "ph", estimatedHours: "abc" }).success).toBe(false);
    const r = projectCreateSchema.safeParse({ name: "P", clientId: "c", startDate: "2026-10-01", dueDate: "2026-09-01" });
    expect(r.success).toBe(false);
  });

  it("only accepts http(s) URLs", () => {
    expect(projectCreateSchema.safeParse({ name: "P", clientId: "c", repositoryUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ name: "P", clientId: "c", repositoryUrl: "https://github.com/x" }).success).toBe(true);
  });
});
