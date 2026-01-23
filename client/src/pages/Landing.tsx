import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { useSearch, useModels, useSearchHistory } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Globe, Bot, ChevronDown, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Landing() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('replit');
  const [showHistory, setShowHistory] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const { setProject, loadFromAPI } = useAppStore();
  const searchMutation = useSearch();
  const { data: models } = useModels();
  const { data: searchHistory } = useSearchHistory();

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const result = await searchMutation.mutateAsync({ query: input, model: selectedModel });
      
      setProject({
        id: String(result.searchQueryId),
        name: input,
        search_string: input,
        created_at: new Date()
      });
      
      loadFromAPI(result.results);
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
      setLocation('/dashboard');
    } catch (error) {
      toast.error('Search failed. Please try again.');
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
           <div className="h-16 w-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-2xl">
              <Globe className="h-8 w-8" />
           </div>
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
                <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center bg-card shadow-lg rounded-full border border-border/50 overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  <Search className="ml-4 h-5 w-5 text-muted-foreground shrink-0" />
                  <Input 
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setShowHistory(true)}
                    placeholder="e.g. 'Top 20 CFOs in luxury watch brands globally'" 
                    className="border-0 shadow-none focus-visible:ring-0 h-14 text-lg bg-transparent px-4 flex-1"
                    disabled={searchMutation.isPending}
                    data-testid="input-search-query"
                    title={input}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="p-2 mr-3 hover:bg-muted rounded-full transition-colors"
                  >
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              
              {showHistory && searchHistory && searchHistory.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
                  <div className="p-3 border-b border-border">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <History className="h-4 w-4" /> Previous Searches
                    </span>
                  </div>
                  {searchHistory.slice(0, 10).map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectHistoryItem(item.query)}
                      className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="font-medium truncate">{item.query}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
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
