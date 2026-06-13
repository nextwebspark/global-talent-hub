import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useDashboardKeyboard } from '@/features/dashboard/hooks/useDashboardKeyboard';
import { useRightPanelResize } from '@/features/dashboard/hooks/useRightPanelResize';
import { useDashboardProjectPersist } from '@/features/dashboard/hooks/useDashboardProjectPersist';
import { useCompanies, useLoadSearchResults, useEnrichmentMatch, EnrichmentMatchResult } from '@/lib/api';
import { transformAPICompany, transformAPIExecutive } from '@/lib/store';
import Sidebar, { type ViewMode } from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import CompanyList from '@/features/dashboard/components/CompanyList';
import RightPanel from '@/features/dashboard/panels/RightPanel';
import MapComponent from '@/features/dashboard/components/map/Map';
import DataTable from '@/features/dashboard/components/DataTable';
import AnalyticsView from '@/features/dashboard/views/AnalyticsView';
import ImportModal from '@/features/dashboard/components/ImportModal';
import ProjectsPanel from '@/features/projects/ProjectsPanel';
import MatchReviewPanel from '@/features/dashboard/panels/MatchReviewPanel';
import ClockworkProjectSelector from '@/features/dashboard/panels/ClockworkProjectSelector';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { currentProject, setProject, selectedCompanyId, selectedExecutiveId, companies, executives, selectCompany, selectExecutive, setCompanies, setExecutives, loadFromAPI, dashboardView: activeView, setDashboardView, setCommandPaletteOpen } = useAppStore();
  const { isLoading, refetch: refetchCompanies } = useCompanies();
  const loadSearchResults = useLoadSearchResults();

  const mapViewStateRef = useRef<{ center: [number, number]; zoom: number; hasRestored: boolean }>({ center: [0, 20], zoom: 1.5, hasRestored: false });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalMode, setImportModalMode] = useState<'import' | 'add'>('import');
  const { rightPanelWidth, isResizingRight, setIsResizingRight } = useRightPanelResize();
  const [isEnriching, setIsEnriching] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();

  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const [matchReviewData, setMatchReviewData] = useState<EnrichmentMatchResult | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const enrichmentMatch = useEnrichmentMatch();

  const setActiveView = useCallback((view: ViewMode) => {
    if (view !== 'map') {
      selectCompany(null);
      selectExecutive(null);
    }
    setDashboardView(view);
  }, [selectCompany, selectExecutive, setDashboardView]);

  useDashboardKeyboard(setActiveView);
  useDashboardProjectPersist();

  useEffect(() => {
    // Allow Playwright to pre-seed state via window.__E2E_SEED__ in DEV
    if (!currentProject && import.meta.env.DEV && (window as any).__E2E_SEED__?.currentProject) {
      useAppStore.setState((window as any).__E2E_SEED__);
      return;
    }
    if (!currentProject) setLocation('/');
  }, [currentProject, setLocation]);

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
      const sectorMsg = result.enrichment.sectorsInferred ? `, ${result.enrichment.sectorsInferred} sectors inferred` : '';
      toast.success(`Enriched ${result.enrichment.companiesProcessed} companies${sectorMsg}`);
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
        onHome={() => setLocation('/')}
        onProjects={() => setShowProjectsPanel(prev => !prev)}
        isProjectsOpen={showProjectsPanel}
        projectOpen={!!currentProject}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeView={activeView}
          onCommandPalette={() => setCommandPaletteOpen(true)}
          onExport={handleExport}
          onImport={() => { setImportModalMode('import'); setShowImportModal(true); }}
          onEnrichAll={handleEnrichAll}
          onAddCompany={() => { setImportModalMode('add'); setShowImportModal(true); }}
          onHome={() => setLocation('/')}
          isEnriching={isEnriching}
          onMobileNav={() => setMobileNavOpen(true)}
        />

        <div className="flex-1 flex min-h-0 relative">
          {activeView === 'map' && (
            <div className="flex-1 relative">
              <MapComponent
                initialCenter={mapViewStateRef.current.center}
                initialZoom={mapViewStateRef.current.zoom}
                restoredPosition={mapViewStateRef.current.hasRestored}
                onViewChange={(center, zoom) => { mapViewStateRef.current = { center, zoom, hasRestored: true }; }}
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
              <AnalyticsView searchId={currentProject?.id} />
            </div>
          )}

          {hasSelection && activeView === 'map' && !isMobile && (
            <>
              <div
                className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0 z-30 hidden md:block"
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

      {/* Mobile: selection detail as a bottom sheet */}
      <Sheet
        open={isMobile && hasSelection && activeView === 'map'}
        onOpenChange={(open) => { if (!open) selectCompany(null); }}
      >
        <SheetContent side="bottom" className="h-[85vh] p-0">
          <SheetTitle className="sr-only">Selection details</SheetTitle>
          <div className="h-full overflow-hidden">
            <RightPanel width={typeof window !== 'undefined' ? window.innerWidth : 384} isOpen={true} onToggle={() => selectCompany(null)} />
          </div>
        </SheetContent>
      </Sheet>

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
