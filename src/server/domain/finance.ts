// Pure financial calculations from real records (business rules 13 & 14).
import type { ExpenseCategory, InvoiceStatus } from "@prisma/client";
import { daysBetween, type ISODate } from "@/lib/dates";

export interface FinanceInvoice {
  number: string;
  total: number;
  paid: number;
  status: InvoiceStatus;
  dueDate: ISODate;
}

export interface FinanceInput {
  today: ISODate;
  contractValue: number;
  approvedChangeRequestValue: number;
  invoices: FinanceInvoice[];
  expenses: { category: ExpenseCategory; amount: number }[];
  laborCost: number; // tracked hours × cost rate
  estimatedHours: number;
  actualHours: number;
  hourlyCost: number; // blended internal rate for estimating remaining cost
}

export interface ProjectFinancials {
  contractValue: number; // including approved change requests
  invoiced: number;
  paid: number;
  outstanding: number; // invoiced but unpaid
  overdue: number;
  uninvoiced: number;
  expensesTotal: number;
  expensesByCategory: Partial<Record<ExpenseCategory, number>>;
  laborCost: number;
  actualCost: number;
  estimatedCost: number;
  expectedProfit: number;
  actualProfit: number; // cash basis: received − cost so far
  marginPct: number | null; // actual profit / revenue received
  expectedMarginPct: number | null;
  overdueInvoices: { number: string; amount: number; daysOverdue: number }[];
}

const isLive = (s: InvoiceStatus) => s !== "DRAFT" && s !== "CANCELLED";

export function isInvoiceOverdue(inv: Pick<FinanceInvoice, "status" | "dueDate" | "total" | "paid">, today: ISODate): boolean {
  return isLive(inv.status) && inv.status !== "PAID" && inv.paid < inv.total && daysBetween(inv.dueDate, today) > 0;
}

export function computeFinancials(i: FinanceInput): ProjectFinancials {
  const live = i.invoices.filter((inv) => isLive(inv.status));
  const invoiced = sum(live.map((inv) => inv.total));
  const paid = sum(i.invoices.map((inv) => inv.paid));
  const outstanding = sum(live.map((inv) => Math.max(0, inv.total - inv.paid)));

  const overdueInvoices = live
    .filter((inv) => isInvoiceOverdue(inv, i.today))
    .map((inv) => ({ number: inv.number, amount: inv.total - inv.paid, daysOverdue: daysBetween(inv.dueDate, i.today) }));
  const overdue = sum(overdueInvoices.map((o) => o.amount));

  const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of i.expenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount;
  const expensesTotal = sum(i.expenses.map((e) => e.amount));

  const contractValue = i.contractValue + i.approvedChangeRequestValue;
  const actualCost = i.laborCost + expensesTotal;
  const remainingHours = Math.max(0, i.estimatedHours - i.actualHours);
  const estimatedCost = actualCost + remainingHours * i.hourlyCost;
  const expectedProfit = contractValue - estimatedCost;
  const actualProfit = paid - actualCost;

  return {
    contractValue,
    invoiced,
    paid,
    outstanding,
    overdue,
    uninvoiced: Math.max(0, contractValue - invoiced),
    expensesTotal,
    expensesByCategory,
    laborCost: i.laborCost,
    actualCost,
    estimatedCost,
    expectedProfit,
    actualProfit,
    marginPct: paid > 0 ? (actualProfit / paid) * 100 : null,
    expectedMarginPct: contractValue > 0 ? (expectedProfit / contractValue) * 100 : null,
    overdueInvoices,
  };
}

export type PaymentState = "PAID" | "DUE" | "OVERDUE" | "NOT_INVOICED" | "NONE";

/** Single label for tables: "₹25K Due", "Paid", "Overdue". */
export function paymentState(f: Pick<ProjectFinancials, "overdue" | "outstanding" | "paid" | "contractValue">): PaymentState {
  if (f.overdue > 0) return "OVERDUE";
  if (f.outstanding > 0) return "DUE";
  if (f.contractValue > 0 && f.paid >= f.contractValue) return "PAID";
  if (f.contractValue > 0) return "NOT_INVOICED";
  return "NONE";
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
