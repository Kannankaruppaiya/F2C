// Development/demo seed. Dates are relative to "today" so the demo always looks current.
// Never run against production: it TRUNCATEs every table.
import { PrismaClient, type FeatureStatus, type PhaseStatus, type Priority, type ProjectStatus, type Role, type TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DAY = 86_400_000;
const TODAY = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const d = (offset: number) => new Date(TODAY.getTime() + offset * DAY);
const at = (offset: number, hour = 11) => new Date(TODAY.getTime() + offset * DAY + hour * 3_600_000);

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  throw new Error("Refusing to seed in production (set ALLOW_SEED=true to override)");
}

// ─── Specs ───
type TaskSpec = { t: string; s: TaskStatus; p?: Priority; est: number; due?: number; who?: string; act?: number; blocked?: string };
type FeatureSpec = { name: string; s: FeatureStatus; p?: Priority; est: number; criteria?: [string, boolean][]; tasks: TaskSpec[]; desc?: string };
type PhaseSpec = { name: string; s: PhaseStatus; start: number; end: number; est: number; features?: FeatureSpec[]; tasks?: TaskSpec[] };
type ProjectSpec = {
  key: string;
  name: string;
  client: string;
  type: string;
  status: ProjectStatus;
  priority: Priority;
  start: number;
  due: number;
  value: number;
  terms: string;
  description: string;
  scope: string;
  outOfScope?: string;
  repo?: string;
  prod?: string;
  staging?: string;
  hosting?: string;
  members: string[];
  phases: PhaseSpec[];
};

const USERS: { key: string; name: string; email: string; role: Role; rate: number; color: string; client?: string }[] = [
  { key: "owner", name: "Ravi Shankar", email: "demo@pcc.dev", role: "OWNER", rate: 900, color: "#4f46e5" },
  { key: "priya", name: "Priya Nair", email: "priya@pcc.dev", role: "DEVELOPER", rate: 700, color: "#0891b2" },
  { key: "arun", name: "Arun Mehta", email: "arun@pcc.dev", role: "DEVELOPER", rate: 650, color: "#059669" },
  { key: "sara", name: "Sara Thomas", email: "sara@pcc.dev", role: "DESIGNER", rate: 600, color: "#db2777" },
  { key: "vikram", name: "Vikram Rao", email: "vikram@pcc.dev", role: "QA", rate: 500, color: "#d97706" },
  { key: "meera", name: "Meera Iyer", email: "meera@pcc.dev", role: "FINANCE", rate: 0, color: "#7c3aed" },
  { key: "clientuser", name: "Anil Kapoor", email: "anil@apexretail.example", role: "CLIENT", rate: 0, color: "#64748b", client: "apex" },
];

const CLIENTS = [
  { key: "apex", name: "Apex Retail", company: "Apex Retail Pvt Ltd", email: "projects@apexretail.example", phone: "+91 98450 11223", website: "https://apexretail.example", country: "India", address: "12 MG Road, Bengaluru 560001", status: "ACTIVE" as const,
    contacts: [{ name: "Anil Kapoor", role: "Head of Sales Enablement", email: "anil@apexretail.example", phone: "+91 98450 11223", isPrimary: true }, { name: "Divya Menon", role: "IT Manager", email: "divya@apexretail.example", phone: null, isPrimary: false }] },
  { key: "kumar", name: "Dr. Kumar", company: "Kumar Multispeciality Clinic", email: "admin@kumarclinic.example", phone: "+91 94440 55678", website: null, country: "India", address: "45 Anna Salai, Chennai 600002", status: "ACTIVE" as const,
    contacts: [{ name: "Dr. Suresh Kumar", role: "Medical Director", email: "suresh@kumarclinic.example", phone: "+91 94440 55678", isPrimary: true }] },
  { key: "swift", name: "Swift Logistics", company: "Swift Logistics LLP", email: "ops@swiftlogistics.example", phone: "+91 99000 33445", website: "https://swiftlogistics.example", country: "India", address: "Plot 8, MIDC, Pune 411019", status: "ACTIVE" as const,
    contacts: [{ name: "Rahul Deshpande", role: "COO", email: "rahul@swiftlogistics.example", phone: "+91 99000 33445", isPrimary: true }, { name: "Neha Joshi", role: "Accounts", email: "accounts@swiftlogistics.example", phone: null, isPrimary: false }] },
  { key: "bloom", name: "Bloom Organics", company: "Bloom Organics Co.", email: "hello@bloomorganics.example", phone: "+971 50 123 4567", website: "https://bloomorganics.example", country: "UAE", address: "Business Bay, Dubai", status: "ACTIVE" as const,
    contacts: [{ name: "Fatima Al Zarooni", role: "Founder", email: "fatima@bloomorganics.example", phone: "+971 50 123 4567", isPrimary: true }] },
  { key: "greenfield", name: "Greenfield Academy", company: "Greenfield Education Trust", email: "office@greenfield.example", phone: "+91 80 4123 9876", website: null, country: "India", address: "Whitefield, Bengaluru", status: "ACTIVE" as const,
    contacts: [{ name: "Lakshmi Prasad", role: "Principal", email: "principal@greenfield.example", phone: null, isPrimary: true }] },
  { key: "spice", name: "Spice Route", company: "Spice Route Restaurants", email: "it@spiceroute.example", phone: "+91 98201 77889", website: "https://spiceroute.example", country: "India", address: "Bandra West, Mumbai", status: "ACTIVE" as const,
    contacts: [{ name: "Karan Malhotra", role: "Operations Head", email: "karan@spiceroute.example", phone: "+91 98201 77889", isPrimary: true }] },
  { key: "horizon", name: "Horizon Realty", company: "Horizon Realty Group", email: "info@horizonrealty.example", phone: null, website: "https://horizonrealty.example", country: "India", address: "Gachibowli, Hyderabad", status: "LEAD" as const,
    contacts: [{ name: "Sameer Reddy", role: "Director", email: "sameer@horizonrealty.example", phone: null, isPrimary: true }] },
];

