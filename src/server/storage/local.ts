import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidStorageKey } from "./keys";
import type { SignedUrlOptions, StorageProvider } from "./types";

export interface LocalTokenPayload {
  k: string; // storage key
  e: number; // expiry (unix seconds)
  n: string; // filename
  t: string; // content type
  d: "attachment" | "inline";
}

/**
 * Filesystem provider for development, CI and single-node installs. Objects live under `root`;
 * downloads go through an HMAC-signed, expiring token served by GET /api/v1/files/:token.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;
  private readonly root: string;

  constructor(
    root: string,
    private readonly secret: string,
    private readonly baseUrl = "/api/v1/files",
  ) {
    this.root = path.resolve(root);
  }

  /** Resolves a key inside the root, refusing anything that could escape it. */
  resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Storage key escapes root");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    // "wx": never overwrite an existing object (versions are immutable).
    await writeFile(full, body, { flag: "wx" });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    this.resolve(key);
    const payload: LocalTokenPayload = { k: key, e: Math.floor(Date.now() / 1000) + opts.expiresIn, n: opts.filename, t: opts.contentType, d: opts.disposition };
    return `${this.baseUrl}/${this.sign(payload)}`;
  }

  sign(payload: LocalTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.mac(body)}`;
  }

  /** Returns the payload if the token is authentic and unexpired; otherwise null. */
  verify(token: string, now = Date.now()): LocalTokenPayload | null {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as LocalTokenPayload;
      if (typeof payload.e !== "number" || payload.e * 1000 < now || !isValidStorageKey(payload.k)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private mac(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }
}
