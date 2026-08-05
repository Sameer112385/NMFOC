import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isLocalDbMode, saveComment } from '@/lib/local-db';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  const formData = await request.formData();
  const project_id = String(formData.get('project_id') ?? '').trim();
  const wbs_code = String(formData.get('wbs_code') ?? '').trim();
  const comment_text = String(formData.get('comment_text') ?? '').trim();
  const created_by = String(formData.get('created_by') ?? '').trim();

  if (!project_id || !wbs_code || !comment_text) {
    return NextResponse.json({ error: 'Project, WBS, and comment text are required.' }, { status: 400 });
  }

  try {
    if (await isLocalDbMode()) {
      const comment = await saveComment({
        project_id,
        wbs_code,
        comment_text,
        created_by: created_by || null,
      });
      return NextResponse.json({ comment });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('comments')
      .insert({
        project_id,
        wbs_code,
        comment_text,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ comment: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save comment.' },
      { status: 500 },
    );
  }
}
