// Shared helpers for the browser walkthroughs (run against a running app: `npm run dev` + seeded DB).
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const candidates = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"];
  return candidates.find((p) => existsSync(p));
}

export async function launch() {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  return browser;
}

export async function newPage(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return page;
}

export async function login(page, email, password = "demo-password-2026") {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
}

export async function logout(page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

export function stepper() {
  let n = 0;
  return (msg) => console.log(`✓ ${String(++n).padStart(2, "0")} ${msg}`);
}

/** A small valid PDF; content varies so each upload is a distinct file. */
export function pdf(label) {
  return Buffer.from(`%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n% ${label} ${Date.now()}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`);
}
