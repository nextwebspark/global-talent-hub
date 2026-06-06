import { useEffect, useRef } from 'react';
import { useSearchHistory, type SearchHistoryItem } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Building2, Clock, Loader2, FolderOpen, CheckSquare, LayoutGrid, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import ProjectStatusChip from './ProjectStatusChip';
import { useResumeDraft } from '@/lib/useLoadProject';

interface ProjectsPanelProps {
  onClose: () => void;
  onProjectLoaded?: () => void;
  offsetTop?: number;
}

export default function ProjectsPanel({ onClose, onProjectLoaded, offsetTop = 56 }: ProjectsPanelProps) {
  const { data: history, isLoading } = useSearchHistory();
  const { currentProject, setProject, loadFromAPI } = useAppStore();
  const [, setLocation] = useLocation();
  const resumeDraft = useResumeDraft();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const sidebarBtn = document.querySelector('[data-testid="sidebar-projects"]');
        if (sidebarBtn && sidebarBtn.contains(e.target as Node)) return;
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleLoadProject = async (item: SearchHistoryItem) => {
    if (String(item.id) === currentProject?.id) {
      onClose();
      return;
    }

    if (item.status === 'draft') {
      const ok = await resumeDraft(item);
      onClose();
      if (ok) setLocation(`/universe/${item.id}`);
      return;
    }

    try {
      toast.loading('Loading project...', { id: 'load-project' });
      const response = await fetch(`/api/search-history/${item.id}/load`);
      if (!response.ok) throw new Error('Failed to load project');
      const data = await response.json();
      toast.dismiss('load-project');

      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt),
      });

      const results = data.results || [];
      loadFromAPI(results, data.satelliteHierarchies || {}, data.tableConfig || null, data.mapPositions || {}, data.satelliteOrders || {});
      if (results.length === 0) {
        toast.info('This project has no companies yet.');
      } else {
        toast.success(`Loaded ${results.length} companies`);
      }
      onClose();
      onProjectLoaded?.();
    } catch {
      toast.dismiss('load-project');
      toast.error('Failed to load project');
    }
  };

  const byLatest = (a: SearchHistoryItem, b: SearchHistoryItem) =>
    new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  const drafts = (history || []).filter(h => h.status === 'draft').sort(byLatest).slice(0, 3);
  const recents = (history || []).filter(h => h.status !== 'draft').sort(byLatest).slice(0, 3);

  const renderItem = (item: SearchHistoryItem) => {
    const isActive = String(item.id) === currentProject?.id;
    const isDraft = item.status === 'draft';

    return (
      <div
        key={item.id}
        className={`mx-1 flex items-center rounded-md mb-0.5 cursor-pointer transition-colors ${
          isActive ? 'bg-primary/10' : 'hover:bg-muted'
        }`}
        data-testid={`project-item-${item.id}`}
      >
        <button
          onClick={() => handleLoadProject(item)}
          className="flex-1 text-left py-2 min-w-0 px-3"
          data-testid={`project-load-${item.id}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
              {item.query}
            </p>
            {isDraft && <ProjectStatusChip status="draft" />}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
            {isDraft ? (
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {item.selectedCount || 0} selected
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {item.companyCount || 0}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(item.updatedAt || item.createdAt), { addSuffix: true })}
            </span>
          </div>
        </button>
      </div>
    );
  };

  const groupHeader = (label: string) => (
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">{label}</div>
  );

  return (
    <div
      ref={panelRef}
      className="absolute left-12 top-0 z-50 w-72 max-h-[80vh] bg-popover border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
      style={{ marginTop: offsetTop, marginLeft: 4 }}
      data-testid="projects-panel"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1">Projects</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8" data-testid="projects-loading">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !history || history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground px-4 text-center" data-testid="projects-empty">
          <FolderOpen className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-xs">No projects yet</p>
        </div>
      ) : (
        <>
          <div className="overflow-y-auto flex-1 py-1">
            {drafts.length > 0 && groupHeader('Drafts')}
            {drafts.map(renderItem)}
            {recents.length > 0 && groupHeader('Recent')}
            {recents.map(renderItem)}
          </div>
          <button
            onClick={() => { onClose(); setLocation('/projects'); }}
            className="flex items-center gap-2 w-full px-3 py-2.5 border-t border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            data-testid="button-see-all-projects"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            See all projects ({history.length})
            <ArrowRight className="w-3.5 h-3.5 ml-auto" />
          </button>
        </>
      )}
    </div>
  );
}
