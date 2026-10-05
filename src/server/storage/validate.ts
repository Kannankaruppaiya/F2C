// Upload validation. Pure (no I/O) so it is exhaustively unit-testable.
// The browser-declared MIME type is never trusted: the file's bytes decide its type.

export interface FileTypeDef {
  ext: string[];
  mime: string;
  label: string;
  /** Types safe to render inline in the browser (preview). Everything else downloads. */
  inline: boolean;
}

export const ALLOWED_TYPES: Record<string, FileTypeDef> = {
  pdf: { ext: ["pdf"], mime: "application/pdf", label: "PDF", inline: true },
  docx: { ext: ["docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word", inline: false },
  xlsx: { ext: ["xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel", inline: false },
  pptx: { ext: ["pptx"], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint", inline: false },
  png: { ext: ["png"], mime: "image/png", label: "PNG", inline: true },
  jpg: { ext: ["jpg", "jpeg"], mime: "image/jpeg", label: "JPEG", inline: true },
  txt: { ext: ["txt"], mime: "text/plain", label: "Text", inline: false },
};

export const ACCEPT_ATTRIBUTE = Object.values(ALLOWED_TYPES)
  .flatMap((t) => t.ext.map((e) => `.${e}`))
  .join(",");

/** MIME types browsers commonly send that carry no information. */
const GENERIC_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/zip", "application/x-zip-compressed"]);
/** Acceptable declared aliases per type (browsers/OSes vary). */
const DECLARED_ALIASES: Record<string, string[]> = {
  jpg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  txt: ["text/plain"],
  pdf: ["application/pdf", "application/x-pdf"],
  png: ["image/png"],
};

export type UploadError =
  | { code: "EMPTY"; message: string }
  | { code: "TOO_LARGE"; message: string }
  | { code: "BAD_NAME"; message: string }
  | { code: "UNSUPPORTED_TYPE"; message: string }
  | { code: "CONTENT_MISMATCH"; message: string };

export type UploadValidation =
  | { ok: true; type: keyof typeof ALLOWED_TYPES; mimeType: string; filename: string; inline: boolean }
  | { ok: false; error: UploadError };

const MAX_NAME = 180;

/** Strips paths, control/reserved characters and normalises whitespace; keeps the extension. */
export function sanitizeFilename(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop() ?? "";
  let name = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (!name) return null;
  if (name.length > MAX_NAME) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    name = name.slice(0, MAX_NAME - ext.length) + ext;
  }
  return name;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string, limit = bytes.length): boolean {
  const n = Buffer.from(needle, "latin1");
  const hay = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(limit, bytes.length));
  return hay.indexOf(n) !== -1;
}

/** Detects the real type from content. Returns null for anything not on the allow-list. */
export function sniffType(bytes: Uint8Array): keyof typeof ALLOWED_TYPES | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // OOXML packages are ZIPs whose part names identify the application.
    if (!containsAscii(bytes, "[Content_Types].xml")) return null;
    if (containsAscii(bytes, "word/")) return "docx";
    if (containsAscii(bytes, "xl/")) return "xlsx";
    if (containsAscii(bytes, "ppt/")) return "pptx";
    return null;
  }
  // Plain text: no NUL bytes and valid UTF-8.
  const head = bytes.subarray(0, 64 * 1024);
  if (head.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length === bytes.length ? head : bytes.subarray(0, trimToUtf8Boundary(head)));
  } catch {
    return null;
  }
  // Reject markup that browsers could execute if ever served inline.
  const sample = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  if (sample.startsWith("<!doctype html") || sample.startsWith("<html") || sample.startsWith("<svg") || sample.startsWith("<?xml") || sample.startsWith("<script")) return null;
  return "txt";
}

/** Avoids a false UTF-8 failure when the sample cuts a multi-byte character in half. */
function trimToUtf8Boundary(b: Uint8Array): number {
  const end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const c = b[end - i]!;
    if ((c & 0xc0) === 0xc0) return end - i; // lead byte of a possibly incomplete sequence
    if ((c & 0x80) === 0) break;
  }
  return end;
}

export function validateUpload(input: { filename: string; declaredMime?: string | null; bytes: Uint8Array; maxBytes: number }): UploadValidation {
  const { bytes, maxBytes } = input;
  if (bytes.length === 0) return { ok: false, error: { code: "EMPTY", message: "The file is empty." } };
  if (bytes.length > maxBytes) {
    return { ok: false, error: { code: "TOO_LARGE", message: `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.` } };
  }
  const filename = sanitizeFilename(input.filename);
  if (!filename) return { ok: false, error: { code: "BAD_NAME", message: "The file name is not valid." } };

  const ext = extensionOf(filename);
  const byExt = Object.entries(ALLOWED_TYPES).find(([, t]) => t.ext.includes(ext));
  if (!byExt) {
    return { ok: false, error: { code: "UNSUPPORTED_TYPE", message: "Unsupported file type. Allowed: PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT." } };
  }
  const [typeKey, def] = byExt as [keyof typeof ALLOWED_TYPES, FileTypeDef];

  const declared = (input.declaredMime ?? "").toLowerCase().split(";")[0]!.trim();
  if (!GENERIC_MIMES.has(declared) && declared !== def.mime && !(DECLARED_ALIASES[typeKey] ?? []).includes(declared)) {
    return { ok: false, error: { code: "CONTENT_MISMATCH", message: `The file type (${declared}) does not match its .${ext} extension.` } };
  }

  const sniffed = sniffType(bytes);
  if (sniffed !== typeKey) {
    return { ok: false, error: { code: "CONTENT_MISMATCH", message: `The file content is not a valid ${def.label} file.` } };
  }
  return { ok: true, type: typeKey, mimeType: def.mime, filename, inline: def.inline };
}

/** RFC 5987/6266 Content-Disposition value safe for any filename. */
export function contentDisposition(disposition: "attachment" | "inline", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
