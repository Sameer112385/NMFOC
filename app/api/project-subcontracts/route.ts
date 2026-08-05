import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { replaceProjectSubcontracts } from '@/lib/data';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = await request.json().catch(() => ({} as Record<string, unknown>));
    const projectId = String(payload.project_id ?? '').trim();
    const rows: unknown[] = Array.isArray(payload.rows) ? payload.rows : [];

    if (!projectId) {
      return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
    }

    const normalizedRows = rows
      .map((row: unknown) => {
        const item = row as Record<string, unknown>;
        return {
          package_name: String(item.package_name ?? '').trim(),
          subcontractor_name: String(item.subcontractor_name ?? '').trim(),
          po_number: String(item.po_number ?? '').trim() || null,
          po_amount:
            item.po_amount === '' || item.po_amount === null || item.po_amount === undefined
              ? null
              : Number(item.po_amount),
          scope: String(item.scope ?? '').trim() || null,
          status: String(item.status ?? 'Active').trim() || 'Active',
        };
      })
      .filter(
        (row) => row.package_name || row.subcontractor_name || row.po_number || row.po_amount !== null || row.scope
      );

    const hasInvalidRow = normalizedRows.some((row) => !row.package_name || !row.subcontractor_name);
    if (hasInvalidRow) {
      return NextResponse.json(
        { error: 'Each subcontract line needs both package name and subcontractor name.' },
        { status: 400 },
      );
    }

    const savedRows = await replaceProjectSubcontracts(projectId, normalizedRows);
    return NextResponse.json({ ok: true, rows: savedRows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save project subcontracts.' },
      { status: 500 },
    );
  }
}
