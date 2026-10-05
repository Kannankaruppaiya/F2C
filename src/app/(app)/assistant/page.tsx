import type { Metadata } from "next";
import { RoadmapPage } from "@/components/ui/roadmap-page";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AssistantPage() {
  return (
    <RoadmapPage
      title="AI Assistant"
      description="A contextual project assistant grounded in your actual data. Not connected yet."
      phase="Phase 6"
      capabilities={[
        "Answers questions like “What is blocking this project?” or “How much is outstanding?” using tool calls into the same authorized services the app uses",
        "Says “Insufficient project data.” instead of guessing when records are missing",
        "Generates status reports and client updates for review before sending",
        "Requirement analyzer: PDF/DOCX/TXT/image → requirements, features, risks, suggested phases and tasks — always reviewed before anything is created",
        "Proposal generator with scope, milestones, payment terms, assumptions and exclusions",
        "Risk analysis combining deadline, effort, approvals, change requests and payments (builds on the existing health engine)",
      ]}
      available={<p>The <strong>project health engine</strong> already explains risk in plain language on every project and on the dashboard&apos;s <em>Needs attention</em> list.</p>}
    />
  );
}
