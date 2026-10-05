-- Phase 3: Documents, versioning, approvals, change requests.
-- Evolves the Phase 1 tables in place. Every rename uses RENAME (no data loss); new NOT NULL
-- columns are backfilled before the constraint is applied.

-- ─── Enums ───
ALTER TYPE "DocumentCategory" RENAME VALUE 'CLIENT_APPROVALS' TO 'APPROVAL';
ALTER TYPE "DocumentCategory" RENAME VALUE 'INVOICES' TO 'INVOICE';
ALTER TYPE "DocumentCategory" ADD VALUE 'OTHER';
ALTER TYPE "ApprovalStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "ChangeRequestStatus" RENAME VALUE 'PENDING_INTERNAL_REVIEW' TO 'UNDER_REVIEW';

-- ─── documents ───
ALTER TABLE "documents" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "documents"
  ADD COLUMN "client_id" TEXT,
  ADD COLUMN "change_request_id" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "created_by_id" TEXT;
-- Exactly one owner: a project (client derived through it) or a client directly.
ALTER TABLE "documents" ADD CONSTRAINT "documents_single_owner" CHECK (("project_id" IS NULL) <> ("client_id" IS NULL));
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "documents_workspace_id_idx";
CREATE INDEX "documents_client_id_idx" ON "documents"("client_id");
CREATE INDEX "documents_workspace_id_status_idx" ON "documents"("workspace_id", "status");

-- ─── document_versions ───
ALTER TABLE "document_versions" RENAME COLUMN "version" TO "version_number";
ALTER TABLE "document_versions" RENAME COLUMN "file_name" TO "original_filename";
ALTER TABLE "document_versions" RENAME COLUMN "storage_path" TO "storage_key";
ALTER TABLE "document_versions" RENAME COLUMN "size_bytes" TO "file_size";
ALTER TABLE "document_versions" RENAME COLUMN "change_notes" TO "change_summary";
ALTER TABLE "document_versions" ADD COLUMN "shared_at" TIMESTAMP(3);
-- Versions already sent to / decided by the client count as shared.
UPDATE "document_versions" SET "shared_at" = "created_at" WHERE "status" IN ('SENT_TO_CLIENT', 'APPROVED', 'REJECTED');
ALTER INDEX "document_versions_document_id_version_key" RENAME TO "document_versions_document_id_version_number_key";
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- ─── approvals ───
ALTER TABLE "approvals" RENAME COLUMN "decided_at" TO "responded_at";
ALTER TABLE "approvals" RENAME COLUMN "decided_by_name" TO "responded_by_name";
ALTER TABLE "approvals"
  ADD COLUMN "document_id" TEXT,
  ADD COLUMN "requester_id" TEXT,
  ADD COLUMN "approver_id" TEXT,
  ADD COLUMN "request_message" TEXT,
  ADD COLUMN "viewed_at" TIMESTAMP(3);
UPDATE "approvals" a SET "document_id" = v."document_id" FROM "document_versions" v WHERE v."id" = a."document_version_id";
-- Approvals must reference an exact version; fails loudly if legacy rows lack one.
ALTER TABLE "approvals" ALTER COLUMN "document_id" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "document_version_id" SET NOT NULL;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "approvals_document_id_idx" ON "approvals"("document_id");
CREATE INDEX "approvals_approver_id_status_idx" ON "approvals"("approver_id", "status");
-- At most one pending approval per document version.
CREATE UNIQUE INDEX "approvals_one_pending_per_version" ON "approvals"("document_version_id") WHERE "status" = 'PENDING';

-- ─── change_requests ───
ALTER TABLE "change_requests" RENAME COLUMN "additional_hours" TO "estimated_hours";
ALTER TABLE "change_requests" RENAME COLUMN "decided_at" TO "resolved_at";
ALTER TABLE "change_requests"
  ADD COLUMN "requested_by_id" TEXT,
  ADD COLUMN "client_decision" TEXT,
  ADD COLUMN "decided_by_id" TEXT,
  ADD COLUMN "decision_on_behalf" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancellation_reason" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "implemented_at" TIMESTAMP(3);
UPDATE "change_requests" SET "submitted_at" = "created_at" WHERE "status" NOT IN ('DRAFT', 'UNDER_REVIEW', 'CANCELLED');
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_estimated_hours_non_negative" CHECK ("estimated_hours" >= 0);
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_additional_cost_non_negative" CHECK ("additional_cost" >= 0);

-- ─── features / tasks: scope provenance ───
ALTER TABLE "features" ADD COLUMN "change_request_id" TEXT;
ALTER TABLE "features" ADD CONSTRAINT "features_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "features_change_request_id_idx" ON "features"("change_request_id");
CREATE INDEX "tasks_change_request_id_idx" ON "tasks"("change_request_id");

-- ─── Immutability triggers ───
-- Document versions: file metadata can never change after insert.
CREATE OR REPLACE FUNCTION document_versions_reject_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."document_id" IS DISTINCT FROM OLD."document_id"
     OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
     OR NEW."storage_key" IS DISTINCT FROM OLD."storage_key"
     OR NEW."original_filename" IS DISTINCT FROM OLD."original_filename"
     OR NEW."mime_type" IS DISTINCT FROM OLD."mime_type"
     OR NEW."file_size" IS DISTINCT FROM OLD."file_size"
     OR NEW."checksum" IS DISTINCT FROM OLD."checksum"
     OR NEW."change_summary" IS DISTINCT FROM OLD."change_summary"
     OR NEW."uploaded_by_id" IS DISTINCT FROM OLD."uploaded_by_id"
     OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'document versions are immutable: upload a new version instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_versions_immutable
  BEFORE UPDATE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION document_versions_reject_mutation();

-- Approvals: once decided (or cancelled) a row is frozen; rows are never deleted individually.
-- (pg_trigger_depth() > 1 lets cascades from a workspace deletion through.)
CREATE OR REPLACE FUNCTION approvals_reject_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'approval history is immutable: approvals cannot be deleted';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'approval history is immutable: % approvals cannot be changed', OLD."status";
  END IF;
  IF NEW."document_version_id" IS DISTINCT FROM OLD."document_version_id"
     OR NEW."document_id" IS DISTINCT FROM OLD."document_id"
     OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'an approval cannot be re-pointed to another document or version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approvals_immutable
  BEFORE UPDATE OR DELETE ON "approvals"
  FOR EACH ROW EXECUTE FUNCTION approvals_reject_mutation();
