import { NextResponse } from 'next/server';
import {
  getGlobalDashboardLayout,
  saveGlobalDashboardLayout,
  saveGlobalOrder,
  getEffectiveOrder,
} from '@/lib/dashboard-layout';
import { getCurrentAppUser, canManageDashboardLayout } from '@/lib/current-user';
import type { DashboardLayout, DashboardTab } from '@/lib/dashboard-widgets';

// Global default layout (the house style). Per-project overrides live at
// /api/dashboard-layout/[projectId]. Handles both status (`layout`) and `order` axes.
export async function GET() {
  const layout = await getGlobalDashboardLayout();
  // Effective global order == global override ?? registry default (projectId irrelevant here).
  const order = {
    summary: await getEffectiveOrder('', 'summary'),
    trends: await getEffectiveOrder('', 'trends'),
  };
  return NextResponse.json({ layout, order });
}

export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!canManageDashboardLayout(user?.role)) {
    return NextResponse.json({ error: 'You do not have permission to change the dashboard layout.' }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    layout?: DashboardLayout;
    order?: string[];
    tab?: DashboardTab;
  };

  const result: { ok: true; layout?: DashboardLayout; order?: string[] } = { ok: true };
  if (payload.layout) {
    result.layout = await saveGlobalDashboardLayout(payload.layout);
  }
  if (payload.order && (payload.tab === 'summary' || payload.tab === 'trends')) {
    result.order = await saveGlobalOrder(payload.tab, payload.order);
  }
  return NextResponse.json(result);
}
