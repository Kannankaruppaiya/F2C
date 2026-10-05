// Upload/storage configuration from environment variables (see .env.example).

const MB = 1024 * 1024;

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  return (Number.isFinite(mb) && mb > 0 ? Math.min(mb, 500) : 25) * MB;
}

/** Lifetime of signed download URLs, in seconds. */
export function signedUrlTtl(): number {
  const s = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);
  return Number.isFinite(s) && s >= 30 && s <= 3600 ? s : 300;
}
