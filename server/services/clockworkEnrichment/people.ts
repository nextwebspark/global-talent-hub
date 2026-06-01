import { randomUUID } from "crypto";
import type {
  ClockworkCareerPosition,
  ClockworkExecutive,
  ClockworkFetchResult,
} from "./types";
import { getClockworkConfig } from "./apiClient";
import { isSystemAccount, validateFetchedCandidates } from "./validation";

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
export async function fetchClockworkExecutives(
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
