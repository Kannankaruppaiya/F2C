// Storage abstraction. The rest of the app depends only on this interface; the concrete provider
// (local filesystem for dev/CI, any S3-compatible service in production) is chosen by config.
// NOTE: storage modules intentionally avoid `import "server-only"` so the seed script (plain Node)
// can use them; they depend on node: built-ins and can never be bundled for the browser anyway.

export interface SignedUrlOptions {
  /** Seconds until the URL stops working. */
  expiresIn: number;
  /** Filename presented to the user (already sanitised). */
  filename: string;
  contentType: string;
  disposition: "attachment" | "inline";
}

export interface StorageProvider {
  readonly name: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived URL for a private object. Never a permanent public URL. */
  getSignedUrl(key: string, opts: SignedUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
