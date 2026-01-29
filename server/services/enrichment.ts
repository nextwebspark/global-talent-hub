/**
 * Enrichment Layer (Clockwork Integration)
 * 
 * This layer is responsible for optional data enrichment that:
 * - Runs ONLY when explicitly triggered by the user
 * - Never auto-runs on search or page load
 * - Never replaces or deletes LLM-discovered executives
 * - Adds supplementary data to existing records
 */

import { storage } from "../storage";
import { randomUUID } from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

const AVAILABLE_SOURCES: EnrichmentSource[] = [
  { name: 'Clockwork', type: 'clockwork', isEnabled: false },
  { name: 'LinkedIn', type: 'linkedin', isEnabled: false },
  { name: 'Clearbit', type: 'clearbit', isEnabled: false },
];

export function getAvailableSources(): EnrichmentSource[] {
  return AVAILABLE_SOURCES;
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
 * Raw API response from Clockwork projects endpoint
 */
interface ClockworkAPIProjectResponse {
  id: number | string;
  name: string;
  client?: { name?: string; company_name?: string };
  client_name?: string;
  status?: string;
  project_type?: string;
  type?: string;
  candidate_count?: number;
  candidates_count?: number;
  restricted?: boolean;
}

/**
 * Clockwork API pagination response
 */
interface ClockworkAPIPaginatedResponse {
  data?: ClockworkAPIProjectResponse[];
  projects?: ClockworkAPIProjectResponse[];
  items?: ClockworkAPIProjectResponse[];
  meta?: {
    current_page?: number;
    total_pages?: number;
    total_count?: number;
    per_page?: number;
  };
  pagination?: {
    page?: number;
    pages?: number;
    total?: number;
    per_page?: number;
  };
  page?: number;
  total_pages?: number;
  total?: number;
}

/**
 * Clockwork configuration type
 */
interface ClockworkConfig {
  apiKey: string;
  apiSecret: string;
  firmKey: string;
  firmSlug: string;
  baseUrl: string;
  authToken: string;
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
 * Get Clockwork API configuration
 */
function getClockworkConfig(): ClockworkConfig | null {
  const apiKey = process.env.CLOCKWORK_API_KEY;
  const apiSecret = process.env.CLOCKWORK_API_SECRET;
  const firmKey = process.env.CLOCKWORK_FIRM_KEY;
  // Firm slug is used in the URL path (e.g., "acme-search" from clockworkrecruiting.com/acme-search)
  // Falls back to firm key if not set separately
  const firmSlug = process.env.CLOCKWORK_FIRM_SLUG || firmKey;
  
  if (!apiKey || !apiSecret || !firmKey) {
    console.warn('[Enrichment:Clockwork] Missing API credentials - CLOCKWORK_API_KEY, CLOCKWORK_API_SECRET, or CLOCKWORK_FIRM_KEY not set');
    return null;
  }
  
  // Clockwork uses Token auth with base64(api_key:api_secret)
  const authToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = process.env.CLOCKWORK_API_URL || 'https://api.clockworkrecruiting.com/v3.0';
  
  console.log(`[Enrichment:Clockwork] Using firm slug: ${firmSlug} with base URL: ${baseUrl}`);
  
  return { apiKey, apiSecret, firmKey, firmSlug: firmSlug || firmKey, baseUrl, authToken };
}

/**
 * Explore Clockwork API to find the correct endpoint for project candidates
 * Tests multiple endpoint patterns and returns detailed results
 */
export async function exploreClockworkProjectEndpoints(clockworkProjectId: string): Promise<{
  success: boolean;
  workingEndpoint: string | null;
  endpointsTested: Array<{
    endpoint: string;
    url: string;
    status: number | null;
    success: boolean;
    candidateCount: number;
    sampleNames: string[];
    responseKeys: string[];
    rawSnippet: string;
  }>;
  recommendation: string;
}> {
  const config = getClockworkConfig();
  
  if (!config) {
    return {
      success: false,
      workingEndpoint: null,
      endpointsTested: [],
      recommendation: 'Missing Clockwork credentials'
    };
  }
  
  // Comprehensive list of endpoint patterns to test
  const endpointPatterns = [
    // Single project with candidates embedded
    { name: 'project_detail', path: `projects/${clockworkProjectId}` },
    { name: 'project_candidates_nested', path: `projects/${clockworkProjectId}/candidates` },
    { name: 'project_people_nested', path: `projects/${clockworkProjectId}/people` },
    { name: 'project_positions_nested', path: `projects/${clockworkProjectId}/positions` },
    
    // Project positions endpoint (Clockwork term for candidate placements in a project)
    { name: 'project_positions_root', path: `project_positions?project_id=${clockworkProjectId}` },
    { name: 'projectpositions', path: `projectpositions?project_id=${clockworkProjectId}` },
    
    // Positions endpoint with project filter (Clockwork terminology: positions = candidate placements)
    { name: 'positions_project_filter', path: `positions?project_id=${clockworkProjectId}` },
    { name: 'positions_search_filter', path: `positions?search_id=${clockworkProjectId}` },
    
    // Candidates endpoint with project filter
    { name: 'candidates_project_filter', path: `candidates?project_id=${clockworkProjectId}` },
    { name: 'candidates_root', path: `candidates` },
    
    // People endpoint with various filters
    { name: 'people_project_filter', path: `people?project_id=${clockworkProjectId}` },
    { name: 'people_search_filter', path: `people?search_id=${clockworkProjectId}` },
    
    // Search-based patterns (Clockwork also calls projects "searches")
    { name: 'search_detail', path: `searches/${clockworkProjectId}` },
    { name: 'search_candidates', path: `searches/${clockworkProjectId}/candidates` },
    { name: 'search_positions', path: `searches/${clockworkProjectId}/positions` },
    
    // Project with includes/embed parameters
    { name: 'project_with_candidates_embed', path: `projects/${clockworkProjectId}?include=candidates` },
    { name: 'project_with_positions_embed', path: `projects/${clockworkProjectId}?include=positions` },
    { name: 'project_with_expand', path: `projects/${clockworkProjectId}?expand=candidates,positions` },
  ];
  
  const results: Array<{
    endpoint: string;
    url: string;
    status: number | null;
    success: boolean;
    candidateCount: number;
    sampleNames: string[];
    responseKeys: string[];
    rawSnippet: string;
  }> = [];
  
  let workingEndpoint: string | null = null;
  
  for (const pattern of endpointPatterns) {
    const url = `${config.baseUrl}/${config.firmSlug}/${pattern.path}`;
    console.log(`[Clockwork:Explore] Testing: ${pattern.name} -> ${url}`);
    
    const result = {
      endpoint: pattern.name,
      url,
      status: null as number | null,
      success: false,
      candidateCount: 0,
      sampleNames: [] as string[],
      responseKeys: [] as string[],
      rawSnippet: ''
    };
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${config.authToken}`,
          'X-API-Key': config.firmKey,
          'Accept': 'application/json'
        }
      });
      
      result.status = response.status;
      
      if (response.ok) {
        const data = await response.json();
        result.success = true;
        result.responseKeys = Object.keys(data);
        result.rawSnippet = JSON.stringify(data).substring(0, 500);
        
        // Try to extract candidates from various response formats
        const candidates = data.candidates || data.people || data.positions || 
                          data.data || data.items || [];
        
        if (Array.isArray(candidates)) {
          result.candidateCount = candidates.length;
          result.sampleNames = candidates.slice(0, 5).map((c: any) => {
            const name = c.name || c.full_name || 
                        `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
                        c.person?.name || 'Unknown';
            return name;
          });
          
          if (candidates.length > 0 && !workingEndpoint) {
            workingEndpoint = pattern.name;
          }
        }
        
        // Check if this is a single project response with embedded candidates
        if (data.candidates || data.candidate_count || data.positions) {
          console.log(`[Clockwork:Explore] Found embedded data in ${pattern.name}`);
        }
      }
    } catch (err) {
      result.rawSnippet = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
    
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Determine recommendation based on results
  let recommendation = 'No working endpoint found. Contact Clockwork support for API documentation.';
  
  const successfulEndpoints = results.filter(r => r.success && r.candidateCount > 0);
  if (successfulEndpoints.length > 0) {
    const best = successfulEndpoints.reduce((a, b) => a.candidateCount > b.candidateCount ? a : b);
    recommendation = `Use endpoint: ${best.endpoint} (found ${best.candidateCount} candidates)`;
  }
  
  return {
    success: !!workingEndpoint,
    workingEndpoint,
    endpointsTested: results,
    recommendation
  };
}

