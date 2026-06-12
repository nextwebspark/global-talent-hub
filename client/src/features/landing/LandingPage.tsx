import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/layout/Sidebar';
import ProjectsPanel from '@/features/projects/ProjectsPanel';
import { RecentProjects } from './panels/RecentProjects';
import { useSearchHistory } from '@/lib/api';
import { useSearchStream } from '@/features/search/useSearchStream';
import { ModeSelector } from './ModeSelector';
import { SearchPanel } from './panels/SearchPanel';
import { BriefPanel } from './panels/BriefPanel';
import { ImportPanel } from './panels/ImportPanel';
import { useBriefUpload } from './hooks/useBriefUpload';
import { useBriefMode } from './hooks/useBriefMode';
import { useImportMode } from './hooks/useImportMode';
import { SAMPLE_RETAIL_COMPANIES } from '@/features/landing/fixtures/sampleData';
import { Globe, Menu } from 'lucide-react';
import type { LandingMode } from './types';

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { setProject, loadFromAPI } = useAppStore();
  const { data: history, isLoading: historyLoading } = useSearchHistory();
  // While the first fetch is in flight we don't yet know if projects exist — treat as
  // "returning" so the Recent section reserves its space (and shows a skeleton) instead
  // of flashing the new-user hero and then jumping when data arrives.
  const hasProjects = historyLoading || (history?.length || 0) > 0;
  const hasProjectsLoaded = (history?.length || 0) > 0;

  const [mode, setMode] = useState<LandingMode>('search');
  const [input, setInput] = useState('');
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { phase, searchQueryId, startSearch, reset } = useSearchStream();

  const briefUpload = useBriefUpload(sessionId);
  const brief = useBriefMode({ upload: briefUpload, sessionId, startSearch });
  const importState = useImportMode({ setProject, loadFromAPI, setLocation });

  // The draft searchQuery row exists once the stream emits `search_created`; hand the
  // live session off to the universe route, where it keeps streaming into the store.
  useEffect(() => {
    if (phase === 'streaming' && searchQueryId) setLocation(`/universe/${searchQueryId}`);
  }, [phase, searchQueryId, setLocation]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const handleEnhancedSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === 'streaming') return; // already searching — block double submit
    if (!input.trim()) { toast.error('Please describe what you are looking for'); return; }
    startSearch(input.trim(), sessionId);
  };

  const handleSelectMode = (m: LandingMode) => {
    setMode(m);
    if (m !== 'import') importState.setImportPreview(null);
  };

  const handleViewSampleGlobe = () => {
    setProject({ id: 'demo', name: 'Sample Retail Globe', search_string: 'Global retail companies', created_at: new Date() });
    loadFromAPI(SAMPLE_RETAIL_COMPANIES, {}, null, {});
    setLocation('/dashboard');
  };

  return (
    <div className="h-screen w-screen flex bg-background relative overflow-hidden">
      <Sidebar
        activeView="map"
        onViewChange={() => {}}
        onHome={reset}
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

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col overflow-y-auto"
      >
        <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
        </div>

        <div className="z-10 w-full max-w-3xl mx-auto px-4 md:px-6 pt-12 pb-16 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-3.5 self-start">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-2 -ml-2 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Open navigation"
              data-testid="landing-hamburger"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center text-[11px] font-bold tracking-wide">GT</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Global Talent Map</span>
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-foreground mb-2 text-center self-start"
          >
            {hasProjectsLoaded ? 'Welcome back' : 'Build your company universe'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base text-muted-foreground mb-7 text-center self-start"
          >
            {hasProjectsLoaded ? 'Resume a project, or start a new search.' : 'Select how you want to define the scope of this search.'}
          </motion.p>

          {hasProjects && (
            <>
              <RecentProjects />
              <div className="flex items-center gap-3 w-full mb-6 text-[11px] text-muted-foreground">
                <span className="flex-1 h-px bg-border" />
                <span>or start a new search</span>
                <span className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          <ModeSelector mode={mode} onSelectMode={handleSelectMode} />

          {mode === 'search' && (
            <SearchPanel
              input={input}
              setInput={setInput}
              onSubmit={handleEnhancedSearch}
              inputRef={inputRef}
              isSearching={phase === 'streaming'}
            />
          )}
          {mode === 'brief' && <BriefPanel upload={briefUpload} brief={brief} />}
          {mode === 'import' && <ImportPanel importState={importState} />}

          <button
            type="button"
            onClick={handleViewSampleGlobe}
            className="mt-5 inline-flex items-center gap-2 self-start text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            View sample globe — 20 global retail companies
          </button>
        </div>
      </motion.div>
    </div>
  );
}
