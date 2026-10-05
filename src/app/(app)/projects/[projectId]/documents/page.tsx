import { pageContext, load } from "@/server/page-context";
import { listDocuments } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { DocumentList } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const rows = await load(() => listDocuments(ctx, { projectId }));
  return <Panel title="Documents" description="Every version is kept; approved versions are never overwritten." actions={<ReadOnlyNote module="Uploads & versioning" phase="Phase 3" />}><DocumentList rows={rows} /></Panel>;
}
