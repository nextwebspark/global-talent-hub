import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useSearch } from '@/lib/api';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Loader2, Search, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentProject, loadFromAPI, setProject, reset } = useAppStore();
  const { data: companies, isLoading, refetch } = useCompanies();
  const searchMutation = useSearch();
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);

  useEffect(() => {
    if (companies && companies.length > 0) {
      loadFromAPI(companies);
    }
  }, [companies, loadFromAPI]);

  const handleNewSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    reset();
    
    try {
      const result = await searchMutation.mutateAsync(searchInput);
      
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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
          <form onSubmit={handleNewSearch} className="flex items-center bg-background/95 backdrop-blur-sm shadow-lg rounded-full border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                {currentProject.name.substring(0, 30)}{currentProject.name.length > 30 ? '...' : ''}
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
        </div>
        
        <MapComponent />
      </div>
      
      <RightPanel />
    </div>
  );
}
