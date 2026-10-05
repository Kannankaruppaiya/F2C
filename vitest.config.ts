import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

/**
 * Unit tests (pure) and integration tests (real PostgreSQL, real storage provider) run together.
 * Integration tests use a dedicated database derived from DATABASE_URL (suffix "_test") unless
 * TEST_DATABASE_URL is set; it is reset by test/global-setup.ts before the run.
 */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pcc";
  const u = new URL(base);
  u.pathname = `${u.pathname.replace(/\/$/, "")}_test`;
  return u.toString();
}

const dbUrl = testDatabaseUrl();
process.env.TEST_DATABASE_URL = dbUrl;

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: dbUrl,
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: path.join(os.tmpdir(), `pcc-test-storage-${process.pid}`),
      STORAGE_SIGNING_SECRET: "test-signing-secret-test-signing-secret",
      MAX_UPLOAD_MB: "2",
    },
    // Integration files share one database; each creates its own isolated workspace.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
