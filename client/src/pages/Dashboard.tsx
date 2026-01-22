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

    reset();
    
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
          <div className="flex items-center gap-2">
            <form onSubmit={handleNewSearch} className="flex-1 flex items-center bg-background/95 backdrop-blur-sm shadow-lg rounded-full border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                  {currentProject.name.substring(0, 25)}{currentProject.name.length > 25 ? '...' : ''}
                </span>
              </div>
              <div className="h-6 w-px bg-border" />
              <Search className="ml-3 h-4 w-4 text-muted-foreground shrink-0" />
              <Input 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="New search..." 
                className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm bg-transparent px-3 flex-1"
                disabled={searchMutation.isPending}
                data-testid="input-new-search"
              />
              <Button 
                type="submit" 
                size="sm" 
                disabled={searchMutation.isPending}
                className="h-8 mr-2 rounded-full px-4 text-xs font-semibold"
                data-testid="button-new-search"
              >
                {searchMutation.isPending ? <Loader2 className="animate-spin h-3 w-3" /> : 'Search'}
              </Button>
            </form>
            
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="min-w-[160px] max-w-[220px] h-12 text-xs bg-background/95 backdrop-blur-sm border-border rounded-full shadow-lg cursor-pointer px-3" data-testid="select-model-dashboard">
                <div className="flex items-center gap-2 w-full overflow-hidden">
                  <Bot className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate flex-1 text-left text-xs">
                    {models?.find(m => m.id === selectedModel)?.name || "Model..."}
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
          </div>
        </div>
        
        <MapComponent />
      </div>
      
      <RightPanel />
    </div>
  );
}
