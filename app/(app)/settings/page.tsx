import { redirect } from 'next/navigation';
import { PageShell, Badge, StatRow } from '@/components/ui';
import { SupabaseConnectionPanel } from '@/components/supabase-connection-panel';
import { UserManagementPanel } from '@/components/user-management-panel';
import { AdminResetPanel } from '@/components/admin-reset-panel';
import { CompanyLogoPanel } from '@/components/company-logo-panel';
import { DashboardLayoutPanel } from '@/components/dashboard-layout-panel';
import { SettingsSection } from '@/components/settings-section';
import { getCurrentAppUser, canAccessSettings, canManageDashboardLayout } from '@/lib/current-user';

export default async function SettingsPage() {
  const currentUser = await getCurrentAppUser();
  if (!canAccessSettings(currentUser?.role)) {
    redirect('/dashboard');
  }
  const canReset = currentUser?.role === 'Admin';
  const canManageLayout = canManageDashboardLayout(currentUser?.role);

  const envStatus: Array<[string, boolean]> = [
    ['NEXT_PUBLIC_SUPABASE_URL', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ['SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)],
  ];

  return (
    <PageShell title="Settings" subtitle="Branding configuration, environment checks, role notes, and user profiles.">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        {canManageLayout ? (
          <SettingsSection
            icon="dashboard"
            title="Dashboard Layout"
            description="Show or hide dashboard visuals — reversible anytime."
            defaultOpen
          >
            <DashboardLayoutPanel />
          </SettingsSection>
        ) : null}

        <SettingsSection
          icon="branding"
          title="Company Branding"
          description="Logo, banner, name, and subtext shown across the app."
        >
          <CompanyLogoPanel />
        </SettingsSection>

        <SettingsSection
          icon="users"
          title="User Management"
          description="Create users and assign role-based permissions."
        >
          <UserManagementPanel />
        </SettingsSection>

        <SettingsSection
          icon="system"
          title="System Operations"
          description="Connect Supabase without relying only on env files."
        >
          <SupabaseConnectionPanel />
        </SettingsSection>

        <SettingsSection
          icon="danger"
          title="Danger Zone"
          description="Back up, wipe, or reset project data. Use with care."
          tone="danger"
        >
          <AdminResetPanel canReset={canReset} />
        </SettingsSection>

        <SettingsSection
          icon="env"
          title="Environment Variables"
          description="Runtime configuration detected on the server."
        >
          <div className="space-y-1">
            {envStatus.map(([name, enabled]) => (
              <StatRow key={name} label={name} value={enabled ? 'Configured' : 'Missing'} />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          icon="roles"
          title="Role Permissions"
          description="Access tiers and the recommended enforcement model."
        >
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Admin</Badge>
            <Badge tone="warning">Cost Controller</Badge>
            <Badge tone="success">Project Manager</Badge>
            <Badge>Viewer</Badge>
          </div>
          <p className="mt-4 text-sm text-muted">
            Recommended: enforce row-level access in Supabase via `users_profile` and project-scoped policies.
          </p>
        </SettingsSection>
      </div>
    </PageShell>
  );
}
