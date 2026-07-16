import { NextResponse } from 'next/server';
import { getProjectLayoutBundle, saveProjectDashboardLayout } from '@/lib/dashboard-layout';
import { getCurrentAppUser, canManageDashboardLayout } from '@/lib/current-user';
import type { DashboardLayout } from '@/lib/dashboard-widgets';

// Per-project layout overrides. GET returns the global base, the project's explicit
// override, and the resulting effective layout. POST replaces the project's override map.

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
  const payload = (await request.json().catch(() => ({}))) as { layout?: DashboardLayout };
  const saved = await saveProjectDashboardLayout(projectId, payload.layout ?? {});
  return NextResponse.json({ ok: true, layout: saved });
}
