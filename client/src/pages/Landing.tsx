import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { useSearch, useSearchHistory } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, ChevronDown, ChevronUp, History, Sparkles, Bot } from 'lucide-react';
import logoImage from '@/assets/images/logo.png';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const LLM_MODELS = [
  // Free models - verified working on OpenRouter (Feb 2026)
  { id: 'openrouter/auto', name: 'Auto (Best Available)', provider: 'OpenRouter', free: true },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'Google', free: true },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google', free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta', free: true },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', provider: 'DeepSeek', free: true },
  { id: 'qwen/qwen2.5-vl-72b-instruct:free', name: 'Qwen 2.5 72B', provider: 'Qwen', free: true },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1', provider: 'Mistral', free: true },
  // Paid models - more capable
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', free: false },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', free: false },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', free: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', free: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', free: false },
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', provider: 'Google', free: false },
  { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', provider: 'Google', free: false },
];

export default function Landing() {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [selectedModel, setSelectedModel] = useState('openrouter/auto');
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const { setProject, loadFromAPI } = useAppStore();
  const searchMutation = useSearch();
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
      const modelName = LLM_MODELS.find(m => m.id === selectedModel)?.name || selectedModel;
      toast.loading(`Searching with ${modelName}...`, { id: 'search' });
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
              <div className={`bg-gradient-to-b from-background to-background/95 backdrop-blur-xl shadow-2xl shadow-primary/5 border border-border/80 overflow-hidden transition-all duration-300 ring-1 ring-black/5 ${isPromptExpanded ? 'rounded-2xl' : 'rounded-3xl'}`}>
                <div className="flex items-center px-5 py-3 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary">AI Research</span>
                    </div>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="w-[180px] h-8 text-xs bg-background" data-testid="select-model">
                        <Bot className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {LLM_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.name}</span>
                              {model.free && (
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[9px] font-semibold rounded">FREE</span>
                              )}
                              <span className="text-muted-foreground">({model.provider})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>
                <div className="px-5 py-4">
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
                      : "Describe what you're looking for... (e.g., 'Top 5 banks in UAE' or 'FMCG distributors in Saudi Arabia')"
                    }
                    className={`border-0 shadow-none focus-visible:ring-0 text-base leading-relaxed bg-transparent resize-none transition-all duration-300 placeholder:text-muted-foreground/50 ${
                      isPromptExpanded ? 'min-h-[280px] max-h-[500px]' : 'min-h-[72px] max-h-[120px]'
                    }`}
                    disabled={searchMutation.isPending}
                    data-testid="input-search-query"
                  />
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
              <Button 
                type="submit" 
                size="lg" 
                disabled={searchMutation.isPending}
                className="h-12 rounded-full px-8 text-sm font-semibold shadow-xl shadow-primary/20 bg-gradient-to-r from-primary to-primary/90 hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200"
                data-testid="button-submit-search"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                {searchMutation.isPending ? 'Researching...' : 'Start Research'}
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
