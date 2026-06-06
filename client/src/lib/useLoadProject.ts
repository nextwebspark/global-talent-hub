import { useAppStore } from '@/lib/store';
import type { StreamCompany } from '@/lib/store';
import type { SearchHistoryItem } from '@/lib/api';
import { toast } from 'sonner';

type LoadedCompany = Record<string, any>;

function toStreamCompany(c: LoadedCompany): StreamCompany {
  const relevanceType = (['Direct', 'Adjacent', 'AI Inferred'].includes(c.relevanceType)
    ? c.relevanceType
    : 'Direct') as StreamCompany['relevanceType'];
  return {
    id: Number(c.id),
    name: String(c.name || 'Unknown'),
    sector: c.sector ?? null,
    country: c.country ?? null,
    geography: c.region ?? null,
    revenue: c.revenue != null ? String(c.revenue) : null,
    employees: c.employees != null ? Number(c.employees) : null,
    website: c.website ?? null,
    summary: c.summary ?? null,
    latitude: c.latitude != null ? String(c.latitude) : null,
    longitude: c.longitude != null ? String(c.longitude) : null,
    relevanceType,
    relevanceRationale: c.relevanceReason || '',
    confidenceScore: Number(c.confidenceScore ?? 1),
    isUserAccepted: true,
    isUserRejected: false,
    executives: (c.executives || []).map((e: any) => ({ name: String(e.name || ''), title: String(e.title || '') })),
    accepted: true,
    rejected: false,
  };
}

/** Rehydrates a draft project into the Landing universe review. Repopulates the
 *  search-session store (companies pre-accepted, original sessionId) so UniverseView
 *  renders and a subsequent "Confirm universe" passes /add-to-project ownership. */
export function useResumeDraft() {
  const { setSearchCompanies, setSearchSessionId, setSearchQueryId, setSearchPhase, setProject } = useAppStore();

  return async function resumeDraft(item: SearchHistoryItem): Promise<boolean> {
    try {
      toast.loading('Resuming draft...', { id: 'resume-draft' });
      const response = await fetch(`/api/search-history/${item.id}/load`);
      if (!response.ok) throw new Error('Failed to load draft');
      const data = await response.json();
      toast.dismiss('resume-draft');

      const companies = (data.results || []).map(toStreamCompany);
      setSearchCompanies(companies);
      setSearchSessionId(data.sessionId || null);
      setSearchQueryId(item.id);
      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt),
        status: item.status,
        selectedCount: item.selectedCount,
      });
      setSearchPhase('complete');
      return true;
    } catch {
      toast.dismiss('resume-draft');
      toast.error('Failed to resume draft');
      return false;
    }
  };
}

/** Rehydrates a draft into the universe by id alone (no SearchHistoryItem). Used on
 *  refresh / deep-link of /universe/:id, where only the route param is available. */
export function useResumeDraftById() {
  const { setSearchCompanies, setSearchSessionId, setSearchQueryId, setSearchPhase, setProject } = useAppStore();

  return async function resumeDraftById(id: number): Promise<boolean> {
    try {
      const response = await fetch(`/api/search-history/${id}/load`);
      if (!response.ok) throw new Error('Failed to load draft');
      const data = await response.json();

      const companies = (data.results || []).map(toStreamCompany);
      setSearchCompanies(companies);
      setSearchSessionId(data.sessionId || null);
      setSearchQueryId(id);
      setProject({
        id: String(id),
        name: data.query || 'Draft',
        search_string: data.query || '',
        created_at: new Date(),
        status: data.status,
      });
      setSearchPhase('complete');
      return true;
    } catch {
      toast.error('Failed to resume draft');
      return false;
    }
  };
}

/** Loads a project (search query) into the store. Shared by the projects popover,
 *  the full Projects screen, and the Landing recent-projects grid. */
export function useLoadProject() {
  const { currentProject, setProject, loadFromAPI } = useAppStore();

  return async function loadProject(item: SearchHistoryItem): Promise<boolean> {
    if (String(item.id) === currentProject?.id) return true;
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
        status: item.status,
        selectedCount: item.selectedCount,
      });

      const results = data.results || [];
      loadFromAPI(results, data.satelliteHierarchies || {}, data.tableConfig || null, data.mapPositions || {}, data.satelliteOrders || {});
      if (results.length === 0) {
        toast.info('This project has no companies yet.');
      } else {
        toast.success(`Loaded ${results.length} companies`);
      }
      return true;
    } catch {
      toast.dismiss('load-project');
      toast.error('Failed to load project');
      return false;
    }
  };
}
