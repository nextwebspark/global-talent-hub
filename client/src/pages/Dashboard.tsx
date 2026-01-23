import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useSearch, useModels, useSearchHistory } from '@/lib/api';
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
  const { currentProject, loadFromAPI, setProject, reset } = useAppStore();
  const { isLoading } = useCompanies();
  const searchMutation = useSearch();
  const { data: models } = useModels();
  const { data: searchHistory, refetch: refetchHistory } = useSearchHistory();
  const [searchInput, setSearchInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('replit');
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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


  const handleNewSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    
    try {
      const result = await searchMutation.mutateAsync({ query: searchInput, model: selectedModel });
      
      setProject({
        id: String(result.searchQueryId),
        name: searchInput,
        search_string: searchInput,
        created_at: new Date()
      });
      
      loadFromAPI(result.results);
      refetchHistory();
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
    } catch (error) {
      toast.error('Search failed. Please try again.');
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
      <LeftPanel />
      
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
              
              {showHistory && searchHistory && searchHistory.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
                  <div className="p-2 border-b border-border">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <History className="h-3 w-3" /> Previous Searches
                    </span>
                  </div>
                  {searchHistory.slice(0, 10).map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectHistoryItem(item.query)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="font-medium truncate">{item.query}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
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
      
      <RightPanel />
    </div>
  );
}
