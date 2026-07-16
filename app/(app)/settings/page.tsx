import { redirect } from 'next/navigation';
import { PageShell, Badge, StatRow } from '@/components/ui';
import { SupabaseConnectionPanel } from '@/components/supabase-connection-panel';
import { UserManagementPanel } from '@/components/user-management-panel';
import { AdminResetPanel } from '@/components/admin-reset-panel';
import { CompanyLogoPanel } from '@/components/company-logo-panel';
import { getCurrentAppUser, canAccessSettings } from '@/lib/current-user';

export default async function SettingsPage() {
  const currentUser = await getCurrentAppUser();
  if (!canAccessSettings(currentUser?.role)) {
    redirect('/dashboard');
  }
  const canReset = currentUser?.role === 'Admin';

  const envStatus: Array<[string, boolean]> = [
    ['NEXT_PUBLIC_SUPABASE_URL', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ['SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)],
  ];

  return (
    <PageShell title="Settings" subtitle="Branding configuration, environment checks, role notes, and user profiles.">
      <div className="grid gap-4 xl:grid-cols-2">
        <CompanyLogoPanel />
        <SupabaseConnectionPanel />
        <UserManagementPanel />
        <AdminResetPanel canReset={canReset} />
        
        <div className="glass rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-text">Environment Variables</h3>
          <div className="mt-4 space-y-1">
            {envStatus.map(([name, enabled]) => (
              <StatRow key={name} label={name} value={enabled ? 'Configured' : 'Missing'} />
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-text">Role Permissions</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="accent">Admin</Badge>
            <Badge tone="warning">Cost Controller</Badge>
            <Badge tone="success">Project Manager</Badge>
            <Badge>Viewer</Badge>
          </div>
          <p className="mt-4 text-sm text-muted">
            Recommended: enforce row-level access in Supabase via `users_profile` and project-scoped policies.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
