import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Company {
  id: number;
  name: string;
  sector: string | null;
  region: string | null;
  country: string | null;
  streetAddress: string | null;
  latitude: string;
  longitude: string;
  revenue: string | null;
  employees: number | null;
  color: string | null;
  searchQueryId: number | null;
  createdAt: string;
  updatedAt: string;
  executives?: Executive[];
}

export interface Executive {
  id: number;
  companyId: number;
  name: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  searchQueryId: number;
  query: string;
  interpretation: string;
  criteria: any;
  results: Company[];
}

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: async () => {
      const response = await fetch('/api/companies');
      if (!response.ok) throw new Error('Failed to fetch companies');
      return response.json();
    },
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (company: Partial<Company>) => {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      if (!response.ok) throw new Error('Failed to create company');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Company> }) => {
      const response = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update company');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/companies/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete company');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useCreateExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executive: Partial<Executive>) => {
      const response = await fetch('/api/executives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executive),
      });
      if (!response.ok) throw new Error('Failed to create executive');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUpdateExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Executive> }) => {
      const response = await fetch(`/api/executives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update executive');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useDeleteExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/executives/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete executive');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
}

export function useModels() {
  return useQuery<LLMModel[]>({
    queryKey: ['models'],
    queryFn: async () => {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error('Failed to fetch models');
      return response.json();
    },
  });
}

export function useSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ query, model }: { query: string; model?: string }) => {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, model }),
      });
      if (!response.ok) throw new Error('Failed to execute search');
      return response.json() as Promise<SearchResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export interface StreamingSearchCallbacks {
  onStatus?: (message: string, progress: number) => void;
  onCompany?: (company: Company) => void;
  onSearchCreated?: (data: { searchQueryId: number; query: string; interpretation: string }) => void;
  onComplete?: (total: number, searchQueryId: number) => void;
  onError?: (message: string) => void;
}

export function streamingSearch(
  query: string,
  model: string,
  callbacks: StreamingSearchCallbacks
): () => void {
  const url = `/api/search/stream?query=${encodeURIComponent(query)}&model=${encodeURIComponent(model)}`;
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
    callbacks.onComplete?.(data.total, data.searchQueryId);
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

export interface SearchHistoryItem {
  id: number;
  query: string;
  parsedCriteria: string | null;
  resultCount: number;
  companyCount: number;
  createdAt: string;
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

export interface ExecutiveMatchItem {
  localExecutiveId: number;
  localExecutiveName: string;
  localExecutiveTitle: string;
  localCompanyName: string;
  clockworkExecutiveId: number | null;
  clockworkExecutiveName: string | null;
  clockworkExecutiveTitle: string | null;
  classification: 'confirmed' | 'possible' | 'no_match';
  confidence: number;
  matchDetails: {
    nameScore: number;
    titleScore: number;
    companyScore: number;
  };
}

export interface EnrichmentMatchResult {
  searchId: number;
  clockworkProjectId: string;
  timestamp: string;
  totalLocalExecutives: number;
  totalClockworkExecutives: number;
  matches: {
    confirmed: ExecutiveMatchItem[];
    possible: ExecutiveMatchItem[];
    noMatch: ExecutiveMatchItem[];
  };
  summary: {
    confirmedCount: number;
    possibleCount: number;
    noMatchCount: number;
  };
}

export function useEnrichmentMatch() {
  return useMutation<EnrichmentMatchResult, Error, { searchId: number; clockworkProjectId: string }>({
    mutationFn: async ({ searchId, clockworkProjectId }) => {
      const response = await fetch('/api/enrichment/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId, clockworkProjectId }),
      });
      if (!response.ok) throw new Error('Failed to fetch enrichment matches');
      return response.json();
    },
  });
}
