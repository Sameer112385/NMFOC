import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createProjectManpowerRate, createProjectMaterialMaster, getProjectWbsMaster } from '@/lib/data';

type BulkRow = Record<string, string | number | boolean | null | undefined>;

export async function POST(request: Request) {
  await requireProjectEditorUser();
  try {
    const formData = await request.formData();
    const projectId = String(formData.get('project_id') ?? '').trim();
    const type = String(formData.get('type') ?? '').trim().toLowerCase();
    const file = formData.get('file');

    if (!projectId || !['manpower', 'material'].includes(type)) {
      return NextResponse.json({ error: 'Project and upload type are required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel file is required.' }, { status: 400 });
    }

    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<BulkRow>(firstSheet, { defval: '' });

    const nonEmptyRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
    if (!nonEmptyRows.length) {
      return NextResponse.json({ error: 'The uploaded template does not contain any data rows.' }, { status: 400 });
    }
    const costWbsCodes = new Set(
      (await getProjectWbsMaster(projectId))
        .filter((row) => row.is_active !== false && row.include_in_cost)
        .map((row) => normalizeWbsCode(row.wbs_code))
        .filter(Boolean),
    );
    if (!costWbsCodes.size) {
      return NextResponse.json({ error: 'No cost-included WBS found for this project. Select Include in Cost in WBS Master first.' }, { status: 400 });
    }

    if (type === 'manpower') {
      for (const [index, rawRow] of nonEmptyRows.entries()) {
        const row = normalizeKeys(rawRow);
        const revenue_wbs_code = String(row.revenue_wbs_code ?? '').trim();
        const labor_category = String(row.labor_category ?? '').trim();
        if (!revenue_wbs_code || !labor_category) {
          return NextResponse.json({ error: `Manpower row ${index + 2}: revenue_wbs_code and labor_category are required.` }, { status: 400 });
        }
        if (!costWbsCodes.has(normalizeWbsCode(revenue_wbs_code))) {
          return NextResponse.json({ error: `Manpower row ${index + 2}: WBS ${revenue_wbs_code} is not selected as Include in Cost in WBS Master.` }, { status: 400 });
        }

        try {
          await createProjectManpowerRate({
            project_id: projectId,
            revenue_wbs_code,
            work_center: String(row.work_center ?? '').trim() || null,
            cost_center: String(row.cost_center ?? '').trim() || null,
            labor_category,
            hourly_rate: Number(row.hourly_rate ?? 0),
            is_active: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return NextResponse.json({ error: formatBulkError(message, 'manpower', index + 2) }, { status: 500 });
        }
      }
    }

    if (type === 'material') {
      for (const [index, rawRow] of nonEmptyRows.entries()) {
        const row = normalizeKeys(rawRow);
        const revenue_wbs_code = String(row.revenue_wbs_code ?? '').trim();
        const material_code = String(row.material_code ?? '').trim();
        const material_description = String(row.material_description ?? '').trim();
        if (!revenue_wbs_code || !material_code || !material_description) {
          return NextResponse.json({ error: `Material row ${index + 2}: revenue_wbs_code, material_code, and material_description are required.` }, { status: 400 });
        }
        if (!costWbsCodes.has(normalizeWbsCode(revenue_wbs_code))) {
          return NextResponse.json({ error: `Material row ${index + 2}: WBS ${revenue_wbs_code} is not selected as Include in Cost in WBS Master.` }, { status: 400 });
        }

        try {
          await createProjectMaterialMaster({
            project_id: projectId,
            revenue_wbs_code,
            material_code,
            material_description,
            unit_of_measure: String(row.unit_of_measure ?? '').trim() || null,
            planned_quantity: Number(row.planned_quantity ?? 0),
            unit_price: Number(row.unit_price ?? 0),
            is_active: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return NextResponse.json({ error: formatBulkError(message, 'material', index + 2) }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true, imported: nonEmptyRows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to bulk upload master data.' },
      { status: 500 },
    );
  }
}

function normalizeKeys(row: BulkRow): BulkRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, '_'), value]),
  );
}

function normalizeWbsCode(code: string) {
  return String(code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatBulkError(message: string, type: 'manpower' | 'material', rowNumber: number) {
  const normalized = message.toLowerCase();

  if (normalized.includes('revenue_wbs_code')) {
    return `${type === 'manpower' ? 'Manpower' : 'Material'} row ${rowNumber}: Supabase table is missing the revenue_wbs_code column. Run the latest manual setup SQL, refresh, then upload again.`;
  }

  return `${type === 'manpower' ? 'Manpower' : 'Material'} row ${rowNumber}: ${message}`;
}