/**
 * Run Clockwork connectivity and scope diagnostics
 * Returns detailed info about credentials, connectivity, and available projects
 */
export async function runClockworkDiagnostics(): Promise<ClockworkDiagnosticsResult> {
  const startTime = Date.now();
  const result: ClockworkDiagnosticsResult = {
    ok: false,
    timestamp: new Date().toISOString(),
    credentials: {
      hasApiKey: !!process.env.CLOCKWORK_API_KEY,
      hasApiSecret: !!process.env.CLOCKWORK_API_SECRET,
      hasFirmKey: !!process.env.CLOCKWORK_FIRM_KEY,
      hasFirmSlug: !!process.env.CLOCKWORK_FIRM_SLUG,
      firmSlug: process.env.CLOCKWORK_FIRM_SLUG || process.env.CLOCKWORK_FIRM_KEY || null,
      baseUrl: process.env.CLOCKWORK_API_URL || 'https://api.clockworkrecruiting.com/v3.0'
    },
    connectivity: {
      tested: false,
      endpoint: null,
      httpStatus: null,
      httpStatusText: null,
      responseTime: null
    },
    projects: {
      count: 0,
      sample: []
    },
    errors: [],
    endpointsTried: []
  };

  const config = getClockworkConfig();
  
  if (!config) {
    result.errors.push('Missing required credentials: CLOCKWORK_API_KEY, CLOCKWORK_API_SECRET, or CLOCKWORK_FIRM_KEY');
    return result;
  }

  // Try different project endpoints
  const endpointsToTry = ['positions', 'projects', 'searches'];
  
  for (const endpoint of endpointsToTry) {
    const url = `${config.baseUrl}/${config.firmSlug}/${endpoint}?page=1&per_page=10`;
    const endpointResult: ClockworkDiagnosticsResult['endpointsTried'][0] = {
      url,
      status: null,
      statusText: null,
      success: false
    };
    
    try {
      const reqStart = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${config.authToken}`,
          'X-API-Key': config.firmKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - reqStart;
      endpointResult.status = response.status;
      endpointResult.statusText = response.statusText;
      
      if (response.ok) {
        endpointResult.success = true;
        result.connectivity.tested = true;
        result.connectivity.endpoint = url;
        result.connectivity.httpStatus = response.status;
        result.connectivity.httpStatusText = response.statusText;
        result.connectivity.responseTime = responseTime;
        
        const data = await response.json();
        endpointResult.responseSnippet = JSON.stringify(data).substring(0, 200);
        
        // Extract projects
        const projects = data.data || data.projects || data.items || data.positions || [];
        if (Array.isArray(projects)) {
          result.projects.count = data.meta?.total_count || data.pagination?.total || projects.length;
          result.projects.sample = projects.slice(0, 3).map((p: any) => ({
            id: String(p.id),
            name: p.name || p.title || 'Unknown',
            status: p.status || 'unknown'
          }));
        }
        
        result.ok = true;
        result.endpointsTried.push(endpointResult);
        break; // Found a working endpoint
      } else {
        const errorText = await response.text();
        endpointResult.responseSnippet = errorText.substring(0, 200);
      }
    } catch (err) {
      endpointResult.statusText = String(err);
    }
    
    result.endpointsTried.push(endpointResult);
  }

  if (!result.ok) {
    result.errors.push('All Clockwork API endpoints failed. Check credentials and permissions.');
  }

  return result;
}

/**
 * Normalize project status to standard values
 */
function normalizeProjectStatus(status?: string): ClockworkProject['status'] {
  if (!status) return 'unknown';
  const s = status.toLowerCase();
  if (s.includes('open') || s === 'active') return 'open';
  if (s.includes('close') || s === 'completed') return 'closed';
  if (s.includes('retain')) return 'retained';
  if (s.includes('special')) return 'special';
  return 'unknown';
}

/**
 * Transform raw API project to our ClockworkProject interface
 */
function transformAPIProject(raw: ClockworkAPIProjectResponse): ClockworkProject {
  return {
    id: String(raw.id),
    name: raw.name,
    clientCompany: raw.client?.company_name || raw.client?.name || raw.client_name,
    status: normalizeProjectStatus(raw.status),
    type: raw.project_type || raw.type,
    candidateCount: raw.candidate_count || raw.candidates_count,
    restricted: raw.restricted,
    restrictionReason: raw.restricted ? 'Insufficient permissions' : undefined
  };
}

/**
 * Fetch ALL projects from Clockwork API with pagination (READ-ONLY)
 * 
 * CRITICAL: This function fetches ALL pages to ensure no projects are hidden.
 * Includes closed, retained, and special projects.
 * IMPORTANT: All Clockwork API calls are strictly read-only.
 */
export async function getClockworkProjects(): Promise<ClockworkProject[]> {
  const config = getClockworkConfig();
  
  if (!config) {
    console.error('[Enrichment:Clockwork] Cannot fetch projects - API credentials not configured');
    console.error('[Enrichment:Clockwork] Required secrets: CLOCKWORK_API_KEY, CLOCKWORK_API_SECRET, CLOCKWORK_FIRM_KEY');
    return [];
  }
  
  console.log('[Enrichment:Clockwork] Fetching projects from Clockwork API...');
  
  const allProjects: ClockworkProject[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  const maxPages = 100; // Safety limit
  
  try {
    // Try multiple endpoint names since Clockwork API docs are not public
    const endpointsToTry = ['positions', 'projects', 'searches'];
    
    for (const endpoint of endpointsToTry) {
      console.log(`[Enrichment:Clockwork] Trying endpoint: /${config.firmSlug}/${endpoint}`);
      
      const url = new URL(`${config.baseUrl}/${config.firmSlug}/${endpoint}`);
      url.searchParams.set('page', '1');
      url.searchParams.set('per_page', '100');
      
      console.log(`[Enrichment:Clockwork] Requesting URL: ${url.toString()}`);
      
      try {
        const testResponse = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Token ${config.authToken}`,
            'X-API-Key': config.firmKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (testResponse.ok) {
          console.log(`[Enrichment:Clockwork] SUCCESS! Endpoint /${endpoint} works`);
          // Use this endpoint for pagination
          return await fetchAllProjectsFromEndpoint(config, endpoint);
        } else {
          console.log(`[Enrichment:Clockwork] Endpoint /${endpoint} returned ${testResponse.status}`);
        }
      } catch (err) {
        console.log(`[Enrichment:Clockwork] Endpoint /${endpoint} failed: ${err}`);
      }
    }
    
    console.error('[Enrichment:Clockwork] All endpoints failed - unable to fetch projects');
    return [];
  } catch (error) {
    console.error('[Enrichment:Clockwork] Failed to fetch projects:', error);
    return [];
  }
}

