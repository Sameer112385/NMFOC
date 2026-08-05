import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clearSupabaseRuntimeConfig, getSupabaseRuntimeConfig, saveSupabaseRuntimeConfig } from '@/lib/supabase/runtime-config';
import { requireAdminUser } from '@/lib/current-user';

export async function GET() {
  await requireAdminUser();
  const config = await getSupabaseRuntimeConfig();
  return NextResponse.json({
    configured: Boolean(config?.supabaseUrl && config?.supabaseAnonKey),
    supabaseUrl: config?.supabaseUrl ?? '',
    supabaseAnonKey: config?.supabaseAnonKey ?? '',
    hasAnonKey: Boolean(config?.supabaseAnonKey),
    hasServiceRoleKey: Boolean(config?.supabaseServiceRoleKey),
    savedAt: config?.savedAt ?? null,
  });
}

export async function POST(request: Request) {
  await requireAdminUser();
  const payload = await request.json().catch(() => ({} as Record<string, string | boolean | null>));

  if (payload.action === 'clear') {
    await clearSupabaseRuntimeConfig();
    return NextResponse.json({ ok: true, configured: false });
  }

  const existing = await getSupabaseRuntimeConfig();
  const supabaseUrl = String(payload.supabaseUrl ?? existing?.supabaseUrl ?? '').trim();
  const supabaseAnonKey = String(payload.supabaseAnonKey ?? existing?.supabaseAnonKey ?? '').trim();
  const supabaseServiceRoleKey = String(payload.supabaseServiceRoleKey ?? existing?.supabaseServiceRoleKey ?? '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase URL and anon key are required.' }, { status: 400 });
  }

  const saved = await saveSupabaseRuntimeConfig({
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: supabaseServiceRoleKey || null,
  });

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('projects').select('id').limit(1);
    if (error) {
      return NextResponse.json({
        ok: true,
        configured: true,
        savedAt: saved.savedAt,
        warning: error.message,
      });
    }
  } catch (error) {
    return NextResponse.json({
      ok: true,
      configured: true,
      savedAt: saved.savedAt,
      warning: error instanceof Error ? error.message : 'Saved, but the Supabase connection test failed.',
    });
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    savedAt: saved.savedAt,
  });
}
