import { PageShell, Badge } from '@/components/ui';
import { buildRiskAlerts } from '@/lib/calculations';
import { getRevenueRows } from '@/lib/data';
import { formatCurrency } from '@/lib/utils';
import { requireRouteAccess } from '@/lib/current-user';

export default async function RiskAlertsPage() {
  await requireRouteAccess('/risk-alerts');
  const rows = await getRevenueRows();
  const risks = buildRiskAlerts(rows);

  return (
    <PageShell title="Risk Alerts" subtitle="Automatically generated from Cost-to-Cost thresholds, margin pressure, and forecast variance.">
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5 text-left text-muted">
            <tr>
              <th className="px-4 py-3">Risk Type</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">WBS</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Suggested Action</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-black/10">
            {risks.map((risk, index) => (
              <tr key={`${risk.wbs_code}-${index}`}>
                <td className="px-4 py-3 text-text">{risk.risk_type}</td>
                <td className="px-4 py-3 text-muted">{risk.project_id}</td>
                <td className="px-4 py-3 text-muted">{risk.wbs_code}</td>
                <td className="px-4 py-3 text-muted">{formatCurrency(risk.amount)}</td>
                <td className="px-4 py-3">
                  <Badge tone={risk.severity === 'High' ? 'danger' : risk.severity === 'Medium' ? 'warning' : 'success'}>{risk.severity}</Badge>
                </td>
                <td className="px-4 py-3 text-muted">{risk.suggested_action}</td>
                <td className="px-4 py-3">
                  <Badge tone={risk.status === 'Closed' ? 'success' : risk.status === 'In Progress' ? 'warning' : 'danger'}>{risk.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
