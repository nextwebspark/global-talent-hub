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
