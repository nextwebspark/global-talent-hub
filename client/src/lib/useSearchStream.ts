import { useCallback, useRef } from 'react';
import { useAppStore } from './store';
import type { ActivityEvent } from '@shared/schema';
import type { StreamCompany } from './store';

export type StreamPhase = 'input' | 'streaming' | 'complete';

function makeActivity(type: ActivityEvent['type'], message: string, data?: Record<string, unknown>): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    type,
    message,
    timestamp: new Date(),
    ...(data ? { data } : {}),
  } as ActivityEvent;
}

// Re-export StreamCompany for Landing.tsx backward compat
export type { StreamCompany };

export interface UseSearchStreamReturn {
  phase: StreamPhase;
  intent: ReturnType<typeof useAppStore.getState>['searchIntent'];
  activities: ActivityEvent[];
  companies: StreamCompany[];
  pendingCompanyNames: string[];
  searchQueryId: number | null;
  isStreaming: boolean;
  isRefining: boolean;
  startSearch: (query: string, sessionId: string) => void;
  stopSearch: () => void;
  startRefinement: (sessionId: string, refinementMessage: string) => Promise<void>;
  acceptCompany: (id: number) => void;
  rejectCompany: (id: number) => void;
  addManualCompany: (data: { name: string; sector: string; revenueBand: string; employeeBand: string }) => void;
  reset: () => void;
}

export function useSearchStream(_sessionId?: string): UseSearchStreamReturn {
  const store = useAppStore();
  const esRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    searchPhase: phase,
    searchIntent: intent,
    searchActivities: activities,
    searchCompanies: companies,
    pendingCompanyNames,
    searchQueryId,
    isSearchStreaming: isStreaming,
    isSearchRefining: isRefining,
    setSearchPhase,
    setSearchSessionId,
    setSearchIntent,
    addSearchActivity,
    addPendingCompanyName,
    removePendingCompanyName,
    addSearchCompany,
    addExecutiveToCompany,
    acceptSearchCompany,
    rejectSearchCompany,
    addManualCompany: addManualCompanyToStore,
    setSearchQueryId,
    setIsSearchStreaming,
    setIsSearchRefining,
    addSearchRefinement,
    resetSearchSession,
    clearPendingCompanyNames,
  } = store;

  // Apply one parsed SSE event to the store. Shared by startSearch (EventSource)
  // and startRefinement (fetch stream) so event handling stays in parity.
  const applySearchEvent = useCallback((type: string, data: any) => {
    addSearchActivity(makeActivity(type as ActivityEvent['type'], data.message || type, data));

    if (type === 'search_created' && data.searchQueryId) {
      setSearchQueryId(data.searchQueryId);
    }
    if (type === 'intent_extracted' && data.intent) {
      setSearchIntent(data.intent);
    }
    if (type === 'company_found' && (data.companyName || data.name)) {
      // Add skeleton placeholder while this company is being enriched
      addPendingCompanyName(data.companyName || data.name);
    }
    if (type === 'company_enriched' && data.company) {
      addSearchCompany({ ...data.company, accepted: true, rejected: false });
      // Skeleton removal is handled by addSearchCompany in the store
    }
    if (type === 'executive_found' && data.executive && data.companyId) {
      // Merge discovered executive into the matching company card
      addExecutiveToCompany(data.companyId, data.executive);
    }
    if (type === 'search_complete' || type === 'done') {
      clearPendingCompanyNames(); // Clear any lingering skeletons for skipped companies
      setIsSearchStreaming(false);
      setSearchPhase('complete');
    }
    if (type === 'error') {
      setIsSearchStreaming(false);
    }
  }, [addSearchActivity, setSearchQueryId, setSearchIntent, addPendingCompanyName, addSearchCompany, addExecutiveToCompany, clearPendingCompanyNames, setIsSearchStreaming, setSearchPhase]);

  const startSearch = useCallback((query: string, sessionId: string) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    resetSearchSession();
    setSearchSessionId(sessionId);
    setSearchPhase('streaming');
    setIsSearchStreaming(true);

    const params = new URLSearchParams({ query, sessionId });
    const es = new EventSource(`/api/search/enhanced-stream?${params}`);
    esRef.current = es;

    const handleEvent = (type: string, rawData: string) => {
      try {
        const data = JSON.parse(rawData);
        applySearchEvent(type, data);
        if (type === 'search_complete' || type === 'done') {
          es.close();
        }
      } catch (parseErr) {
        console.warn('[useSearchStream] Failed to parse SSE event data:', parseErr);
      }
    };

    const events: Array<string> = [
      'search_created', 'intent_extracted', 'company_found', 'company_enriched',
      'adjacent_sector_found', 'executive_found', 'search_complete', 'status', 'done', 'error'
    ];

    events.forEach(evType => {
      es.addEventListener(evType, (e: MessageEvent) => handleEvent(evType, e.data));
    });

    es.onerror = () => {
      setIsSearchStreaming(false);
      setSearchPhase('complete');
      es.close();
    };
  }, [resetSearchSession, setSearchPhase, setSearchSessionId, setIsSearchStreaming, applySearchEvent]);

  const stopSearch = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearPendingCompanyNames();
    setIsSearchStreaming(false);
    setIsSearchRefining(false);
    setSearchPhase('complete');
  }, [clearPendingCompanyNames, setIsSearchStreaming, setIsSearchRefining, setSearchPhase]);

  const startRefinement = useCallback(async (sessionId: string, refinementMessage: string) => {
    if (abortRef.current) { abortRef.current.abort(); }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearchRefining(true);
    setIsSearchStreaming(true);
    setSearchPhase('streaming');
    addSearchRefinement({ message: refinementMessage, timestamp: new Date().toISOString() });

    try {
      const res = await fetch('/api/search/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, refinementMessage }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let currentEvent = '';
      let lineBuffer = ''; // Buffer to handle chunk-boundary partial lines

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // Accumulate into buffer and split on newlines, keeping partial last line
        const chunk = lineBuffer + decoder.decode(value, { stream: true });
        const rawLines = chunk.split('\n');
        lineBuffer = rawLines.pop() ?? ''; // Last element may be incomplete
        for (const line of rawLines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              applySearchEvent(currentEvent, data);
            } catch (parseErr) {
              console.warn('[useSearchStream] Failed to parse refinement SSE line:', parseErr);
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addSearchActivity(makeActivity('error', err.message || 'Refinement failed'));
      }
    } finally {
      setIsSearchRefining(false);
      setIsSearchStreaming(false);
    }
  }, [setIsSearchRefining, setIsSearchStreaming, setSearchPhase, addSearchActivity, addSearchRefinement, applySearchEvent]);

  const acceptCompany = useCallback((id: number) => acceptSearchCompany(id), [acceptSearchCompany]);
  const rejectCompany = useCallback((id: number) => rejectSearchCompany(id), [rejectSearchCompany]);
  const addManualCompany = useCallback(
    (data: { name: string; sector: string; revenueBand: string; employeeBand: string }) => addManualCompanyToStore(data),
    [addManualCompanyToStore],
  );
  const reset = useCallback(() => resetSearchSession(), [resetSearchSession]);

  return {
    phase,
    intent,
    activities,
    companies,
    pendingCompanyNames,
    searchQueryId,
    isStreaming,
    isRefining,
    startSearch,
    stopSearch,
    startRefinement,
    acceptCompany,
    rejectCompany,
    addManualCompany,
    reset,
  };
}
