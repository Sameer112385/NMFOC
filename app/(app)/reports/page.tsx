import { PageShell } from "@/components/ui";
import { getProjects, getRevenueRows, getDailyUpdates, getProjectSubcontracts } from "@/lib/data";
import { buildRiskAlerts } from "@/lib/calculations";
import ReportsBuilder from "@/components/reports-builder";
import { requireRouteAccess } from "@/lib/current-user";

export default async function ReportsPage() {
  await requireRouteAccess('/reports');
  const projects = await getProjects();
  const revenueRows = await getRevenueRows();
  const dailyUpdates = await getDailyUpdates();
  const subcontracts = await getProjectSubcontracts();
  const risks = buildRiskAlerts(revenueRows);

  return (
    <PageShell
      title="Advanced PDF & Excel Exporter"
      subtitle="Generate professional project performance summary sheets, subcontractor PO spend logs, active control exceptions, and daily progress updates."
    >
      <ReportsBuilder
        projects={projects}
        allWbsRows={revenueRows}
        allSubcontracts={subcontracts}
        allDailyUpdates={dailyUpdates}
        allRisks={risks}
      />
    </PageShell>
  );
}
