import { PageShell, Badge } from '@/components/ui';
import { getComments, getProjects, getRevenueRows } from '@/lib/data';
import { CommentForm } from '@/components/comment-form';
import { requireRouteAccess } from '@/lib/current-user';

export default async function CommentsPage() {
  await requireRouteAccess('/comments');
  const projects = await getProjects();
  const revenueRows = await getRevenueRows();
  const comments = await getComments();

  return (
    <PageShell title="Comments" subtitle="Track project notes, review comments, and open discussion on specific WBS codes.">
      <CommentForm
        projects={projects.map((project) => ({ id: project.id, project_name: project.project_name }))}
        revenueWbs={revenueRows.map((row) => ({ code: row.wbs_code }))}
      />
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-text">Comments Feed</h3>
            <p className="text-sm text-muted">Connect this to the comments table and project chat workflow.</p>
          </div>
          <Badge tone="accent">{comments.length} comments</Badge>
        </div>
        <div className="mt-6 space-y-3">
          {comments.slice(0, 6).map((comment) => (
            <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-text">{comment.wbs_code}</div>
                <Badge>{comment.created_by ?? 'Unknown'}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                {comment.comment_text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
