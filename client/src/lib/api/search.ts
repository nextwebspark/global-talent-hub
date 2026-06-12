import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Company,
  SearchResult,
  SearchMode,
  StreamingSearchCallbacks,
  SearchHistoryItem,
} from './types';

export function useSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ query, mode = 'quick' }: { query: string; mode?: SearchMode }) => {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute search');
      }
      return response.json() as Promise<SearchResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
}

export function streamingSearch(
  query: string,
  callbacks: StreamingSearchCallbacks,
  mode: SearchMode = 'quick'
): () => void {
  const params = new URLSearchParams({ query, research: 'true', mode });
  const url = `/api/search/stream?${params.toString()}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    callbacks.onStatus?.(data.message, data.progress);
  });

  eventSource.addEventListener('search_created', (e) => {
    const data = JSON.parse(e.data);
    callbacks.onSearchCreated?.(data);
  });

  eventSource.addEventListener('company', (e) => {
    const data = JSON.parse(e.data);
    if (data.company) {
      callbacks.onCompany?.(data.company);
    }
  });

  eventSource.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    callbacks.onComplete?.({
      total: data.total,
      searchQueryId: data.searchQueryId,
      discoveryStatus: data.discoveryStatus,
      degradationReasons: data.degradationReasons,
    });
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    if (e instanceof MessageEvent) {
      const data = JSON.parse(e.data);
      callbacks.onError?.(data.message);
    } else {
      callbacks.onError?.('Connection error');
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    callbacks.onError?.('Connection lost');
    eventSource.close();
  };

  return () => eventSource.close();
}

export function useSearchHistory() {
  return useQuery<SearchHistoryItem[]>({
    queryKey: ['search-history'],
    queryFn: async () => {
      const response = await fetch('/api/search-history');
      if (!response.ok) throw new Error('Failed to fetch search history');
      return response.json();
    },
  });
}

export function useLoadSearchResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (searchQueryId: number) => {
      const response = await fetch(`/api/search-results/${searchQueryId}`);
      if (!response.ok) throw new Error('Failed to load search results');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
