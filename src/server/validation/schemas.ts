import { z } from "zod";
import { hours, id, isoDate, money, optionalDate, optionalEmail, optionalId, optionalText, optionalUrl, requiredText } from "./common";

const clientStatus = z.enum(["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"]);
const projectStatus = z.enum(["LEAD", "PLANNING", "ACTIVE", "ON_HOLD", "CLIENT_REVIEW", "COMPLETED", "MAINTENANCE", "CANCELLED"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const phaseStatus = z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"]);
const featureStatus = z.enum(["BACKLOG", "PLANNED", "IN_DEVELOPMENT", "REVIEW", "TESTING", "COMPLETED", "REJECTED"]);
export const taskStatus = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "TESTING", "DONE"]);

// ─── Auth ───
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

export const registerSchema = z.object({
  name: requiredText(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .regex(/[a-zA-Z]/, "Include a letter")
    .regex(/[0-9]/, "Include a number"),
  workspaceName: requiredText(100),
});

// ─── Clients ───
export const clientCreateSchema = z.object({
  name: requiredText(120),
  company: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalUrl,
  country: optionalText(80),
  address: optionalText(500),
  notes: optionalText(5000),
  status: clientStatus.default("ACTIVE"),
});
export const clientUpdateSchema = clientCreateSchema.partial();

export const contactSchema = z.object({
  name: requiredText(120),
  role: optionalText(80),
  email: optionalEmail,
  phone: optionalText(40),
  isPrimary: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()).default(false),
});

// ─── Projects ───
const projectBase = z.object({
  name: requiredText(160),
  clientId: id,
  description: optionalText(10000),
  projectType: optionalText(80),
  status: projectStatus.default("PLANNING"),
  priority: priority.default("MEDIUM"),
  startDate: optionalDate,
  dueDate: optionalDate,
  contractValue: money,
  paymentTerms: optionalText(2000),
  repositoryUrl: optionalUrl,
  productionUrl: optionalUrl,
  stagingUrl: optionalUrl,
  hostingProvider: optionalText(80),
  scopeSummary: optionalText(20000),
  outOfScope: optionalText(10000),
  projectManagerId: optionalId,
  memberIds: z.array(id).max(50).default([]),
});

const datesOrdered = (v: { startDate?: string | null; dueDate?: string | null }) =>
  !v.startDate || !v.dueDate || v.dueDate >= v.startDate;
const datesMsg = { message: "Expected delivery must be on or after the start date", path: ["dueDate"] };

export const projectCreateSchema = projectBase.refine(datesOrdered, datesMsg);
export const projectUpdateSchema = projectBase.partial().refine(datesOrdered, datesMsg);

export const projectListQuery = z.object({
  q: z.string().max(100).optional(),
  status: projectStatus.optional(),
  clientId: z.string().max(64).optional(),
  priority: priority.optional(),
  health: z.enum(["HEALTHY", "AT_RISK", "CRITICAL"]).optional(),
  payment: z.enum(["PAID", "DUE", "OVERDUE", "NOT_INVOICED", "NONE"]).optional(),
  scope: z.enum(["active", "all"]).default("active"),
  sort: z.enum(["name", "dueDate", "progress", "contractValue", "updated"]).default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

// ─── Phases ───
const phaseBase = z.object({
  name: requiredText(120),
  description: optionalText(5000),
  status: phaseStatus.default("NOT_STARTED"),
  startDate: optionalDate,
  endDate: optionalDate,
  budget: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().min(0).max(1e12).nullish()),
  estimatedHours: hours,
  dependsOnIds: z.array(id).max(20).default([]),
});
export const phaseCreateSchema = phaseBase.refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});
export const phaseUpdateSchema = phaseBase.partial();

// ─── Features ───
const featureBase = z.object({
  phaseId: id,
  name: requiredText(160),
  description: optionalText(10000),
  priority: priority.default("MEDIUM"),
  status: featureStatus.default("BACKLOG"),
  estimatedHours: hours,
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  dependsOnIds: z.array(id).max(20).default([]),
});
export const featureCreateSchema = featureBase;
export const featureUpdateSchema = featureBase.partial();

// ─── Tasks ───
const taskBase = z.object({
  title: requiredText(200),
  description: optionalText(20000),
  acceptanceCriteria: optionalText(10000),
  phaseId: id,
  featureId: optionalId,
  assigneeId: optionalId,
  priority: priority.default("MEDIUM"),
  status: taskStatus.default("TODO"),
  dueDate: optionalDate,
  estimatedHours: hours,
  blockedReason: optionalText(1000),
  dependsOnIds: z.array(id).max(20).default([]),
});
export const taskCreateSchema = taskBase.extend({ projectId: id });
export const taskUpdateSchema = taskBase.partial();

export const taskListQuery = z.object({
  q: z.string().max(100).optional(),
  projectId: z.string().max(64).optional(),
  phaseId: z.string().max(64).optional(),
  featureId: z.string().max(64).optional(),
  status: taskStatus.optional(),
  priority: priority.optional(),
  assigneeId: z.string().max(64).optional(), // "me" | "none" | id
  due: z.enum(["overdue", "today", "week"]).optional(),
  open: z.enum(["1", "0"]).default("1"),
});

export const timeEntrySchema = z.object({
  taskId: optionalId,
  projectId: id,
  date: isoDate,
  hours: z.coerce.number().gt(0, "Enter hours").max(24),
  description: optionalText(1000),
});

export const commentSchema = z.object({ body: requiredText(5000) });
export const subtaskSchema = z.object({ title: requiredText(200) });
