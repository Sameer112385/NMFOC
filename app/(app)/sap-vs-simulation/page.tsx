import { PageShell, Badge } from '@/components/ui';
import { getRevenueRows } from '@/lib/data';
import { formatCurrency } from '@/lib/utils';
import { requireRouteAccess } from '@/lib/current-user';

export default async function ComparisonPage() {
  await requireRouteAccess('/sap-vs-simulation');
  const rows = await getRevenueRows();

  return (
    <PageShell
      title="Source Comparison"
      subtitle="Compare source values against the calculated Cost-to-Cost outputs for actual cost and revenue recognition."
    >
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5 text-left text-muted">
            <tr>
              <th className="px-4 py-3">WBS Code</th>
              <th className="px-4 py-3">Actual Cost to Date</th>
              <th className="px-4 py-3">Planned Cost</th>
              <th className="px-4 py-3">Difference</th>
              <th className="px-4 py-3">Planned Revenue</th>
              <th className="px-4 py-3">Recognized Revenue</th>
              <th className="px-4 py-3">Difference</th>
              <th className="px-4 py-3">Match / Not Match</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-black/10">
            {rows.map((row) => {
              const actualDiff = row.actual_cost_to_date - row.planned_cost;
              const revenueDiff = row.planned_revenue - row.recognized_revenue_to_date;
              const matched = Math.abs(actualDiff) < 1 && Math.abs(revenueDiff) < 1;
              return (
                <tr key={row.wbs_code}>
                  <td className="px-4 py-3 text-text">{row.wbs_code}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(row.actual_cost_to_date)}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(row.planned_cost)}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(actualDiff)}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(row.planned_revenue)}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(row.recognized_revenue_to_date)}</td>
                  <td className="px-4 py-3 text-muted">{formatCurrency(revenueDiff)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={matched ? 'success' : 'warning'}>{matched ? 'Match' : 'Not Match'}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
