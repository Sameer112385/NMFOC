import { NextResponse } from 'next/server';
import { deleteProject, updateProject } from '@/lib/data';
import { requireAdminUser } from '@/lib/current-user';

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await requireAdminUser();
    const { projectId } = await params;
    const payload = await request.json().catch(() => ({} as Record<string, unknown>));

    const project_code = String(payload.project_code ?? '').trim();
    const project_name = String(payload.project_name ?? '').trim();

    if (!project_code || !project_name) {
      return NextResponse.json({ error: 'Project code and project name are required.' }, { status: 400 });
    }

    const project = await updateProject(projectId, {
      project_code,
      project_name,
      client_name: String(payload.client_name ?? '').trim() || null,
      project_manager_user_id: String(payload.project_manager_user_id ?? '').trim() || null,
      project_manager_name: String(payload.project_manager_name ?? '').trim() || null,
      project_manager_email: String(payload.project_manager_email ?? '').trim() || null,
      project_manager_phone: String(payload.project_manager_phone ?? '').trim() || null,
      site_location: String(payload.site_location ?? '').trim() || null,
      subcontractor_name: String(payload.subcontractor_name ?? '').trim() || null,
      subcontract_po_number: String(payload.subcontract_po_number ?? '').trim() || null,
      subcontract_po_amount:
        payload.subcontract_po_amount === '' || payload.subcontract_po_amount === null || payload.subcontract_po_amount === undefined
          ? null
          : Number(payload.subcontract_po_amount),
      subcontract_scope: String(payload.subcontract_scope ?? '').trim() || null,
      status: String(payload.status ?? 'Active').trim() || 'Active',
    });

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update project.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await requireAdminUser();
    const { projectId } = await params;
    await deleteProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete project.';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Admin access is required') ? 403 : 500 },
    );
  }
}
