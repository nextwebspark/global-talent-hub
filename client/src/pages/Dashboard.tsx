import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useLoadSearchResults, useEnrichmentMatch, EnrichmentMatchResult } from '@/lib/api';
import { transformAPICompany, transformAPIExecutive } from '@/lib/store';
import Sidebar, { type ViewMode } from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import CommandPalette from '@/components/layout/CommandPalette';
import CompanyList from '@/components/layout/CompanyList';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import DataTable from '@/components/DataTable';
import DashboardView from '@/components/DashboardView';
import ImportModal from '@/components/layout/ImportModal';
import ProjectsPanel from '@/components/panels/ProjectsPanel';
import MatchReviewPanel from '@/components/panels/MatchReviewPanel';
import ClockworkProjectSelector from '@/components/panels/ClockworkProjectSelector';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentProject, setProject, selectedCompanyId, selectedExecutiveId, companies, executives, selectCompany, selectExecutive, setCompanies, setExecutives, loadFromAPI } = useAppStore();
  const { isLoading, refetch: refetchCompanies } = useCompanies();
  const loadSearchResults = useLoadSearchResults();

  const [activeView, setActiveViewRaw] = useState<ViewMode>('map');
  const mapViewStateRef = useRef<{ center: [number, number]; zoom: number }>({ center: [0, 20], zoom: 1.5 });
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalMode, setImportModalMode] = useState<'import' | 'add'>('import');
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const [matchReviewData, setMatchReviewData] = useState<EnrichmentMatchResult | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const enrichmentMatch = useEnrichmentMatch();

  const setActiveView = (view: ViewMode) => {
    if (view !== 'map') {
      selectCompany(null);
      selectExecutive(null);
    }
    setActiveViewRaw(view);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === '1' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('map');
      }
      if (e.key === '2' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('table');
      }
      if (e.key === '3' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('dashboard');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isResizingRight) {
      const onMove = (e: MouseEvent) => {
        const w = Math.max(320, Math.min(700, window.innerWidth - e.clientX));
        setRightPanelWidth(w);
      };
      const onUp = () => {
        setIsResizingRight(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }
  }, [isResizingRight]);

  useEffect(() => {
    if (!currentProject) setLocation('/');
  }, [currentProject, setLocation]);

  const hierarchySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHierarchiesRef = useRef<Record<string, Record<string, string>>>({});
  useEffect(() => {
    prevHierarchiesRef.current = useAppStore.getState().satelliteHierarchies;
    const unsub = useAppStore.subscribe((state) => {
      const hierarchies = state.satelliteHierarchies;
      if (hierarchies === prevHierarchiesRef.current) return;
      prevHierarchiesRef.current = hierarchies;
      const projectId = state.currentProject?.id;
      if (!projectId) return;
      if (hierarchySaveTimerRef.current) clearTimeout(hierarchySaveTimerRef.current);
      hierarchySaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/satellite-hierarchies`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hierarchies }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (hierarchySaveTimerRef.current) clearTimeout(hierarchySaveTimerRef.current);
    };
  }, []);

  const ordersSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOrdersRef = useRef<Record<string, string[]>>({});
  useEffect(() => {
    prevOrdersRef.current = useAppStore.getState().satelliteOrders;
    const unsub = useAppStore.subscribe((state) => {
      const orders = state.satelliteOrders;
      if (orders === prevOrdersRef.current) return;
      prevOrdersRef.current = orders;
      const projectId = state.currentProject?.id;
      if (!projectId) return;
      if (ordersSaveTimerRef.current) clearTimeout(ordersSaveTimerRef.current);
      ordersSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/satellite-orders`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (ordersSaveTimerRef.current) clearTimeout(ordersSaveTimerRef.current);
    };
  }, []);

  const mapPositionsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMapPositionsRef = useRef<Record<string, any>>({});
  const prevMapPositionsProjectRef = useRef<string | undefined>(useAppStore.getState().currentProject?.id);
  useEffect(() => {
    prevMapPositionsRef.current = useAppStore.getState().mapPositions;
    prevMapPositionsProjectRef.current = useAppStore.getState().currentProject?.id;
    const unsub = useAppStore.subscribe((state) => {
      const projectId = state.currentProject?.id;
      if (projectId !== prevMapPositionsProjectRef.current) {
        if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
        prevMapPositionsProjectRef.current = projectId;
        prevMapPositionsRef.current = state.mapPositions;
        return;
      }
      const positions = state.mapPositions;
      if (positions === prevMapPositionsRef.current) return;
      prevMapPositionsRef.current = positions;
      if (!projectId) return;
      if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
      mapPositionsSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/map-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
    };
  }, []);

  const tableConfigSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTableConfigRef = useRef<Record<string, any> | null>(useAppStore.getState().tableConfig);
  const prevTableConfigProjectRef = useRef<string | undefined>(useAppStore.getState().currentProject?.id);
  useEffect(() => {
    prevTableConfigRef.current = useAppStore.getState().tableConfig;
    prevTableConfigProjectRef.current = useAppStore.getState().currentProject?.id;
    const unsub = useAppStore.subscribe((state) => {
      const config = state.tableConfig;
      const currentPid = state.currentProject?.id;
      if (currentPid !== prevTableConfigProjectRef.current) {
        prevTableConfigProjectRef.current = currentPid;
        prevTableConfigRef.current = config;
        if (tableConfigSaveTimerRef.current) {
          clearTimeout(tableConfigSaveTimerRef.current);
          tableConfigSaveTimerRef.current = null;
        }
        return;
      }
      if (config === prevTableConfigRef.current) return;
      prevTableConfigRef.current = config;
      if (!currentPid || !config) return;
      if (tableConfigSaveTimerRef.current) clearTimeout(tableConfigSaveTimerRef.current);
      tableConfigSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${currentPid}/table-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (tableConfigSaveTimerRef.current) clearTimeout(tableConfigSaveTimerRef.current);
    };
  }, []);

  const tableData = useMemo(() => {
    const data: any[] = [];
    companies.forEach(company => {
      const companyExecs = executives.filter(e => e.company_id === company.id);
      const companyFields = {
        companyId: company.id, companyName: company.name, companyColor: company.color || '#1e3a8a',
        country: company.hq_country || 'Unknown', sector: company.industry || '',
        revenue: company.revenue_usd || 0, employees: company.employees || 0,
      };
      if (companyExecs.length === 0) {
        data.push({
          ...companyFields,
          id: `company-${company.id}`,
          name: '', title: '', notes: '', email: '', phone: '', linkedin: '',
          remunerationNotes: '', availability: '', level: '',
          gender: '', ethnicity: '',
          isCompanyRow: true,
        });
      } else {
        companyExecs.forEach(exec => {
          data.push({
            ...companyFields,
            id: exec.id,
            name: exec.name, title: exec.title, notes: exec.notes || '',
            email: exec.email || '', phone: exec.phone || '', linkedin: exec.linkedin || '',
            remunerationNotes: exec.remunerationNotes || '',
            availability: exec.availability || '', level: exec.level || '',
            gender: exec.gender || '', ethnicity: exec.ethnicity || '',
            isCompanyRow: false, customFields: exec.customFields,
          });
        });
      }
    });
    return data;
  }, [companies, executives]);

  const handleExport = useCallback(() => {
    const exportData = tableData.map(row => {
      const base: Record<string, string> = {
        'Country': row.country || '', 'Company': row.companyName || '', 'Sector': row.sector || '',
        'Revenue': row.revenue ? String(row.revenue) : '', 'Employees': row.employees ? String(row.employees) : '',
        'Executive': row.name || '', 'Title': row.title || '', 'Notes': row.notes || '',
        'Email': row.email || '', 'Phone': row.phone || '', 'LinkedIn': row.linkedin || '',
        'Remuneration': row.remunerationNotes || '',
        'Status': row.availability || '',
        'Level': row.level || '',
        'Gender': row.gender || '',
        'Ethnicity': row.ethnicity || '',
      };
      if (row.customFields) Object.entries(row.customFields).forEach(([k, v]) => { base[k] = v as string || ''; });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Executives');
    const name = currentProject?.search_string?.slice(0, 30) || 'executives';
    XLSX.writeFile(wb, `${name.replace(/[^a-zA-Z0-9]/g, '_')}_export.xlsx`);
    toast.success('Exported to Excel');
  }, [tableData, currentProject]);

  const handleEnrichAll = useCallback(async () => {
    if (!currentProject?.id) { toast.error('No active project'); return; }
    setIsEnriching(true);
    toast.info('Enriching companies...');
    let pollInterval: NodeJS.Timeout | null = null;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/search-results/${currentProject.id}`);
        if (res.ok) { const data = await res.json(); if (data.companies) loadFromAPI(data.companies); }
      } catch {}
    };
    pollInterval = setInterval(refresh, 3000);
    try {
      const response = await fetch(`/api/search/${currentProject.id}/enrich-all`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
      });
      if (pollInterval) clearInterval(pollInterval);
      if (!response.ok) throw new Error('Enrichment failed');
      const result = await response.json();
      await refresh();
      toast.success(`Enriched ${result.enrichment.companiesProcessed} companies`);
    } catch {
      if (pollInterval) clearInterval(pollInterval);
      toast.error('Enrichment failed');
    } finally { setIsEnriching(false); }
  }, [currentProject, loadFromAPI]);

  const handleRowClick = useCallback((row: any) => {
    if (!row.isCompanyRow) {
      selectExecutive(row.id, row.companyId);
    } else {
      selectCompany(row.companyId);
    }
  }, [selectCompany, selectExecutive]);

  const handleStartEnrichment = async () => {
    if (!currentProject?.id) { toast.error('Please run a search first'); return; }
    if (!currentProject.clockworkProjectId) { setShowProjectSelector(true); return; }
    await runEnrichmentWithProject(currentProject.clockworkProjectId);
  };

  const runEnrichmentWithProject = async (clockworkProjectId: string) => {
    if (!currentProject?.id) return;
    setShowMatchReview(true);
    try {
      toast.loading('Analyzing matches...', { id: 'enrichment' });
      const result = await enrichmentMatch.mutateAsync({ searchId: parseInt(currentProject.id), clockworkProjectId });
      toast.dismiss('enrichment');
      setMatchReviewData(result);
    } catch {
      toast.dismiss('enrichment');
      toast.error('Failed to analyze matches');
      setShowMatchReview(false);
    }
  };

  const handleClockworkProjectSelect = async (projectId: string) => {
    if (!currentProject?.id) return;
    try {
      const response = await fetch(`/api/search/${currentProject.id}/clockwork-project`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clockworkProjectId: projectId })
      });
      if (!response.ok) throw new Error('Failed');
      setProject({ ...currentProject, clockworkProjectId: projectId });
      setShowProjectSelector(false);
      toast.success('Clockwork project selected');
      await runEnrichmentWithProject(projectId);
    } catch {
      toast.error('Failed to select Clockwork project');
    }
  };

  const handleRefreshAfterEnrichment = async () => {
    if (currentProject?.id) {
      try {
        const results = await loadSearchResults.mutateAsync(parseInt(currentProject.id));
        const cos = results.companies.map((c: any) => transformAPICompany(c));
        const exs = results.companies.flatMap((c: any) => (c.executives || []).map((e: any) => transformAPIExecutive(e, String(c.id))));
        setCompanies(cos);
        setExecutives(exs);
      } catch {
        refetchCompanies();
      }
    } else {
      refetchCompanies();
    }
  };

  if (!currentProject) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading companies...</p>
        </div>
      </div>
    );
  }

  const hasSelection = !!(selectedCompanyId || selectedExecutiveId);

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden relative">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onCommandPalette={() => setShowCommandPalette(true)}
        onHome={() => setLocation('/')}
        onProjects={() => setShowProjectsPanel(prev => !prev)}
        isProjectsOpen={showProjectsPanel}
      />

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeView={activeView}
          onCommandPalette={() => setShowCommandPalette(true)}
          onExport={handleExport}
          onImport={() => { setImportModalMode('import'); setShowImportModal(true); }}
          onEnrichAll={handleEnrichAll}
          onAddCompany={() => { setImportModalMode('add'); setShowImportModal(true); }}
          onHome={() => setLocation('/')}
          isEnriching={isEnriching}
        />

        <div className="flex-1 flex min-h-0 relative">
          {activeView === 'map' && (
            <div className="flex-1 relative">
              <MapComponent
                initialCenter={mapViewStateRef.current.center}
                initialZoom={mapViewStateRef.current.zoom}
                onViewChange={(center, zoom) => { mapViewStateRef.current = { center, zoom }; }}
              />
              <CompanyList />
            </div>
          )}

          {activeView === 'table' && (
            <div className="flex-1 overflow-auto bg-background p-0">
              <DataTable
                data={tableData}
                selectedCompanyId={selectedCompanyId}
                selectedExecutiveId={selectedExecutiveId}
                onRowClick={handleRowClick}
              />
            </div>
          )}

          {activeView === 'dashboard' && (
            <div className="flex-1 overflow-auto bg-background">
              <DashboardView searchId={currentProject?.id} />
            </div>
          )}

          {hasSelection && activeView === 'map' && (
            <>
              <div
                className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0 z-30"
                onMouseDown={() => setIsResizingRight(true)}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
              <div className="shrink-0 h-full z-20" style={{ width: rightPanelWidth }}>
                <RightPanel
                  width={rightPanelWidth}
                  isOpen={true}
                  onToggle={() => selectCompany(null)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={setActiveView}
        onExport={handleExport}
        onEnrichAll={handleEnrichAll}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        mode={importModalMode}
      />

      {showMatchReview && (
        <MatchReviewPanel
          matchData={matchReviewData}
          isLoading={enrichmentMatch.isPending && !matchReviewData}
          onClose={() => { setShowMatchReview(false); setMatchReviewData(null); }}
          onRefreshData={handleRefreshAfterEnrichment}
        />
      )}

      <ClockworkProjectSelector
        isOpen={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onSelect={handleClockworkProjectSelect}
        currentProjectId={currentProject?.clockworkProjectId}
      />
    </div>
  );
}
