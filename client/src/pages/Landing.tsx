import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { useSearch, useModels, useSearchHistory } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Bot, ChevronDown, ChevronUp, History, Maximize2, Minimize2 } from 'lucide-react';
import logoImage from '@/assets/images/logo.png';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Landing() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek/deepseek-chat');
  const [showHistory, setShowHistory] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const { setProject, loadFromAPI } = useAppStore();
  const searchMutation = useSearch();
  const { data: models } = useModels();
  const { data: searchHistory } = useSearchHistory();

  const handleLoadHistory = async (item: any) => {
    try {
      // Clear existing results before loading fresh data from database
      loadFromAPI([]);
      
      toast.loading('Loading previous search results...', { id: 'load-history' });
      
      // Fetch fresh data from database using the search ID
      const response = await fetch(`/api/search-history/${item.id}/load`);
      if (!response.ok) throw new Error('Failed to load history');
      
      const data = await response.json();
      toast.dismiss('load-history');

      if (!data.results || data.results.length === 0) {
        toast.error('No results found for this search.');
        return;
      }

      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt)
      });

      loadFromAPI(data.results);
      toast.success(`Loaded ${data.results.length} companies from history`);
      setLocation('/dashboard');
    } catch (error) {
      toast.dismiss('load-history');
      toast.error('Failed to load search history');
      console.error(error);
    }
  };

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
    setInput(query);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const filteredHistory = searchHistory?.filter((item: any) => 
    item.query.toLowerCase().includes(input.toLowerCase())
  ).sort((a: any, b: any) => a.query.localeCompare(b.query)) || [];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setShowHistory(false);
    
    // Clear existing results before new search
    loadFromAPI([]);
    
    try {
      toast.loading('Searching for companies and executives...', { id: 'search' });
      const result = await searchMutation.mutateAsync({ query: input, model: selectedModel });
      toast.dismiss('search');
      
      if (!result.results || result.results.length === 0) {
        toast.error('No results found. Try a different search query.');
        return;
      }
      
      setProject({
        id: String(result.searchQueryId),
        name: input,
        search_string: input,
        created_at: new Date()
      });
      
      loadFromAPI(result.results);
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
      setLocation('/dashboard');
    } catch (error: any) {
      toast.dismiss('search');
      const message = error?.message || 'Search failed. Please try again.';
      toast.error(message);
      console.error('Search error:', error);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 w-full max-w-2xl px-6 text-center"
      >
        <div className="mb-8 flex justify-center">
          <img src={logoImage} alt="ALAC Partners" className="h-28 w-auto mix-blend-multiply" />
        </div>
        
        <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight text-foreground mb-4">
          Global Talent Map
        </h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
          AI-driven market intelligence for executive search. <br/>
          Identify top companies and leaders in seconds.
        </p>

        <form onSubmit={handleSearch} className="relative max-w-3xl mx-auto">
          <div className="flex flex-col gap-4">
            <div className="relative" ref={historyRef}>
              <div className="relative group">
                <div className={`absolute inset-0 bg-primary/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${isPromptExpanded ? 'rounded-2xl' : 'rounded-full'}`} />
                <div className={`relative bg-card shadow-lg border border-border/50 overflow-hidden hover:shadow-xl transition-all duration-300 ${isPromptExpanded ? 'rounded-2xl' : 'rounded-2xl'}`}>
                  <div className="flex items-center px-4 py-3 border-b border-border/30">
                    <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground ml-2">Search Prompt</span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors flex items-center gap-1"
                        title={isPromptExpanded ? "Collapse prompt" : "Expand for detailed prompt"}
                        data-testid="button-toggle-prompt-expand"
                      >
                        {isPromptExpanded ? (
                          <Minimize2 className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Maximize2 className="h-4 w-4 text-muted-foreground" />
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
                  </div>
                  <div className="px-4 py-3">
                    <Textarea 
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onFocus={() => {
                        if (!isPromptExpanded && input.length < 50) {
                          setShowHistory(true);
                        }
                      }}
                      placeholder={isPromptExpanded 
                        ? `Enter a detailed search prompt...\n\nExample:\nTask: List exactly 10 operating companies involved in renewable power transmission...\n\nInclusion criteria:\n- Entity must be a company, not a project or SPV\n- Must have operational involvement in target sector\n\nExclusion criteria:\n- Exclude pure contractors with no operating assets\n\nData rules:\n- Revenue must only be included if explicitly stated\n- If data is unclear, return "Unknown"`
                        : "e.g. 'Top 20 CFOs in luxury watch brands globally' — Click Expand for detailed prompts"
                      }
                      className={`border-0 shadow-none focus-visible:ring-0 text-base bg-transparent resize-none transition-all duration-200 ${
                        isPromptExpanded ? 'min-h-[280px] max-h-[500px]' : 'min-h-[50px] max-h-[100px]'
                      }`}
                      disabled={searchMutation.isPending}
                      data-testid="input-search-query"
                    />
                  </div>
                </div>
              </div>
              
              {showHistory && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl max-h-72 overflow-hidden z-50">
                  <div className="p-3 border-b border-border bg-muted/30">
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <History className="h-4 w-4" /> {input ? 'Matching Searches' : 'Recent Searches'}
                    </span>
                  </div>
                  {filteredHistory.length > 0 ? (
                    <div className="overflow-y-auto max-h-56">
                      {filteredHistory.slice(0, 10).map((item: any, index: number) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0 group cursor-pointer"
                          data-testid={`button-history-item-${index}`}
                          onClick={() => selectHistoryItem(item.query)}
                        >
                          <div className="flex items-center gap-3">
                            <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate group-hover:text-primary transition-colors">{item.query}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                {(item.companyCount || item.resultCount) > 0 && (
                                  <span className="text-primary/70">{item.companyCount || item.resultCount} companies</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLoadHistory(item);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent hover:bg-primary/10 hover:text-primary px-3 py-1.5 rounded-md text-sm font-medium"
                            >
                              Load
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      <p className="text-sm">{input ? 'No matching searches' : 'No previous searches yet'}</p>
                      <p className="text-xs mt-1">{input ? 'Try a different search term' : 'Your search history will appear here'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[280px] h-12 text-sm bg-card border-border/50 rounded-full shadow-lg cursor-pointer px-4" data-testid="select-model">
                  <div className="flex items-center gap-2 w-full overflow-hidden">
                    <Bot className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate flex-1 text-left">
                      {models?.find(m => m.id === selectedModel)?.name || "Select model..."}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-80 max-w-[350px]">
                  {models?.map((model) => (
                    <SelectItem key={model.id} value={model.id} data-testid={`model-${model.id}`}>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm truncate">{model.name}</span>
                        <span className="text-[10px] text-muted-foreground">{model.provider}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                type="submit" 
                size="lg" 
                disabled={searchMutation.isPending}
                className="h-12 rounded-full px-8 font-semibold shadow-lg"
                data-testid="button-submit-search"
              >
                {searchMutation.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                {searchMutation.isPending ? 'Searching...' : 'Run Search'}
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
      
      <div className="absolute bottom-6 text-xs text-muted-foreground opacity-50">
        &copy; 2026 Global Talent Map
      </div>
    </div>
  );
}
