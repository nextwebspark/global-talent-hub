import { storage } from "../../storage";
import { randomUUID } from "crypto";
import type {
  EnrichmentMatchResult,
  ExecutiveMatch,
} from "./types";
import { getClockworkConfig } from "./apiClient";
import { classifyMatch, findBestMatch } from "./matching";
import { fetchClockworkExecutives } from "./people";

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
  clockworkProjectId: string,
  orgId: string
): Promise<EnrichmentMatchResult> {
  // Generate unique run ID for observability
  const enrichmentRunId = randomUUID().substring(0, 8);
  const config = getClockworkConfig();
  const firmSlug = config?.firmSlug || 'unknown';

  console.log(`[Enrichment:${enrichmentRunId}] INFO - Starting match orchestration`);
  console.log(`[Enrichment:${enrichmentRunId}] INFO - search_id=${searchId}, clockwork_project_id=${clockworkProjectId}, firm_slug=${firmSlug}`);

  // Step 1: Fetch all companies and executives for this search from our database
  const companies = await storage.getCompaniesBySearchQuery(searchId, orgId);
  const localExecutives: Array<{
    id: number;
    name: string;
    title: string;
    companyName: string;
    companyId: number;
  }> = [];

  for (const company of companies) {
    const executives = await storage.getExecutivesByCompany(company.id, orgId);
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
