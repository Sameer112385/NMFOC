import { PageShell } from '@/components/ui';
import { PMUpdateForm } from '@/components/pm-update-form';
import { PMUpdatesTable } from '@/components/pm-updates-table';
import { getDailyUpdates, getProjectManpowerRates, getProjectMaterialMaster, getProjects, getProjectSubcontracts, getRevenueGeneratingRows, getSalesOrderRevenueRows } from '@/lib/data';
import { getCurrentAppUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function PMDailyUpdatesPage() {
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
        projects={projects.map((project) => ({ id: project.id, project_name: project.project_name }))}
        revenueWbs={revenueWbsOptions}
        manpowerRates={manpowerRates}
        materialMasters={materialMasters}
        projectSubcontracts={projectSubcontracts}
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
