import { requireProjectEditorUser } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { createProject } from '@/lib/data';

export async function POST(request: Request) {
  await requireProjectEditorUser();
  const formData = await request.formData();
  const project_code = String(formData.get('project_code') ?? '').trim();
  const project_name = String(formData.get('project_name') ?? '').trim();
  const client_name = String(formData.get('client_name') ?? '').trim();

  if (!project_code || !project_name) {
    return NextResponse.json({ error: 'Project code and project name are required.' }, { status: 400 });
  }

  try {
    const project = await createProject({
      project_code,
      project_name,
      client_name: client_name || null,
      status: 'Active',
    });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create project.' },
      { status: 500 },
    );
  }
}
