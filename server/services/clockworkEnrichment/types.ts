/**
 * Enrichment run context for observability
 */
export interface EnrichmentRunContext {
  enrichmentRunId: string;
  searchId: number;
  clockworkProjectId: string;
  clockworkFirmSlug: string;
  startedAt: Date;
}

/**
 * Enrichment diagnostics result
 */
export interface EnrichmentDiagnostics {
  ok: boolean;
  status: number | null;
  fetchedCount: number;
  sampleFieldsPresent: string[];
  paginationUsed: boolean;
  errorMessage: string | null;
  endpoint: string | null;
}

/**
 * Fetch error details for observability
 */
export interface ClockworkFetchError {
  endpoint: string;
  status: number | null;
  statusText: string;
  errorMessage: string;
  timestamp: Date;
}

export interface EnrichmentSource {
  name: string;
  type: 'clockwork' | 'linkedin' | 'clearbit' | 'other';
  isEnabled: boolean;
}

export interface EnrichmentResult {
  success: boolean;
  executiveId: number;
  enrichedFields: string[];
  source: string;
  timestamp: Date;
}

export interface CompanyEnrichmentResult {
  success: boolean;
  companyId: number;
  enrichedFields: string[];
  source: string;
  timestamp: Date;
}

/**
 * Clockwork Project interface - reflects real Clockwork project data
 */
export interface ClockworkProject {
  id: string;
  name: string;
  clientCompany?: string;
  status: 'open' | 'closed' | 'retained' | 'special' | 'unknown';
  type?: string;
  candidateCount?: number;
  restricted?: boolean;
  restrictionReason?: string;
}

/**
 * Clockwork diagnostics result
 */
export interface ClockworkDiagnosticsResult {
  ok: boolean;
  timestamp: string;
  credentials: {
    hasApiKey: boolean;
    hasApiSecret: boolean;
    hasFirmKey: boolean;
    hasFirmSlug: boolean;
    firmSlug: string | null;
    baseUrl: string;
  };
  connectivity: {
    tested: boolean;
    endpoint: string | null;
    httpStatus: number | null;
    httpStatusText: string | null;
    responseTime: number | null;
  };
  projects: {
    count: number;
    sample: Array<{ id: string; name: string; status: string }>;
  };
  errors: string[];
  endpointsTried: Array<{
    url: string;
    status: number | null;
    statusText: string | null;
    success: boolean;
    responseSnippet?: string;
  }>;
}

/**
 * Match classification for executive comparison
 */
export type MatchClassification = 'confirmed' | 'possible' | 'no_match';

/**
 * A single executive match result from Clockwork comparison
 */
export interface ExecutiveMatch {
  localExecutiveId: number;
  localExecutiveName: string;
  localExecutiveTitle: string;
  localCompanyName: string;
  clockworkExecutiveId: string | null;
  clockworkExecutiveName: string | null;
  clockworkExecutiveTitle: string | null;
  classification: MatchClassification;
  confidence: number; // 0-100
  matchDetails: {
    nameScore: number;
    titleScore: number;
    companyScore: number;
  };
}

/**
 * Clockwork executive data structure (placeholder)
 */
export interface ClockworkExecutive {
  id: string;
  name: string;
  title: string;
  company: string;
  email?: string;
  linkedin?: string;
  imageUrl?: string;
}

/**
 * Structured result from enrichment orchestration
 */
export interface EnrichmentMatchResult {
  enrichmentRunId: string;
  searchId: number;
  clockworkProjectId: string;
  clockworkFirmSlug: string;
  timestamp: Date;
  totalLocalExecutives: number;
  totalClockworkExecutives: number;
  totalRawCandidates: number;
  clockworkCandidates: ClockworkExecutive[];
  matches: {
    confirmed: ExecutiveMatch[];
    possible: ExecutiveMatch[];
    noMatch: ExecutiveMatch[];
  };
  summary: {
    confirmedCount: number;
    possibleCount: number;
    noMatchCount: number;
  };
  fetchStatus: 'success' | 'error' | 'no_candidates' | 'invalid_data';
  fetchError?: {
    message: string;
    status?: number;
    endpoint?: string;
  };
  paginationUsed: boolean;
  pagesFetched: number;
  endpointsTried: ClockworkFetchResult['endpointsTried'];
  warnings: string[];
  successEndpoint?: string;
}

/**
 * Result from fetching Clockwork candidates
 */
/**
 * Detailed result from fetching Clockwork project people
 * Includes endpoint verification and system account detection
 */
export interface ClockworkFetchResult {
  candidates: ClockworkExecutive[];
  status: 'success' | 'error' | 'no_candidates' | 'invalid_data';
  error?: {
    message: string;
    status?: number;
    endpoint?: string;
  };
  paginationUsed: boolean;
  pagesFetched: number;
  totalRawCandidates: number;
  successEndpoint?: string;
  endpointsTried: Array<{
    endpoint: string;
    status: number | null;
    success: boolean;
    candidateCount: number;
    samplePerson?: { id: string; name: string; company: string };
  }>;
  warnings: string[];
  projectId: string;
  firmSlug: string;
}

/**
 * Career position data from Clockwork API
 */
export interface ClockworkCareerPosition {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

/**
 * Research company details
 */
export interface ResearchedCompany {
  name: string;
  sector: string;
  region: string;
  country: string;
  city: string;
  streetAddress: string;
  latitude: number;
  longitude: number;
  revenue: number | null;  // null if not available (no false precision)
  revenueSource: string;
  employees: number | null;  // null if not available (no false precision)
  employeesSource: string;
  confidence: number;
}
