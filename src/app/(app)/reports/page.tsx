import type { Metadata } from "next";
import Link from "next/link";
import { RoadmapPage } from "@/components/ui/roadmap-page";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <RoadmapPage
      title="Reports"
      description="Exportable performance, financial and delivery reports."
      phase="Phase 5"
      capabilities={[
        "Project performance: progress, timeline, tasks, hours, bugs, payments, expenses, profitability and risks",
        "Financial and client revenue reports by period",
        "Outstanding payments and ageing",
        "Time tracking and estimated vs actual effort",
        "Task completion and bug statistics",
        "Change request impact on scope, hours and revenue",
        "PDF / CSV export and scheduled email delivery",
      ]}
      available={
        <>
          <p><Link href="/profitability" className="text-accent hover:underline">Profitability</Link> — live revenue, cost and margin by project.</p>
          <p>Each project&apos;s <strong>Overview</strong> and <strong>Time</strong> tabs show progress, effort variance and financials.</p>
          <p><Link href="/dashboard" className="text-accent hover:underline">Dashboard</Link> — monthly revenue, expenses and profit.</p>
        </>
      }
    />
  );
}
