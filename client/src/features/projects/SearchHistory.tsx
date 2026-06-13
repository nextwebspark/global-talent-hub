import { useSearchHistory, useLoadSearchResults } from '@/lib/api';
import { useAppStore, transformAPICompany, transformAPIExecutive } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Clock, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SearchHistoryProps {
  onClose: () => void;
}

export default function SearchHistory({ onClose }: SearchHistoryProps) {
  const { data: history, isLoading } = useSearchHistory();
  const loadResults = useLoadSearchResults();
  const { setCompanies, setExecutives, setSearchQuery } = useAppStore();

  const handleLoadSearch = async (searchId: number, query: string) => {
    try {
      const results = await loadResults.mutateAsync(searchId);
      
      const companies = results.companies.map((c: any) => transformAPICompany(c));
      const executives = results.companies.flatMap((c: any) => 
        (c.executives || []).map((e: any) => transformAPIExecutive(e, String(c.id)))
      );
      
      setCompanies(companies);
      setExecutives(executives);
      setSearchQuery(query);
      onClose();
    } catch (error) {
      console.error('Failed to load search results:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="search-history-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground" data-testid="search-history-empty">
        <History className="w-12 h-12 mb-4 opacity-50" />
        <p>No search history yet</p>
        <p className="text-sm mt-2">Your searches will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="search-history-panel">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5" />
          <h2 className="font-semibold">Search History</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-history">
          Close
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => handleLoadSearch(item.id, item.query)}
              disabled={loadResults.isPending}
              className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors mb-2 group"
              data-testid={`search-history-item-${item.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate pr-2">
                    {item.query}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {item.companyCount || 0} companies
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
