import { randomUUID } from "node:crypto";

// Storage keys are generated server-side only. No user-supplied value (filename, name, path)
// is ever part of a key, so path manipulation through uploads is impossible.
const SAFE_ID = /^[a-z0-9]{8,40}$/;
export const STORAGE_KEY_PATTERN = /^w\/[a-z0-9]{8,40}\/d\/[a-z0-9]{8,40}\/[0-9a-f-]{36}$/;

export function documentVersionKey(workspaceId: string, documentId: string): string {
  if (!SAFE_ID.test(workspaceId) || !SAFE_ID.test(documentId)) throw new Error("Invalid identifier for storage key");
  return `w/${workspaceId}/d/${documentId}/${randomUUID()}`;
}

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key);
}
