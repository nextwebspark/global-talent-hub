/**
 * Enrichment Layer (Clockwork Integration)
 * 
 * This layer is responsible for optional data enrichment that:
 * - Runs ONLY when explicitly triggered by the user
 * - Never auto-runs on search or page load
 * - Never replaces or deletes LLM-discovered executives
 * - Adds supplementary data to existing records
 * 
 * Status: PLACEHOLDER - Ready for Clockwork integration
 */

import { storage } from "../storage";

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
  searchId: number;
  clockworkProjectId: string;
  timestamp: Date;
  totalLocalExecutives: number;
  totalClockworkExecutives: number;
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
 * PLACEHOLDER: Fetch executives from Clockwork project.
 * In production, this would call the Clockwork API.
 */
async function fetchClockworkExecutives(clockworkProjectId: string): Promise<ClockworkExecutive[]> {
  console.log(`[Enrichment:Clockwork] Fetching executives from Clockwork project: ${clockworkProjectId}`);
  
  // PLACEHOLDER: Return empty array until Clockwork API is integrated
  // When implemented:
  // const response = await fetch(`https://api.clockwork.com/projects/${clockworkProjectId}/executives`, {
  //   headers: { 'Authorization': `Bearer ${process.env.CLOCKWORK_API_KEY}` }
  // });
  // return response.json();
  
  console.log(`[Enrichment:Clockwork] Placeholder - returning empty array until API integration`);
  return [];
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
 * 1. Fetch all executives from our database for the given search_id
 * 2. Fetch all executives from the Clockwork project (placeholder)
 * 3. Use fuzzy matching to compare each local executive against Clockwork
 * 4. Classify matches as: confirmed, possible, or no_match
 * 5. Return structured results to UI for user review
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
  console.log(`[Enrichment:Orchestrate] Starting match orchestration for search ${searchId} with Clockwork project ${clockworkProjectId}`);
  
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
  
  console.log(`[Enrichment:Orchestrate] Found ${localExecutives.length} local executives from ${companies.length} companies`);
  
  // Step 2: Fetch executives from Clockwork project
  const clockworkExecutives = await fetchClockworkExecutives(clockworkProjectId);
  console.log(`[Enrichment:Orchestrate] Found ${clockworkExecutives.length} Clockwork executives`);
  
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
    searchId,
    clockworkProjectId,
    timestamp: new Date(),
    totalLocalExecutives: localExecutives.length,
    totalClockworkExecutives: clockworkExecutives.length,
    matches,
    summary: {
      confirmedCount: matches.confirmed.length,
      possibleCount: matches.possible.length,
      noMatchCount: matches.noMatch.length
    }
  };
  
  console.log(`[Enrichment:Orchestrate] Match results: ${result.summary.confirmedCount} confirmed, ${result.summary.possibleCount} possible, ${result.summary.noMatchCount} no match`);
  
  return result;
}