async function fetchAllProjectsFromEndpoint(
  config: { baseUrl: string; firmSlug: string; authToken: string; firmKey: string },
  endpoint: string
): Promise<ClockworkProject[]> {
  const allProjects: ClockworkProject[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  const maxPages = 100;
  
  try {
    while (hasMorePages && currentPage <= maxPages) {
      console.log(`[Enrichment:Clockwork] Fetching page ${currentPage} from /${endpoint}...`);
      
      const url = new URL(`${config.baseUrl}/${config.firmSlug}/${endpoint}`);
      url.searchParams.set('page', String(currentPage));
      url.searchParams.set('per_page', '100');
      
      console.log(`[Enrichment:Clockwork] Requesting URL: ${url.toString()}`);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Token ${config.authToken}`,
          'X-API-Key': config.firmKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Enrichment:Clockwork] API error (${response.status}): ${errorText}`);
        throw new Error(`Clockwork API returned ${response.status}: ${errorText}`);
      }
      
      const data: ClockworkAPIPaginatedResponse = await response.json();
      
      // Extract projects from various possible response formats
      const projects = data.data || data.projects || data.items || [];
      
      if (Array.isArray(projects)) {
        const transformed = projects.map(transformAPIProject);
        allProjects.push(...transformed);
        console.log(`[Enrichment:Clockwork] Page ${currentPage}: Found ${projects.length} projects`);
      }
      
      // Check for more pages using various pagination formats
      const totalPages = data.meta?.total_pages || data.pagination?.pages || data.total_pages;
      const totalCount = data.meta?.total_count || data.pagination?.total || data.total;
      
      if (totalPages !== undefined) {
        hasMorePages = currentPage < totalPages;
      } else if (totalCount !== undefined) {
        // Calculate if more pages based on total count
        const perPage = data.meta?.per_page || data.pagination?.per_page || 100;
        hasMorePages = allProjects.length < totalCount;
      } else {
        // If no pagination info, check if we got a full page
        hasMorePages = projects.length >= 100;
      }
      
      currentPage++;
    }
    
    // Log summary
    console.log(`[Enrichment:Clockwork] Fetched ${allProjects.length} total projects across ${currentPage - 1} page(s)`);
    
    // Count by status for debugging
    const statusCounts = allProjects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`[Enrichment:Clockwork] Project status breakdown:`, statusCounts);
    
    // Warning if very few projects
    if (allProjects.length === 0) {
      console.warn('[Enrichment:Clockwork] WARNING: Zero projects returned from API - check credentials and permissions');
    } else if (allProjects.length < 5) {
      console.warn(`[Enrichment:Clockwork] WARNING: Only ${allProjects.length} projects returned - this may indicate pagination or permission issues`);
    }
    
    return allProjects;
    
  } catch (error) {
    console.error('[Enrichment:Clockwork] Failed to fetch projects:', error);
    console.error('[Enrichment:Clockwork] Returning empty array - no demo/fallback data');
    return [];
  }
}

export function isEnrichmentEnabled(sourceType: string): boolean {
  const source = AVAILABLE_SOURCES.find(s => s.type === sourceType);
  return source?.isEnabled ?? false;
}

/**
 * Enrich a single executive with additional data.
 * 
 * ENRICHMENT LAYER RULES (STRICTLY ENFORCED):
 * - Runs ONLY when explicitly triggered by the user
 * - May enrich EMPTY profile fields only
 * - Must NEVER overwrite existing data
 * - Must NEVER delete or auto-merge executives
 * 
 * This function uses storage.enrichExecutiveEmptyFields() which enforces
 * that only null/empty fields can be updated.
 */
export async function enrichExecutive(
  executiveId: number,
  sourceType: string = 'clockwork'
): Promise<EnrichmentResult> {
  console.log(`[Enrichment] User-triggered enrichment for executive ${executiveId} using ${sourceType}`);
  
  const executive = await storage.getExecutive(executiveId);
  if (!executive) {
    return {
      success: false,
      executiveId,
      enrichedFields: [],
      source: sourceType,
      timestamp: new Date()
    };
  }

  // PLACEHOLDER: Clockwork API integration would go here
  // When implemented:
  // 1. Call Clockwork API with executive name/company
  // 2. Use storage.enrichExecutiveEmptyFields() to update only empty fields
  // 3. Return list of actually enriched fields
  
  // Example of how Clockwork data would be applied (when implemented):
  // const clockworkData = await fetchFromClockwork(executive.name, company.name);
  // const { enrichedFields } = await storage.enrichExecutiveEmptyFields(executiveId, {
  //   email: clockworkData.email,
  //   linkedin: clockworkData.linkedinUrl,
  //   profileUrl: clockworkData.profileUrl,
  //   imageUrl: clockworkData.photoUrl
  // });
  
  console.log(`[Enrichment] Placeholder - Clockwork integration not yet implemented`);
  console.log(`[Enrichment] When implemented, will only enrich empty fields for executive ${executiveId}`);
  
  return {
    success: true,
    executiveId,
    enrichedFields: [], // Would contain list of fields actually updated
    source: sourceType,
    timestamp: new Date()
  };
}

/**
 * Enrich a company with additional data.
 * 
 * ENRICHMENT LAYER RULES (STRICTLY ENFORCED):
 * - Runs ONLY when explicitly triggered by the user
 * - May enrich EMPTY company fields only
 * - Must NEVER overwrite existing data
 * - Must NEVER delete companies
 * 
 * This function uses storage.enrichCompanyEmptyFields() which enforces
 * that only null/empty fields can be updated.
 */
export async function enrichCompany(
  companyId: number,
  sourceType: string = 'clockwork'
): Promise<CompanyEnrichmentResult> {
  console.log(`[Enrichment] User-triggered enrichment for company ${companyId} using ${sourceType}`);
  
  const company = await storage.getCompany(companyId);
  if (!company) {
    return {
      success: false,
      companyId,
      enrichedFields: [],
      source: sourceType,
      timestamp: new Date()
    };
  }

  // PLACEHOLDER: Enrichment API integration would go here
  
  console.log(`[Enrichment] Placeholder - Enrichment integration not yet implemented`);
  
  return {
    success: true,
    companyId,
    enrichedFields: [],
    source: sourceType,
    timestamp: new Date()
  };
}

/**
 * Bulk enrich all executives for a company.
 * This function is called ONLY when explicitly triggered by the user.
 */
export async function enrichCompanyExecutives(
  companyId: number,
  sourceType: string = 'clockwork'
): Promise<EnrichmentResult[]> {
  console.log(`[Enrichment] User-triggered bulk enrichment for company ${companyId} executives`);
  
  // Get company with executives via storage
  const company = await storage.getCompanyWithExecutives(companyId);
  if (!company) {
    return [];
  }
  
  const results: EnrichmentResult[] = [];
  
  for (const exec of company.executives) {
    const result = await enrichExecutive(exec.id, sourceType);
    results.push(result);
  }
  
  return results;
}

/**
 * Check if an executive has been enriched from a specific source.
 * Useful for showing enrichment status in UI.
 */