const PROJECTS: ProjectSpec[] = [
  {
    key: "aisales", name: "AI Sales Training", client: "apex", type: "Web App + AI", status: "ACTIVE", priority: "HIGH", start: -75, due: 7, value: 300000,
    terms: "30% advance, 25% after backend, 25% after UAT, 20% on deployment. Net 15.",
    description: "Roleplay-based sales training platform where reps practise conversations with an AI customer and receive scored feedback.",
    scope: "Web app for sales reps and managers. AI roleplay with configurable customer personas, session history, AI evaluation and scoring, manager dashboard with team analytics. Email + password login.",
    outOfScope: "Native mobile apps, SSO (quoted separately), CRM integration.",
    repo: "https://github.com/example/ai-sales-training", staging: "https://staging.aisales.example", prod: "https://aisales.example", hosting: "Vercel + Supabase",
    members: ["owner", "priya", "arun", "sara", "vikram"],
    phases: [
      { name: "Discovery", s: "COMPLETED", start: -75, end: -66, est: 24, tasks: [
        { t: "Stakeholder interviews", s: "DONE", est: 6, who: "owner", act: 7 },
        { t: "Requirements document v2", s: "DONE", est: 10, who: "owner", act: 11 },
        { t: "Persona & scoring rubric workshop", s: "DONE", est: 6, who: "owner", act: 5 } ] },
      { name: "UI/UX", s: "COMPLETED", start: -65, end: -50, est: 50, features: [
        { name: "Design system & wireframes", s: "COMPLETED", est: 50, tasks: [
          { t: "Wireframes for roleplay flow", s: "DONE", est: 14, who: "sara", act: 15 },
          { t: "High-fidelity screens (v3)", s: "DONE", est: 24, who: "sara", act: 29 },
          { t: "Clickable prototype", s: "DONE", est: 10, who: "sara", act: 9 } ] } ] },
      { name: "Backend", s: "COMPLETED", start: -50, end: -25, est: 90, features: [
        { name: "Auth & user management", s: "COMPLETED", est: 20, criteria: [["Users can sign up and log in", true], ["Managers can invite reps", true]], tasks: [
          { t: "Email/password auth", s: "DONE", est: 8, who: "arun", act: 8 },
          { t: "Team invites & roles", s: "DONE", est: 10, who: "arun", act: 12 } ] },
        { name: "Session storage API", s: "COMPLETED", est: 30, tasks: [
          { t: "Conversation schema & persistence", s: "DONE", est: 12, who: "arun", act: 14 },
          { t: "Session resume endpoint", s: "DONE", est: 8, who: "arun", act: 7 },
          { t: "Manager analytics queries", s: "DONE", est: 12, who: "priya", act: 15 } ] } ] },
      { name: "Frontend", s: "IN_PROGRESS", start: -30, end: 2, est: 70, features: [
        { name: "Rep workspace", s: "TESTING", est: 30, tasks: [
          { t: "Roleplay chat UI", s: "DONE", est: 14, who: "priya", act: 16 },
          { t: "Session history list", s: "DONE", est: 6, who: "priya", act: 6 },
          { t: "Score breakdown view", s: "TESTING", est: 8, who: "priya", act: 7 } ] },
        { name: "Manager dashboard", s: "IN_DEVELOPMENT", est: 30, tasks: [
          { t: "Team leaderboard", s: "DONE", est: 8, who: "priya", act: 9 },
          { t: "Rep drill-down page", s: "IN_PROGRESS", est: 10, due: 1, who: "priya", act: 5 },
          { t: "CSV export of scores", s: "TODO", p: "LOW", est: 4, due: 4, who: "arun" } ] } ] },
      { name: "AI Integration", s: "IN_PROGRESS", start: -20, end: 4, est: 60, features: [
        { name: "AI Sales Roleplay", s: "IN_DEVELOPMENT", p: "CRITICAL", est: 36, desc: "Rep starts a roleplay; the AI acts as a customer persona; conversation is stored and resumable; AI generates an evaluation and score.",
          criteria: [["User can start roleplay", true], ["AI responds as customer", true], ["Conversation is stored", true], ["Session can be resumed", true], ["AI evaluation is generated", false], ["Score is calculated", false]],
          tasks: [
            { t: "Persona prompt templates", s: "DONE", p: "HIGH", est: 8, who: "owner", act: 10 },
            { t: "Streaming responses", s: "DONE", p: "HIGH", est: 8, who: "arun", act: 9 },
            { t: "Evaluation prompt & rubric scoring", s: "IN_PROGRESS", p: "CRITICAL", est: 12, due: 2, who: "owner", act: 6 },
            { t: "Token usage limits per workspace", s: "TODO", p: "MEDIUM", est: 6, due: 3, who: "arun" } ] },
        { name: "Objection library", s: "PLANNED", est: 16, tasks: [
          { t: "Seed objection scenarios", s: "TODO", est: 6, due: 5, who: "owner" },
          { t: "Scenario picker UI", s: "BACKLOG", est: 6, who: "priya" } ] } ] },
      { name: "QA", s: "NOT_STARTED", start: 2, end: 6, est: 24, tasks: [{ t: "Regression test pass", s: "TODO", est: 16, due: 6, who: "vikram" }] },
      { name: "Deployment", s: "NOT_STARTED", start: 6, end: 7, est: 8, tasks: [{ t: "Production deployment", s: "TODO", p: "HIGH", est: 6, due: 7, who: "arun" }] },
    ],
  },
  {
    key: "patient", name: "Patient Assessment", client: "kumar", type: "Web App", status: "ACTIVE", priority: "HIGH", start: -60, due: 3, value: 180000,
    terms: "50% advance, 50% on go-live. Net 7.",
    description: "Digital intake and assessment forms for clinic patients with doctor review workflow and PDF summaries.",
    scope: "Patient intake forms (tablet), configurable assessment templates, doctor review queue, PDF export, role-based access for reception and doctors.",
    repo: "https://github.com/example/patient-assessment", staging: "https://staging.kumarclinic.example", hosting: "AWS Lightsail",
    members: ["owner", "arun", "vikram", "sara"],
    phases: [
      { name: "Discovery", s: "COMPLETED", start: -60, end: -54, est: 12, tasks: [{ t: "Clinic workflow mapping", s: "DONE", est: 8, who: "owner", act: 8 }] },
      { name: "UI/UX", s: "COMPLETED", start: -54, end: -45, est: 24, tasks: [{ t: "Tablet intake form design", s: "DONE", est: 16, who: "sara", act: 15 }] },
      { name: "Development", s: "COMPLETED", start: -45, end: -10, est: 110, features: [
        { name: "Assessment templates", s: "COMPLETED", est: 40, tasks: [
          { t: "Template builder", s: "DONE", est: 24, who: "arun", act: 26 },
          { t: "Conditional questions", s: "DONE", est: 12, who: "arun", act: 13 } ] },
        { name: "Doctor review queue", s: "COMPLETED", est: 30, tasks: [
          { t: "Review queue UI", s: "DONE", est: 14, who: "arun", act: 14 },
          { t: "PDF summary export", s: "DONE", est: 12, who: "arun", act: 15 } ] } ] },
      { name: "QA", s: "IN_PROGRESS", start: -10, end: 2, est: 30, features: [
        { name: "Regression & UAT fixes", s: "TESTING", p: "HIGH", est: 30, tasks: [
          { t: "Cross-browser test pass", s: "DONE", est: 8, who: "vikram", act: 9 },
          { t: "Fix PDF layout on long assessments", s: "REVIEW", p: "HIGH", est: 4, due: 1, who: "arun", act: 3 },
          { t: "Fix session timeout on tablets", s: "IN_PROGRESS", p: "CRITICAL", est: 4, due: 1, who: "arun", act: 2 },
          { t: "Final UAT checklist with clinic", s: "TODO", p: "HIGH", est: 4, due: 2, who: "vikram" } ] } ] },
      { name: "Deployment", s: "NOT_STARTED", start: 2, end: 3, est: 6, tasks: [{ t: "Go-live & data migration", s: "TODO", p: "HIGH", est: 6, due: 3, who: "arun" }] },
    ],
  },
  {
    key: "fleet", name: "Fleet Operations Dashboard", client: "swift", type: "Web App + Integrations", status: "ACTIVE", priority: "CRITICAL", start: -50, due: 20, value: 240000,
    terms: "Milestone based: 25% advance, 25% per completed phase. Net 15.",
    description: "Real-time fleet tracking dashboard with GPS provider integration, trip analytics and driver performance.",
    scope: "Live map of vehicles, GPS vendor API integration, trip history, fuel and idle analytics, driver scorecards, alerting.",
    repo: "https://github.com/example/fleet-ops", staging: "https://staging.fleet.example", hosting: "DigitalOcean",
    members: ["owner", "priya", "arun", "vikram"],
    phases: [
      { name: "Discovery", s: "COMPLETED", start: -50, end: -44, est: 16, tasks: [{ t: "GPS vendor API evaluation", s: "DONE", est: 10, who: "owner", act: 14 }] },
      { name: "Backend", s: "IN_PROGRESS", start: -44, end: 0, est: 120, features: [
        { name: "GPS ingestion pipeline", s: "IN_DEVELOPMENT", p: "CRITICAL", est: 50, tasks: [
          { t: "Vendor webhook receiver", s: "DONE", est: 10, who: "arun", act: 15 },
          { t: "Position deduplication", s: "DONE", est: 8, who: "arun", act: 13 },
          { t: "Backfill historical trips", s: "BLOCKED", p: "HIGH", est: 12, due: -4, who: "arun", act: 6, blocked: "Waiting on vendor to enable history API for client account" },
          { t: "Geofence alerts", s: "BLOCKED", p: "HIGH", est: 10, due: -2, who: "priya", act: 3, blocked: "Client hasn't shared depot coordinates" },
          { t: "Rate-limit handling", s: "IN_PROGRESS", p: "HIGH", est: 6, due: -1, who: "arun", act: 5 } ] },
        { name: "Trip analytics", s: "IN_DEVELOPMENT", est: 40, tasks: [
          { t: "Trip segmentation algorithm", s: "DONE", est: 12, who: "priya", act: 17 },
          { t: "Fuel & idle time reports", s: "IN_PROGRESS", p: "HIGH", est: 12, due: -3, who: "priya", act: 9 },
          { t: "Driver scorecard queries", s: "TODO", est: 10, due: 5, who: "priya" } ] } ] },
      { name: "Frontend", s: "NOT_STARTED", start: 0, end: 14, est: 60, features: [
        { name: "Live map", s: "PLANNED", p: "HIGH", est: 30, tasks: [{ t: "Map clustering", s: "TODO", est: 12, due: 8, who: "priya" }] } ] },
      { name: "QA", s: "NOT_STARTED", start: 14, end: 18, est: 20 },
      { name: "Deployment", s: "NOT_STARTED", start: 18, end: 20, est: 8 },
    ],
  },
  {
    key: "bloom", name: "Bloom Mobile Store", client: "bloom", type: "Mobile App (React Native)", status: "CLIENT_REVIEW", priority: "MEDIUM", start: -90, due: 12, value: 220000,
    terms: "40% advance, 40% on beta, 20% on store release.",
    description: "iOS/Android shopping app for an organic products brand with subscriptions and loyalty points.",
    scope: "Catalogue, cart, checkout (Stripe), subscription boxes, loyalty points, push notifications. Email login.",
    outOfScope: "Social login, in-app chat.",
    repo: "https://github.com/example/bloom-app", staging: "https://testflight.apple.com/join/example", hosting: "Expo EAS + Firebase",
    members: ["owner", "priya", "sara", "vikram"],
    phases: [
      { name: "Discovery", s: "COMPLETED", start: -90, end: -82, est: 16, tasks: [{ t: "Requirements & user journeys", s: "DONE", est: 12, who: "owner", act: 12 }] },
      { name: "UI/UX", s: "COMPLETED", start: -82, end: -65, est: 60, tasks: [{ t: "App screens & design system", s: "DONE", est: 50, who: "sara", act: 52 }] },
      { name: "Development", s: "COMPLETED", start: -65, end: -15, est: 160, features: [
        { name: "Catalogue & checkout", s: "COMPLETED", est: 70, tasks: [
          { t: "Product catalogue", s: "DONE", est: 24, who: "priya", act: 22 },
          { t: "Stripe checkout", s: "DONE", est: 20, who: "priya", act: 21 } ] },
        { name: "Subscriptions & loyalty", s: "COMPLETED", est: 60, tasks: [
          { t: "Subscription boxes", s: "DONE", est: 30, who: "priya", act: 28 },
          { t: "Loyalty points ledger", s: "DONE", est: 20, who: "priya", act: 19 } ] } ] },
      { name: "Client UAT", s: "REVIEW", start: -15, end: 5, est: 20, tasks: [
        { t: "UAT build to TestFlight", s: "DONE", est: 4, who: "priya", act: 4 },
        { t: "Address UAT feedback round 1", s: "REVIEW", est: 10, due: 2, who: "priya", act: 8 } ] },
      { name: "Deployment", s: "NOT_STARTED", start: 5, end: 12, est: 12, tasks: [{ t: "App Store & Play Store submission", s: "TODO", est: 8, due: 10, who: "priya" }] },
    ],
  },
  {
    key: "school", name: "School ERP Portal", client: "greenfield", type: "Web App", status: "PLANNING", priority: "MEDIUM", start: -5, due: 110, value: 350000,
    terms: "30% advance on sign-off, then monthly milestones.",
    description: "Admissions, fee collection, attendance and parent communication portal for a K-12 school.",
    scope: "Draft scope under discussion: admissions, fees, attendance, report cards, parent app (phase 2).",
    members: ["owner", "sara"],
    phases: [
      { name: "Discovery", s: "IN_PROGRESS", start: -5, end: 10, est: 30, tasks: [
        { t: "Requirement workshops with admin staff", s: "IN_PROGRESS", est: 10, due: 4, who: "owner", act: 4 },
        { t: "Proposal & estimate", s: "TODO", p: "HIGH", est: 6, due: 8, who: "owner" } ] },
      { name: "UI/UX", s: "NOT_STARTED", start: 10, end: 30, est: 70 },
      { name: "Development", s: "NOT_STARTED", start: 30, end: 95, est: 400 },
      { name: "QA", s: "NOT_STARTED", start: 95, end: 105, est: 40 },
      { name: "Deployment", s: "NOT_STARTED", start: 105, end: 110, est: 12 },
    ],
  },
  {
    key: "pos", name: "Restaurant POS Integration", client: "spice", type: "Integration", status: "MAINTENANCE", priority: "LOW", start: -160, due: -40, value: 150000,
    terms: "50/50. Maintenance billed monthly.",
    description: "Integration of POS terminals with online ordering aggregators and a central kitchen display.",
    scope: "Aggregator order sync, kitchen display system, daily sales reconciliation.",
    repo: "https://github.com/example/spice-pos", prod: "https://kds.spiceroute.example", hosting: "AWS",
    members: ["owner", "arun"],
    phases: [
      { name: "Discovery", s: "COMPLETED", start: -160, end: -150, est: 16, tasks: [{ t: "POS vendor API review", s: "DONE", est: 10, who: "owner", act: 10 }] },
      { name: "Development", s: "COMPLETED", start: -150, end: -60, est: 160, tasks: [
        { t: "Order sync service", s: "DONE", est: 60, who: "arun", act: 64 },
        { t: "Kitchen display app", s: "DONE", est: 50, who: "arun", act: 47 } ] },
      { name: "Deployment", s: "COMPLETED", start: -60, end: -45, est: 16, tasks: [{ t: "Rollout to 4 outlets", s: "DONE", est: 12, who: "arun", act: 14 }] },
      { name: "Handover", s: "COMPLETED", start: -45, end: -40, est: 8, tasks: [{ t: "Staff training", s: "DONE", est: 6, who: "owner", act: 6 }] },
      { name: "Maintenance", s: "IN_PROGRESS", start: -40, end: 325, est: 0, tasks: [{ t: "Add new outlet (Andheri)", s: "TODO", est: 4, due: 9, who: "arun" }] },
    ],
  },
  {
    key: "crm", name: "Real Estate CRM", client: "horizon", type: "Web App", status: "LEAD", priority: "LOW", start: 20, due: 140, value: 0,
    terms: "To be proposed.",
    description: "Lead and property inventory CRM for a real-estate brokerage. Awaiting requirement call.",
    scope: "Not yet defined.",
    members: ["owner"],
    phases: [],
  },
];

