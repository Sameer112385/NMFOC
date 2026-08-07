import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireProjectEditorUser } from '@/lib/current-user';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLocalDbMode, replaceLocalPoCommitmentRows } from '@/lib/local-db';

export const runtime = 'nodejs';
const text = (value: unknown) => String(value ?? '').trim();
const amount = (value: unknown) => Number(text(value).replace(/,/g, '')) || 0;

export async function POST(request: Request) {
  try {
    if (!(await isLocalDbMode())) await requireProjectEditorUser();
    const form = await request.formData();
    const projectId = text(form.get('project_id'));
    const file = form.get('file');
    if (!projectId || !(file instanceof File)) return NextResponse.json({ error: 'Select a project and ME2J Excel file.' }, { status: 400 });
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const rows = sourceRows.map((row) => {
      const supplier = text(row['Supplier/Supplying Plant']);
      const parts = supplier.split(/\s+/);
      return {
        project_id: projectId,
        po_number: text(row['Purchasing Document']),
        po_item: text(row['Item']),
        wbs_code: text(row['WBS Element']),
        network: text(row['Network']) || null,
        activity: text(row['Activity']) || null,
        vendor_id: parts[0] || null,
        vendor_name: parts.slice(1).join(' ') || text(row['Name of Supplier']) || null,
        short_text: text(row['Short Text']) || null,
        material_group: text(row['Material Group']) || null,
        deletion_indicator: text(row['Deletion Indicator']) || null,
        distribution_percent: amount(row['Distribution (%)']),
        net_order_value: amount(row['Net Order Value']),
        still_to_deliver_value: amount(row['Still to be delivered (value)']),
        currency: text(row['Currency']) || 'SAR',
        source_file_name: file.name,
      };
    }).filter((row) => row.po_number && row.wbs_code);
    if (!rows.length) return NextResponse.json({ error: 'No ME2J PO/WBS rows found. Ensure Purchasing Document and WBS Element are included.' }, { status: 400 });
    if (await isLocalDbMode()) {
      await replaceLocalPoCommitmentRows(projectId, rows);
    } else {
      const supabase = await createSupabaseAdminClient();
      const { error: removeError } = await supabase.from('po_commitment_rows').delete().eq('project_id', projectId);
      if (removeError) throw removeError;
      for (let index = 0; index < rows.length; index += 500) {
        const { error } = await supabase.from('po_commitment_rows').insert(rows.slice(index, index + 500));
        if (error) throw error;
      }
    }
    return NextResponse.json({ imported: rows.length, fileName: file.name });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'ME2J upload failed.';
    return NextResponse.json({ error: message }, { status: message.includes('access') ? 403 : 500 });
  }
}