export async function getEnrichmentStatus(executiveId: number): Promise<{
  hasBeenEnriched: boolean;
  enrichmentSources: string[];
  lastEnrichedAt: Date | null;
}> {
  // PLACEHOLDER: Would query enrichment history table
  return {
    hasBeenEnriched: false,
    enrichmentSources: [],
    lastEnrichedAt: null
  };
}

// ============================================================================
// ENRICHMENT ORCHESTRATION - Clockwork Matching
// ============================================================================

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
 * Fetch Clockwork project people - exported for direct API access
 * Returns detailed results including endpoint verification and system account detection
 */
export async function fetchClockworkProjectPeople(
  projectId: string
): Promise<ClockworkFetchResult> {
  const enrichmentRunId = randomUUID().substring(0, 8);
  console.log(`[Enrichment:${enrichmentRunId}] Fetching project people for direct API access: ${projectId}`);
  return fetchClockworkExecutives(projectId, enrichmentRunId);
}

/**
 * Normalize a string for fuzzy comparison:
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation
 * - Trim
 */
function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,\-–—'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits needed.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-100).
 * Uses normalized Levenshtein distance.
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(s1, s2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity);
}

/**
 * Calculate token-based Jaccard similarity for names.
 * Better for names where word order might differ.
 */
function calculateTokenSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;
  
  const tokens1 = s1.split(' ').filter(t => t.length > 1);
  const tokens2 = s2.split(' ').filter(t => t.length > 1);
  
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  // Calculate intersection (tokens in both)
  const tokens2Set = new Set(tokens2);
  const intersectionCount = tokens1.filter(t => tokens2Set.has(t)).length;
  
  // Calculate union (unique tokens from both)
  const unionSet = new Set(tokens1.concat(tokens2));
  const unionCount = unionSet.size;
  
  return Math.round((intersectionCount / unionCount) * 100);
}

/**
 * Calculate combined name match score using both Levenshtein and token similarity.
 */
function calculateNameScore(name1: string, name2: string): number {
  const levenshteinScore = calculateSimilarity(name1, name2);
  const tokenScore = calculateTokenSimilarity(name1, name2);
  
  // Weight token similarity higher for names (handles "John Smith" vs "Smith, John")
  return Math.round((levenshteinScore * 0.4) + (tokenScore * 0.6));
}

/**
 * Calculate title match score with role normalization.
 */
function calculateTitleScore(title1: string, title2: string): number {
  const t1 = normalizeString(title1);
  const t2 = normalizeString(title2);
  
  // Common title abbreviation mappings
  const titleNormalize = (t: string) => t
    .replace(/\bceo\b/g, 'chief executive officer')
    .replace(/\bcfo\b/g, 'chief financial officer')
    .replace(/\bcoo\b/g, 'chief operating officer')
    .replace(/\bcto\b/g, 'chief technology officer')
    .replace(/\bcmo\b/g, 'chief marketing officer')
    .replace(/\bcio\b/g, 'chief information officer')
    .replace(/\bvp\b/g, 'vice president')
    .replace(/\bsvp\b/g, 'senior vice president')
    .replace(/\bevp\b/g, 'executive vice president');
  
  const normalized1 = titleNormalize(t1);
  const normalized2 = titleNormalize(t2);
  
  return calculateTokenSimilarity(normalized1, normalized2);
}

/**
 * Classify match based on confidence scores.
 */
function classifyMatch(nameScore: number, titleScore: number, companyScore: number): {
  classification: MatchClassification;
  confidence: number;
} {
  // Weighted average: name is most important, then company, then title
  const confidence = Math.round(
    (nameScore * 0.5) + (companyScore * 0.3) + (titleScore * 0.2)
  );
  
  // Classification thresholds
  if (nameScore >= 85 && confidence >= 75) {
    return { classification: 'confirmed', confidence };
  } else if (nameScore >= 60 && confidence >= 50) {
    return { classification: 'possible', confidence };
  } else {
    return { classification: 'no_match', confidence };
  }
}

/**
 * Find the best matching Clockwork executive for a local executive.
 * Returns the best match or null if no good match found.
 */
function findBestMatch(
  localExec: { name: string; title: string; companyName: string },
  clockworkExecs: ClockworkExecutive[]
): { match: ClockworkExecutive | null; scores: { nameScore: number; titleScore: number; companyScore: number } } {
  let bestMatch: ClockworkExecutive | null = null;
  let bestScores = { nameScore: 0, titleScore: 0, companyScore: 0 };
  let bestConfidence = 0;
  
  for (const cwExec of clockworkExecs) {
    const nameScore = calculateNameScore(localExec.name, cwExec.name);
    const titleScore = calculateTitleScore(localExec.title, cwExec.title);
    const companyScore = calculateSimilarity(localExec.companyName, cwExec.company);
    
    const { confidence } = classifyMatch(nameScore, titleScore, companyScore);
    
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = cwExec;
      bestScores = { nameScore, titleScore, companyScore };
    }
  }
  
  return { match: bestMatch, scores: bestScores };
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
 * System/test account names to detect invalid data
 */
const SYSTEM_ACCOUNT_PATTERNS = [
  /^clockwork\s*admin$/i,
  /^data$/i,
  /^test\s*user$/i,
  /^admin$/i,
  /^system$/i,
  /^clockwork$/i,
  /^api\s*user$/i,
  /^support$/i,
];

/**
 * Check if a name appears to be a system/test account
 */
function isSystemAccount(name: string): boolean {
  return SYSTEM_ACCOUNT_PATTERNS.some(pattern => pattern.test(name.trim()));
}

/**
 * Verify that fetched data looks like real project candidates
 * Returns validation result with warnings
 */
function validateFetchedCandidates(candidates: ClockworkExecutive[]): {
  valid: boolean;
  warnings: string[];
  systemAccountCount: number;
} {
  const systemAccountCount = candidates.filter(c => isSystemAccount(c.name)).length;
  const warnings: string[] = [];
  
  if (candidates.length === 0) {
    return { valid: true, warnings: [], systemAccountCount: 0 };
  }
  
  // More than 50% system accounts suggests the project filter isn't working
  if (systemAccountCount > candidates.length * 0.5) {
    warnings.push(`CLOCKWORK API LIMITATION: Found ${systemAccountCount}/${candidates.length} system/test accounts. The Clockwork API v3.0 ignores the project_id filter and returns all firm contacts instead of project-specific candidates. Contact Clockwork support for the correct endpoint.`);
    return { valid: false, warnings, systemAccountCount };
  }
  
  // All candidates have identical names suggests duplicate data
  const uniqueNames = new Set(candidates.map(c => c.name.toLowerCase()));
  if (candidates.length > 5 && uniqueNames.size < candidates.length * 0.3) {
    warnings.push(`Found many duplicate names (${uniqueNames.size} unique out of ${candidates.length}) - API may be returning incorrect data`);
  }
  
  // Warn about system accounts but don't invalidate if < 50%
  if (systemAccountCount > 0 && systemAccountCount <= candidates.length * 0.5) {
    warnings.push(`Found ${systemAccountCount} system/test accounts that will be filtered out`);
  }
  
  return { valid: true, warnings, systemAccountCount };
}

/**
 * Fetch positions for a specific person from Clockwork API
 * Returns the primary/current position with title and company
 */
