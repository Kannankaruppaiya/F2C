"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { DOCUMENT_CATEGORY } from "@/lib/status";
import { ACCEPT_ATTRIBUTE } from "@/server/storage/validate";

export interface UploadProjectOption {
  id: string;
  name: string;
  phases: { id: string; name: string }[];
}

type Mode =
  | { kind: "document"; projects: UploadProjectOption[]; clients: { id: string; name: string }[]; defaultProjectId?: string; canShare: boolean }
  | { kind: "version"; documentId: string; documentName: string; nextVersion: number; canShare: boolean; shared: boolean };

/**
 * Upload a new document (v1) or a new version. Posts multipart to the API; the server validates
 * type/size/name and assigns the version number. Client-side checks are only for fast feedback.
 */
export function UploadDialog({ mode, maxMb, label, variant = "primary" }: { mode: Mode; maxMb: number; label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [projectId, setProjectId] = useState(mode.kind === "document" ? (mode.defaultProjectId ?? mode.projects[0]?.id ?? "") : "");
  const formRef = useRef<HTMLFormElement>(null);
  const phases = mode.kind === "document" ? (mode.projects.find((p) => p.id === projectId)?.phases ?? []) : [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setFieldErrors({ file: ["Choose a file"] });
    if (file.size > maxMb * 1024 * 1024) return setFieldErrors({ file: [`File exceeds the ${maxMb} MB limit`] });
    if (mode.kind === "document" && projectId === "__client__") fd.delete("projectId");
    else fd.delete("clientId");
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const url = mode.kind === "document" ? "/api/v1/documents" : `/api/v1/documents/${mode.documentId}/versions`;
      const res = await fetch(url, { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: { message: string; details?: Record<string, string[]> } };
      if (!res.ok) {
        setError(json.error?.message ?? "Upload failed");
        setFieldErrors(json.error?.details ?? {});
        return;
      }
      setOpen(false);
      formRef.current?.reset();
      if (mode.kind === "document" && json.data) router.push(`/documents/${json.data.id}`);
      else router.refresh();
    } catch {
      setError("Network error — the upload did not complete.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Upload className="size-3.5" /> {label ?? (mode.kind === "document" ? "Upload" : "Upload new version")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={mode.kind === "document" ? "Upload document" : `Upload ${mode.documentName} v${mode.nextVersion}`}
        description={mode.kind === "version" ? "Previous versions are kept unchanged. The version number is assigned automatically." : "PDF, DOCX, XLSX, PPTX, PNG, JPG or TXT."}
      >
        <form ref={formRef} onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          {mode.kind === "document" && (
            <>
              <Field label="Document name" htmlFor="up-name" error={fieldErrors.name} required className="sm:col-span-2">
                <Input id="up-name" name="name" placeholder="e.g. Requirements" autoFocus />
              </Field>
              <Field label="Belongs to" htmlFor="up-project" error={fieldErrors.projectId} required>
                <Select id="up-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {mode.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {mode.clients.length > 0 && <option value="__client__">Client-level (no project)…</option>}
                </Select>
              </Field>
              {projectId === "__client__" ? (
                <Field label="Client" htmlFor="up-client" required>
                  <Select id="up-client" name="clientId">
                    {mode.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Phase" htmlFor="up-phase" hint="Optional">
                  <Select id="up-phase" name="phaseId" key={projectId}>
                    <option value="">—</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Category" htmlFor="up-category" required>
                <Select id="up-category" name="category" defaultValue="REQUIREMENTS">
                  {Object.entries(DOCUMENT_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Description" htmlFor="up-desc" className="sm:col-span-2" error={fieldErrors.description}>
                <Textarea id="up-desc" name="description" rows={2} />
              </Field>
            </>
          )}
          <Field label="File" htmlFor="up-file" error={fieldErrors.file} required hint={`Max ${maxMb} MB`} className="sm:col-span-2">
            <input id="up-file" name="file" type="file" accept={ACCEPT_ATTRIBUTE} className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium hover:file:bg-subtle" />
          </Field>
          <Field label="Change summary" htmlFor="up-summary" className="sm:col-span-2" hint={mode.kind === "version" ? "What changed since the previous version?" : "Optional"}>
            <Input id="up-summary" name="changeSummary" placeholder={mode.kind === "version" ? "e.g. Added Google + Microsoft login" : "Initial version"} />
          </Field>
          {mode.canShare && (
            <label className="flex items-start gap-2 text-[13px] sm:col-span-2">
              <input type="checkbox" name="share" value="true" defaultChecked={mode.kind === "version" && mode.shared} className="mt-0.5 accent-accent" />
              <span>
                Share this version with the client
                <span className="block text-xs text-ink-3">Clients only ever see versions you share or send for approval.</span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
