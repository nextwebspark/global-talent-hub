import { useState } from 'react';
import { useSearchHistory } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, Clock, X, Loader2, FolderOpen, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectsPanelProps {
  onClose: () => void;
}

export default function ProjectsPanel({ onClose }: ProjectsPanelProps) {
  const { data: history, isLoading } = useSearchHistory();
  const { currentProject, setProject, loadFromAPI } = useAppStore();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLoadProject = async (item: { id: number; query: string; createdAt: string; companyCount: number }) => {
    if (String(item.id) === currentProject?.id) {
      onClose();
      return;
    }

    try {
      toast.loading('Loading project...', { id: 'load-project' });
      const response = await fetch(`/api/search-history/${item.id}/load`);
      if (!response.ok) throw new Error('Failed to load project');
      const data = await response.json();
      toast.dismiss('load-project');

      if (!data.results || data.results.length === 0) {
        toast.error('No results found for this project.');
        return;
      }

      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt),
      });
      loadFromAPI(data.results);
      toast.success(`Loaded ${data.results.length} companies`);
      onClose();
    } catch {
      toast.dismiss('load-project');
      toast.error('Failed to load project');
    }
  };

  const handleDeleteProject = async (id: number) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/search-queries/${id}/results`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');

      queryClient.invalidateQueries({ queryKey: ['search-history'] });

      if (String(id) === currentProject?.id) {
        loadFromAPI([]);
        setLocation('/');
        onClose();
      }

      toast.success('Project deleted');
      setConfirmDeleteId(null);
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="h-full bg-background border-r border-border flex flex-col"
      style={{ width: 280 }}
      data-testid="projects-panel"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Projects</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          data-testid="button-close-projects"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1" data-testid="projects-loading">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !history || history.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground px-4 text-center" data-testid="projects-empty">
          <FolderOpen className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No projects yet</p>
          <p className="text-xs mt-1">Run a search or import data to create your first project</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-1.5">
            {history.map((item) => {
              const isActive = String(item.id) === currentProject?.id;
              const isConfirming = confirmDeleteId === item.id;

              if (isConfirming) {
                return (
                  <div
                    key={item.id}
                    className="w-full px-3 py-2.5 rounded-md mb-0.5 border border-destructive/30 bg-destructive/5"
                    data-testid={`project-delete-confirm-${item.id}`}
                  >
                    <p className="text-xs text-destructive font-medium mb-2">
                      Delete this project? All companies and executives will be permanently removed.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProject(item.id)}
                        disabled={isDeleting}
                        className="flex-1 text-xs px-2 py-1.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                        data-testid={`button-confirm-delete-${item.id}`}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        className="flex-1 text-xs px-2 py-1.5 rounded border border-border hover:bg-muted transition-colors"
                        data-testid={`button-cancel-delete-${item.id}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors group relative ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-muted border border-transparent'
                  }`}
                  data-testid={`project-item-${item.id}`}
                >
                  <button
                    onClick={() => handleLoadProject(item)}
                    className="w-full text-left"
                    data-testid={`project-load-${item.id}`}
                  >
                    <p className={`text-sm font-medium truncate pr-6 ${isActive ? 'text-primary' : ''}`}>
                      {item.query}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {item.companyCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(item.id);
                    }}
                    className="absolute top-2.5 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all text-muted-foreground"
                    title="Delete project"
                    data-testid={`button-delete-project-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
