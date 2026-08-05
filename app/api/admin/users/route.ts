import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLocalDbMode, readLocalUsers, createLocalUser, deleteLocalUser, updateLocalUser } from '@/lib/local-db';
import { requireAdminUser } from '@/lib/current-user';

export async function GET() {
  try {
    await requireAdminUser();
    if (await isLocalDbMode()) {
      const users = await readLocalUsers();
      return NextResponse.json({ ok: true, users });
    }

    const supabase = await createSupabaseAdminClient();
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    // Join with users_profile in public schema if possible
    let profiles: any[] = [];
    try {
      const { data, error: profileError } = await supabase
        .from('users_profile')
        .select('*');
      if (!profileError && data) {
        profiles = data;
      }
    } catch {
      // Ignore profile select failures (e.g. if table not ready yet)
    }

    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    const mergedUsers = users.map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: profile?.id ?? u.id,
        user_id: u.id,
        email: u.email ?? '',
        full_name: profile?.full_name ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
        phone: profile?.phone ?? u.user_metadata?.phone ?? null,
        role: profile?.role ?? u.user_metadata?.role ?? 'Viewer',
        created_at: u.created_at,
      };
    });

    return NextResponse.json({ ok: true, users: mergedUsers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to list users.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const payload = await request.json();
    const email = String(payload.email ?? '').trim();
    const password = String(payload.password ?? '');
    const full_name = String(payload.full_name ?? '').trim();
    const phone = String(payload.phone ?? '').trim();
    const role = String(payload.role ?? 'Viewer').trim();

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Email, password, and role are required.' }, { status: 400 });
    }

    if (await isLocalDbMode()) {
      const row = await createLocalUser({ email, full_name: full_name || null, phone: phone || null, role });
      return NextResponse.json({ ok: true, user: row });
    }

    const supabase = await createSupabaseAdminClient();
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone, role },
    });

    if (createError) throw createError;

    if (userData?.user) {
      try {
        // Double-check profile insertion to complement trigger
        await supabase
          .from('users_profile')
          .upsert(
            {
              user_id: userData.user.id,
              full_name: full_name || null,
              phone: phone || null,
              role,
            },
            { onConflict: 'user_id' },
          );
      } catch {
        // Trigger might have already done this, ignore errors here
      }
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userData.user?.id,
        user_id: userData.user?.id,
        email: userData.user?.email,
        full_name,
        phone,
        role,
        created_at: userData.user?.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create user.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    if (await isLocalDbMode()) {
      await deleteLocalUser(userId);
      return NextResponse.json({ ok: true });
    }

    const supabase = await createSupabaseAdminClient();
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) throw authDeleteError;

    // Cascade delete on profiles should trigger, but let's delete manually to be safe
    try {
      await supabase.from('users_profile').delete().eq('user_id', userId);
    } catch {
      // Ignore errors here if cascade already handled it
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete user.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUser();
    const payload = await request.json();
    const userId = String(payload.userId ?? '').trim();
    const full_name = payload.full_name !== undefined ? String(payload.full_name ?? '').trim() : undefined;
    const phone = payload.phone !== undefined ? String(payload.phone ?? '').trim() : undefined;
    const role = payload.role !== undefined ? String(payload.role ?? '').trim() : undefined;
    const password = payload.password !== undefined ? String(payload.password ?? '') : undefined;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    if (await isLocalDbMode()) {
      const row = await updateLocalUser(userId, {
        full_name: full_name || null,
        phone: phone === undefined ? undefined : phone || null,
        role,
      });
      return NextResponse.json({ ok: true, user: row });
    }

    const supabase = await createSupabaseAdminClient();
    
    // Prepare update parameters for Auth schema
    const updateParams: any = {};
    if (full_name !== undefined || phone !== undefined || role !== undefined) {
      updateParams.user_metadata = {};
      if (full_name !== undefined) updateParams.user_metadata.full_name = full_name;
      if (phone !== undefined) updateParams.user_metadata.phone = phone;
      if (role !== undefined) updateParams.user_metadata.role = role;
    }
    if (password) {
      updateParams.password = password;
    }

    // Update in auth.users
    const { data: userData, error: authError } = await supabase.auth.admin.updateUserById(
      userId,
      updateParams
    );
    if (authError) throw authError;

    // Update in public.users_profile
    if (full_name !== undefined || phone !== undefined || role !== undefined) {
      const profileUpdates: any = {};
      if (full_name !== undefined) profileUpdates.full_name = full_name || null;
      if (phone !== undefined) profileUpdates.phone = phone || null;
      if (role !== undefined) profileUpdates.role = role;

      const { error: profileError } = await supabase
        .from('users_profile')
        .update(profileUpdates)
        .eq('user_id', userId);
      
      if (profileError) throw profileError;
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        user_id: userId,
        full_name,
        phone,
        role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update user.' },
      { status: 500 },
    );
  }
}
