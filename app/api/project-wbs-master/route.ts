import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { replaceProjectWbsMaster } from '@/lib/data';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = (await request.json()) as {
      project_id?: string;
      rows?: Array<{
        wbs_code?: string;
        wbs_description?: string;
        is_revenue_generating?: boolean;
        include_in_cost?: boolean;
        is_active?: boolean;
        remarks?: string;
      }>;
    };
    const projectId = String(payload.project_id ?? '').trim();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (!projectId) {
      return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
    }

    const normalizedRows = rows
      .map((row) => ({
        wbs_code: String(row.wbs_code ?? '').trim(),
        wbs_description: String(row.wbs_description ?? '').trim(),
        is_revenue_generating: Boolean(row.is_revenue_generating),
        include_in_cost: Boolean(row.include_in_cost),
        is_active: Boolean(row.is_active),
        remarks: String(row.remarks ?? '').trim(),
      }))
      .filter((row) => row.wbs_code);

    const saved = await replaceProjectWbsMaster(projectId, normalizedRows);
    return NextResponse.json({ ok: true, rows: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save WBS master.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
