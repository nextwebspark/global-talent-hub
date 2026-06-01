import type { ClockworkDiagnosticsResult } from "./types";
import { getClockworkConfig } from "./apiClient";

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
