// Phase 3 browser walkthrough: documents, versioning, approvals (client decision), change requests → tasks.
import { BASE, launch, login, logout, newPage, pdf, stepper } from "./lib.mjs";

const step = stepper();
const stamp = Date.now().toString(36);
const DOC = `Scope Statement ${stamp}`;
const CR_TITLE = `Google + Microsoft login ${stamp}`;

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await newPage(browser, errors);

  // ── Internal user: upload, version, approval request ──
  await login(page, "demo@pcc.dev");
  step("owner signed in");
  await page.goto(`${BASE}/documents`);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.fill("#up-name", DOC);
  await page.selectOption("#up-project", { label: "AI Sales Training" });
  await page.selectOption("#up-category", "SCOPE");
  await page.setInputFiles("#up-file", { name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ this is an executable, not a PDF") });
  await page.getByRole("button", { name: "Upload", exact: true }).last().click();
  await page.getByText("The file content is not a valid PDF file.").first().waitFor();
  step("spoofed PDF rejected by server-side content sniffing");

  await page.setInputFiles("#up-file", { name: "scope-v1.pdf", mimeType: "application/pdf", buffer: pdf("v1") });
  await page.fill("#up-summary", "Initial scope");
  await page.getByRole("button", { name: "Upload", exact: true }).last().click();
  await page.waitForURL(/\/documents\/d[0-9a-f]+$/);
  const docUrl = page.url();
  await page.getByRole("heading", { name: DOC }).waitFor();
  step(`document created with v1 (${docUrl.split("/").pop()})`);

  await page.getByRole("button", { name: "Upload new version" }).click();
  await page.setInputFiles("#up-file", { name: "scope-v2.pdf", mimeType: "application/pdf", buffer: pdf("v2") });
  await page.fill("#up-summary", "Added SSO to scope");
  await page.getByRole("button", { name: "Upload", exact: true }).last().click();
  await page.getByText("Added SSO to scope").first().waitFor();
  await page.getByText("v2", { exact: true }).first().waitFor();
  step("v2 uploaded; version number assigned by server");

  // Download goes through authorization → short-lived signed URL.
  const v2Href = await page.getByRole("link", { name: "Download v2" }).first().getAttribute("href");
  const res = await page.request.get(`${BASE}${v2Href}`, { maxRedirects: 0 });
  if (res.status() !== 302) throw new Error(`expected 302 to signed URL, got ${res.status()}`);
  const signed = res.headers()["location"];
  const file = await page.request.get(signed.startsWith("http") ? signed : `${BASE}${signed}`);
  const body = await file.text();
  if (file.status() !== 200 || !body.startsWith("%PDF") || !file.headers()["content-disposition"]?.includes("scope-v2.pdf")) throw new Error("signed download failed");
  if (file.headers()["x-content-type-options"] !== "nosniff") throw new Error("missing nosniff header");
  step("download redirects to a signed URL that serves the exact file");

  await page.getByRole("button", { name: "Request approval" }).click();
  await page.getByRole("option", { name: /Anil Kapoor/ }).waitFor({ state: "attached" });
  await page.fill("#ap-msg", "Please confirm the updated scope.");
  await page.getByRole("button", { name: "Send approval request" }).click();
  await page.getByText(`Approval requested for ${DOC} v2`).first().waitFor();
  step(`approval requested for ${DOC} v2`);

  // ── Change request: draft → estimate → send ──
  await page.goto(`${BASE}/change-requests?new=1`);
  await page.selectOption("#cr-project", { label: "AI Sales Training" });
  await page.fill("#cr-title", CR_TITLE);
  await page.fill("#cr-orig", "Email login");
  await page.fill("#cr-change", "Google + Microsoft login");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/change-requests\/c[a-z0-9]+$/);
  const crUrl = page.url();
  if (!(await page.getByRole("button", { name: "Send to client" }).isDisabled())) throw new Error("send should be disabled before estimating");
  step("CR draft created; cannot send without impact and hours");

  await page.getByRole("button", { name: "Edit" }).click();
  await page.fill("#cr-impact", "Adds about 2 days; Apple Sign-In needed for iOS.");
  await page.fill("#cr-hours", "12");
  await page.fill("#cr-cost", "8000");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Adds about 2 days").first().waitFor();
  await page.getByRole("button", { name: "Send to client" }).click();
  await page.getByRole("button", { name: "Send to client" }).last().click();
  await page.getByText("Pending Client").first().waitFor();
  step("CR estimated (12h, ₹8,000) and sent to client");
  await logout(page);

  // ── Client: review document approval & CR ──
  await login(page, "anil@apexretail.example");
  step("client signed in");
  await page.goto(`${BASE}/approvals`);
  await page.getByRole("link", { name: DOC }).click();
  await page.getByRole("heading", { name: `Approval requested for ${DOC} v2` }).waitFor();
  await page.getByRole("button", { name: "Request changes" }).click();
  if (!(await page.getByRole("button", { name: "Request changes" }).last().isDisabled())) throw new Error("comment must be required");
  await page.fill("#confirm-reason", "Please list the OAuth providers explicitly.");
  await page.getByRole("button", { name: "Request changes" }).last().click();
  await page.getByText(/Changes requested by Anil Kapoor/).waitFor();
  step("client requested changes (comment required, confirmation dialog)");

  await page.goto(`${BASE}/approvals`);
  await page.getByRole("link", { name: "UI Design" }).first().click();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Approve" }).last().click();
  await page.getByText(/Approved by Anil Kapoor/).waitFor();
  step("client approved UI Design v3");

  // Client cannot see internal documents or upload through the API.
  const internal = await page.request.get(`${BASE}/api/v1/documents?q=Proposal`);
  const internalJson = await internal.json();
  if (internalJson.data.some((d) => d.name.startsWith("Proposal"))) throw new Error("client can see an internal document");
  const upload = await page.request.post(`${BASE}/api/v1/documents`, { headers: { Origin: BASE }, multipart: { name: "x", category: "OTHER", projectId: "x", file: { name: "x.pdf", mimeType: "application/pdf", buffer: pdf("x") } } });
  if (upload.status() !== 403) throw new Error(`client upload should be 403, got ${upload.status()}`);
  step("client cannot list internal documents or upload (403)");

  await page.goto(crUrl);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Approve change" }).click();
  await page.getByText(/Approved by Anil Kapoor/).waitFor();
  step("client approved the change request");
  await logout(page);

  // ── Internal: implementation tasks from the approved CR ──
  await login(page, "demo@pcc.dev");
  await page.goto(crUrl);
  await page.getByRole("button", { name: "Create implementation tasks" }).click();
  await page.getByLabel("Task 1 title").fill("Google OAuth");
  await page.getByLabel("Task 1 hours").fill("4");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task 2 title").fill("Microsoft OAuth");
  await page.getByLabel("Task 2 hours").fill("4");
  await page.getByRole("button", { name: "Create 2 tasks" }).click();
  await page.getByRole("link", { name: /Google OAuth/ }).waitFor();
  await page.getByRole("link", { name: /Microsoft OAuth/ }).waitFor();
  step("implementation tasks created only after confirmation, linked to the CR");

  await page.goto(docUrl);
  await page.getByText(/Changes Requested/).first().waitFor();
  await page.getByText("Anil Kapoor requested changes").first().waitFor();
  step("document shows the decision and its audit trail");

  if (errors.length) throw new Error(`Page errors: ${errors.join("; ")}`);
  console.log("Phase 3 walkthrough passed");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
