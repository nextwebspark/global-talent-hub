import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useSearch, useModels, useSearchHistory, useLoadSearchResults } from '@/lib/api';
import { transformAPICompany, transformAPIExecutive } from '@/lib/store';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { Loader2, Search, Globe, Bot, ChevronDown, History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentProject, loadFromAPI, setProject, reset, selectedCompanyId, setCompanies, setExecutives } = useAppStore();
  const { isLoading } = useCompanies();
  const searchMutation = useSearch();
  const { data: models } = useModels();
  const { data: searchHistory, refetch: refetchHistory } = useSearchHistory();
  const loadSearchResults = useLoadSearchResults();
  const [searchInput, setSearchInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('replit');
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const [leftPanelWidth, setLeftPanelWidth] = useState(360);
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

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


  const handleNewSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    
    setShowHistory(false);
    
    // Clear existing results before new search
    setCompanies([]);
    setExecutives([]);
    
    try {
      toast.loading('Searching for companies and executives...', { id: 'search' });
      const result = await searchMutation.mutateAsync({ query: searchInput, model: selectedModel });
      toast.dismiss('search');
      
      if (!result.results || result.results.length === 0) {
        toast.error('No results found. Try a different search query.');
        return;
      }
      
      setProject({
        id: String(result.searchQueryId),
        name: searchInput,
        search_string: searchInput,
        created_at: new Date()
      });
      
      loadFromAPI(result.results);
      refetchHistory();
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
    } catch (error: any) {
      toast.dismiss('search');
      const message = error?.message || 'Search failed. Please try again.';
      toast.error(message);
      console.error('Search error:', error);
    }
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
    <div className="flex h-screen w-screen bg-background overflow-hidden font-sans text-foreground">
      <LeftPanel 
        width={leftPanelWidth} 
        isOpen={isLeftPanelOpen} 
        onToggle={() => setIsLeftPanelOpen(!isLeftPanelOpen)} 
      />
      {isLeftPanelOpen && (
        <div 
          className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative z-30 shrink-0"
          onMouseDown={() => setIsResizingLeft(true)}
          data-testid="resize-handle-left"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}
      
      <div className="flex-1 relative z-0">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
          <form onSubmit={handleNewSearch} className="flex flex-col gap-3">
            <div className="relative" ref={historyRef}>
              <div className="flex items-center bg-background/95 backdrop-blur-sm shadow-lg rounded-full border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 group relative" title={currentProject.name}>
                  <Globe className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground hidden sm:inline max-w-[180px] truncate">
                    {currentProject.name}
                  </span>
                  <div className="absolute left-0 top-full mt-1 bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg border border-border opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap pointer-events-none">
                    {currentProject.name}
                  </div>
                </div>
                <div className="h-6 w-px bg-border shrink-0" />
                <Search className="ml-3 h-4 w-4 text-muted-foreground shrink-0" />
                <Input 
                  ref={inputRef}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => setShowHistory(true)}
                  placeholder="Enter new search query..." 
                  className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm bg-transparent px-3 flex-1"
                  disabled={searchMutation.isPending}
                  data-testid="input-new-search"
                  title={searchInput}
                />
                <button 
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2 mr-2 hover:bg-muted rounded-full transition-colors"
                >
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                </button>
              </div>
              
              {showHistory && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-background/98 backdrop-blur-md border border-border rounded-xl shadow-2xl max-h-72 overflow-hidden z-50">
                  <div className="p-3 border-b border-border bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <History className="h-3 w-3" /> Recent Searches
                    </span>
                  </div>
                  {searchHistory && searchHistory.length > 0 ? (
                    <div className="overflow-y-auto max-h-56">
                      {searchHistory.slice(0, 10).map((item: any, index: number) => (
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
                      <p className="text-xs">No previous searches yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[240px] h-10 text-xs bg-background/95 backdrop-blur-sm border-border rounded-full shadow-lg cursor-pointer px-3" data-testid="select-model-dashboard">
                  <div className="flex items-center gap-2 w-full overflow-hidden">
                    <Bot className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate flex-1 text-left text-xs">
                      {models?.find(m => m.id === selectedModel)?.name || "Select model..."}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-80 max-w-[320px]">
                  {models?.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs truncate">{model.name}</span>
                        <span className="text-[9px] text-muted-foreground">{model.provider}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                type="submit" 
                size="sm" 
                disabled={searchMutation.isPending}
                className="h-10 rounded-full px-6 text-sm font-semibold shadow-lg"
                data-testid="button-new-search"
              >
                {searchMutation.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                {searchMutation.isPending ? 'Searching...' : 'Run Search'}
              </Button>
            </div>
          </form>
        </div>
        
        <MapComponent />
      </div>
      
      {selectedCompanyId && (
        <>
          <div 
            className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative z-30 shrink-0"
            onMouseDown={() => setIsResizingRight(true)}
            data-testid="resize-handle-right"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          <RightPanel width={rightPanelWidth} />
        </>
      )}
    </div>
  );
}
