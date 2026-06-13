import { useMutation } from '@tanstack/react-query';
import type { EnrichmentMatchResult } from './types';

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
