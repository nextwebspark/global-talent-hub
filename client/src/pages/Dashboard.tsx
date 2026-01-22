import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useSearch, useModels } from '@/lib/api';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Loader2, Search, Globe, Bot } from 'lucide-react';
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
  const [searchInput, setSearchInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('replit');

  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);


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
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
      setSearchInput('');
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Enter new search query..." 
                className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm bg-transparent px-3 flex-1"
                disabled={searchMutation.isPending}
                data-testid="input-new-search"
                title={searchInput}
              />
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
