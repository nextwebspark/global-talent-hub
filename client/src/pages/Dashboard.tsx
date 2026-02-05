import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useSearch, useSearchHistory, useLoadSearchResults, useEnrichmentMatch, EnrichmentMatchResult, streamingSearch } from '@/lib/api';
import { transformAPICompany, transformAPIExecutive } from '@/lib/store';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import MatchReviewPanel from '@/components/panels/MatchReviewPanel';
import ClockworkProjectSelector from '@/components/panels/ClockworkProjectSelector';
import { useLocation } from 'wouter';
import { Loader2, Search, Globe, ChevronDown, ChevronUp, History, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentProject, loadFromAPI, setProject, reset, selectedCompanyId, selectedExecutiveId, setCompanies, setExecutives, resetVisibility } = useAppStore();
  const { isLoading } = useCompanies();
  const searchMutation = useSearch();
  const { data: searchHistory, refetch: refetchHistory } = useSearchHistory();
  const loadSearchResults = useLoadSearchResults();
  const [searchInput, setSearchInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  
  const [leftPanelWidth, setLeftPanelWidth] = useState(360);
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  const [showMatchReview, setShowMatchReview] = useState(false);
  const [matchReviewData, setMatchReviewData] = useState<EnrichmentMatchResult | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const enrichmentMatch = useEnrichmentMatch();
  const { refetch: refetchCompanies } = useCompanies();
  
  // Streaming search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');
  const searchCleanupRef = useRef<(() => void) | null>(null);
  const searchSessionRef = useRef<number>(0);
  
  // Cleanup streaming connection on unmount
  useEffect(() => {
    return () => {
      if (searchCleanupRef.current) {
        searchCleanupRef.current();
      }
    };
  }, []);

  // Auto-open RHP when company or executive is selected
  useEffect(() => {
    if (selectedCompanyId || selectedExecutiveId) {
      setIsRightPanelOpen(true);
    }
  }, [selectedCompanyId, selectedExecutiveId]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizingLeft) {
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setLeftPanelWidth(newWidth);
    }
    if (isResizingRight) {
      const newWidth = Math.max(320, Math.min(700, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    }
  }, [isResizingLeft, isResizingRight]);

  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectHistoryItem = (query: string) => {
    setSearchInput(query);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const filteredHistory = searchHistory?.filter((item: any) => 
    item.query.toLowerCase().includes(searchInput.toLowerCase())
  ).sort((a: any, b: any) => a.query.localeCompare(b.query)) || [];

  const handleClearResults = async () => {
    if (!currentProject?.id) return;
    
    setIsClearing(true);
    try {
      const response = await fetch(`/api/search-queries/${currentProject.id}/results`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to clear results');
      
      setCompanies([]);
      setExecutives([]);
      refetchHistory();
      setShowClearConfirm(false);
      toast.success('Results cleared - ready for new search');
    } catch (error) {
      toast.error('Failed to clear results');
      console.error(error);
    } finally {
      setIsClearing(false);
    }
  };

  const loadHistorySearch = async (item: any) => {
    try {
      setShowHistory(false);
      
      // Clear existing results before loading
      setCompanies([]);
      setExecutives([]);
      
      toast.loading('Loading previous search results...', { id: 'load-history' });
      
      // Fetch fresh data from database using the search ID
      const results = await loadSearchResults.mutateAsync(item.id);
      
      const companies = results.companies.map((c: any) => transformAPICompany(c));
      const executives = results.companies.flatMap((c: any) => 
        (c.executives || []).map((e: any) => transformAPIExecutive(e, String(c.id)))
      );
      
      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt)
      });
      
      setCompanies(companies);
      setExecutives(executives);
      setSearchInput(item.query);
      
      toast.dismiss('load-history');
      toast.success(`Loaded ${companies.length} companies from previous search`);
    } catch (error) {
      toast.dismiss('load-history');
      toast.error('Failed to load previous search results');
      console.error('Failed to load search results:', error);
    }
  };


  const handleStartEnrichment = async () => {
    if (!currentProject?.id) {
      toast.error('Please run a search first');
      return;
    }

    // Check if a Clockwork project is already selected for this search
    if (!currentProject.clockworkProjectId) {
      // Show project selector modal
      setShowProjectSelector(true);
      return;
    }

    // Proceed with enrichment using the selected project
    await runEnrichmentWithProject(currentProject.clockworkProjectId);
  };

  const runEnrichmentWithProject = async (clockworkProjectId: string) => {
    if (!currentProject?.id) return;

    setShowMatchReview(true);
    try {
      toast.loading('Analyzing matches...', { id: 'enrichment' });
      const result = await enrichmentMatch.mutateAsync({
        searchId: parseInt(currentProject.id),
        clockworkProjectId
      });
      toast.dismiss('enrichment');
      setMatchReviewData(result);
    } catch (error) {
      toast.dismiss('enrichment');
      toast.error('Failed to analyze matches');
      setShowMatchReview(false);
      console.error('Enrichment error:', error);
    }
  };

  const handleClockworkProjectSelect = async (projectId: string) => {
    if (!currentProject?.id) return;

    try {
      // Persist the selection to the database
      const response = await fetch(`/api/search/${currentProject.id}/clockwork-project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clockworkProjectId: projectId })
      });

      if (!response.ok) throw new Error('Failed to save project selection');

      // Update the local project state
      setProject({
        ...currentProject,
        clockworkProjectId: projectId
      });

      setShowProjectSelector(false);
      toast.success('Clockwork project selected');

      // Now run the enrichment
      await runEnrichmentWithProject(projectId);
    } catch (error) {
      console.error('Error selecting Clockwork project:', error);
      toast.error('Failed to select Clockwork project');
    }
  };

  const handleCloseMatchReview = () => {
    setShowMatchReview(false);
    setMatchReviewData(null);
  };

  const handleRefreshAfterEnrichment = async () => {
    // Reload the current search results to update map and panels
    console.log('[Refresh] Starting refresh after enrichment, currentProject:', currentProject?.id);
    if (currentProject?.id) {
      try {
        const searchId = parseInt(currentProject.id);
        console.log('[Refresh] Loading search results for ID:', searchId);
        const results = await loadSearchResults.mutateAsync(searchId);
        console.log('[Refresh] Got results, companies:', results.companies?.length);
        
        const companies = results.companies.map((c: any) => transformAPICompany(c));
        const executives = results.companies.flatMap((c: any) => {
          const execs = (c.executives || []).map((e: any) => transformAPIExecutive(e, String(c.id)));
          console.log(`[Refresh] Company ${c.name} has ${execs.length} executives`);
          return execs;
        });
        
        console.log('[Refresh] Total executives after transform:', executives.length);
        setCompanies(companies);
        setExecutives(executives);
        console.log('[Refresh] Store updated');
      } catch (error) {
        console.error('[Refresh] Failed to refresh after enrichment:', error);
        // Fallback to simple refetch
        refetchCompanies();
      }
    } else {
      console.log('[Refresh] No currentProject, falling back to refetchCompanies');
      refetchCompanies();
    }
  };

  const handleNewSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    
    // Reset map visibility for new search
    resetVisibility();
    
    // Cancel any existing search
    if (searchCleanupRef.current) {
      searchCleanupRef.current();
      searchCleanupRef.current = null;
    }
    
    // Increment session to ignore late events from cancelled searches
    searchSessionRef.current++;
    const currentSession = searchSessionRef.current;
    
    setShowHistory(false);
    setIsSearching(true);
    setSearchProgress(0);
    setSearchStatus('Starting search...');
    
    // Clear existing results before new search
    setCompanies([]);
    setExecutives([]);
    
    let companyCount = 0;
    
    // Use Tavily Research API directly (no LLM layer needed)
    const cleanup = streamingSearch(searchInput, {
      onStatus: (message, progress) => {
        if (searchSessionRef.current !== currentSession) return;
        setSearchStatus(message);
        setSearchProgress(progress);
      },
      onSearchCreated: (data) => {
        if (searchSessionRef.current !== currentSession) return;
        setProject({
          id: String(data.searchQueryId),
          name: searchInput,
          search_string: searchInput,
          created_at: new Date()
        });
        setSearchStatus('Discovering companies...');
      },
      onCompany: (company) => {
        if (searchSessionRef.current !== currentSession) return;
        companyCount++;
        // Transform and add company progressively
        const transformedCompany = transformAPICompany(company);
        useAppStore.getState().addCompany(transformedCompany);
        
        // Add executives for this company
        if (company.executives) {
          company.executives.forEach((exec: any) => {
            const transformedExec = transformAPIExecutive(exec, String(company.id));
            useAppStore.getState().addExecutive(transformedExec);
          });
        }
        setSearchStatus(`Found ${companyCount} companies...`);
      },
      onComplete: (result) => {
        if (searchSessionRef.current !== currentSession) return;
        setIsSearching(false);
        setSearchProgress(100);
        setSearchStatus('');
        searchCleanupRef.current = null;
        refetchHistory();
        // NOTE: Do NOT call refetchCompanies() here - streaming already added companies via addCompany()
        // Calling refetchCompanies() would fetch ALL companies from ALL searches and overwrite the current results
        
        // Update discovery status in store
        useAppStore.getState().setDiscoveryStatus(result.discoveryStatus, result.degradationReasons);
        
        if (result.total === 0) {
          toast.error('No results found. Try a different search query.');
        } else {
          const statusMsg = result.discoveryStatus === 'degraded' 
            ? ` (some limitations applied)` 
            : result.discoveryStatus === 'partial' 
              ? ` (partial results)` 
              : '';
          toast.success(`Found ${result.total} companies matching your criteria${statusMsg}`);
        }
      },
      onError: (message) => {
        if (searchSessionRef.current !== currentSession) return;
        setIsSearching(false);
        setSearchProgress(0);
        setSearchStatus('');
        searchCleanupRef.current = null;
        toast.error(message || 'Search failed. Please try again.');
      }
    });
    
    searchCleanupRef.current = cleanup;
  };

  if (!currentProject) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-background overflow-hidden font-sans text-foreground">
      {/* Map as fixed background layer - always fills entire viewport */}
      <div className="absolute inset-0 z-0">
        <MapComponent />
      </div>
      
      {/* Left Panel overlay */}
      <div className="absolute top-0 left-0 h-full z-20 flex">
        <LeftPanel 
          width={leftPanelWidth} 
          isOpen={isLeftPanelOpen} 
          onToggle={() => setIsLeftPanelOpen(!isLeftPanelOpen)} 
        />
        {isLeftPanelOpen && (
          <div 
            className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0"
            onMouseDown={() => setIsResizingLeft(true)}
            data-testid="resize-handle-left"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}
      </div>
      
      {/* Search bar overlay - centered in the available space */}
      <div 
        className="absolute top-4 z-30" 
        style={{ 
          left: isLeftPanelOpen ? leftPanelWidth + 16 : 56, 
          right: isRightPanelOpen && selectedCompanyId ? rightPanelWidth + 16 : 16,
          transition: 'left 0.3s ease, right 0.3s ease'
        }}
      >
        <div className="max-w-5xl mx-auto px-4">
          <form onSubmit={handleNewSearch} className="flex flex-col gap-3">
            <div className="relative" ref={historyRef}>
              <div className={`bg-gradient-to-b from-background to-background/95 backdrop-blur-xl shadow-2xl shadow-primary/5 border border-border/80 overflow-hidden transition-all duration-300 ring-1 ring-black/5 ${isPromptExpanded ? 'rounded-2xl' : 'rounded-3xl'}`}>
                <div className="flex items-center px-5 py-3 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 group relative" title={currentProject.name}>
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Globe className="h-4 w-4 text-primary shrink-0" />
                    </div>
                    <span className="text-xs font-medium text-foreground/80 hidden sm:inline max-w-[180px] truncate">
                      {currentProject.name}
                    </span>
                  </div>
                  <div className="h-5 w-px bg-border/60 mx-4 shrink-0" />
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium text-primary">AI Research</span>
                  </div>
                  <div className="flex-1" />
                  {isSearching ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">{searchProgress}%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors flex items-center gap-1"
                        title={isPromptExpanded ? "Collapse prompt" : "Expand prompt"}
                        data-testid="button-toggle-prompt-expand"
                      >
                        {isPromptExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">{isPromptExpanded ? 'Collapse' : 'Expand'}</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="Search history"
                        data-testid="button-toggle-history"
                      >
                        <History className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4">
                  <Textarea 
                    ref={inputRef}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => {
                      if (!isPromptExpanded && searchInput.length < 50) {
                        setShowHistory(true);
                      }
                    }}
                    placeholder={isPromptExpanded 
                      ? `Enter a detailed search prompt...\n\nExample:\nTask: List exactly 10 operating companies in renewable energy...\n\nInclusion criteria:\n- Entity must be a company, not a project\n- Must have operational presence in target region\n\nData rules:\n- Revenue must only be included if explicitly stated\n- If data is unclear, return "Unknown"`
                      : "Describe what you're looking for... (e.g., 'Top 5 banks in UAE' or 'FMCG distributors in Saudi Arabia')"
                    }
                    className={`border-0 shadow-none focus-visible:ring-0 text-base leading-relaxed bg-transparent resize-none transition-all duration-300 placeholder:text-muted-foreground/50 ${
                      isPromptExpanded ? 'min-h-[240px] max-h-[450px]' : 'min-h-[72px] max-h-[120px]'
                    }`}
                    disabled={isSearching}
                    data-testid="input-new-search"
                  />
                </div>
              </div>
              
              {isSearching && (
                <div className="bg-background/95 backdrop-blur-sm shadow-lg rounded-full border border-border overflow-hidden mt-2 px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${searchProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[120px]">
                      {searchStatus}
                    </span>
                  </div>
                </div>
              )}
              
              {showHistory && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-background/98 backdrop-blur-md border border-border rounded-xl shadow-2xl max-h-72 overflow-hidden z-50">
                  <div className="p-3 border-b border-border bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <History className="h-3 w-3" /> {searchInput ? 'Matching Searches' : 'Recent Searches'}
                    </span>
                  </div>
                  {filteredHistory.length > 0 ? (
                    <div className="overflow-y-auto max-h-56">
                      {filteredHistory.slice(0, 10).map((item: any, index: number) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="w-full px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0 group flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => selectHistoryItem(item.query)}
                            className="flex-1 text-left"
                            data-testid={`button-dashboard-history-${index}`}
                          >
                            <div className="flex items-center gap-2">
                              <Search className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate group-hover:text-primary transition-colors">{item.query}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                  {(item.companyCount || item.resultCount) > 0 && (
                                    <span className="text-primary/70">{item.companyCount || item.resultCount} companies</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => loadHistorySearch(item)}
                            disabled={loadSearchResults.isPending}
                            className="shrink-0 text-xs h-7 px-2"
                            data-testid={`button-load-history-${index}`}
                          >
                            {loadSearchResults.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Load'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <p className="text-xs">{searchInput ? 'No matching searches' : 'No previous searches yet'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <Button 
                type="submit" 
                size="lg" 
                disabled={searchMutation.isPending || isSearching}
                className="h-12 rounded-full px-8 text-sm font-semibold shadow-xl shadow-primary/20 bg-gradient-to-r from-primary to-primary/90 hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200"
                data-testid="button-new-search"
              >
                {(searchMutation.isPending || isSearching) ? (
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                {(searchMutation.isPending || isSearching) ? 'Researching...' : 'Start Research'}
              </Button>
              
              <Button 
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                className="h-10 rounded-full px-4 text-sm shadow-lg border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                data-testid="button-clear-results"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear Results
              </Button>
              
              <Button 
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartEnrichment}
                disabled={!currentProject?.id || enrichmentMatch.isPending}
                className="h-10 rounded-full px-4 text-sm shadow-lg border-blue-500/50 text-blue-600 hover:bg-blue-500 hover:text-white"
                data-testid="button-enrich-data"
              >
                {enrichmentMatch.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Enrich Data
              </Button>
            </div>
          </form>
        </div>
        
        {showClearConfirm && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm mx-4">
              <h3 className="text-lg font-semibold mb-2">Clear All Results?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete all companies and executives from this search. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  data-testid="button-clear-cancel"
                >
                  No, Keep Results
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearResults}
                  disabled={isClearing}
                  data-testid="button-clear-confirm"
                >
                  {isClearing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Yes, Clear All
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel overlay */}
      <div className="absolute top-0 right-0 h-full z-20 flex">
        {isRightPanelOpen && selectedCompanyId && (
          <div 
            className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0"
            onMouseDown={() => setIsResizingRight(true)}
            data-testid="resize-handle-right"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}
        <RightPanel 
          width={rightPanelWidth} 
          isOpen={isRightPanelOpen} 
          onToggle={() => setIsRightPanelOpen(!isRightPanelOpen)} 
        />
      </div>
      
      {showMatchReview && (
        <MatchReviewPanel
          matchData={matchReviewData}
          isLoading={enrichmentMatch.isPending && !matchReviewData}
          onClose={handleCloseMatchReview}
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
