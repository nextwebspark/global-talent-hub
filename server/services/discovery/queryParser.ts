import { DEFAULT_MODEL, AVAILABLE_MODELS } from "./models";

export interface SearchCriteria {
  roles: string[];
  roleFunction: string;
  roleLevel: string;
  sectors: string[];
  regions: string[];
  minRevenue: number | null;
  maxRevenue: number | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  limit: number;
}

export interface ParsedSearchResult {
  criteria: SearchCriteria;
  interpretation: string;
}

export function extractLimitFromQuery(query: string): number {
  const match = query.match(/(?:top|first|leading|biggest|largest|best)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 50) {
      return num;
    }
  }
  return 10;
}

export async function parseSearchQuery(query: string, selectedModel: string = DEFAULT_MODEL): Promise<ParsedSearchResult> {
  const limit = extractLimitFromQuery(query);

  const criteria: SearchCriteria = {
    roles: [],
    roleFunction: 'all',
    roleLevel: 'all',
    sectors: [],
    regions: [],
    minRevenue: null,
    maxRevenue: null,
    minEmployees: null,
    maxEmployees: null,
    limit
  };

  return {
    criteria,
    interpretation: query
  };
}

export async function fetchAvailableModels(): Promise<any[]> {
  return AVAILABLE_MODELS;
}

export function generateSearchUniqueKey(query: string): string {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const timestamp = Date.now();
  return `${normalizedQuery}|${timestamp}`;
}
