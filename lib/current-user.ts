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

  // Demo session takes priority — works even when Supabase is configured
  if (cookieStore.has('sap-cn41-demo-session')) {
    return {
      id: 'demo-admin',
      email: 'admin@local',
      role: 'Admin',
      fullName: 'Sameer Shaikh',
      mode: 'demo',
    };
  }

  if (await isLocalDbMode()) {
    return null;
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

export type AppRole = 'Admin' | 'Cost Controller' | 'Project Manager' | 'Viewer';

const ALLOWED_ROUTES: Record<AppRole, string[]> = {
  'Admin':            ['*'],
  'Cost Controller':  ['/dashboard', '/projects', '/reports', '/upload-cn41', '/pm-daily-updates', '/simulation', '/sap-vs-simulation', '/risk-alerts', '/comments', '/revenue-wbs', '/cost-elements'],
  'Project Manager':  ['/dashboard', '/projects', '/pm-daily-updates'],
  'Viewer':           ['/dashboard', '/projects', '/pm-daily-updates'],
};

export function getAllowedRoutes(role?: string | null): string[] {
  return ALLOWED_ROUTES[(role as AppRole)] ?? ALLOWED_ROUTES['Viewer'];
}

export function canAccessRoute(role?: string | null, pathname?: string): boolean {
  const allowed = getAllowedRoutes(role);
  if (allowed.includes('*')) return true;
  if (!pathname) return false;
  return allowed.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

export async function requireRouteAccess(pathname: string) {
  const user = await getCurrentAppUser();
  if (user && !canAccessRoute(user.role, pathname)) {
    const { redirect } = await import('next/navigation');
    redirect('/dashboard');
  }
  return user;
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
  return role === 'Admin';
}

export function canManageDashboardLayout(role?: string | null): boolean {
  return role === 'Admin';
}

export function canSubmitPmUpdates(
  user: CurrentAppUser | null,
  project: { project_manager_user_id?: string | null; project_manager_email?: string | null; assigned_users?: { user_id: string; email: string }[] | null },
): boolean {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Cost Controller') return true;
  if (project.project_manager_user_id && project.project_manager_user_id === user.id) return true;
  if (project.project_manager_email && project.project_manager_email === user.email) return true;
  if (project.assigned_users?.some((u) => u.user_id === user.id || u.email === user.email)) return true;
  return false;
}
