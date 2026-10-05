import { createHash } from "node:crypto";
import path from "node:path";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export type { StorageProvider } from "./types";

const g = globalThis as unknown as { __pccStorage?: StorageProvider };

/** Secret for signing local download tokens. Required in production. */
function signingSecret(): string {
  const s = process.env.STORAGE_SIGNING_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.STORAGE_DRIVER !== "s3") {
    throw new Error("STORAGE_SIGNING_SECRET (≥ 32 chars) is required when STORAGE_DRIVER=local in production");
  }
  // Development fallback, derived from the DB URL so it is stable per environment.
  return createHash("sha256").update(`pcc-dev-signing:${process.env.DATABASE_URL ?? ""}`).digest("hex");
}

function build(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    return new S3StorageProvider({
      bucket,
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }
  if (driver !== "local") throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  return new LocalStorageProvider(process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "storage"), signingSecret());
}

export function getStorage(): StorageProvider {
  return (g.__pccStorage ??= build());
}

/** Test hook: inject a provider. */
export function setStorage(provider: StorageProvider | undefined): void {
  g.__pccStorage = provider;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