// ─── Helpers ───
let taskNo = 0;
const counters: Record<string, number> = {};
function rand(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function main() {
  console.log("Resetting data…");
  // TRUNCATE bypasses the append-only DELETE trigger on activities.
  await db.$executeRawUnsafe(`TRUNCATE TABLE "workspaces", "users" RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash("demo-password-2026", 12);
  const ws = await db.workspace.create({
    data: { name: "Northwind Software Studio", slug: "northwind", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", defaultHourlyCost: 650, defaultTaxRate: 18 },
  });
  const W = ws.id;

  const clients: Record<string, string> = {};
  for (const c of CLIENTS) {
    const created = await db.client.create({
      data: { workspaceId: W, name: c.name, company: c.company, email: c.email, phone: c.phone, website: c.website, country: c.country, address: c.address, status: c.status, createdAt: at(-170),
        contacts: { create: c.contacts.map((ct) => ({ ...ct, workspaceId: W })) } },
    });
    clients[c.key] = created.id;
  }

  const users: Record<string, string> = {};
  for (const u of USERS) {
    const user = await db.user.create({ data: { email: u.email, name: u.name, passwordHash, avatarColor: u.color } });
    users[u.key] = user.id;
    await db.workspaceMember.create({
      data: { workspaceId: W, userId: user.id, role: u.role, hourlyCost: u.rate || null, clientId: u.client ? clients[u.client] : null },
    });
  }
  const owner = users.owner!;

  const activity = (data: { projectId?: string; entityType: string; entityId: string; action: string; summary: string; createdAt: Date; actor?: string }) =>
    db.activity.create({
      data: { workspaceId: W, actorId: data.actor ? users[data.actor] : owner, projectId: data.projectId, entityType: data.entityType, entityId: data.entityId, action: data.action, summary: data.summary, createdAt: data.createdAt },
    });

  const projects: Record<string, { id: string; phases: Record<string, string>; features: Record<string, string>; tasks: { id: string; title: string }[] }> = {};
  let pNo = 0;
  for (const spec of PROJECTS) {
    pNo += 1;
    const project = await db.project.create({
      data: {
        workspaceId: W, clientId: clients[spec.client]!, code: `PRJ-${String(pNo).padStart(3, "0")}`, name: spec.name, description: spec.description, projectType: spec.type,
        status: spec.status, priority: spec.priority, startDate: d(spec.start), dueDate: d(spec.due), contractValue: spec.value, paymentTerms: spec.terms,
        repositoryUrl: spec.repo, productionUrl: spec.prod, stagingUrl: spec.staging, hostingProvider: spec.hosting, scopeSummary: spec.scope, outOfScope: spec.outOfScope,
        projectManagerId: owner, createdAt: at(Math.min(spec.start - 5, -3)), completedAt: spec.status === "MAINTENANCE" ? at(spec.due) : null,
        members: { create: spec.members.map((m) => ({ userId: users[m]!, workspaceId: W })) },
      },
    });
    const rec = { id: project.id, phases: {} as Record<string, string>, features: {} as Record<string, string>, tasks: [] as { id: string; title: string }[] };
    projects[spec.key] = rec;
    await activity({ projectId: project.id, entityType: "project", entityId: project.id, action: "project.created", summary: `Project ${spec.name} created`, createdAt: at(Math.min(spec.start - 5, -3)) });

    let pos = 0;
    for (const ph of spec.phases) {
      pos += 1;
      const phase = await db.phase.create({
        data: { workspaceId: W, projectId: project.id, name: ph.name, position: pos, status: ph.s, startDate: d(ph.start), endDate: d(ph.end), estimatedHours: ph.est },
      });
      rec.phases[ph.name] = phase.id;
      if (ph.s === "COMPLETED") {
        await activity({ projectId: project.id, entityType: "phase", entityId: phase.id, action: "phase.status_changed", summary: `Phase ${ph.name} moved to Completed`, createdAt: at(Math.min(ph.end, -1), 17) });
      }

      const createTasks = async (tasks: TaskSpec[], featureId: string | null) => {
        let tpos = 0;
        for (const ts of tasks) {
          tpos += 1;
          taskNo += 1;
          const completedOffset = Math.min(-1, ph.end - Math.floor(rand(taskNo) * 4));
          const task = await db.task.create({
            data: {
              workspaceId: W, projectId: project.id, phaseId: phase.id, featureId, number: taskNo, title: ts.t, status: ts.s, priority: ts.p ?? "MEDIUM",
              assigneeId: ts.who ? users[ts.who] : null, createdById: owner, dueDate: ts.due !== undefined ? d(ts.due) : ts.s === "DONE" ? d(completedOffset) : null,
              estimatedHours: ts.est, blockedReason: ts.blocked, position: tpos, createdAt: at(ph.start - 2),
              completedAt: ts.s === "DONE" ? at(completedOffset, 16) : null,
            },
          });
          rec.tasks.push({ id: task.id, title: ts.t });
          // Spread actual hours across past working days within the phase window.
          let remaining = ts.act ?? 0;
          let day = Math.min(ph.start + 1, -1);
          const lastDay = ts.s === "DONE" ? completedOffset : -1;
          while (remaining > 0) {
            const h = Math.min(remaining, 2 + Math.round(rand(taskNo * 7 + remaining) * 4));
            await db.timeEntry.create({
              data: { workspaceId: W, projectId: project.id, phaseId: phase.id, featureId, taskId: task.id, userId: users[ts.who ?? "owner"]!, date: d(Math.min(day, lastDay)), hours: h, description: ts.t },
            });
            remaining -= h;
            day += 1 + Math.floor(rand(taskNo + day) * 2);
          }
          if (ts.s === "DONE") {
            await activity({ projectId: project.id, entityType: "task", entityId: task.id, action: "task.completed", summary: `Task T-${taskNo} "${ts.t}" completed`, createdAt: at(completedOffset, 16), actor: ts.who });
          }
        }
      };

      for (const f of ph.features ?? []) {
        const feature = await db.feature.create({
          data: {
            workspaceId: W, projectId: project.id, phaseId: phase.id, name: f.name, description: f.desc, status: f.s, priority: f.p ?? "MEDIUM", estimatedHours: f.est,
            acceptanceCriteria: { create: (f.criteria ?? []).map(([text, isMet], i) => ({ text, isMet, position: i, workspaceId: W })) },
          },
        });
        rec.features[f.name] = feature.id;
        await createTasks(f.tasks, feature.id);
      }
      await createTasks(ph.tasks ?? [], null);
    }
  }

  // Task dependencies
  const findTask = (p: string, title: string) => projects[p]!.tasks.find((t) => t.title === title)!.id;
  await db.taskDependency.createMany({
    data: [
      { taskId: findTask("aisales", "Regression test pass"), dependsOnId: findTask("aisales", "Evaluation prompt & rubric scoring") },
      { taskId: findTask("aisales", "Production deployment"), dependsOnId: findTask("aisales", "Regression test pass") },
      { taskId: findTask("patient", "Go-live & data migration"), dependsOnId: findTask("patient", "Final UAT checklist with clinic") },
      { taskId: findTask("fleet", "Driver scorecard queries"), dependsOnId: findTask("fleet", "Backfill historical trips") },
    ],
  });

  // Subtasks & comments on a focal task
  const evalTask = findTask("aisales", "Evaluation prompt & rubric scoring");
  await db.subtask.createMany({
    data: [
      { workspaceId: W, taskId: evalTask, title: "Define 5-point rubric with client", isDone: true, position: 1 },
      { workspaceId: W, taskId: evalTask, title: "Structured output schema for scores", isDone: true, position: 2 },
      { workspaceId: W, taskId: evalTask, title: "Calibrate against 20 sample transcripts", isDone: false, position: 3 },
      { workspaceId: W, taskId: evalTask, title: "Store evaluation with session", isDone: false, position: 4 },
    ],
  });
  await db.taskComment.createMany({
    data: [
      { workspaceId: W, taskId: evalTask, authorId: users.priya!, body: "Score breakdown UI expects { category, score, evidence[] } per rubric item.", createdAt: at(-3, 10) },
      { workspaceId: W, taskId: evalTask, authorId: owner, body: "Agreed. Calibration set received from Anil — 20 transcripts in the shared drive.", createdAt: at(-2, 15) },
    ],
  });

  // ─── Documents, approvals, change requests ───
  const counter = (k: string) => (counters[k] = (counters[k] ?? 0) + 1);
  const doc = async (p: string, name: string, category: "REQUIREMENTS" | "UI_UX" | "SCOPE" | "TECHNICAL", versions: number, status: "APPROVED" | "SENT_TO_CLIENT" | "DRAFT", phase?: string) => {
    const project = projects[p]!;
    const document = await db.document.create({ data: { workspaceId: W, projectId: project.id, phaseId: phase ? project.phases[phase] : null, name, category, status } });
    let last: string | null = null;
    for (let v = 1; v <= versions; v++) {
      const ver = await db.documentVersion.create({
        data: { workspaceId: W, documentId: document.id, version: v, fileName: `${name.toLowerCase().replace(/\W+/g, "-")}-v${v}.pdf`, storagePath: `${W}/${project.id}/${document.id}/v${v}.pdf`, mimeType: "application/pdf", sizeBytes: 180_000 + v * 12_000, uploadedById: owner, status: v === versions ? status : "ARCHIVED", createdAt: at(-40 + v * 8) },
      });
      last = ver.id;
    }
    await db.document.update({ where: { id: document.id }, data: { currentVersionId: last } });
    return { documentId: document.id, versionId: last! };
  };

  const req = await doc("aisales", "Requirements", "REQUIREMENTS", 2, "APPROVED", "Discovery");
  const ui = await doc("aisales", "UI Design", "UI_UX", 3, "SENT_TO_CLIENT", "UI/UX");
  const pUi = await doc("patient", "Assessment Report Layout", "UI_UX", 2, "SENT_TO_CLIENT", "QA");
  const bloomUat = await doc("bloom", "UAT Build Notes", "TECHNICAL", 1, "SENT_TO_CLIENT", "Client UAT");
  await doc("fleet", "Technical Architecture", "TECHNICAL", 1, "APPROVED", "Discovery");

  const approval = (p: string, client: string, title: string, versionId: string | null, status: "PENDING" | "APPROVED", due: number, requested: number, decided?: string) =>
    db.approval.create({
      data: { workspaceId: W, projectId: projects[p]!.id, clientId: clients[client]!, documentVersionId: versionId, number: counter("approval"), title, status, dueDate: d(due), requestedAt: at(requested), decidedAt: status === "APPROVED" ? at(requested + 2) : null, decidedByName: decided },
    });
  const a1 = await approval("aisales", "apex", "Requirements v2", req.versionId, "APPROVED", -60, -64, "Anil Kapoor");
  await activity({ projectId: projects.aisales!.id, entityType: "approval", entityId: a1.id, action: "approval.approved", summary: "Client approved Requirements v2", createdAt: at(-62, 12) });
  await approval("aisales", "apex", "UI Design v3", ui.versionId, "PENDING", 1, -4);
  await approval("patient", "kumar", "Assessment Report Layout v2", pUi.versionId, "PENDING", -2, -6);
  await approval("bloom", "bloom", "UAT Build 1.0 sign-off", bloomUat.versionId, "PENDING", 4, -3);

  const crBloom = await db.changeRequest.create({
    data: { workspaceId: W, projectId: projects.bloom!.id, clientId: clients.bloom!, number: 14, title: "Social login", requestedBy: "Fatima Al Zarooni", requestDate: d(-5),
      description: "Client wants users to sign in with Google and Microsoft accounts.", originalScope: "Email login", requestedChange: "Google + Microsoft login", additionalHours: 12, additionalCost: 8000,
      impact: "Adds ~2 days to Deployment phase; requires Apple Sign-In as well for App Store compliance.", priority: "MEDIUM", status: "PENDING_CLIENT_APPROVAL" } });
  counters.change_request = 14;
  await activity({ projectId: projects.bloom!.id, entityType: "change_request", entityId: crBloom.id, action: "change_request.created", summary: "Change request CR-014 created: Social login", createdAt: at(-5, 14) });
  const crApex = await db.changeRequest.create({
    data: { workspaceId: W, projectId: projects.aisales!.id, clientId: clients.apex!, number: 13, title: "Objection library", requestedBy: "Anil Kapoor", requestDate: d(-25),
      originalScope: "Free-form roleplay only", requestedChange: "Curated library of objection scenarios", additionalHours: 16, additionalCost: 15000, priority: "MEDIUM", status: "APPROVED", decidedAt: at(-22) } });
  await activity({ projectId: projects.aisales!.id, entityType: "change_request", entityId: crApex.id, action: "change_request.approved", summary: "Client approved CR-013: Objection library", createdAt: at(-22, 11) });

  // ─── Bugs ───
  const bug = (p: string, title: string, severity: "CRITICAL" | "HIGH" | "MEDIUM", status: "OPEN" | "IN_PROGRESS" | "CLOSED", who: string, created: number) =>
    db.bug.create({ data: { workspaceId: W, projectId: projects[p]!.id, number: counter("bug"), title, severity, priority: severity === "CRITICAL" ? "CRITICAL" : "HIGH", status, assigneeId: users[who], reporterId: users.vikram, environment: "STAGING",
      stepsToReproduce: "1. Log in as reception\n2. Open a long assessment\n3. Export PDF", expectedResult: "All sections render on paginated A4 pages", actualResult: "Content after page 2 is cut off", createdAt: at(created) } });
  await bug("patient", "Session expires mid-assessment on tablets", "CRITICAL", "IN_PROGRESS", "arun", -3);
  await bug("patient", "PDF export truncates long assessments", "CRITICAL", "OPEN", "arun", -2);
  await bug("patient", "Date picker shows US format", "MEDIUM", "CLOSED", "arun", -8);
  await bug("aisales", "Score card overlaps on small screens", "MEDIUM", "OPEN", "priya", -1);

  // ─── Finance ───
  const invoice = async (p: string, client: string, milestone: string, amount: number, issued: number, due: number, payments: [number, number][], status: "SENT" | "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "DRAFT") => {
    const project = projects[p]!;
    const n = counter("invoice") + 8;
    const ms = await db.milestone.create({ data: { workspaceId: W, projectId: project.id, name: milestone, amount, dueDate: d(due), status: status === "PAID" ? "PAID" : status === "DRAFT" ? "PENDING" : "INVOICED" } });
    const tax = Math.round(amount * 0.18);
    const inv = await db.invoice.create({
      data: { workspaceId: W, clientId: clients[client]!, projectId: project.id, milestoneId: ms.id, number: `INV-${String(n).padStart(3, "0")}`, subtotal: amount, taxAmount: tax, total: amount + tax, issueDate: d(issued), dueDate: d(due), status,
        items: { create: [{ workspaceId: W, description: milestone, quantity: 1, unitPrice: amount, amount }] } },
    });
    for (const [offset, amt] of payments) {
      const pay = await db.payment.create({ data: { workspaceId: W, invoiceId: inv.id, amount: amt, paidAt: d(offset), method: "BANK_TRANSFER", transactionId: `UTR${100000 + n * 10 + offset}` } });
      await activity({ projectId: project.id, entityType: "payment", entityId: pay.id, action: "payment.recorded", summary: `Payment of ₹${amt.toLocaleString("en-IN")} recorded for ${inv.number}`, createdAt: at(offset, 13), actor: "meera" });
    }
    if (status === "PAID") await activity({ projectId: project.id, entityType: "invoice", entityId: inv.id, action: "invoice.paid", summary: `Invoice ${inv.number} marked paid`, createdAt: at(payments.at(-1)![0], 13), actor: "meera" });
    return inv;
  };
  const gst = (x: number) => x + Math.round(x * 0.18);
  await invoice("aisales", "apex", "Advance (30%)", 90000, -74, -60, [[-62, gst(90000)]], "PAID");
  await invoice("aisales", "apex", "Backend complete (25%)", 75000, -24, -10, [[-3, gst(75000)]], "PAID");
  await invoice("aisales", "apex", "Change request CR-013", 15000, -10, 6, [], "SENT");
  await invoice("patient", "kumar", "Advance (50%)", 90000, -60, -53, [[-55, gst(90000)]], "PAID");
  await invoice("fleet", "swift", "Advance (25%)", 60000, -50, -36, [[-38, gst(60000)]], "PAID");
  await invoice("fleet", "swift", "Discovery complete (25%)", 60000, -20, -5, [[-12, 20000]], "PARTIALLY_PAID");
  await invoice("bloom", "bloom", "Advance (40%)", 88000, -90, -80, [[-82, gst(88000)]], "PAID");
  await invoice("bloom", "bloom", "Beta build (40%)", 88000, -14, 1, [], "SENT");
  await invoice("pos", "spice", "Advance (50%)", 75000, -160, -150, [[-152, gst(75000)]], "PAID");
  await invoice("pos", "spice", "Go-live (50%)", 75000, -44, -30, [[-28, gst(75000)]], "PAID");
  await invoice("pos", "spice", "Maintenance – this month", 12000, -3, 12, [[-1, gst(12000)]], "PAID");

  const expense = (p: string, category: "HOSTING" | "API" | "SOFTWARE" | "FREELANCER" | "DOMAIN" | "INFRASTRUCTURE", description: string, amount: number, offset: number, vendor: string) =>
    db.expense.create({ data: { workspaceId: W, projectId: projects[p]!.id, category, description, amount, incurredOn: d(offset), vendor } });
  await expense("aisales", "API", "LLM API usage", 6800, -2, "OpenAI");
  await expense("aisales", "API", "LLM API usage", 4200, -32, "OpenAI");
  await expense("aisales", "HOSTING", "Vercel Pro", 1700, -4, "Vercel");
  await expense("aisales", "FREELANCER", "Illustrations for personas", 12000, -55, "Freelance illustrator");
  await expense("patient", "HOSTING", "Lightsail instance", 1500, -3, "AWS");
  await expense("fleet", "API", "GPS vendor sandbox", 5000, -30, "TrackPro");
  await expense("fleet", "INFRASTRUCTURE", "Managed Postgres", 2400, -1, "DigitalOcean");
  await expense("bloom", "SOFTWARE", "Apple developer account", 8300, -20, "Apple");
  await expense("bloom", "FREELANCER", "QA on physical devices", 9000, -12, "DeviceLab");
  await expense("pos", "HOSTING", "AWS hosting", 3200, -2, "AWS");
  await expense("pos", "DOMAIN", "kds.spiceroute domain", 900, -100, "GoDaddy");

  // ─── Delivery: handover, maintenance, deployments ───
  const handover = ["Source Code", "Production URL", "Technical Documentation", "API Documentation", "Database Documentation", "Deployment Documentation", "Credentials Transfer", "Admin Training", "User Training", "Backup", "Final Invoice", "Warranty Details"];
  const required = new Set(["Source Code", "Production URL", "Technical Documentation", "Deployment Documentation", "Credentials Transfer", "Backup", "Final Invoice"]);
  for (const [key, p] of Object.entries(projects)) {
    const done = key === "pos";
    await db.handoverItem.createMany({
      data: handover.map((name, i) => ({ workspaceId: W, projectId: p.id, name, isRequired: required.has(name), position: i, status: done ? (name === "Database Documentation" ? "SKIPPED" : "COMPLETED") : key === "aisales" && i < 2 ? "COMPLETED" : "PENDING", completedAt: done ? at(-41) : null })),
    });
  }
  const plan = await db.maintenancePlan.create({
    data: { workspaceId: W, projectId: projects.pos!.id, plan: "Standard Support", startDate: d(-40), endDate: d(325), monthlyCost: 12000, includedHours: 10, supportLevel: "Business hours, 1 business day response" },
  });
  await db.supportRequest.createMany({
    data: [
      { workspaceId: W, maintenancePlanId: plan.id, title: "Zomato menu sync failing for combos", kind: "BUG_FIX", status: "RESOLVED", hoursUsed: 3 },
      { workspaceId: W, maintenancePlanId: plan.id, title: "Add new outlet (Andheri)", kind: "CHANGE", status: "OPEN", hoursUsed: 0 },
    ],
  });
  const dep = (p: string, version: string, env: "STAGING" | "PRODUCTION", status: "SUCCESSFUL" | "FAILED" | "PENDING", offset: number, notes: string) =>
    db.deployment.create({ data: { workspaceId: W, projectId: projects[p]!.id, version, environment: env, status, deployedById: users.arun, deployedAt: status === "PENDING" ? null : at(offset, 18), scheduledFor: status === "PENDING" ? at(offset, 18) : null, commitSha: Math.abs(Math.sin(offset) * 1e10).toString(16).slice(0, 7), releaseNotes: notes } });
  await dep("pos", "v1.4.1", "PRODUCTION", "SUCCESSFUL", -12, "Combo item mapping fix");
  const latest = await dep("pos", "v1.4.2", "PRODUCTION", "SUCCESSFUL", -1, "Daily reconciliation report improvements");
  await activity({ projectId: projects.pos!.id, entityType: "deployment", entityId: latest.id, action: "deployment.completed", summary: "Deployment v1.4.2 completed", createdAt: at(-1, 18), actor: "arun" });
  await dep("aisales", "v0.9.0", "STAGING", "SUCCESSFUL", -3, "Roleplay streaming + session resume");
  await dep("aisales", "v1.0.0", "PRODUCTION", "PENDING", 7, "Initial production release");
  await dep("patient", "v0.8.3", "STAGING", "FAILED", -1, "Session timeout fix (migration failed)");

  await db.calendarEvent.createMany({
    data: [
      { workspaceId: W, projectId: projects.aisales!.id, title: "Weekly sync – Apex Retail", startsAt: at(1, 5), endsAt: at(1, 6) },
      { workspaceId: W, projectId: projects.school!.id, title: "Requirement workshop – Greenfield", startsAt: at(2, 4), endsAt: at(2, 6) },
      { workspaceId: W, projectId: projects.bloom!.id, title: "UAT review call – Bloom", startsAt: at(3, 9), endsAt: at(3, 10) },
    ],
  });

  // ─── Counters (so new records continue the sequences) ───
  await db.workspaceCounter.createMany({
    data: [
      { workspaceId: W, key: "task", value: taskNo },
      { workspaceId: W, key: "project", value: pNo },
      { workspaceId: W, key: "approval", value: counters.approval ?? 0 },
      { workspaceId: W, key: "bug", value: counters.bug ?? 0 },
      { workspaceId: W, key: "invoice", value: (counters.invoice ?? 0) + 8 },
      { workspaceId: W, key: "change_request", value: counters.change_request ?? 0 },
    ],
  });

  // ─── Notifications ───
  await db.notification.createMany({
    data: [
      { workspaceId: W, userId: owner, kind: "invoice.overdue", title: "Invoice INV-014 is overdue", body: "Swift Logistics · ₹50,800 outstanding", href: `/projects/${projects.fleet!.id}`, createdAt: at(-4, 9) },
      { workspaceId: W, userId: owner, kind: "approval.pending", title: "Approval pending: UI Design v3", body: "Apex Retail · due tomorrow", href: `/projects/${projects.aisales!.id}/approvals`, createdAt: at(-1, 10) },
      { workspaceId: W, userId: owner, kind: "deployment.failed", title: "Staging deployment v0.8.3 failed", body: "Patient Assessment", href: `/projects/${projects.patient!.id}/deployment`, createdAt: at(-1, 18) },
      { workspaceId: W, userId: owner, kind: "change_request.pending", title: "CR-014 awaiting client approval", body: "Bloom Mobile Store · ₹8,000", href: `/projects/${projects.bloom!.id}/change-requests`, createdAt: at(-5, 14), readAt: at(-4) },
      { workspaceId: W, userId: owner, kind: "approval.approved", title: "Client approved Requirements v2", body: "AI Sales Training", href: `/projects/${projects.aisales!.id}/approvals`, createdAt: at(-62, 12), readAt: at(-61) },
    ],
  });

  console.log(`Seeded workspace "${ws.name}": ${PROJECTS.length} projects, ${taskNo} tasks.`);
  console.log("Sign in: demo@pcc.dev / demo-password-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
