import { NextResponse } from 'next/server';
import { getGlobalDashboardLayout, saveGlobalDashboardLayout } from '@/lib/dashboard-layout';
import { getCurrentAppUser, canManageDashboardLayout } from '@/lib/current-user';
import type { DashboardLayout } from '@/lib/dashboard-widgets';

// Global default layout (the house style). Per-project overrides live at
// /api/dashboard-layout/[projectId].
export async function GET() {
  const layout = await getGlobalDashboardLayout();
  return NextResponse.json({ layout });
}

export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!canManageDashboardLayout(user?.role)) {
    return NextResponse.json({ error: 'You do not have permission to change the dashboard layout.' }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { layout?: DashboardLayout };
  // saveGlobalDashboardLayout sanitizes: unknown ids and invalid statuses are dropped.
  const saved = await saveGlobalDashboardLayout(payload.layout ?? {});
  return NextResponse.json({ ok: true, layout: saved });
}