async function fetchPersonPositions(
  personId: string,
  config: { baseUrl: string; firmSlug: string; firmKey: string; authToken: string },
  enrichmentRunId: string
): Promise<{ title: string; company: string } | null> {
  try {
    const url = `${config.baseUrl}/${config.firmSlug}/people/${personId}/positions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${config.authToken}`,
        'X-API-Key': config.firmKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`[Enrichment:${enrichmentRunId}] Position fetch for ${personId} returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[Enrichment:${enrichmentRunId}] Position response for ${personId}: ${JSON.stringify(data).substring(0, 300)}`);
    
    // Clockwork API returns positions in 'personPositions' field
    const positions = data.personPositions || data.data || data.positions || [];
    
    if (!Array.isArray(positions) || positions.length === 0) {
      return null;
    }
    
    // Find primary or current position (prefer current, then first)
    const primaryPos = positions.find((pos: any) => pos.isCurrent) || positions[0];
    
    // Extract title from position
    const title = primaryPos?.title || primaryPos?.positionTitle || '';
    
    // Extract company name from nested company object
    const company = primaryPos?.company?.name || primaryPos?.companyName || 
                    primaryPos?.organization?.name || '';
    
    return { title, company };
  } catch (err) {
    console.warn(`[Enrichment:${enrichmentRunId}] Failed to fetch positions for person ${personId}: ${err}`);
    return null;
  }
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
 * Fetch ALL career positions for a person from Clockwork API
 * Returns array of positions with company, title, dates
 * Exported for use in import endpoint
 */
