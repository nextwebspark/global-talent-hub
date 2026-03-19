import { useState, useEffect, useRef } from 'react';
import { useSearchHistory } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Building2, Clock, Loader2, FolderOpen, Trash2, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectsPanelProps {
  onClose: () => void;
  onProjectLoaded?: () => void;
  offsetTop?: number;
}

export default function ProjectsPanel({ onClose, onProjectLoaded, offsetTop = 56 }: ProjectsPanelProps) {
  const { data: history, isLoading } = useSearchHistory();
  const { currentProject, setProject, loadFromAPI } = useAppStore();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!history) return;
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(h => h.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const handleLoadProject = async (item: { id: number; query: string; createdAt: string; companyCount: number }) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }

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

      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt),
      });

      const results = data.results || [];
      loadFromAPI(results, data.satelliteHierarchies || {}, data.tableConfig || null, data.mapPositions || {});
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

  const handleDeleteProject = async (id: number) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/search-queries/${id}/results`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');

      queryClient.invalidateQueries({ queryKey: ['search-history'] });

      if (String(id) === currentProject?.id) {
        const { reset } = useAppStore.getState();
        reset();
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const response = await fetch('/api/search-queries/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error('Failed to delete');

      queryClient.invalidateQueries({ queryKey: ['search-history'] });

      if (currentProject && ids.includes(Number(currentProject.id))) {
        const { reset } = useAppStore.getState();
        reset();
        setLocation('/');
        onClose();
      }

      toast.success(`Deleted ${ids.length} project${ids.length > 1 ? 's' : ''}`);
      exitSelectMode();
    } catch {
      toast.error('Failed to delete projects');
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = history && history.length > 0 && selectedIds.size === history.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

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
        {history && history.length > 0 && (
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              selectMode
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            data-testid="button-toggle-select-mode"
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      {selectMode && history && history.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-select-all"
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-primary" />
            ) : someSelected ? (
              <MinusSquare className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="flex-1" />
          {selectedIds.size > 0 && !confirmBulkDelete && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors font-medium"
              data-testid="button-bulk-delete"
            >
              <Trash2 className="w-3 h-3" />
              Delete {selectedIds.size}
            </button>
          )}
          {confirmBulkDelete && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                data-testid="button-confirm-bulk-delete"
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={isDeleting}
                className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors"
                data-testid="button-cancel-bulk-delete"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}

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
        <div className="overflow-y-auto flex-1 py-1">
          {history.map((item) => {
            const isActive = String(item.id) === currentProject?.id;
            const isSelected = selectedIds.has(item.id);
            const isConfirming = confirmDeleteId === item.id;

            if (isConfirming && !selectMode) {
              return (
                <div
                  key={item.id}
                  className="mx-1 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/5 mb-0.5"
                  data-testid={`project-delete-confirm-${item.id}`}
                >
                  <p className="text-xs text-destructive font-medium mb-2">
                    Delete this project and all its data?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteProject(item.id)}
                      disabled={isDeleting}
                      className="flex-1 text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                      data-testid={`button-confirm-delete-${item.id}`}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isDeleting}
                      className="flex-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
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
                className={`mx-1 flex items-center rounded-md mb-0.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/20'
                    : isActive
                      ? 'bg-primary/10'
                      : 'hover:bg-muted'
                }`}
                data-testid={`project-item-${item.id}`}
              >
                {selectMode && (
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className="pl-2.5 pr-0.5 py-2 shrink-0"
                    data-testid={`checkbox-project-${item.id}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => handleLoadProject(item)}
                  className={`flex-1 text-left py-2 min-w-0 ${selectMode ? 'px-1.5' : 'px-3'}`}
                  data-testid={`project-load-${item.id}`}
                >
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                    {item.query}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
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
                {!selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(item.id);
                    }}
                    className="p-1.5 mr-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground/50 shrink-0"
                    title="Delete project"
                    data-testid={`button-delete-project-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
