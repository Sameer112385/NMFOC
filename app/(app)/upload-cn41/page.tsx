import { PageShell } from '@/components/ui';
import { Cn41UploadForm } from '@/components/cn41-upload-form';
import { getProjects } from '@/lib/data';
import { requireRouteAccess } from '@/lib/current-user';

export default async function UploadCn41Page() {
  await requireRouteAccess('/upload-cn41');
  const projects = await getProjects();

  return (
    <PageShell
      title="Financial Sources"
      subtitle="Upload CN41 planned cost, GR55 actual cost, or Sales Order revenue files. The app recalculates the Cost-to-Cost revenue outputs after each import."
    >
      <Cn41UploadForm projects={projects.map((project) => ({ id: project.id, project_name: project.project_name }))} />
    </PageShell>
  );
}