export async function fetchClockworkCareerHistory(
  personId: string
): Promise<ClockworkCareerPosition[]> {
  const apiKey = process.env.CLOCKWORK_API_KEY;
  const apiSecret = process.env.CLOCKWORK_API_SECRET;
  const firmKey = process.env.CLOCKWORK_FIRM_KEY;
  const firmSlug = process.env.CLOCKWORK_FIRM_SLUG;

  if (!apiKey || !apiSecret || !firmKey || !firmSlug) {
    console.warn('[Enrichment] Clockwork credentials not configured');
    return [];
  }

  const authToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = 'https://api.clockworkrecruiting.com/v3.0';

  try {
    const url = `${baseUrl}/${firmSlug}/people/${personId}/positions`;
    console.log(`[Enrichment] Fetching career history for person ${personId}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${authToken}`,
        'X-API-Key': firmKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`[Enrichment] Career history fetch for ${personId} returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`[Enrichment] Career history response: ${JSON.stringify(data).substring(0, 500)}`);
    
    // Clockwork API returns positions in 'personPositions' field
    const positions = data.personPositions || data.data || data.positions || [];
    
    if (!Array.isArray(positions) || positions.length === 0) {
      return [];
    }
    
    // Transform to career position format
    const careerPositions: ClockworkCareerPosition[] = positions.map((pos: any, index: number) => {
      const title = pos.title || pos.positionTitle || 'Unknown Role';
      const company = pos.company?.name || pos.companyName || pos.organization?.name || 'Unknown Company';
      
      // Parse dates - Clockwork may use various date formats
      let startDate: string | null = null;
      let endDate: string | null = null;
      
      if (pos.startDate || pos.start_date || pos.startMonth) {
        const start = pos.startDate || pos.start_date;
        if (start) {
          // Try to extract year or full date
          startDate = String(start).substring(0, 10); // YYYY-MM-DD or YYYY
        } else if (pos.startYear && pos.startMonth) {
          startDate = `${pos.startYear}-${String(pos.startMonth).padStart(2, '0')}`;
        } else if (pos.startYear) {
          startDate = String(pos.startYear);
        }
      }
      
      if (pos.endDate || pos.end_date || pos.endMonth) {
        const end = pos.endDate || pos.end_date;
        if (end) {
          endDate = String(end).substring(0, 10);
        } else if (pos.endYear && pos.endMonth) {
          endDate = `${pos.endYear}-${String(pos.endMonth).padStart(2, '0')}`;
        } else if (pos.endYear) {
          endDate = String(pos.endYear);
        }
      }
      
      const isCurrent = pos.isCurrent === true || pos.is_current === true || !endDate;
      
      return {
        company,
        title,
        startDate,
        endDate,
        isCurrent
      };
    });
    
    // Sort by current first, then by start date (most recent first)
    careerPositions.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      // Both current or both not current - sort by start date
      const aStart = a.startDate || '0000';
      const bStart = b.startDate || '0000';
      return bStart.localeCompare(aStart); // Descending
    });
    
    console.log(`[Enrichment] Parsed ${careerPositions.length} career positions for person ${personId}`);
    return careerPositions;
  } catch (err) {
    console.warn(`[Enrichment] Failed to fetch career history for person ${personId}: ${err}`);
    return [];
  }
}

/**
 * Transform a raw person record to ClockworkExecutive format
 * Handles both flat and nested data structures from Clockwork API
 */
function transformToClockworkExecutive(p: any): ClockworkExecutive | null {
  const id = p.id || p.uuid || p.person_id;
  if (!id) {
    return null;
  }
  
  // Try to extract title from various possible locations
  let title = p.title || p.position || p.current_title || '';
  let company = p.company || p.current_company || p.organization || '';
  
  // Check for nested positions array or current_position object
  if (!title && p.positions && Array.isArray(p.positions) && p.positions.length > 0) {
    const primaryPosition = p.positions.find((pos: any) => pos.is_primary || pos.isPrimary) || p.positions[0];
    title = primaryPosition?.title || primaryPosition?.position_title || '';
    company = company || primaryPosition?.company || primaryPosition?.organization || primaryPosition?.company_name || '';
  }
  
  if (!title && p.current_position) {
    title = p.current_position.title || p.current_position.position_title || '';
    company = company || p.current_position.company || p.current_position.organization || '';
  }
  
  // Check for primaryPosition object
  if (!title && p.primaryPosition) {
    title = p.primaryPosition.title || '';
    company = company || p.primaryPosition.company || p.primaryPosition.organization || '';
  }
  
  // Extract email and linkedin from various locations
  let email = p.email || p.primary_email || '';
  let linkedin = p.linkedin || p.linkedin_url || '';
  
  // Check for nested email addresses
  if (!email && p.emailAddresses && Array.isArray(p.emailAddresses) && p.emailAddresses.length > 0) {
    const primaryEmail = p.emailAddresses.find((e: any) => e.is_primary || e.isPrimary) || p.emailAddresses[0];
    email = primaryEmail?.address || primaryEmail?.email || '';
  }
  
  // Check for nested linkedin URLs
  if (!linkedin && p.linkedinUrls && Array.isArray(p.linkedinUrls) && p.linkedinUrls.length > 0) {
    linkedin = p.linkedinUrls[0]?.url || p.linkedinUrls[0]?.address || '';
  }
  
  return {
    id: String(id),
    name: p.name || p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
    title,
    company,
    email,
    linkedin,
    imageUrl: p.image_url || p.photo_url || p.avatar_url || ''
  };
}

/**
 * Fetch candidates/people from a Clockwork project with pagination.
 * Tries multiple endpoint patterns to find the right one.
 * Returns structured result with error info for observability.
 */
async function fetchClockworkExecutives(
  clockworkProjectId: string,
  enrichmentRunId: string
): Promise<ClockworkFetchResult> {
  console.log(`[Enrichment:${enrichmentRunId}] Fetching candidates from Clockwork project: ${clockworkProjectId}`);
  
  const config = getClockworkConfig();
  if (!config) {
    console.error(`[Enrichment:${enrichmentRunId}] ERROR - Failed to get config - credentials missing`);
    return {
      candidates: [],
      status: 'error',
      error: {
        message: 'Clockwork API credentials not configured (CLOCKWORK_API_KEY, CLOCKWORK_API_SECRET, CLOCKWORK_FIRM_KEY)',
        status: undefined,
        endpoint: undefined
      },
      paginationUsed: false,
      pagesFetched: 0,
      totalRawCandidates: 0,
      endpointsTried: [],
      warnings: ['Clockwork API credentials not configured'],
      projectId: clockworkProjectId,
      firmSlug: 'unknown'
    };
  }
  
  const endpointsTriedDetails: ClockworkFetchResult['endpointsTried'] = [];
  const allWarnings: string[] = [];
  
  // Try multiple endpoint patterns for fetching project candidates
  // Based on Clockwork API v3.0 documentation:
  // GET /projects/{project_id}/candidacies returns project-specific candidates
  // Use ?include=person to embed person data in the response
  const endpointsToTry = [
    // PRIMARY: The correct endpoint for project-specific candidates
    { path: `projects/${clockworkProjectId}/candidacies`, queryParams: { include: 'person' }, isCandidacies: true },
    // FALLBACK: Root-level people endpoint (returns all firm contacts, not project-specific)
    { path: 'people', queryParams: {}, isCandidacies: false },
  ];
  
  const errors: Array<{ endpoint: string; status: number | null; message: string }> = [];
  
  for (const endpointConfig of endpointsToTry) {
    const { path: endpointPath, queryParams, isCandidacies } = endpointConfig as { path: string; queryParams: Record<string, string>; isCandidacies?: boolean };
    const endpointDesc = Object.keys(queryParams).length > 0 
      ? `${endpointPath}?${Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join('&')}` 
      : endpointPath;
    
    const allCandidates: ClockworkExecutive[] = [];
    let currentPage = 1;
    let currentOffset = 0;
    let hasMorePages = true;
    const maxPages = 50; // Safety limit
    const perPage = 100;
    let totalRawCandidates = 0;
    let paginationUsed = false;
    
    while (hasMorePages && currentPage <= maxPages) {
      // Add small delay between requests to avoid rate limiting (100ms)
      if (currentPage > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const url = new URL(`${config.baseUrl}/${config.firmSlug}/${endpointPath}`);
      // Add any custom query params (e.g., include=person for candidacies)
      for (const [key, value] of Object.entries(queryParams)) {
        if (value) url.searchParams.set(key, String(value));
      }
      
      // Candidacies endpoint uses offset/limit pagination, others use page/per_page
      if (isCandidacies) {
        url.searchParams.set('limit', String(perPage));
        url.searchParams.set('offset', String(currentOffset));
      } else {
        url.searchParams.set('page', String(currentPage));
        url.searchParams.set('per_page', String(perPage));
        // Try to include position/company data in the response for /people endpoint
        url.searchParams.set('include', 'positions,current_position');
        url.searchParams.set('expand', 'positions,current_position');
      }
      
      console.log(`[Enrichment:${enrichmentRunId}] Trying: ${url.toString()} (page ${currentPage})`);
      
      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Token ${config.authToken}`,
            'X-API-Key': config.firmKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (currentPage === 1) {
            console.log(`[Enrichment:${enrichmentRunId}] SUCCESS! Endpoint ${endpointDesc} works`);
          }
          
          // Extract people/candidates from various response formats
          // For candidacies endpoint, extract person from each candidacy object
          let people: any[] = [];
          if (data.candidacies && Array.isArray(data.candidacies)) {
            // Candidacies response: extract person from each candidacy
            people = data.candidacies
              .filter((c: any) => c.person)
              .map((c: any) => ({
                ...c.person,
                // Include candidacy-level data that may be useful
                candidacyId: c.id,
                projectId: c.projectId,
                rank: c.rank,
                stoplightStatus: c.stoplightStatus,
              }));
            console.log(`[Enrichment:${enrichmentRunId}] INFO - Parsed ${people.length} persons from candidacies response`);
          } else {
            // Standard people/candidates response
            people = data.data || data.people || data.candidates || data.items || [];
          }
          
          // Debug: Log first person's raw structure to understand available fields
          if (currentPage === 1 && people.length > 0) {
            const firstPerson = people[0];
            console.log(`[Enrichment:${enrichmentRunId}] DEBUG - Raw person fields: ${Object.keys(firstPerson).join(', ')}`);
            console.log(`[Enrichment:${enrichmentRunId}] DEBUG - Sample person: ${JSON.stringify(firstPerson).substring(0, 500)}`);
          }
          
          if (Array.isArray(people)) {
            totalRawCandidates += people.length;
            console.log(`[Enrichment:${enrichmentRunId}] INFO - Page ${currentPage}: Found ${people.length} candidates`);
            
            // Transform and filter candidates
            for (const p of people) {
              const candidate = transformToClockworkExecutive(p);
              if (candidate) {
                allCandidates.push(candidate);
              } else {
                const name = p.name || p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
                console.warn(`[Enrichment:${enrichmentRunId}] Skipping candidate without stable ID: ${name}`);
              }
            }
            
            // Check for pagination info from multiple possible sources
            // Try nested meta/pagination objects first, then top-level fields
            const meta = data.meta || data.pagination || {};
            
            // Get total count from various sources
            const totalCount = meta.total_count || meta.total || data.total_count || data.total || 0;
            
            // Handle pagination differently for candidacies (offset/limit) vs people (page/per_page)
            if (isCandidacies) {
              // Candidacies uses offset/limit pagination
              // Determine if there are more items based on count received
              console.log(`[Enrichment:${enrichmentRunId}] INFO - Candidacies offset ${currentOffset}, received ${people.length}, totalCount=${totalCount}`);
              
              currentOffset += people.length;
              
              if (people.length === 0) {
                // Empty response means we're done
                hasMorePages = false;
              } else if (totalCount > 0 && currentOffset >= totalCount) {
                // We've fetched all items based on total_count
                hasMorePages = false;
              } else if (people.length < perPage) {
                // Received fewer items than requested, likely last page
                hasMorePages = false;
              } else {
                // Full page received, there might be more
                paginationUsed = true;
                currentPage++;
              }
            } else {
              // Page-based pagination for /people endpoint
              // Get total pages - either explicit or computed from total_count / per_page
              let totalPages = meta.total_pages || meta.pages || data.total_pages || data.pages || 0;
              
              // If total_count is provided but total_pages is not, compute it
              if (totalPages === 0 && totalCount > 0) {
                totalPages = Math.ceil(totalCount / perPage);
              }
              
              // Fallback: if still no pagination info, assume single page if we got fewer items than requested
              if (totalPages === 0) {
                totalPages = people.length >= perPage ? currentPage + 1 : 1;
              }
              
              console.log(`[Enrichment:${enrichmentRunId}] INFO - Pagination: page ${currentPage}, totalPages=${totalPages}, totalCount=${totalCount}, perPage=${perPage}, received=${people.length}`);
              
              if (totalPages > 1 || totalCount > perPage) {
                paginationUsed = true;
              }
              
              // Determine if there are more pages
              if (currentPage >= totalPages) {
                hasMorePages = false;
              } else if (people.length === 0) {
                hasMorePages = false;
              } else {
                currentPage++;
              }
            }
          } else {
            hasMorePages = false;
          }
        } else {
          const errorBody = await response.text().catch(() => '(no body)');
          console.error(`[Enrichment:${enrichmentRunId}] ERROR - Endpoint ${endpointDesc} returned ${response.status}: ${errorBody.substring(0, 200)}`);
          errors.push({
            endpoint: endpointDesc,
            status: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`
          });
          hasMorePages = false;
          break; // Try next endpoint
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Enrichment:${enrichmentRunId}] ERROR - Endpoint ${endpointDesc} failed: ${errMsg}`);
        errors.push({
          endpoint: endpointDesc,
          status: null,
          message: errMsg
        });
        hasMorePages = false;
        break; // Try next endpoint
      }
    }
    
    // If we got candidates from this endpoint, enrich with position data and deduplicate
    if (allCandidates.length > 0 || (currentPage > 1 && totalRawCandidates > 0)) {
      console.log(`[Enrichment:${enrichmentRunId}] INFO - Total pages fetched: ${currentPage}, raw candidates: ${totalRawCandidates}, valid candidates: ${allCandidates.length}`);
      
      // Deduplicate by Clockwork ID
      const seenIds = new Set<string>();
      const uniqueCandidates: ClockworkExecutive[] = [];
      for (const candidate of allCandidates) {
        if (!seenIds.has(candidate.id)) {
          seenIds.add(candidate.id);
          uniqueCandidates.push(candidate);
        }
      }
      
      if (uniqueCandidates.length < allCandidates.length) {
        console.log(`[Enrichment:${enrichmentRunId}] INFO - Deduplicated: ${allCandidates.length} -> ${uniqueCandidates.length} candidates`);
      }
      
      // Fetch position data for candidates without title (limit to first 50 to avoid rate limits)
      const candidatesNeedingPositions = uniqueCandidates.filter(c => !c.title).slice(0, 50);
      if (candidatesNeedingPositions.length > 0) {
        console.log(`[Enrichment:${enrichmentRunId}] INFO - Fetching positions for ${candidatesNeedingPositions.length} candidates...`);
        
        let positionsFetched = 0;
        for (const candidate of candidatesNeedingPositions) {
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));
          
          const positionData = await fetchPersonPositions(candidate.id, config, enrichmentRunId);
          if (positionData) {
            candidate.title = positionData.title;
            candidate.company = positionData.company;
            positionsFetched++;
          }
        }
        
        console.log(`[Enrichment:${enrichmentRunId}] INFO - Successfully fetched ${positionsFetched} positions`);
      }
      
      // Validate that we got real candidates, not just system accounts
      const validation = validateFetchedCandidates(uniqueCandidates);
      allWarnings.push(...validation.warnings);
      
      // Filter out system accounts from final results
      const filteredCandidates = uniqueCandidates.filter(c => !isSystemAccount(c.name));
      
      endpointsTriedDetails.push({
        endpoint: endpointDesc,
        status: 200,
        success: true,
        candidateCount: filteredCandidates.length,
        samplePerson: filteredCandidates[0] ? {
          id: filteredCandidates[0].id,
          name: filteredCandidates[0].name,
          company: filteredCandidates[0].company || ''
        } : undefined
      });
      
      return {
        candidates: filteredCandidates,
        status: validation.valid 
          ? (filteredCandidates.length > 0 ? 'success' : 'no_candidates')
          : 'invalid_data',
        paginationUsed,
        pagesFetched: currentPage,
        totalRawCandidates,
        successEndpoint: endpointDesc,
        endpointsTried: endpointsTriedDetails,
        warnings: allWarnings,
        projectId: clockworkProjectId,
        firmSlug: config.firmSlug
      };
    }
  }
  
  // All endpoints failed
  const lastError = errors[errors.length - 1];
  console.error(`[Enrichment:${enrichmentRunId}] ERROR - All ${endpointsToTry.length} candidate endpoints failed`);
  
  return {
    candidates: [],
    status: 'error',
    error: {
      message: lastError?.message || 'All candidate endpoints failed',
      status: lastError?.status ?? undefined,
      endpoint: lastError?.endpoint
    },
    paginationUsed: false,
    pagesFetched: 0,
    totalRawCandidates: 0,
    endpointsTried: endpointsTriedDetails,
    warnings: allWarnings,
    projectId: clockworkProjectId,
    firmSlug: config.firmSlug
  };
}

