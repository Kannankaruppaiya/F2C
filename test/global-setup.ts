import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Recreates the integration-test database schema from migrations. Only ever operates on a
 * database whose name ends in "_test" — never the development database.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test")) {
    throw new Error(`Refusing to reset a database whose name does not end in _test: ${url}`);
  }
  await ensureDatabase(url);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}

/** Creates the _test database on first run (CI services only create the main database). */
async function ensureDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const prisma = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_database WHERE datname = ${name}`;
    if (rows.length === 0) await prisma.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
  } finally {
    await prisma.$disconnect();
  }
}
