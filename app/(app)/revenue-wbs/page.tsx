import { PageShell, Badge } from '@/components/ui';
import { getRevenueGeneratingRows } from '@/lib/data';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { RevenueWbsFilter } from '@/components/revenue-wbs-filter';
import { requireRouteAccess } from '@/lib/current-user';

export default async function RevenueWbsPage() {
  await requireRouteAccess('/revenue-wbs');
  const rows = await getRevenueGeneratingRows();
  const revenueRows = rows;

  return (
    <PageShell title="WBS Financial Analysis" subtitle="Sales Order revenue grouped by WBS, with CN41 planned cost and GR55 actual cost rolled up into Cost-to-Cost metrics.">
      {!revenueRows.length ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          No revenue WBS rows were detected yet. Upload the Sales Order file first, then CN41 planned cost and GR55 actual cost if available, to populate this view.
        </div>
      ) : null}
      {revenueRows.length ? <RevenueWbsFilter rows={revenueRows} /> : null}
    </PageShell>
  );
}
