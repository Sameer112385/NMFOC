import { NextResponse } from 'next/server';
import { getProjectLayoutBundle, saveProjectDashboardLayout, saveProjectOrder } from '@/lib/dashboard-layout';
import { getCurrentAppUser, canManageDashboardLayout } from '@/lib/current-user';
import type { DashboardLayout, DashboardTab } from '@/lib/dashboard-widgets';

// Per-project overrides. GET returns global/project/effective for both status and order.
// POST accepts `layout` (status map) and/or `order` (ordered ids for a tab) — different axes.

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const bundle = await getProjectLayoutBundle(projectId);
  return NextResponse.json(bundle);
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentAppUser();
  if (!canManageDashboardLayout(user?.role)) {
    return NextResponse.json({ error: 'You do not have permission to customize this dashboard.' }, { status: 403 });
  }

  const { projectId } = await params;
  const payload = (await request.json().catch(() => ({}))) as {
    layout?: DashboardLayout;
    order?: string[];
    tab?: DashboardTab;
  };

  const result: { ok: true; layout?: DashboardLayout; order?: string[] } = { ok: true };
  if (payload.layout) {
    result.layout = await saveProjectDashboardLayout(projectId, payload.layout);
  }
  if (payload.order && (payload.tab === 'summary' || payload.tab === 'trends')) {
    result.order = await saveProjectOrder(projectId, payload.tab, payload.order);
  }
  return NextResponse.json(result);
}
