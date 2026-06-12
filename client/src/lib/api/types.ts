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
  revenueSource: string | null;
  revenueSourceUrl: string | null;
  revenueConfidence: number | null;
  revenueCurrency: string | null;
  revenueFiscalYear: number | null;
  employees: number | null;
  employeesSource: string | null;
  employeesSourceUrl: string | null;
  employeesConfidence: number | null;
  confidence: number | null;
  businessType: string | null;
  relevanceReason: string | null;
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
  executiveConfidence: string | null;
  executiveConfidenceReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  searchQueryId: number;
  query: string;
  interpretation: string;
  criteria: unknown;
  results: Company[];
}

export type SearchMode = 'quick' | 'deep';

export type DiscoveryStatus = 'complete' | 'partial' | 'degraded';

export interface DiscoveryResult {
  total: number;
  searchQueryId: number;
  discoveryStatus?: DiscoveryStatus;
  degradationReasons?: string[];
}

export interface StreamingSearchCallbacks {
  onStatus?: (message: string, progress: number) => void;
  onCompany?: (company: Company) => void;
  onSearchCreated?: (data: { searchQueryId: number; query: string; interpretation: string }) => void;
  onComplete?: (result: DiscoveryResult) => void;
  onError?: (message: string) => void;
}

export interface SearchHistoryItem {
  id: number;
  query: string;
  parsedCriteria: string | null;
  resultCount: number;
  companyCount: number;
  status: 'draft' | 'active';
  selectedCount?: number;
  createdAt: string;
  updatedAt?: string;
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
