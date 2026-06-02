import { motion } from 'framer-motion';
import {
  CheckCircle2, CheckCheck, Square, RotateCcw, ArrowRight, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from './ActivityFeed';
import { CompanyList, type CompanyTab } from './CompanyList';
import type { StreamCompany } from '@/lib/useSearchStream';
import type { ActivityEvent, InferredIntent } from '@shared/schema';

export function ResultsView({
  phase, intent, activities, companies, pendingCompanyNames,
  isStreaming, isRefining,
  query,
  acceptedCount, directCount, adjacentCount,
  filteredCompanies,
  activeTab, setActiveTab,
  mobileTab, setMobileTab,
  refinementInput, setRefinementInput,
  debouncedRefinement, setDebouncedRefinement,
  refinementDebounceRef,
  activityFeedRef,
  isSavingProject,
  onStopSearch, onResetSearch, onSubmitRefinement,
  onAcceptCompany, onRejectCompany,
  onSaveProject, onGoToDashboard,
}: {
  phase: string;
  intent: InferredIntent | null;
  activities: ActivityEvent[];
  companies: StreamCompany[];
  pendingCompanyNames: string[];
  isStreaming: boolean;
  isRefining: boolean;
  query: string;
  acceptedCount: number;
  directCount: number;
  adjacentCount: number;
  filteredCompanies: StreamCompany[];
  activeTab: CompanyTab;
  setActiveTab: (t: CompanyTab) => void;
  mobileTab: 'intelligence' | 'results';
  setMobileTab: (t: 'intelligence' | 'results') => void;
  refinementInput: string;
  setRefinementInput: (v: string) => void;
  debouncedRefinement: string;
  setDebouncedRefinement: (v: string) => void;
  refinementDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  activityFeedRef: React.RefObject<HTMLDivElement | null>;
  isSavingProject: boolean;
  onStopSearch: () => void;
  onResetSearch: () => void;
  onSubmitRefinement: () => void;
  onAcceptCompany: (id: number) => void;
  onRejectCompany: (id: number) => void;
  onSaveProject: () => void;
  onGoToDashboard: () => void;
}) {
  return (
    <motion.div
      key="streaming"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      <div className="h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur flex items-center px-4 gap-3 z-10">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Live Search
              </div>
              <Button variant="destructive" size="sm" onClick={onStopSearch} className="h-6 px-2 gap-1 text-xs" data-testid="button-stop-search">
                <Square className="w-3 h-3 fill-current" />Stop
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />Search Complete
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{query}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isStreaming && companies.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {companies.filter(c => !c.rejected).length} companies found
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onResetSearch} className="h-7 gap-1.5 text-xs" data-testid="button-reset-search">
            <RotateCcw className="w-3 h-3" />New Search
          </Button>
        </div>
      </div>

      <div className="flex sm:hidden border-b border-border bg-background/95 backdrop-blur shrink-0">
        <button
          onClick={() => setMobileTab('results')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mobileTab === 'results' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
          data-testid="mobile-tab-results"
        >
          Results ({companies.filter(c => !c.rejected).length})
        </button>
        <button
          onClick={() => setMobileTab('intelligence')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mobileTab === 'intelligence' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
          data-testid="mobile-tab-intelligence"
        >
          Search Intelligence
        </button>
      </div>

      {acceptedCount > 0 && (
        <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-2 flex items-center gap-3" data-testid="sticky-selected-bar">
          <CheckCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{acceptedCount} selected</span>
          <div className="flex-1" />
          <Button size="sm" onClick={onSaveProject} disabled={isSavingProject} className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" data-testid="button-sticky-save-project">
            {isSavingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
            Save to Project
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className={`w-72 shrink-0 border-r border-border flex-col overflow-hidden bg-muted/20 ${mobileTab === 'results' ? 'hidden sm:flex' : 'flex w-full sm:w-72'}`}>
          <ActivityFeed
            intent={intent}
            activities={activities}
            isStreaming={isStreaming}
            isRefining={isRefining}
            refinementInput={refinementInput}
            setRefinementInput={setRefinementInput}
            debouncedRefinement={debouncedRefinement}
            setDebouncedRefinement={setDebouncedRefinement}
            onSubmitRefinement={onSubmitRefinement}
            refinementDebounceRef={refinementDebounceRef}
            activityFeedRef={activityFeedRef}
          />
        </div>

        <div className={`flex-1 flex-col overflow-hidden ${mobileTab === 'intelligence' ? 'hidden sm:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                data-testid="tab-all-companies"
              >
                All ({companies.filter(c => !c.rejected).length})
              </button>
              <button
                onClick={() => setActiveTab('direct')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'direct' ? 'bg-emerald-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                data-testid="tab-direct-companies"
              >
                Core ({directCount})
              </button>
              <button
                onClick={() => setActiveTab('adjacent')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'adjacent' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                data-testid="tab-adjacent-companies"
              >
                AI Suggested ({adjacentCount})
              </button>
            </div>
            <div className="flex-1" />
            {acceptedCount > 0 && (
              <Button size="sm" onClick={onSaveProject} disabled={isSavingProject} className="h-7 text-xs gap-1.5" data-testid="button-save-project">
                {isSavingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                Save {acceptedCount} to Project
              </Button>
            )}
            {!isStreaming && phase === 'complete' && companies.length > 0 && (
              <Button variant="outline" size="sm" onClick={onGoToDashboard} disabled={isSavingProject} className="h-7 text-xs gap-1.5" data-testid="button-go-dashboard">
                <ArrowRight className="w-3 h-3" />View All in Dashboard
              </Button>
            )}
          </div>

          {phase === 'complete' && companies.length > 0 && (
            <div className="px-4 py-3 border-b border-border/30 bg-emerald-50/50 dark:bg-emerald-950/20" data-testid="completion-summary">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCheck className="w-4 h-4" />
                  <span className="text-sm font-semibold">Search Complete</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{directCount}</strong> core matches</span>
                  <span><strong className="text-foreground">{adjacentCount}</strong> AI suggested</span>
                  {intent && <span className="hidden sm:inline">{intent.targetGeographies.slice(0, 2).join(', ')}</span>}
                </div>
                {intent?.searchRationale && (
                  <p className="hidden md:block text-[11px] text-muted-foreground truncate flex-1">{intent.searchRationale}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto" data-testid="company-cards-grid">
            <CompanyList
              filteredCompanies={filteredCompanies}
              pendingCompanyNames={pendingCompanyNames}
              activeTab={activeTab}
              isStreaming={isStreaming}
              onAccept={onAcceptCompany}
              onReject={onRejectCompany}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