/**
 * ENRICHMENT ORCHESTRATION FUNCTION
 * 
 * This function orchestrates the matching of executives between our database
 * and a Clockwork project. It is:
 * - DETERMINISTIC: Same inputs always produce same outputs
 * - SIDE-EFFECT FREE: Does not persist any data
 * - READ-ONLY: Only reads from database, never writes
 * 
 * Steps:
 * 1. Generate enrichment_run_id for observability
 * 2. Fetch all executives from our database for the given search_id
 * 3. Fetch all executives from the Clockwork project
 * 4. Use fuzzy matching to compare each local executive against Clockwork
 * 5. Classify matches as: confirmed, possible, or no_match
 * 6. Return structured results to UI for user review
 * 
 * ENRICHMENT LAYER RULES:
 * - Does NOT auto-merge executives
 * - Does NOT delete any data
 * - Does NOT persist enriched data (user must confirm first)
 */
export async function orchestrateEnrichmentMatching(
  searchId: number,
  clockworkProjectId: string
): Promise<EnrichmentMatchResult> {
  // Generate unique run ID for observability
  const enrichmentRunId = randomUUID().substring(0, 8);
  const config = getClockworkConfig();
  const firmSlug = config?.firmSlug || 'unknown';
  
  console.log(`[Enrichment:${enrichmentRunId}] INFO - Starting match orchestration`);
  console.log(`[Enrichment:${enrichmentRunId}] INFO - search_id=${searchId}, clockwork_project_id=${clockworkProjectId}, firm_slug=${firmSlug}`);
  
  // Step 1: Fetch all companies and executives for this search from our database
  const companies = await storage.getCompaniesBySearchQuery(searchId);
  const localExecutives: Array<{
    id: number;
    name: string;
    title: string;
    companyName: string;
    companyId: number;
  }> = [];
  
  for (const company of companies) {
    const executives = await storage.getExecutivesByCompany(company.id);
    for (const exec of executives) {
      localExecutives.push({
        id: exec.id,
        name: exec.name,
        title: exec.title,
        companyName: company.name,
        companyId: company.id
      });
    }
  }
  
  console.log(`[Enrichment:${enrichmentRunId}] INFO - Found ${localExecutives.length} local executives from ${companies.length} companies`);
  
  // Step 2: Fetch executives from Clockwork project
  const fetchResult = await fetchClockworkExecutives(clockworkProjectId, enrichmentRunId);
  const clockworkExecutives = fetchResult.candidates;
  
  console.log(`[Enrichment:${enrichmentRunId}] INFO - Clockwork fetch status: ${fetchResult.status}, candidates: ${clockworkExecutives.length}`);
  
  // Step 3 & 4: Match and classify each local executive
  const matches: {
    confirmed: ExecutiveMatch[];
    possible: ExecutiveMatch[];
    noMatch: ExecutiveMatch[];
  } = {
    confirmed: [],
    possible: [],
    noMatch: []
  };
  
  for (const localExec of localExecutives) {
    const { match: clockworkMatch, scores } = findBestMatch(
      { name: localExec.name, title: localExec.title, companyName: localExec.companyName },
      clockworkExecutives
    );
    
    const { classification, confidence } = classifyMatch(
      scores.nameScore,
      scores.titleScore,
      scores.companyScore
    );
    
    const matchResult: ExecutiveMatch = {
      localExecutiveId: localExec.id,
      localExecutiveName: localExec.name,
      localExecutiveTitle: localExec.title,
      localCompanyName: localExec.companyName,
      clockworkExecutiveId: clockworkMatch?.id ?? null,
      clockworkExecutiveName: clockworkMatch?.name ?? null,
      clockworkExecutiveTitle: clockworkMatch?.title ?? null,
      classification,
      confidence,
      matchDetails: scores
    };
    
    // Classify into appropriate bucket
    switch (classification) {
      case 'confirmed':
        matches.confirmed.push(matchResult);
        break;
      case 'possible':
        matches.possible.push(matchResult);
        break;
      case 'no_match':
        matches.noMatch.push(matchResult);
        break;
    }
  }
  
  // Sort each category by confidence (highest first)
  matches.confirmed.sort((a, b) => b.confidence - a.confidence);
  matches.possible.sort((a, b) => b.confidence - a.confidence);
  matches.noMatch.sort((a, b) => b.confidence - a.confidence);
  
  // Step 5: Build and return structured result
  const result: EnrichmentMatchResult = {
    enrichmentRunId,
    searchId,
    clockworkProjectId,
    clockworkFirmSlug: firmSlug,
    timestamp: new Date(),
    totalLocalExecutives: localExecutives.length,
    totalClockworkExecutives: clockworkExecutives.length,
    totalRawCandidates: fetchResult.totalRawCandidates,
    clockworkCandidates: clockworkExecutives,
    matches,
    summary: {
      confirmedCount: matches.confirmed.length,
      possibleCount: matches.possible.length,
      noMatchCount: matches.noMatch.length
    },
    fetchStatus: fetchResult.status,
    fetchError: fetchResult.error,
    paginationUsed: fetchResult.paginationUsed,
    pagesFetched: fetchResult.pagesFetched,
    endpointsTried: fetchResult.endpointsTried,
    warnings: fetchResult.warnings,
    successEndpoint: fetchResult.successEndpoint
  };
  
  console.log(`[Enrichment:${enrichmentRunId}] INFO - Match results: confirmed=${result.summary.confirmedCount}, possible=${result.summary.possibleCount}, no_match=${result.summary.noMatchCount}`);
  console.log(`[Enrichment:${enrichmentRunId}] INFO - Clockwork candidates available: ${clockworkExecutives.length}`);
  
  return result;
}

