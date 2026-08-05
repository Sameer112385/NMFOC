import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { replaceProjectCostElementControl } from '@/lib/data';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = (await request.json()) as {
      project_id?: string;
      rows?: Array<{
        cost_element?: string;
        cost_element_name?: string;
        include_in_cost?: boolean;
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
        cost_element: String(row.cost_element ?? '').trim(),
        cost_element_name: String(row.cost_element_name ?? '').trim(),
        include_in_cost: Boolean(row.include_in_cost),
        remarks: String(row.remarks ?? '').trim(),
      }))
      .filter((row) => row.cost_element);

    const saved = await replaceProjectCostElementControl(projectId, normalizedRows);
    return NextResponse.json({ ok: true, rows: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save cost element control.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
