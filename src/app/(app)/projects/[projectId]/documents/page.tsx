import { pageContext, load } from "@/server/page-context";
import { assertProjectAccess } from "@/server/services/projects";
import { listDocuments } from "@/server/services/documents";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { DocumentTable } from "@/features/documents/document-table";
import { UploadDialog } from "@/features/documents/upload-dialog";
import { loadUploadOptions } from "@/features/documents/upload-options";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  await load(() => assertProjectAccess(ctx, projectId));
  const [rows, upload] = await Promise.all([listDocuments(ctx, { projectId }), loadUploadOptions(ctx)]);
  const canUploadHere = upload.canUpload && upload.projects.some((p) => p.id === projectId);
  return (
    <Panel
      title="Documents"
      description="Requirements, designs and technical docs. Every revision is a new immutable version."
      actions={canUploadHere && <UploadDialog mode={{ kind: "document", projects: upload.projects.filter((p) => p.id === projectId), clients: [], defaultProjectId: projectId, canShare: upload.canShare }} maxMb={upload.maxMb} />}
    >
      <DocumentTable
        rows={rows}
        showProject={false}
        empty={<EmptyState title={ctx.role === "CLIENT" ? "No documents have been shared with you yet." : "No project documents yet."} description={ctx.role === "CLIENT" ? undefined : "Upload the requirements, proposal or designs to start the version history."} />}
      />
    </Panel>
  );
}