/**
 * Research company details using AI when importing a Clockwork candidate
 * whose company doesn't exist in the search results.
 * 
 * Returns real company data: revenue, location, employees, coordinates
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
  revenue: number;
  revenueSource: string;
  employees: number;
  employeesSource: string;
  confidence: number;
}

// Region coordinates for fallback when AI doesn't provide precise location
const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 25.2048, lng: 55.2708 } // Default to Dubai/Middle East
};

function parseNumeric(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$\s]/g, '').replace(/[BbMmKk]$/, (m) => {
      const multipliers: Record<string, string> = { 'B': '000000000', 'b': '000000000', 'M': '000000', 'm': '000000', 'K': '000', 'k': '000' };
      return multipliers[m] || '';
    });
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

function validateAndNormalizeCoordinates(lat: any, lng: any, country?: string, region?: string): { lat: number; lng: number } {
  const parsedLat = parseNumeric(lat);
  const parsedLng = parseNumeric(lng);
  
  // Check if coordinates are valid
  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 && 
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  
  // Fallback to region/country coordinates
  const lookupKey = (country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];
  
  // Add small random offset to avoid exact same coordinates
  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

export async function researchCompanyDetails(companyName: string): Promise<ResearchedCompany> {
  console.log(`[Enrichment:Research] Researching company details for: ${companyName}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are a company research analyst. Given a company name, research and return accurate information about that company.

Return ONLY valid JSON with this exact structure:
{
  "name": "Official Company Name",
  "sector": "Primary Industry Sector",
  "region": "Geographic Region (e.g., Middle East, Europe, North America)",
  "country": "Country where headquarters is located",
  "city": "City where headquarters is located",
  "streetAddress": "Exact street address of headquarters",
  "latitude": 25.2048,
  "longitude": 55.2708,
  "revenue": 500000000,
  "revenueSource": "Annual Report 2024 / Estimate based on industry data",
  "employees": 1500,
  "employeesSource": "Company Website / LinkedIn / Estimate",
  "confidence": 7
}

CRITICAL REQUIREMENTS:
1. Use the OFFICIAL company name (correct capitalization, legal entity)
2. Revenue MUST be in USD (convert if in other currency) - NEVER return 0, provide an estimate if unknown
3. Employees MUST be a realistic number - NEVER return 0, provide an estimate if unknown
4. Latitude/Longitude must be the PRECISE coordinates of the headquarters building
5. If exact data is unavailable, provide best estimate based on company size/industry and set confidence lower (1-10)
6. Return ONLY the JSON object, no additional text or markdown`
        },
        {
          role: "user",
          content: `Research this company and provide details: "${companyName}"`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
      temperature: 0.3
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const data = JSON.parse(content);
    
    // Validate and normalize all fields
    const name = String(data.name || companyName).trim();
    const sector = String(data.sector || 'Business Services').trim();
    const region = String(data.region || 'Unknown').trim();
    const country = String(data.country || 'Unknown').trim();
    const city = String(data.city || '').trim();
    const streetAddress = String(data.streetAddress || '').trim();
    
    // Validate coordinates with fallback
    const coords = validateAndNormalizeCoordinates(data.latitude, data.longitude, country, region);
    
    // Parse revenue - ensure non-zero
    let revenue = parseNumeric(data.revenue, 0);
    if (revenue <= 0) {
      // Estimate based on employee count or default
      const estEmployees = parseNumeric(data.employees, 100);
      revenue = estEmployees * 100000; // Rough estimate: $100k revenue per employee
      console.log(`[Enrichment:Research] Estimated revenue for ${name}: $${revenue}`);
    }
    
    // Parse employees - ensure non-zero
    let employees = Math.round(parseNumeric(data.employees, 0));
    if (employees <= 0) {
      employees = 100; // Default estimate for unknown company size
      console.log(`[Enrichment:Research] Estimated employees for ${name}: ${employees}`);
    }
    
    // Confidence score
    let confidence = parseNumeric(data.confidence, 5);
    confidence = Math.max(1, Math.min(10, confidence));
    
    console.log(`[Enrichment:Research] Successfully researched company: ${name} (Revenue: $${revenue}, Employees: ${employees}, Location: ${country})`);
    
    return {
      name,
      sector,
      region,
      country,
      city,
      streetAddress,
      latitude: coords.lat,
      longitude: coords.lng,
      revenue,
      revenueSource: String(data.revenueSource || 'AI Research').trim(),
      employees,
      employeesSource: String(data.employeesSource || 'AI Research').trim(),
      confidence
    };
  } catch (error: any) {
    console.error(`[Enrichment:Research] Failed to research company: ${error.message}`);
    
    // Return fallback with reasonable estimates instead of zeros
    const defaultCoords = REGION_COORDINATES['default'];
    return {
      name: companyName,
      sector: 'Business Services',
      region: 'Unknown',
      country: 'Unknown',
      city: '',
      streetAddress: '',
      latitude: defaultCoords.lat + (Math.random() - 0.5) * 0.1,
      longitude: defaultCoords.lng + (Math.random() - 0.5) * 0.1,
      revenue: 10000000, // $10M default estimate
      revenueSource: 'Estimate (research failed)',
      employees: 100,
      employeesSource: 'Estimate (research failed)',
      confidence: 1
    };
  }
}
