import { describe, expect, it } from "vitest";
import { approvalEffects, canTransitionApproval, isApprovalFinal } from "./approvals";
import { availableCRActions, canCreateImplementationTasks, canTransitionCR, sendReadiness } from "./change-requests";

describe("approval state machine", () => {
  it("only pending approvals can be decided or cancelled", () => {
    for (const a of ["approve", "reject", "request_changes", "cancel"] as const) {
      expect(canTransitionApproval("PENDING", a)).toBe(true);
      for (const s of ["APPROVED", "REJECTED", "CHANGES_REQUESTED", "CANCELLED"] as const) expect(canTransitionApproval(s, a)).toBe(false);
    }
    expect(isApprovalFinal("APPROVED")).toBe(true);
    expect(isApprovalFinal("PENDING")).toBe(false);
  });

  it("decisions on a superseded version do not change the document", () => {
    expect(approvalEffects("approve", true)).toEqual({ version: "APPROVED", document: "APPROVED" });
    expect(approvalEffects("approve", false)).toEqual({ version: "APPROVED", document: null });
    expect(approvalEffects("reject", false)).toEqual({ version: "REJECTED", document: null });
    expect(approvalEffects("request_changes", true)).toEqual({ version: null, document: "INTERNAL_REVIEW" });
  });
});

describe("change request state machine", () => {
  it("follows the documented workflow", () => {
    expect(availableCRActions("DRAFT").sort()).toEqual(["cancel", "send", "submit"]);
    expect(availableCRActions("UNDER_REVIEW").sort()).toEqual(["cancel", "send"]);
    expect(availableCRActions("PENDING_CLIENT_APPROVAL").sort()).toEqual(["approve", "cancel", "reject", "withdraw"]);
    expect(availableCRActions("APPROVED")).toEqual(["implement"]);
    expect(availableCRActions("REJECTED")).toEqual([]);
    expect(availableCRActions("CANCELLED")).toEqual([]);
    expect(availableCRActions("IMPLEMENTED")).toEqual([]);
  });

  it("cannot approve without going through the client", () => {
    expect(canTransitionCR("DRAFT", "approve")).toBe(false);
    expect(canTransitionCR("UNDER_REVIEW", "approve")).toBe(false);
  });

  it("only APPROVED change requests can generate implementation tasks", () => {
    expect(canCreateImplementationTasks("APPROVED")).toBe(true);
    for (const s of ["DRAFT", "UNDER_REVIEW", "PENDING_CLIENT_APPROVAL", "REJECTED", "CANCELLED", "IMPLEMENTED"] as const) {
      expect(canCreateImplementationTasks(s)).toBe(false);
    }
  });

  it("requires impact, change and hours before sending", () => {
    expect(sendReadiness({ impact: null, estimatedHours: 0, requestedChange: "" })).toHaveLength(3);
    expect(sendReadiness({ impact: "2 days", estimatedHours: 12, requestedChange: "Google login" })).toEqual([]);
  });
});
