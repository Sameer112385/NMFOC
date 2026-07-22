import { PageShell } from '@/components/ui';
import { PMUpdateForm } from '@/components/pm-update-form';
import { PMUpdatesTable } from '@/components/pm-updates-table';
import { getDailyUpdates, getProjectManpowerRates, getProjectMaterialMaster, getProjects, getProjectSubcontracts, getRevenueGeneratingRows, getSalesOrderRevenueRows } from '@/lib/data';
import { getCurrentAppUser, requireRouteAccess, canSubmitPmUpdates } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function PMDailyUpdatesPage() {
  await requireRouteAccess('/pm-daily-updates');
  const [projects, revenueWbs, salesOrderRows, updates, manpowerRates, materialMasters, projectSubcontracts] = await Promise.all([
    getProjects(),
    getRevenueGeneratingRows(),
    getSalesOrderRevenueRows(),
    getDailyUpdates(),
    getProjectManpowerRates(),
    getProjectMaterialMaster(),
    getProjectSubcontracts(),
  ]);
  const currentUser = await getCurrentAppUser();
  const submittedBy = currentUser?.fullName || currentUser?.email || '';
  const accessibleProjects = projects.filter((p) => canSubmitPmUpdates(currentUser, p));
  const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));
  const revenueWbsOptions = mergeRevenueWbsOptions(
    revenueWbs.map((row) => ({
      id: row.id ?? row.wbs_code,
      project_id: row.project_id,
      wbs_code: row.wbs_code,
      wbs_description: row.wbs_description,
    })),
    salesOrderRows.map((row) => ({
      id: row.wbs_code,
      project_id: row.project_id,
      wbs_code: row.wbs_code,
      wbs_description: row.wbs_description ?? '',
    })),
  );
  const projectNameById = new Map(projects.map((project) => [project.id, project.project_name]));
  const wbsById = new Map(revenueWbsOptions.map((row) => [row.id, row]));

  return (
    <PageShell title="PM Daily Updates" subtitle="Project Managers can submit daily progress and pending cost for Level 03 revenue WBS.">
      <PMUpdateForm
        projects={accessibleProjects.map((project) => ({ id: project.id, project_name: project.project_name }))}
        revenueWbs={revenueWbsOptions.filter((r) => accessibleProjectIds.has(r.project_id))}
        manpowerRates={manpowerRates.filter((r) => accessibleProjectIds.has(r.project_id))}
        materialMasters={materialMasters.filter((r) => accessibleProjectIds.has(r.project_id))}
        projectSubcontracts={projectSubcontracts.filter((r) => accessibleProjectIds.has(r.project_id))}
        submittedBy={submittedBy}
      />
      <PMUpdatesTable
        updates={updates}
        projectNameById={Object.fromEntries(projectNameById)}
        wbsCodeById={Object.fromEntries(Array.from(wbsById.entries()).map(([key, value]) => [key, value.wbs_code]))}
      />
    </PageShell>
  );
}

function mergeRevenueWbsOptions<T extends { id: string; project_id: string; wbs_code: string; wbs_description: string }>(
  primary: T[],
  fallback: T[],
) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((row) => {
    const key = `${row.project_id}:${row.wbs_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
    if (!row.project_id || !row.wbs_code || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
