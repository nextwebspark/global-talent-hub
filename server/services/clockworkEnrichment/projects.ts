import type { ClockworkProject } from "./types";
import {
  getClockworkConfig,
  transformAPIProject,
  type ClockworkAPIProjectResponse,
} from "./apiClient";

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
