import { useLocation } from 'wouter';
import { FolderOpen, Building2, Clock, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useSearchHistory, type SearchHistoryItem } from '@/lib/api';
import { useLoadProject, useResumeDraft } from '@/lib/useLoadProject';
import ProjectStatusChip from '@/components/panels/ProjectStatusChip';
import { formatDistanceToNow } from 'date-fns';

export function RecentProjects() {
  const [, setLocation] = useLocation();
  const { data: history, isLoading } = useSearchHistory();
  const loadProject = useLoadProject();
  const resumeDraft = useResumeDraft();

  const projects = history || [];

  if (isLoading) {
    return (
      <div className="w-full mb-7" data-testid="recent-projects-loading">
        <div className="h-3 w-28 bg-muted rounded mb-2.5 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-xl border border-border bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (projects.length === 0) return null;

  const recent = projects.slice(0, 3);

  const open = async (item: SearchHistoryItem) => {
    if (item.status === 'draft') {
      const ok = await resumeDraft(item);
      if (ok) setLocation(`/universe/${item.id}`);
      return;
    }
    const ok = await loadProject(item);
    if (ok) setLocation('/dashboard');
  };

  return (
    <div className="w-full mb-7">
      <div className="flex items-center justify-between mb-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <FolderOpen className="w-3 h-3" />Recent projects
        </span>
        <button
          onClick={() => setLocation('/projects')}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-see-all-projects"
        >
          See all {projects.length} <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {recent.map(p => {
          const isDraft = p.status === 'draft';
          return (
            <button
              key={p.id}
              onClick={() => open(p)}
              className={`text-left flex flex-col gap-2 p-3 rounded-xl border bg-card transition-colors group ${
                isDraft
                  ? 'border-amber-400/45 hover:border-amber-400/70 bg-amber-50/40 dark:bg-amber-900/10'
                  : 'border-border hover:border-primary/40 hover:shadow-sm'
              }`}
              data-testid={`recent-project-${p.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold leading-snug line-clamp-2">{p.query}</span>
                <span className="text-muted-foreground group-hover:text-primary shrink-0">
                  {isDraft ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{p.companyCount || 0}</span>
                <ProjectStatusChip status={p.status} />
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatDistanceToNow(new Date(p.updatedAt || p.createdAt), { addSuffix: true })}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
