import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { createProjectMaterialMaster, deleteProjectMaterialMaster, getProjectWbsMaster, updateProjectMaterialMaster } from '@/lib/data';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = await request.json();
    const project_id = String(payload.project_id ?? '').trim();
    const revenue_wbs_code = String(payload.revenue_wbs_code ?? '').trim();
    const material_code = String(payload.material_code ?? '').trim();
    const material_description = String(payload.material_description ?? '').trim();
    const unit_of_measure = String(payload.unit_of_measure ?? '').trim();
    const planned_quantity = Number(payload.planned_quantity ?? 0);
    const unit_price = Number(payload.unit_price ?? 0);

    if (!project_id || !revenue_wbs_code || !material_code || !material_description) {
      return NextResponse.json({ error: 'Project, WBS, material code, and description are required.' }, { status: 400 });
    }
    const costWbs = (await getProjectWbsMaster(project_id)).some(
      (row) => row.is_active !== false && row.include_in_cost && normalizeWbsCode(row.wbs_code) === normalizeWbsCode(revenue_wbs_code),
    );
    if (!costWbs) {
      return NextResponse.json({ error: 'Selected WBS is not marked Include in Cost in WBS Master.' }, { status: 400 });
    }

    const row = await createProjectMaterialMaster({
      project_id,
      revenue_wbs_code,
      material_code,
      material_description,
      unit_of_measure: unit_of_measure || null,
      planned_quantity,
      unit_price,
      is_active: true,
    });

    return NextResponse.json({ ok: true, row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save project material master.' },
      { status: 500 },
    );
  }
}

function normalizeWbsCode(code: string) {
  return String(code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function DELETE(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = await request.json();
    const id = String(payload.id ?? '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Material master id is required.' }, { status: 400 });
    }
    await deleteProjectMaterialMaster(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete project material master.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  await requireProjectEditorUser();
  try {
    const payload = await request.json();
    const id = String(payload.id ?? '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Material master id is required.' }, { status: 400 });
    }
    const patch: any = {};
    if (payload.revenue_wbs_code !== undefined) patch.revenue_wbs_code = String(payload.revenue_wbs_code).trim();
    if (payload.material_code !== undefined) patch.material_code = String(payload.material_code).trim();
    if (payload.material_description !== undefined) patch.material_description = String(payload.material_description).trim();
    if (payload.unit_of_measure !== undefined) patch.unit_of_measure = String(payload.unit_of_measure).trim();
    if (payload.planned_quantity !== undefined) patch.planned_quantity = Number(payload.planned_quantity);
    if (payload.unit_price !== undefined) patch.unit_price = Number(payload.unit_price);
    
    if (patch.revenue_wbs_code) {
      const project_id = String(payload.project_id ?? '').trim();
      if (project_id) {
        const costWbs = (await getProjectWbsMaster(project_id)).some(
          (row) => row.is_active !== false && row.include_in_cost && normalizeWbsCode(row.wbs_code) === normalizeWbsCode(patch.revenue_wbs_code),
        );
        if (!costWbs) {
          return NextResponse.json({ error: 'Selected WBS is not marked Include in Cost in WBS Master.' }, { status: 400 });
        }
      }
    }

    const row = await updateProjectMaterialMaster(id, patch);
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update project material master.' },
      { status: 500 },
    );
  }
}

