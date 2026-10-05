import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contentDisposition, sanitizeFilename, sniffType, validateUpload } from "./validate";
import { documentVersionKey, isValidStorageKey } from "./keys";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";

const MB = 1024 * 1024;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const zipWith = (part: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`....[Content_Types].xml....${part}document.xml`)]);

describe("validateUpload", () => {
  const v = (filename: string, bytes: Buffer, declaredMime?: string, maxBytes = 25 * MB) => validateUpload({ filename, bytes, declaredMime, maxBytes });

  it("accepts each allowed type and stores the detected MIME type", () => {
    expect(v("Spec.pdf", pdf, "application/pdf")).toMatchObject({ ok: true, mimeType: "application/pdf", inline: true });
    expect(v("shot.PNG", png, "image/png")).toMatchObject({ ok: true, type: "png" });
    expect(v("photo.jpeg", jpg, "image/jpeg")).toMatchObject({ ok: true, type: "jpg" });
    expect(v("req.docx", zipWith("word/"), "")).toMatchObject({ ok: true, type: "docx", inline: false });
    expect(v("plan.xlsx", zipWith("xl/"))).toMatchObject({ ok: true, type: "xlsx" });
    expect(v("deck.pptx", zipWith("ppt/"))).toMatchObject({ ok: true, type: "pptx" });
    expect(v("notes.txt", Buffer.from("Héllo wörld\n"), "text/plain")).toMatchObject({ ok: true, type: "txt" });
  });

  it("rejects empty and oversized files", () => {
    expect(v("a.pdf", Buffer.alloc(0))).toMatchObject({ ok: false, error: { code: "EMPTY" } });
    expect(v("a.pdf", pdf, undefined, 10)).toMatchObject({ ok: false, error: { code: "TOO_LARGE" } });
  });

  it("rejects disallowed extensions, including double-extension tricks", () => {
    expect(v("evil.exe", pdf)).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_TYPE" } });
    expect(v("invoice.pdf.html", Buffer.from("<html>"))).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_TYPE" } });
    expect(v("noext", pdf)).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_TYPE" } });
  });

  it("detects MIME spoofing: content must match the extension", () => {
    expect(v("fake.pdf", Buffer.from("MZ\x90\x00 binary"), "application/pdf")).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
    expect(v("image.png", pdf, "image/png")).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
    expect(v("x.docx", zipWith("xl/"))).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
    expect(v("page.txt", Buffer.from("<!DOCTYPE html><script>alert(1)</script>"))).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
    expect(v("bin.txt", Buffer.from([0x41, 0x00, 0x42]))).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
  });

  it("rejects a declared MIME type that contradicts the extension", () => {
    expect(v("spec.pdf", pdf, "text/html")).toMatchObject({ ok: false, error: { code: "CONTENT_MISMATCH" } });
    // Generic declarations are ignored; content decides.
    expect(v("spec.pdf", pdf, "application/octet-stream")).toMatchObject({ ok: true });
  });

  it("sniffs types from content alone", () => {
    expect(sniffType(pdf)).toBe("pdf");
    expect(sniffType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull(); // plain zip
  });
});

describe("sanitizeFilename", () => {
  it("strips paths, control and reserved characters", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFilename("C:\\Users\\me\\Spec v2.pdf")).toBe("Spec v2.pdf");
    expect(sanitizeFilename('a<b>:"c|?*\u0000.pdf')).toBe("abc.pdf");
    expect(sanitizeFilename("   ...   ")).toBeNull();
  });

  it("caps length but keeps the extension", () => {
    const s = sanitizeFilename(`${"x".repeat(400)}.pdf`)!;
    expect(s.length).toBe(180);
    expect(s.endsWith(".pdf")).toBe(true);
  });

  it("encodes Content-Disposition safely", () => {
    expect(contentDisposition("attachment", 'Réq "v2".pdf')).toBe(`attachment; filename="R_q _v2_.pdf"; filename*=UTF-8''R%C3%A9q%20%22v2%22.pdf`);
  });
});

describe("storage keys", () => {
  it("are generated and never contain user input", () => {
    const k = documentVersionKey("cmuuyw350001h7dst5zqikk0d", "cmuuyw350001h7dst5zqikk0e");
    expect(isValidStorageKey(k)).toBe(true);
    expect(documentVersionKey("cmuuyw350001h7dst5zqikk0d", "cmuuyw350001h7dst5zqikk0e")).not.toBe(k);
    expect(() => documentVersionKey("../etc", "cmuuyw350001h7dst5zqikk0e")).toThrow();
    expect(isValidStorageKey("w/abcdefgh/d/abcdefgh/../../../etc/passwd")).toBe(false);
  });
});

describe("LocalStorageProvider", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pcc-storage-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const p = new LocalStorageProvider(root, "x".repeat(40));
  const key = documentVersionKey("cmuuyw350001h7dst5zqikk0d", "cmuuyw350001h7dst5zqikk0e");

  it("stores, reads, refuses overwrite, deletes", async () => {
    await p.put(key, pdf);
    expect(await p.exists(key)).toBe(true);
    expect((await p.read(key)).equals(pdf)).toBe(true);
    await expect(p.put(key, Buffer.from("overwrite"))).rejects.toThrow();
    await p.delete(key);
    expect(await p.exists(key)).toBe(false);
  });

  it("refuses keys that escape the root", () => {
    expect(() => p.resolve("../../etc/passwd")).toThrow();
  });

  it("issues signed, expiring, tamper-proof tokens", async () => {
    const url = await p.getSignedUrl(key, { expiresIn: 60, filename: "a.pdf", contentType: "application/pdf", disposition: "attachment" });
    const token = url.split("/").pop()!;
    expect(p.verify(token)?.k).toBe(key);
    expect(p.verify(token, Date.now() + 120_000)).toBeNull(); // expired
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), e: 9e9 })).toString("base64url");
    expect(p.verify(`${forged}.${mac}`)).toBeNull();
    expect(new LocalStorageProvider(root, "y".repeat(40)).verify(token)).toBeNull(); // other secret
  });
});

// Runs against a real S3-compatible endpoint when S3_TEST_ENDPOINT is set (CI/dev: moto or MinIO).
describe.skipIf(!process.env.S3_TEST_ENDPOINT)("S3StorageProvider (live endpoint)", () => {
  it("puts, presigns, downloads, refuses overwrite and deletes", async () => {
    const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
    const cfg = { bucket: `pcc-test-${Date.now()}`, region: "us-east-1", endpoint: process.env.S3_TEST_ENDPOINT, accessKeyId: "test", secretAccessKey: "test", forcePathStyle: true };
    await new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } }).send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    const s3 = new S3StorageProvider(cfg);
    const key = documentVersionKey("cmuuyw350001h7dst5zqikk0d", "cmuuyw350001h7dst5zqikk0e");
    await s3.put(key, pdf, "application/pdf");
    expect(await s3.exists(key)).toBe(true);
    const url = await s3.getSignedUrl(key, { expiresIn: 60, filename: "Spec v2.pdf", contentType: "application/pdf", disposition: "attachment" });
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain("X-Amz-Expires=60");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(pdf)).toBe(true);
    expect(res.headers.get("content-disposition")).toContain("Spec v2.pdf");
    await s3.delete(key);
    expect(await s3.exists(key)).toBe(false);
  });
});
