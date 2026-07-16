import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isLocalDbMode } from '@/lib/local-db';

export type CurrentAppUser = {
  id: string;
  email: string;
  role: string;
  fullName?: string | null;
  mode: 'demo' | 'supabase';
};

export async function getCurrentAppUser(): Promise<CurrentAppUser | null> {
  const cookieStore = await cookies();

  if (await isLocalDbMode()) {
    if (!cookieStore.has('sap-cn41-demo-session')) return null;
    return {
      id: 'demo-admin',
      email: 'admin@local',
      role: 'Admin',
      fullName: 'Sameer Shaikh',
      mode: 'demo',
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return null;

    let role = String(user.user_metadata?.role ?? 'Viewer');
    let fullName = String(user.user_metadata?.full_name ?? '');
    try {
      const { data: profile } = await supabase
        .from('users_profile')
        .select('role, full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      role = String(profile?.role ?? role ?? 'Viewer');
      if (profile?.full_name) {
        fullName = profile.full_name;
      }
    } catch {
      // ignore profile lookup failures
    }

    return {
      id: user.id,
      email: user.email ?? '',
      role,
      fullName: fullName || user.email?.split('@')[0] || 'User',
      mode: 'supabase',
    };
  } catch {
    return null;
  }
}

export async function requireAdminUser() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'Admin') {
    throw new Error('Admin access is required.');
  }
  return user;
}

export function canEditProjectMaster(role?: string | null): boolean {
  return role === 'Admin' || role === 'Cost Controller';
}

export function canAccessSettings(role?: string | null): boolean {
  return role === 'Admin' || role === 'Cost Controller';
}

// Editing the dashboard layout (global default and per-project overrides) is Admin-only.
export function canManageDashboardLayout(role?: string | null): boolean {
  return role === 'Admin';
}
