import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isValidStorageKey } from "./keys";
import { contentDisposition } from "./validate";
import type { SignedUrlOptions, StorageProvider } from "./types";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/** Any S3-compatible service: AWS S3, Cloudflare R2, MinIO, Supabase Storage (S3 API), etc. */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
    });
  }

  private check(key: string) {
    if (!isValidStorageKey(key)) throw new Error("Invalid storage key");
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.check(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Refuse to overwrite: versions are immutable.
        IfNoneMatch: "*",
        ServerSideEncryption: this.cfg.endpoint ? undefined : "AES256",
      }),
    );
  }

  async getSignedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    this.check(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(opts.disposition, opts.filename),
        ResponseContentType: opts.contentType,
      }),
      { expiresIn: opts.expiresIn },
    );
  }

  async delete(key: string): Promise<void> {
    this.check(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    this.check(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
