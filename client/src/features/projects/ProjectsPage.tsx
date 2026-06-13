import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, Plus, Trash2, CheckSquare, Square, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useSearchHistory, type SearchHistoryItem } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { useLoadProject, useResumeDraft } from '@/lib/useLoadProject';
import Sidebar from '@/components/layout/Sidebar';
import ProjectsPanel from '@/features/projects/ProjectsPanel';
import ProjectStatusChip from '@/features/projects/ProjectStatusChip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';

type Tab = 'all' | 'active' | 'drafts';
type SortKey = 'name' | 'companies' | 'execs' | 'updated';

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useSearchHistory();
  const { currentProject, reset } = useAppStore();
  const loadProject = useLoadProject();
  const resumeDraft = useResumeDraft();

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updated', dir: 'desc' });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);

  const items = history || [];
  const counts = {
    all: items.length,
    active: items.filter(p => p.status !== 'draft').length,
    drafts: items.filter(p => p.status === 'draft').length,
  };

  const filtered = items
    .filter(p => tab === 'all' || (tab === 'drafts' ? p.status === 'draft' : p.status !== 'draft'))
    .filter(p => p.query.toLowerCase().includes(q.toLowerCase()));

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (sort.key === 'name') { av = a.query.toLowerCase(); bv = b.query.toLowerCase(); }
    else if (sort.key === 'companies') { av = a.companyCount || 0; bv = b.companyCount || 0; }
    else if (sort.key === 'execs') { av = a.resultCount || a.selectedCount || 0; bv = b.resultCount || b.selectedCount || 0; }
    else { av = new Date(a.updatedAt || a.createdAt).getTime(); bv = new Date(b.updatedAt || b.createdAt).getTime(); }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const allSel = sorted.length > 0 && sorted.every(p => sel.has(p.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(sorted.map(p => p.id)));
  const toggleOne = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleOpen = async (item: SearchHistoryItem) => {
    if (item.status === 'draft') {
      const ok = await resumeDraft(item);
      if (ok) setLocation(`/universe/${item.id}`);
      return;
    }
    const ok = await loadProject(item);
    if (ok) setLocation('/dashboard');
  };

  const deleteIds = async (ids: number[]) => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/search-queries/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error('Failed to delete');
      queryClient.invalidateQueries({ queryKey: ['search-history'] });
      if (currentProject && ids.includes(Number(currentProject.id))) reset();
      toast.success(`Deleted ${ids.length} project${ids.length > 1 ? 's' : ''}`);
      setSel(new Set());
    } catch {
      toast.error('Failed to delete projects');
    } finally {
      setIsDeleting(false);
      setConfirmIds(null);
    }
  };

  const SortH = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <button
      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors ${right ? 'justify-end' : ''}`}
      onClick={() => toggleSort(k)}
    >
      {children}
      {sort.key === k && (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
    </button>
  );

  const cols = 'grid grid-cols-[38px_2fr_96px_110px_110px_130px_40px] items-center gap-2 px-3.5';

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden">
      <Sidebar
        activeView="map"
        onViewChange={() => {}}
        onHome={() => setLocation('/')}
        onProjects={() => setShowProjectsPanel(prev => !prev)}
        isProjectsOpen={showProjectsPanel}
        projectOpen={false}
      />

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} onProjectLoaded={() => setLocation('/dashboard')} offsetTop={8} />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1040px] mx-auto px-7 pt-8 pb-12">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
              <h1 className="text-2xl font-bold mt-0.5">Projects</h1>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search projects…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="pl-8 h-9 w-56"
                  data-testid="input-projects-search"
                />
              </div>
              <Button onClick={() => setLocation('/')} className="gap-1.5" data-testid="button-new-search">
                <Plus className="w-4 h-4" />New search
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-border mb-4">
            {(['all', 'active', 'drafts'] as Tab[]).map(id => (
              <button
                key={id}
                onClick={() => { setTab(id); setSel(new Set()); }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`tab-${id}`}
              >
                {id === 'all' ? 'All' : id === 'active' ? 'Active' : 'Drafts'}
                <span className={`text-[10px] font-semibold px-1.5 rounded-full ${tab === id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                  {counts[id]}
                </span>
              </button>
            ))}
            {sel.size > 0 && (
              <button
                onClick={() => setConfirmIds([...sel])}
                disabled={isDeleting}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3.5 h-3.5" />Delete {sel.size}
              </button>
            )}
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className={`${cols} h-9 bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}>
              <button onClick={toggleAll} data-testid="checkbox-select-all">
                {allSel ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
              </button>
              <SortH k="name">Project</SortH>
              <span>Status</span>
              <SortH k="companies" right>Companies</SortH>
              <SortH k="execs" right>Executives</SortH>
              <SortH k="updated" right>Updated</SortH>
              <span />
            </div>

            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className={`${cols} h-[52px] border-b border-border/60 last:border-b-0`}
                data-testid="project-row-skeleton"
              >
                <Skeleton className="w-4 h-4" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-4 w-8 justify-self-end" />
                <Skeleton className="h-4 w-8 justify-self-end" />
                <Skeleton className="h-4 w-16 justify-self-end" />
                <Skeleton className="w-4 h-4 justify-self-center" />
              </div>
            ))}

            {!isLoading && sorted.map(p => {
              const isOpen = String(p.id) === currentProject?.id;
              const isDraft = p.status === 'draft';
              return (
                <div
                  key={p.id}
                  onClick={() => handleOpen(p)}
                  className={`${cols} h-[52px] border-b border-border/60 last:border-b-0 transition-colors cursor-pointer ${sel.has(p.id) ? 'bg-primary/5' : 'hover:bg-muted'}`}
                  data-testid={`project-row-${p.id}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleOne(p.id); }}
                    data-testid={`checkbox-project-${p.id}`}
                  >
                    {sel.has(p.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <span
                    className="inline-flex items-center gap-2 min-w-0 truncate text-sm font-medium"
                    data-testid={`project-open-${p.id}`}
                  >
                    <span className="truncate">{p.query}</span>
                    {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Currently open" />}
                  </span>
                  <span><ProjectStatusChip status={isDraft ? 'draft' : 'active'} /></span>
                  <span className="text-right font-mono text-sm">{p.companyCount || 0}</span>
                  <span className="text-right font-mono text-sm">{isDraft ? `${p.selectedCount || 0} sel.` : (p.resultCount || 0)}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.updatedAt || p.createdAt), { addSuffix: true })}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmIds([p.id]); }}
                    disabled={isDeleting}
                    className="justify-self-center p-1 text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-50"
                    data-testid={`button-delete-${p.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {!isLoading && sorted.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-sm" data-testid="projects-empty">
                <Search className="w-5 h-5" />
                <span>No projects match “{q || tab}”.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmIds !== null} onOpenChange={(o) => { if (!o) setConfirmIds(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmIds && confirmIds.length > 1 ? `${confirmIds.length} projects` : 'this project'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {confirmIds && confirmIds.length > 1 ? 'these projects' : 'this project'} and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => { e.preventDefault(); if (confirmIds) deleteIds(confirmIds); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
