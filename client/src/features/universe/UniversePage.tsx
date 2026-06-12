import { useEffect, useRef, useState } from 'react';
import { useLocation, useRoute, Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/store';
import { useResumeDraftById } from '@/lib/useLoadProject';
import { useSearchStream, type StreamCompany } from '@/features/search/useSearchStream';
import Sidebar from '@/components/layout/Sidebar';
import ProjectsPanel from '@/features/projects/ProjectsPanel';
import { UniverseResults } from './UniverseResults';

export default function UniversePage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/universe/:searchQueryId');
  const routeId = Number(params?.searchQueryId);

  const { setProject, loadFromAPI, currentProject } = useAppStore();
  const resumeDraftById = useResumeDraftById();
  const queryClient = useQueryClient();

  const {
    phase, intent, companies, pendingCompanyNames, activities, isStreaming, searchQueryId,
    stopSearch, acceptCompany, rejectCompany, addManualCompany, reset,
  } = useSearchStream();

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Hydrate from the persisted draft on refresh / deep-link. Skip when a live stream
  // (or a just-completed one) is already populating this same id in the store. The
  // hand-off from Landing sets searchSessionId before the first company arrives, so we
  // key off that — checking only searchCompanies would re-hydrate mid-stream (companies
  // empty while skeletons show) and clobber the live session, breaking "Confirm universe".
  const hydrated = useRef(false);
  useEffect(() => {
    if (Number.isNaN(routeId) || hydrated.current) return;
    const { searchQueryId: storeId, searchSessionId } = useAppStore.getState();
    if (searchSessionId && storeId === routeId) return;
    hydrated.current = true;
    resumeDraftById(routeId);
  }, [routeId, resumeDraftById]);

  // Editing the universe invalidates a prior "saved" state.
  useEffect(() => { setDraftSaved(false); }, [companies]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const saveCompaniesToProject = async (companiesToSave: StreamCompany[]) => {
    const { searchSessionId } = useAppStore.getState();
    if (!searchSessionId) throw new Error('Missing session — cannot save project');
    const draftId = searchQueryId ?? routeId;
    if (Number.isNaN(draftId)) throw new Error('Missing project — cannot save');
    const res = await fetch('/api/search/add-to-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: companiesToSave.map(c => c.id), sessionId: searchSessionId, searchQueryId: draftId }),
    });
    if (!res.ok) throw new Error('Failed to save project');
    const data = await res.json();
    const projectName = data.query || currentProject?.name || '';
    setProject({ id: String(data.searchQueryId), name: projectName, search_string: projectName, created_at: new Date() });
    const fullResults = await fetch(`/api/search-history/${data.searchQueryId}/load`);
    if (fullResults.ok) {
      const loaded = await fullResults.json();
      loadFromAPI(loaded.results || [], loaded.satelliteHierarchies || {}, loaded.tableConfig || null, loaded.mapPositions || {});
    } else {
      loadFromAPI([], {}, null, {});
    }
    // Project is now active (draft promoted / name + counts changed) — refresh the lists.
    queryClient.invalidateQueries({ queryKey: ['search-history'] });
    return data;
  };

  const handleSaveProject = async () => {
    const accepted = companies.filter(c => c.accepted);
    if (accepted.length === 0) { toast.error('Select at least one company to save'); return; }
    setIsSavingProject(true);
    try {
      await saveCompaniesToProject(accepted);
      setLocation('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleGoToDashboard = async () => {
    const nonRejected = companies.filter(c => !c.rejected);
    if (nonRejected.length === 0) { reset(); setLocation('/'); return; }
    setIsSavingProject(true);
    try {
      await saveCompaniesToProject(nonRejected);
      setLocation('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to navigate');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleSaveDraft = async (opts?: { silent?: boolean }) => {
    const id = searchQueryId ?? routeId;
    if (Number.isNaN(id)) return;
    const acceptedCount = companies.filter(c => c.accepted).length;
    const { currentProject } = useAppStore.getState();
    try {
      const res = await fetch(`/api/search-queries/${id}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedCount: acceptedCount, query: currentProject?.name }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      queryClient.invalidateQueries({ queryKey: ['search-history'] });
      setDraftSaved(true);
      if (!opts?.silent) toast.success('Draft saved');
    } catch (err: any) {
      if (!opts?.silent) toast.error(err.message || 'Failed to save draft');
    }
  };

  const handleHome = async () => {
    await handleSaveDraft({ silent: true });
    setLocation('/');
  };

  if (Number.isNaN(routeId)) return <Redirect to="/" />;

  const acceptedCount = companies.filter(c => c.accepted).length;
  const directCount = companies.filter(c => c.relevanceType === 'Direct' && !c.rejected).length;
  const adjacentCount = companies.filter(c => (c.relevanceType === 'Adjacent' || c.relevanceType === 'AI Inferred') && !c.rejected).length;

  return (
    <div className="h-screen w-screen flex bg-background relative overflow-hidden">
      <Sidebar
        activeView="map"
        onViewChange={() => {}}
        onHome={handleHome}
        onProjects={() => setShowProjectsPanel(prev => !prev)}
        isProjectsOpen={showProjectsPanel}
        projectOpen={false}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} onProjectLoaded={() => setLocation('/dashboard')} offsetTop={8} />
      )}

      <UniverseResults
        intent={intent}
        companies={companies}
        pendingCompanyNames={pendingCompanyNames}
        activities={activities}
        isStreaming={isStreaming}
        query={currentProject?.name ?? ''}
        acceptedCount={acceptedCount}
        directCount={directCount}
        adjacentCount={adjacentCount}
        isSavingProject={isSavingProject}
        draftSaved={draftSaved}
        resume={!isStreaming && phase === 'complete'}
        onStopSearch={stopSearch}
        onResetSearch={() => { reset(); setLocation('/'); }}
        onAcceptCompany={acceptCompany}
        onRejectCompany={rejectCompany}
        onAddCompany={addManualCompany}
        onSaveDraft={() => handleSaveDraft()}
        onSaveProject={handleSaveProject}
        onGoToDashboard={handleGoToDashboard}
        onMobileNav={() => setMobileNavOpen(true)}
      />
    </div>
  );
}
