import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  FolderOpen, Sun, Moon, ArrowRight, Sparkles, CheckCheck,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import ProjectsPanel from '@/components/panels/ProjectsPanel';
import { useSearchStream, type StreamCompany } from '@/lib/useSearchStream';
import { ModeSelector } from './ModeSelector';
import { SearchPanel } from './panels/SearchPanel';
import { BriefPanel } from './panels/BriefPanel';
import { ImportPanel } from './panels/ImportPanel';
import { ResultsView } from './results/ResultsView';
import { usePdUpload } from './hooks/usePdUpload';
import { useBriefMode } from './hooks/useBriefMode';
import { useImportMode } from './hooks/useImportMode';
import type { LandingMode } from './types';
import type { CompanyTab } from './results/CompanyList';

export default function Landing() {
  const [, setLocation] = useLocation();
  const { setProject, loadFromAPI } = useAppStore();

  const [mode, setMode] = useState<LandingMode>('search');
  const [input, setInput] = useState('');
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [sessionId] = useState(() => crypto.randomUUID());

  const [activeTab, setActiveTab] = useState<CompanyTab>('all');
  const [mobileTab, setMobileTab] = useState<'intelligence' | 'results'>('results');
  const [refinementInput, setRefinementInput] = useState('');
  const [debouncedRefinement, setDebouncedRefinement] = useState('');
  const refinementDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [savedProjectSummary, setSavedProjectSummary] = useState<{ total: number; direct: number; adjacent: number; executives: number } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  const {
    phase, intent, activities, companies, pendingCompanyNames,
    isStreaming, isRefining,
    startSearch, stopSearch, startRefinement,
    acceptCompany, rejectCompany, reset,
  } = useSearchStream();

  const pd = usePdUpload(sessionId);
  const brief = useBriefMode({ pd, sessionId, startSearch });
  const importState = useImportMode({ setProject, loadFromAPI, setLocation });

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  useEffect(() => {
    if (activityFeedRef.current) {
      activityFeedRef.current.scrollTop = activityFeedRef.current.scrollHeight;
    }
  }, [activities]);

  const handleEnhancedSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !pd.pdFileName) { toast.error('Please describe what you are looking for, or upload a Position Description'); return; }
    startSearch(input.trim() || `PD: ${pd.pdFileName}`, sessionId);
  };

  const handleRefinement = async () => {
    if (!refinementInput.trim()) return;
    const msg = refinementInput.trim();
    setRefinementInput('');
    await startRefinement(sessionId, msg);
  };

  const saveCompaniesToProject = async (companiesToSave: StreamCompany[]) => {
    const res = await fetch('/api/search/add-to-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: companiesToSave.map(c => c.id), sessionId, query: input })
    });
    if (!res.ok) throw new Error('Failed to save project');
    const data = await res.json();
    setProject({ id: String(data.searchQueryId), name: input || 'AI Search', search_string: input, created_at: new Date() });
    const fullResults = await fetch(`/api/search-history/${data.searchQueryId}/load`);
    if (fullResults.ok) {
      const loaded = await fullResults.json();
      loadFromAPI(loaded.results || [], loaded.satelliteHierarchies || {}, loaded.tableConfig || null, loaded.mapPositions || {});
    } else {
      loadFromAPI([], {}, null, {});
    }
    return data;
  };

  const handleSaveProject = async () => {
    const accepted = companies.filter(c => c.accepted);
    if (accepted.length === 0) { toast.error('Select at least one company to save'); return; }
    setIsSavingProject(true);
    try {
      await saveCompaniesToProject(accepted);
      toast.success(`Saved ${accepted.length} companies to your project`);
      const direct = accepted.filter(c => c.relevanceType === 'Direct').length;
      const adjacent = accepted.filter(c => c.relevanceType !== 'Direct').length;
      const executives = accepted.reduce((sum, c) => sum + (c.executives?.length ?? 0), 0);
      setSavedProjectSummary({ total: accepted.length, direct, adjacent, executives });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleGoToDashboard = async () => {
    const nonRejected = companies.filter(c => !c.rejected);
    if (nonRejected.length === 0) { reset(); return; }
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

  const handleSelectMode = (m: LandingMode) => {
    setMode(m);
    if (m !== 'import') importState.setImportPreview(null);
  };

  const filteredCompanies = companies.filter(c => {
    if (c.rejected) return false;
    if (activeTab === 'direct') return c.relevanceType === 'Direct';
    if (activeTab === 'adjacent') return c.relevanceType === 'Adjacent' || c.relevanceType === 'AI Inferred';
    return true;
  });
  const acceptedCount = companies.filter(c => c.accepted).length;
  const directCount = companies.filter(c => c.relevanceType === 'Direct' && !c.rejected).length;
  const adjacentCount = companies.filter(c => (c.relevanceType === 'Adjacent' || c.relevanceType === 'AI Inferred') && !c.rejected).length;

  return (
    <div className="h-screen w-screen flex bg-background relative overflow-hidden">
      <TooltipProvider delayDuration={300}>
        <div className="h-full w-12 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-2 shrink-0 z-20" data-testid="landing-sidebar">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowProjectsPanel(prev => !prev)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-colors ${showProjectsPanel ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}
                data-testid="sidebar-projects"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Projects</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors" data-testid="landing-theme-toggle">
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{isDark ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} onProjectLoaded={() => setLocation('/dashboard')} offsetTop={8} />
      )}

      <AnimatePresence mode="wait">
        {phase === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-y-auto"
          >
            <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
            </div>

            <div className="z-10 w-full max-w-3xl mx-auto px-6 pt-12 pb-16 flex flex-col items-center">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-foreground mb-2 text-center"
              >
                Build your company universe
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-base text-muted-foreground mb-7 text-center"
              >
                Select how you want to define the scope of this search.
              </motion.p>

              <ModeSelector mode={mode} onSelectMode={handleSelectMode} />

              {mode === 'search' && (
                <SearchPanel
                  input={input}
                  setInput={setInput}
                  pd={pd}
                  onSubmit={handleEnhancedSearch}
                  inputRef={inputRef}
                />
              )}
              {mode === 'brief' && <BriefPanel pd={pd} brief={brief} />}
              {mode === 'import' && <ImportPanel importState={importState} />}
            </div>
          </motion.div>
        )}

        {savedProjectSummary && (
          <motion.div
            key="completion"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            data-testid="completion-screen"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-6">
              <CheckCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Project Saved</h2>
            <p className="text-muted-foreground mb-6 max-w-sm" data-testid="completion-summary">
              {savedProjectSummary.total} companies added — {savedProjectSummary.direct} core matches, {savedProjectSummary.adjacent} AI suggested
              {savedProjectSummary.executives > 0 && (
                <span className="block text-sm mt-1">{savedProjectSummary.executives} executive{savedProjectSummary.executives !== 1 ? 's' : ''} identified</span>
              )}
            </p>
            {intent?.searchRationale && (
              <div className="bg-muted/40 rounded-xl px-5 py-4 mb-6 max-w-md text-sm text-left text-muted-foreground" data-testid="completion-rationale">
                <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wide">AI Search Rationale</p>
                <p>{intent.searchRationale}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => setLocation('/dashboard')} className="gap-2" data-testid="button-completion-view-project">
                <ArrowRight className="w-4 h-4" />View Project
              </Button>
              <Button variant="outline" onClick={() => { setSavedProjectSummary(null); reset(); }} className="gap-2" data-testid="button-completion-new-search">
                <Sparkles className="w-4 h-4" />Refine &amp; Search Again
              </Button>
            </div>
          </motion.div>
        )}

        {!savedProjectSummary && (phase === 'streaming' || phase === 'complete') && (
          <ResultsView
            phase={phase}
            intent={intent}
            activities={activities}
            companies={companies}
            pendingCompanyNames={pendingCompanyNames}
            isStreaming={isStreaming}
            isRefining={isRefining}
            query={input}
            acceptedCount={acceptedCount}
            directCount={directCount}
            adjacentCount={adjacentCount}
            filteredCompanies={filteredCompanies}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            mobileTab={mobileTab}
            setMobileTab={setMobileTab}
            refinementInput={refinementInput}
            setRefinementInput={setRefinementInput}
            debouncedRefinement={debouncedRefinement}
            setDebouncedRefinement={setDebouncedRefinement}
            refinementDebounceRef={refinementDebounceRef}
            activityFeedRef={activityFeedRef}
            isSavingProject={isSavingProject}
            onStopSearch={stopSearch}
            onResetSearch={reset}
            onSubmitRefinement={handleRefinement}
            onAcceptCompany={acceptCompany}
            onRejectCompany={rejectCompany}
            onSaveProject={handleSaveProject}
            onGoToDashboard={handleGoToDashboard}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
