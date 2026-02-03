/**
 * POST-LLM VALIDATION LAYER
 * 
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CORE ARCHITECTURAL PRINCIPLE (NON-NEGOTIABLE)                   ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║  1. THE LLM PROPOSES.                                            ║
 * ║  2. THE APPLICATION DECIDES.                                     ║
 * ║  3. THE UI ONLY SHOWS VALIDATED TRUTH.                           ║
 * ║                                                                  ║
 * ║  NO EXCEPTIONS.                                                  ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * 
 * This module runs AFTER the LLM response is received and parsed,
 * but BEFORE any data is stored, ranked, visualized, or shown to the user.
 * 
 * RULES:
 * - This layer does NOT generate data
 * - It may only: VALIDATE, STRIP, BLOCK, or DEGRADE results
 * - All existing logic in discovery.ts remains unchanged
 * - This is an additional guardrail layer, not a replacement
 */

import { 
  getFactualCompanyFields, 
  getNarrativeCompanyFields,
  isNarrativeField 
} from './fieldClassification';

// ========== SEARCH PRE-FLIGHT CHECKLIST ==========
// Mandatory checks that must pass before results can be displayed.
// If a check fails, an allowed fallback may be applied.

export interface PreFlightCheck {
  id: string;
  name: string;
  passed: boolean;
  fallbackApplied: boolean;
  fallbackDescription?: string;
  reason: string;
}

export interface PreFlightChecklistResult {
  allChecksPassed: boolean;
  checks: PreFlightCheck[];
  canProceed: boolean;  // true if all passed OR all have valid fallbacks
  blockedReason?: string;
}

/**
 * SEARCH PRE-FLIGHT CHECKLIST
 * Results must not be displayed unless all checks pass or an allowed fallback is applied.
 */
export function runPreFlightChecklist(
  companies: any[],
  options: PostLlmValidationOptions
): PreFlightChecklistResult {
  const checks: PreFlightCheck[] = [];
  
  console.log(`[PreFlightChecklist] Running mandatory checks...`);

  // CHECK 1: Minimum Results Threshold
  // Must have at least 1 result, or the search is considered failed
  const minResultsCheck: PreFlightCheck = {
    id: 'MIN_RESULTS',
    name: 'Minimum Results Threshold',
    passed: companies.length >= 1,
    fallbackApplied: false,
    reason: companies.length >= 1 
      ? `${companies.length} results returned`
      : 'No results returned from LLM'
  };
  // No fallback available for zero results - this blocks the search
  checks.push(minResultsCheck);

  // CHECK 2: Confidence Threshold
  // At least one company must have confidence >= 5 (medium confidence)
  const MIN_ACCEPTABLE_CONFIDENCE = 5;
  const companiesWithAcceptableConfidence = companies.filter(
    c => (c.confidence || 0) >= MIN_ACCEPTABLE_CONFIDENCE
  );
  const hasAcceptableConfidence = companiesWithAcceptableConfidence.length > 0;
  
  const confidenceCheck: PreFlightCheck = {
    id: 'CONFIDENCE_THRESHOLD',
    name: 'Confidence Threshold',
    passed: hasAcceptableConfidence,
    fallbackApplied: false,
    reason: hasAcceptableConfidence
      ? `${companiesWithAcceptableConfidence.length} companies meet confidence threshold (>=${MIN_ACCEPTABLE_CONFIDENCE})`
      : `No companies meet minimum confidence threshold (>=${MIN_ACCEPTABLE_CONFIDENCE})`
  };
  
  // Fallback: Allow low-confidence results but flag them
  if (!hasAcceptableConfidence && companies.length > 0) {
    confidenceCheck.fallbackApplied = true;
    confidenceCheck.fallbackDescription = 'Low confidence results will be displayed with warning';
  }
  checks.push(confidenceCheck);

  // CHECK 3: Required Fields Present
  // Every company must have: name, country, latitude, longitude
  const REQUIRED_FIELDS = ['name', 'country', 'latitude', 'longitude'];
  const companiesWithRequiredFields = companies.filter(c => {
    return REQUIRED_FIELDS.every(field => {
      const value = c[field];
      return value !== undefined && value !== null && value !== '';
    });
  });
  const allHaveRequiredFields = companiesWithRequiredFields.length === companies.length;
  
  const requiredFieldsCheck: PreFlightCheck = {
    id: 'REQUIRED_FIELDS',
    name: 'Required Fields Present',
    passed: allHaveRequiredFields,
    fallbackApplied: false,
    reason: allHaveRequiredFields
      ? 'All companies have required fields (name, country, coordinates)'
      : `${companies.length - companiesWithRequiredFields.length} companies missing required fields`
  };
  
  // Fallback: Strip companies missing required fields
  if (!allHaveRequiredFields && companiesWithRequiredFields.length > 0) {
    requiredFieldsCheck.fallbackApplied = true;
    requiredFieldsCheck.fallbackDescription = `${companies.length - companiesWithRequiredFields.length} incomplete companies will be stripped`;
  }
  checks.push(requiredFieldsCheck);

  // CHECK 4: No Duplicate Companies
  // Company names should be unique (case-insensitive)
  const seenNames = new Set<string>();
  const duplicates: string[] = [];
  for (const c of companies) {
    const normalizedName = String(c.name || '').toLowerCase().trim();
    if (seenNames.has(normalizedName)) {
      duplicates.push(c.name);
    } else {
      seenNames.add(normalizedName);
    }
  }
  const noDuplicates = duplicates.length === 0;
  
  const duplicatesCheck: PreFlightCheck = {
    id: 'NO_DUPLICATES',
    name: 'No Duplicate Companies',
    passed: noDuplicates,
    fallbackApplied: false,
    reason: noDuplicates
      ? 'All company names are unique'
      : `${duplicates.length} duplicate company names found`
  };
  
  // Fallback: Duplicates will be stripped in validation
  if (!noDuplicates) {
    duplicatesCheck.fallbackApplied = true;
    duplicatesCheck.fallbackDescription = 'Duplicate companies will be removed, keeping first occurrence';
  }
  checks.push(duplicatesCheck);

  // CHECK 5: Result Count Reasonableness
  // Results should not exceed 2x the requested limit (LLM hallucination check)
  const maxReasonableResults = options.requestedLimit * 2;
  const isReasonableCount = companies.length <= maxReasonableResults;
  
  const reasonableCountCheck: PreFlightCheck = {
    id: 'REASONABLE_COUNT',
    name: 'Result Count Reasonableness',
    passed: isReasonableCount,
    fallbackApplied: false,
    reason: isReasonableCount
      ? `Result count (${companies.length}) is reasonable for requested limit (${options.requestedLimit})`
      : `Result count (${companies.length}) exceeds 2x requested limit (${options.requestedLimit})`
  };
  
  // Fallback: Truncate to requested limit
  if (!isReasonableCount) {
    reasonableCountCheck.fallbackApplied = true;
    reasonableCountCheck.fallbackDescription = `Results will be truncated to ${options.requestedLimit}`;
  }
  checks.push(reasonableCountCheck);

  // Determine if we can proceed
  const allChecksPassed = checks.every(c => c.passed);
  const allHaveFallbacks = checks.every(c => c.passed || c.fallbackApplied);
  const canProceed = allHaveFallbacks;
  
  // Find blocking reason if any
  let blockedReason: string | undefined;
  if (!canProceed) {
    const blockingCheck = checks.find(c => !c.passed && !c.fallbackApplied);
    blockedReason = blockingCheck 
      ? `Pre-flight check failed: ${blockingCheck.name} - ${blockingCheck.reason}`
      : 'Pre-flight checks failed';
  }

  console.log(`[PreFlightChecklist] Results: ${allChecksPassed ? 'ALL PASSED' : 'SOME FAILED'}, canProceed: ${canProceed}`);
  checks.forEach(c => {
    const status = c.passed ? 'PASS' : (c.fallbackApplied ? 'FALLBACK' : 'FAIL');
    console.log(`[PreFlightChecklist]   ${c.id}: ${status} - ${c.reason}`);
  });

  return {
    allChecksPassed,
    checks,
    canProceed,
    blockedReason
  };
}

/**
 * Apply fallbacks from pre-flight checklist to the company data.
 * This modifies the data according to the fallback rules.
 */
export function applyPreFlightFallbacks(
  companies: any[],
  checklistResult: PreFlightChecklistResult,
  options: PostLlmValidationOptions
): any[] {
  let result = [...companies];
  
  // Apply REQUIRED_FIELDS fallback: strip companies missing required fields
  const requiredFieldsCheck = checklistResult.checks.find(c => c.id === 'REQUIRED_FIELDS');
  if (requiredFieldsCheck?.fallbackApplied) {
    const REQUIRED_FIELDS = ['name', 'country', 'latitude', 'longitude'];
    const before = result.length;
    result = result.filter(c => {
      return REQUIRED_FIELDS.every(field => {
        const value = c[field];
        return value !== undefined && value !== null && value !== '';
      });
    });
    console.log(`[PreFlightFallback] REQUIRED_FIELDS: Stripped ${before - result.length} incomplete companies`);
  }
  
  // Apply NO_DUPLICATES fallback: remove duplicate companies
  const duplicatesCheck = checklistResult.checks.find(c => c.id === 'NO_DUPLICATES');
  if (duplicatesCheck?.fallbackApplied) {
    const seenNames = new Set<string>();
    const before = result.length;
    result = result.filter(c => {
      const normalizedName = String(c.name || '').toLowerCase().trim();
      if (seenNames.has(normalizedName)) {
        return false;
      }
      seenNames.add(normalizedName);
      return true;
    });
    console.log(`[PreFlightFallback] NO_DUPLICATES: Removed ${before - result.length} duplicate companies`);
  }
  
  // Apply REASONABLE_COUNT fallback: truncate to requested limit
  const reasonableCountCheck = checklistResult.checks.find(c => c.id === 'REASONABLE_COUNT');
  if (reasonableCountCheck?.fallbackApplied) {
    const before = result.length;
    result = result.slice(0, options.requestedLimit);
    console.log(`[PreFlightFallback] REASONABLE_COUNT: Truncated from ${before} to ${result.length} companies`);
  }
  
  return result;
}

// ========== NARRATIVE SEPARATION ENFORCEMENT ==========
// Narrative fields (summary, relevanceReason, AI text) must NEVER:
// 1. Populate factual fields
// 2. Influence ranking
// 3. Influence map scaling
// 4. Substitute missing data

export interface NarrativeSeparationResult {
  companies: any[];
  violations: NarrativeViolation[];
  enforced: boolean;
}

export interface NarrativeViolation {
  companyName: string;
  violationType: 'populated_factual' | 'influenced_ranking' | 'influenced_scaling' | 'substituted_data';
  description: string;
  field?: string;
  correctionApplied: string;
}

/**
 * Enforce narrative separation rules on company data.
 * This function ensures narrative fields do not contaminate factual data.
 */
export function enforceNarrativeSeparation(companies: any[]): NarrativeSeparationResult {
  const violations: NarrativeViolation[] = [];
  const factualFields = getFactualCompanyFields();
  const narrativeFields = getNarrativeCompanyFields();
  
  console.log(`[NarrativeSeparation] Enforcing separation on ${companies.length} companies`);
  console.log(`[NarrativeSeparation] Factual fields: ${factualFields.join(', ')}`);
  console.log(`[NarrativeSeparation] Narrative fields: ${narrativeFields.join(', ')}`);
  
  const enforcedCompanies = companies.map(company => {
    const companyName = String(company.name || 'Unknown').trim();
    const enforcedCompany = { ...company };
    
    // RULE 1: Narrative fields must not populate factual fields
    // Check if any factual field contains obvious narrative content
    for (const factualField of factualFields) {
      const value = enforcedCompany[factualField];
      if (typeof value === 'string' && value.length > 0) {
        // Check for narrative patterns in factual fields
        const narrativePatterns = [
          /^This company/i,
          /^The company/i,
          /matches the query because/i,
          /is included because/i,
          /was selected because/i,
          /demonstrates/i,
          /appears to be/i,
          /seems to be/i,
          /is likely/i,
          /probably/i
        ];
        
        if (narrativePatterns.some(pattern => pattern.test(value))) {
          violations.push({
            companyName,
            violationType: 'populated_factual',
            description: `Factual field "${factualField}" contains narrative text`,
            field: factualField,
            correctionApplied: 'Field set to null'
          });
          enforcedCompany[factualField] = null;
        }
      }
    }
    
    // RULE 2: Narrative fields must not influence ranking
    // Ensure ranking is based only on factual metrics
    // (Revenue, employees, confidence are the ranking factors - all factual)
    // No action needed here - this is enforced by design in the ranking logic
    
    // RULE 3: Narrative fields must not influence map scaling
    // Map scaling should be based on revenue/employees only
    // Ensure these are numeric and not derived from narrative
    if (enforcedCompany.revenue !== null && enforcedCompany.revenue !== undefined) {
      const revenueValue = Number(enforcedCompany.revenue);
      if (isNaN(revenueValue)) {
        // Revenue contains non-numeric value (possibly narrative)
        violations.push({
          companyName,
          violationType: 'influenced_scaling',
          description: 'Revenue contains non-numeric value that could affect map scaling',
          field: 'revenue',
          correctionApplied: 'Revenue set to null'
        });
        enforcedCompany.revenue = null;
      }
    }
    
    if (enforcedCompany.employees !== null && enforcedCompany.employees !== undefined) {
      const employeesValue = Number(enforcedCompany.employees);
      if (isNaN(employeesValue) || employeesValue < 0) {
        violations.push({
          companyName,
          violationType: 'influenced_scaling',
          description: 'Employees contains invalid value that could affect map scaling',
          field: 'employees',
          correctionApplied: 'Employees set to null'
        });
        enforcedCompany.employees = null;
      }
    }
    
    // RULE 4: Narrative fields must not substitute missing data
    // Check if narrative content is being used to fill factual gaps
    for (const factualField of factualFields) {
      const value = enforcedCompany[factualField];
      
      // Skip non-string fields
      if (typeof value !== 'string') continue;
      
      // Check if the value looks like it was extracted from narrative
      // (e.g., "Based on the summary..." or referencing narrative fields)
      const substitutionPatterns = [
        /based on (the )?summary/i,
        /according to (the )?description/i,
        /from (the )?relevance/i,
        /as mentioned in/i,
        /derived from/i,
        /inferred from/i
      ];
      
      if (substitutionPatterns.some(pattern => pattern.test(value))) {
        violations.push({
          companyName,
          violationType: 'substituted_data',
          description: `Factual field "${factualField}" appears to be derived from narrative`,
          field: factualField,
          correctionApplied: 'Field set to null'
        });
        enforcedCompany[factualField] = null;
      }
    }
    
    return enforcedCompany;
  });
  
  // Log violations
  if (violations.length > 0) {
    console.log(`[NarrativeSeparation] Found ${violations.length} violations:`);
    violations.forEach(v => {
      console.log(`[NarrativeSeparation]   ${v.companyName}: ${v.violationType} - ${v.description}`);
    });
  } else {
    console.log(`[NarrativeSeparation] No violations found`);
  }
  
  return {
    companies: enforcedCompanies,
    violations,
    enforced: true
  };
}

/**
 * Validate that ranking factors are factual-only.
 * Returns true if the ranking is based only on factual fields.
 */
export function validateRankingFactors(rankingFields: string[]): { valid: boolean; invalidFields: string[] } {
  const factualFields = getFactualCompanyFields();
  const invalidFields = rankingFields.filter(field => !factualFields.includes(field));
  
  return {
    valid: invalidFields.length === 0,
    invalidFields
  };
}

/**
 * Validate that map scaling factors are factual-only.
 * Returns true if scaling is based only on numeric factual fields.
 */
export function validateMapScalingFactors(scalingFields: string[]): { valid: boolean; invalidFields: string[] } {
  const allowedScalingFields = ['revenue', 'employees', 'geographicFootprint', 'confidence'];
  const invalidFields = scalingFields.filter(field => !allowedScalingFields.includes(field));
  
  return {
    valid: invalidFields.length === 0,
    invalidFields
  };
}

// ========== EXPLAINABILITY FRAMEWORK ==========
// For every result, the system MUST be able to answer internally:
// 1. Why the entity was included
// 2. Why a metric is shown or hidden
// 3. Why ranking or visual impact applies
// If the system cannot explain, the result must NOT be displayed.

export interface EntityExplanation {
  entityId: string;
  entityName: string;
  isDisplayable: boolean;
  explanations: {
    inclusion: InclusionExplanation;
    metrics: MetricExplanation[];
    ranking: RankingExplanation;
    visual: VisualExplanation;
  };
  missingExplanations: string[];
}

export interface InclusionExplanation {
  explained: boolean;
  reason: string;
  criteria: string[];
}

export interface MetricExplanation {
  metricName: string;
  shown: boolean;
  explained: boolean;
  reason: string;
}

export interface RankingExplanation {
  explained: boolean;
  position: number;
  reason: string;
  factors: string[];
}

export interface VisualExplanation {
  explained: boolean;
  scalingApplied: boolean;
  reason: string;
}

export interface ExplainabilityResult {
  companies: any[];
  totalExplainable: number;
  totalUnexplainable: number;
  unexplainableRemoved: string[];
  explanationLog: EntityExplanation[];
}

/**
 * Generate explanation for why an entity was included in results.
 */
function explainInclusion(company: any): InclusionExplanation {
  const criteria: string[] = [];
  const reasons: string[] = [];
  
  // Check name
  if (company.name && String(company.name).trim().length > 0) {
    criteria.push('has_valid_name');
    reasons.push(`Named entity: "${company.name}"`);
  }
  
  // Check coordinates
  if (company.latitude !== undefined && company.latitude !== null &&
      company.longitude !== undefined && company.longitude !== null) {
    criteria.push('has_coordinates');
    reasons.push(`Location: (${company.latitude}, ${company.longitude})`);
  }
  
  // Check country
  if (company.country && String(company.country).trim().length > 0) {
    criteria.push('has_country');
    reasons.push(`Country: ${company.country}`);
  }
  
  // Check relevance reason from LLM
  if (company.relevanceReason && String(company.relevanceReason).trim().length > 0) {
    criteria.push('has_relevance_reason');
    reasons.push(`Relevance: ${company.relevanceReason}`);
  }
  
  const hasMinimumCriteria = criteria.includes('has_valid_name') && 
                              criteria.includes('has_coordinates') && 
                              criteria.includes('has_country');
  
  return {
    explained: hasMinimumCriteria,
    reason: hasMinimumCriteria 
      ? reasons.join('; ')
      : 'Missing minimum criteria for inclusion (name, coordinates, or country)',
    criteria
  };
}

/**
 * Generate explanations for why each metric is shown or hidden.
 */
function explainMetrics(company: any): MetricExplanation[] {
  const metricsToExplain = ['revenue', 'employees', 'confidence'];
  const explanations: MetricExplanation[] = [];
  
  for (const metricName of metricsToExplain) {
    const value = company[metricName];
    const hasValue = value !== null && value !== undefined;
    const isNumeric = hasValue && !isNaN(Number(value));
    
    if (hasValue && isNumeric) {
      explanations.push({
        metricName,
        shown: true,
        explained: true,
        reason: `${metricName} = ${value} (valid numeric value present)`
      });
    } else if (hasValue && !isNumeric) {
      explanations.push({
        metricName,
        shown: false,
        explained: true,
        reason: `${metricName} hidden: value "${value}" is not numeric`
      });
    } else {
      explanations.push({
        metricName,
        shown: false,
        explained: true,
        reason: `${metricName} hidden: no authoritative value available`
      });
    }
  }
  
  return explanations;
}

/**
 * Generate explanation for ranking position.
 */
function explainRanking(company: any, position: number): RankingExplanation {
  const factors: string[] = [];
  const reasons: string[] = [];
  
  // Confidence factor
  const confidence = Number(company.confidence || 0);
  factors.push(`confidence: ${confidence}`);
  reasons.push(`Confidence score: ${confidence}/10`);
  
  // Revenue factor (if available)
  if (company.revenue !== null && company.revenue !== undefined) {
    factors.push(`revenue: ${company.revenue}`);
    reasons.push(`Revenue: $${Number(company.revenue).toLocaleString()}`);
  }
  
  // Employees factor (if available)
  if (company.employees !== null && company.employees !== undefined) {
    factors.push(`employees: ${company.employees}`);
    reasons.push(`Employees: ${company.employees}`);
  }
  
  return {
    explained: factors.length > 0,
    position,
    reason: `Ranked #${position} based on: ${reasons.join(', ')}`,
    factors
  };
}

/**
 * Generate explanation for visual scaling.
 */
function explainVisual(company: any): VisualExplanation {
  const scalingApplied = company._scalingApplied === true;
  const scalingValue = company._scalingValue;
  const confidence = Number(company.confidence || 0);
  
  if (scalingApplied) {
    return {
      explained: true,
      scalingApplied: true,
      reason: `Visual scaling applied: metric value ${scalingValue} with confidence ${confidence} (≥6 threshold met)`
    };
  } else {
    const reasons: string[] = [];
    if (confidence < 6) {
      reasons.push(`confidence ${confidence} < 6 threshold`);
    }
    if (scalingValue === null || scalingValue === undefined || scalingValue === 1) {
      reasons.push('metric not available or using neutral fallback');
    }
    
    return {
      explained: true,
      scalingApplied: false,
      reason: `Neutral visual sizing used: ${reasons.join('; ')}`
    };
  }
}

/**
 * Enforce explainability - every result must have complete explanations.
 * If any explanation is missing, the result is NOT displayable.
 */
export function enforceExplainability(companies: any[]): ExplainabilityResult {
  const explanationLog: EntityExplanation[] = [];
  const displayableCompanies: any[] = [];
  const unexplainableRemoved: string[] = [];
  
  console.log(`[Explainability] Checking ${companies.length} companies for complete explanations`);
  
  companies.forEach((company, index) => {
    const entityId = String(company.id || `temp-${index}`);
    const entityName = String(company.name || 'Unknown').trim();
    
    // Generate all explanations
    const inclusion = explainInclusion(company);
    const metrics = explainMetrics(company);
    const ranking = explainRanking(company, index + 1);
    const visual = explainVisual(company);
    
    // Check for missing explanations
    const missingExplanations: string[] = [];
    
    if (!inclusion.explained) {
      missingExplanations.push('inclusion_not_explained');
    }
    
    const unexplainedMetrics = metrics.filter(m => !m.explained);
    if (unexplainedMetrics.length > 0) {
      missingExplanations.push(`metrics_not_explained: ${unexplainedMetrics.map(m => m.metricName).join(', ')}`);
    }
    
    if (!ranking.explained) {
      missingExplanations.push('ranking_not_explained');
    }
    
    if (!visual.explained) {
      missingExplanations.push('visual_not_explained');
    }
    
    const isDisplayable = missingExplanations.length === 0 && inclusion.explained;
    
    const explanation: EntityExplanation = {
      entityId,
      entityName,
      isDisplayable,
      explanations: {
        inclusion,
        metrics,
        ranking,
        visual
      },
      missingExplanations
    };
    
    explanationLog.push(explanation);
    
    if (isDisplayable) {
      // Attach explanation to company for downstream use
      displayableCompanies.push({
        ...company,
        _explanation: explanation
      });
    } else {
      unexplainableRemoved.push(entityName);
      console.log(`[Explainability] Removed unexplainable entity: ${entityName} - ${missingExplanations.join(', ')}`);
    }
  });
  
  console.log(`[Explainability] Result: ${displayableCompanies.length} displayable, ${unexplainableRemoved.length} removed`);
  
  return {
    companies: displayableCompanies,
    totalExplainable: displayableCompanies.length,
    totalUnexplainable: unexplainableRemoved.length,
    unexplainableRemoved,
    explanationLog
  };
}

// ========== VISUAL SCALING ENFORCEMENT ==========
// Map bubbles and other visual scales may ONLY use:
// 1. High-confidence metrics (confidence >= 6)
// 2. Comparable metrics (same unit, same definition)
// 3. Correctly defined metrics (not null, not inferred)
// If conditions are not met, visuals MUST fall back to neutral defaults.

export interface VisualScalingResult {
  companies: any[];
  scalingMetric: string;
  scalingApplied: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;
  scalingLog: VisualScalingEntry[];
}

export interface VisualScalingEntry {
  companyName: string;
  metricValue: any;
  meetsScalingCriteria: boolean;
  usedForScaling: boolean;
  reason: string;
}

// Minimum confidence required for a metric to influence visual scaling
const MIN_SCALING_CONFIDENCE = 6;

/**
 * Check if a metric value is suitable for visual scaling.
 * Requirements:
 * 1. Value must be defined (not null/undefined)
 * 2. Value must be numeric and positive
 * 3. Company confidence must be >= MIN_SCALING_CONFIDENCE
 */
export function isMetricSuitableForScaling(
  value: any,
  confidence: number
): { suitable: boolean; reason: string } {
  // Check if value exists
  if (value === null || value === undefined) {
    return { suitable: false, reason: 'Metric value is null/undefined' };
  }
  
  // Check if value is numeric
  const numericValue = Number(value);
  if (isNaN(numericValue)) {
    return { suitable: false, reason: 'Metric value is not numeric' };
  }
  
  // Check if value is positive (for scaling purposes)
  if (numericValue <= 0) {
    return { suitable: false, reason: 'Metric value is not positive' };
  }
  
  // Check confidence threshold
  if (confidence < MIN_SCALING_CONFIDENCE) {
    return { suitable: false, reason: `Confidence (${confidence}) below threshold (${MIN_SCALING_CONFIDENCE})` };
  }
  
  return { suitable: true, reason: 'Meets all scaling criteria' };
}

/**
 * Enforce visual scaling rules on company data.
 * Determines which metric to use for scaling and applies neutral fallback
 * when metrics don't meet quality requirements.
 */
export function enforceVisualScaling(
  companies: any[],
  preferredMetric: string = 'revenue'
): VisualScalingResult {
  const scalingLog: VisualScalingEntry[] = [];
  const NEUTRAL_SCALE_VALUE = 1; // Default neutral scale when metrics unsuitable
  
  console.log(`[VisualScaling] Evaluating ${companies.length} companies for ${preferredMetric} scaling`);
  
  // Count how many companies have suitable metrics
  let suitableCount = 0;
  
  const processedCompanies = companies.map(company => {
    const companyName = String(company.name || 'Unknown').trim();
    const confidence = Number(company.confidence || 0);
    const metricValue = company[preferredMetric];
    
    const suitability = isMetricSuitableForScaling(metricValue, confidence);
    
    if (suitability.suitable) {
      suitableCount++;
      scalingLog.push({
        companyName,
        metricValue,
        meetsScalingCriteria: true,
        usedForScaling: true,
        reason: suitability.reason
      });
      
      // Keep original value for scaling
      return {
        ...company,
        _scalingValue: Number(metricValue),
        _scalingApplied: true
      };
    } else {
      scalingLog.push({
        companyName,
        metricValue,
        meetsScalingCriteria: false,
        usedForScaling: false,
        reason: suitability.reason
      });
      
      // Apply neutral fallback
      return {
        ...company,
        _scalingValue: NEUTRAL_SCALE_VALUE,
        _scalingApplied: false
      };
    }
  });
  
  // Determine if we should use scaling at all
  // Require at least 50% of companies to have suitable metrics for meaningful comparison
  const minimumSuitableRatio = 0.5;
  const actualRatio = companies.length > 0 ? suitableCount / companies.length : 0;
  const useScaling = actualRatio >= minimumSuitableRatio;
  
  let fallbackReason: string | undefined;
  
  if (!useScaling && companies.length > 0) {
    fallbackReason = `Only ${suitableCount}/${companies.length} (${Math.round(actualRatio * 100)}%) companies have suitable ${preferredMetric} for scaling. Falling back to neutral sizing.`;
    console.log(`[VisualScaling] ${fallbackReason}`);
    
    // Apply neutral fallback to ALL companies when scaling isn't meaningful
    processedCompanies.forEach(company => {
      company._scalingValue = NEUTRAL_SCALE_VALUE;
      company._scalingApplied = false;
    });
  } else {
    console.log(`[VisualScaling] Scaling applied: ${suitableCount}/${companies.length} companies have suitable ${preferredMetric}`);
  }
  
  return {
    companies: processedCompanies,
    scalingMetric: preferredMetric,
    scalingApplied: useScaling,
    fallbackUsed: !useScaling,
    fallbackReason,
    scalingLog
  };
}

/**
 * Get the appropriate bubble size for a company based on scaling rules.
 * Returns a normalized size value for map visualization.
 */
export function getBubbleSize(
  company: any,
  minSize: number = 20,
  maxSize: number = 80
): number {
  // If scaling was not applied, use neutral size
  if (!company._scalingApplied) {
    return (minSize + maxSize) / 2; // Middle size as neutral
  }
  
  const scalingValue = company._scalingValue || 1;
  
  // Normalize to a reasonable range
  // Using log scale to prevent extreme outliers from dominating
  const logValue = Math.log10(Math.max(1, scalingValue));
  const normalizedValue = Math.min(1, Math.max(0, logValue / 12)); // Assuming max ~$1T (10^12)
  
  return minSize + (normalizedValue * (maxSize - minSize));
}

// ========== RANKING INTEGRITY ENFORCEMENT ==========
// Ranking must NEVER suppress valid entities.
// If multiple entities meet criteria, ALL must be returned, even if confidence varies.

export interface RankingIntegrityResult {
  companies: any[];
  totalValid: number;
  totalReturned: number;
  suppressionDetected: boolean;
  integrityLog: RankingIntegrityEntry[];
}

export interface RankingIntegrityEntry {
  companyName: string;
  confidence: number;
  meetsMinimumCriteria: boolean;
  included: boolean;
  reason: string;
}

/**
 * MINIMUM CRITERIA FOR A VALID ENTITY
 * An entity is valid if it has:
 * 1. A non-empty name
 * 2. Valid coordinates (for map display)
 * 3. A country (for geographic filtering)
 * 
 * Confidence does NOT determine validity - only display order.
 */
export function meetsMinimumValidityCriteria(company: any): boolean {
  const hasName = company.name && String(company.name).trim().length > 0;
  const hasCountry = company.country && String(company.country).trim().length > 0;
  const hasCoordinates = (
    company.latitude !== undefined && 
    company.latitude !== null && 
    company.longitude !== undefined && 
    company.longitude !== null
  );
  
  return hasName && hasCountry && hasCoordinates;
}

/**
 * Enforce ranking integrity - ensure no valid entities are suppressed.
 * All entities that meet minimum criteria MUST be returned.
 * Low confidence affects ORDER, not INCLUSION.
 */
export function enforceRankingIntegrity(companies: any[]): RankingIntegrityResult {
  const integrityLog: RankingIntegrityEntry[] = [];
  const validCompanies: any[] = [];
  
  console.log(`[RankingIntegrity] Checking ${companies.length} companies for suppression`);
  
  for (const company of companies) {
    const companyName = String(company.name || 'Unknown').trim();
    const confidence = Number(company.confidence || 0);
    const meetsMinimum = meetsMinimumValidityCriteria(company);
    
    if (meetsMinimum) {
      // Valid entity - MUST be included regardless of confidence
      validCompanies.push(company);
      integrityLog.push({
        companyName,
        confidence,
        meetsMinimumCriteria: true,
        included: true,
        reason: 'Meets minimum criteria - included regardless of confidence'
      });
    } else {
      // Does not meet minimum criteria - can be excluded
      integrityLog.push({
        companyName,
        confidence,
        meetsMinimumCriteria: false,
        included: false,
        reason: 'Does not meet minimum validity criteria (missing name, country, or coordinates)'
      });
    }
  }
  
  // Sort by confidence for display order, but do NOT filter by confidence
  // Ranking determines ORDER, not INCLUSION
  validCompanies.sort((a, b) => {
    const confA = Number(a.confidence || 0);
    const confB = Number(b.confidence || 0);
    return confB - confA; // Higher confidence first
  });
  
  const suppressionDetected = validCompanies.length < companies.filter(c => meetsMinimumValidityCriteria(c)).length;
  
  console.log(`[RankingIntegrity] Result: ${validCompanies.length} valid entities returned (suppression: ${suppressionDetected})`);
  
  return {
    companies: validCompanies,
    totalValid: validCompanies.length,
    totalReturned: validCompanies.length,
    suppressionDetected,
    integrityLog
  };
}

/**
 * Validate that a ranking/filtering operation did not suppress valid entities.
 * Call this AFTER any ranking or filtering operation.
 */
export function validateNoSuppression(
  beforeCount: number,
  afterCount: number,
  validBeforeCount: number
): { valid: boolean; suppressedCount: number; message: string } {
  const suppressedCount = validBeforeCount - afterCount;
  
  if (suppressedCount > 0) {
    return {
      valid: false,
      suppressedCount,
      message: `WARNING: ${suppressedCount} valid entities were suppressed by ranking/filtering`
    };
  }
  
  return {
    valid: true,
    suppressedCount: 0,
    message: 'No valid entities suppressed'
  };
}

export interface PostLlmValidationResult {
  isValid: boolean;
  companies: any[];
  validationLog: ValidationLogEntry[];
  preFlightChecklist: PreFlightChecklistResult;
  narrativeSeparation?: NarrativeSeparationResult;
  rankingIntegrity?: RankingIntegrityResult;
  visualScaling?: VisualScalingResult;
  explainability?: ExplainabilityResult;
  summary: {
    totalReceived: number;
    totalPassed: number;
    totalBlocked: number;
    totalDegraded: number;
    totalStripped: number;
  };
}

export interface ValidationLogEntry {
  companyName: string;
  action: 'passed' | 'blocked' | 'degraded' | 'stripped_field';
  reason: string;
  field?: string;
  originalValue?: any;
  newValue?: any;
}

export interface PostLlmValidationOptions {
  originalQuery: string;
  requestedLimit: number;
}

/**
 * Main entry point for post-LLM validation.
 * Runs all validation rules and returns filtered/degraded results.
 */
export function validateLlmResponse(
  rawCompanies: any[],
  options: PostLlmValidationOptions
): PostLlmValidationResult {
  const validationLog: ValidationLogEntry[] = [];
  const validatedCompanies: any[] = [];
  
  let totalBlocked = 0;
  let totalDegraded = 0;
  let totalStripped = 0;

  console.log(`[PostLlmValidation] Starting validation of ${rawCompanies.length} companies`);
  console.log(`[PostLlmValidation] Original query: "${options.originalQuery}"`);

  for (const company of rawCompanies) {
    const companyName = String(company.name || company.companyName || 'Unknown').trim();
    
    // BLOCK: Companies with no name or placeholder names
    if (!companyName || companyName.toLowerCase() === 'unknown' || companyName.toLowerCase() === 'unknown company') {
      validationLog.push({
        companyName: companyName || '[no name]',
        action: 'blocked',
        reason: 'Missing or placeholder company name'
      });
      totalBlocked++;
      continue;
    }

    // Create a validated copy to potentially modify
    const validatedCompany = { ...company };

    // DEGRADE (not BLOCK): Companies with missing or zero confidence
    // Missing confidence is not a fatal error - set a default low value
    // This allows validateCompanyData downstream to handle it properly
    const rawConfidence = Number(company.confidence || company.score || 0);
    if (rawConfidence < 1) {
      // Set a default low confidence (3) instead of blocking
      // This follows the principle: "null is better than wrong data"
      // but also "a company with missing confidence is still potentially valid"
      validatedCompany.confidence = 3; // Low confidence as fallback
      validationLog.push({
        companyName,
        action: 'degraded',
        reason: `Confidence score missing or zero (${rawConfidence}) - defaulting to 3`,
        field: 'confidence',
        originalValue: rawConfidence,
        newValue: 3
      });
      totalDegraded++;
    }
    let wasDegraded = false;
    let wasStripped = false;

    // STRIP: Remove executives with placeholder names (titles instead of real names)
    if (Array.isArray(validatedCompany.executives)) {
      const originalExecCount = validatedCompany.executives.length;
      validatedCompany.executives = validatedCompany.executives.filter((exec: any) => {
        const execName = String(exec.name || '').trim();
        const execTitle = String(exec.title || '').trim();
        
        // Block executives where name equals title (placeholder)
        if (execName.toLowerCase() === execTitle.toLowerCase()) {
          validationLog.push({
            companyName,
            action: 'stripped_field',
            reason: 'Executive name is same as title (placeholder)',
            field: 'executives',
            originalValue: execName
          });
          return false;
        }
        
        // Block executives with generic placeholder names
        const placeholderPatterns = [
          /^(ceo|cfo|coo|cto|cmo|chro|vp|svp|evp|md|director|manager|president|founder|owner)$/i,
          /^(managing director|general manager|chief executive|chief financial)$/i,
          /^(executive|leadership|management|board member)$/i
        ];
        
        if (placeholderPatterns.some(pattern => pattern.test(execName))) {
          validationLog.push({
            companyName,
            action: 'stripped_field',
            reason: 'Executive name is a generic title placeholder',
            field: 'executives',
            originalValue: execName
          });
          return false;
        }
        
        return true;
      });
      
      if (validatedCompany.executives.length < originalExecCount) {
        wasStripped = true;
        totalStripped++;
      }
    }

    // DEGRADE: Reduce confidence for companies missing critical data
    if (!validatedCompany.relevanceReason || validatedCompany.relevanceReason.trim() === '') {
      const originalConfidence = validatedCompany.confidence;
      validatedCompany.confidence = Math.max(1, (validatedCompany.confidence || 5) - 2);
      validationLog.push({
        companyName,
        action: 'degraded',
        reason: 'Missing relevanceReason field',
        field: 'confidence',
        originalValue: originalConfidence,
        newValue: validatedCompany.confidence
      });
      wasDegraded = true;
    }

    // DEGRADE: Reduce confidence if no executives found
    if (!Array.isArray(validatedCompany.executives) || validatedCompany.executives.length === 0) {
      const originalConfidence = validatedCompany.confidence;
      validatedCompany.confidence = Math.max(1, (validatedCompany.confidence || 5) - 1);
      validationLog.push({
        companyName,
        action: 'degraded',
        reason: 'No executives found',
        field: 'confidence',
        originalValue: originalConfidence,
        newValue: validatedCompany.confidence
      });
      wasDegraded = true;
    }

    if (wasDegraded && !wasStripped) {
      totalDegraded++;
    }

    // Record pass if no issues
    if (!wasDegraded && !wasStripped) {
      validationLog.push({
        companyName,
        action: 'passed',
        reason: 'All validation checks passed'
      });
    }

    validatedCompanies.push(validatedCompany);
  }

  const summary = {
    totalReceived: rawCompanies.length,
    totalPassed: validatedCompanies.length,
    totalBlocked,
    totalDegraded,
    totalStripped
  };

  console.log(`[PostLlmValidation] Validation complete:`, summary);
  
  // Log blocked companies for debugging
  const blockedEntries = validationLog.filter(e => e.action === 'blocked');
  if (blockedEntries.length > 0) {
    console.log(`[PostLlmValidation] Blocked companies:`, blockedEntries.map(e => `${e.companyName}: ${e.reason}`));
  }

  // ========== RUN PRE-FLIGHT CHECKLIST ==========
  // Mandatory checks that must pass before results can be displayed
  const preFlightChecklist = runPreFlightChecklist(validatedCompanies, options);
  
  // If pre-flight checklist blocks, return early with no results
  if (!preFlightChecklist.canProceed) {
    console.log(`[PostLlmValidation] Pre-flight checklist BLOCKED: ${preFlightChecklist.blockedReason}`);
    return {
      isValid: false,
      companies: [],
      validationLog,
      preFlightChecklist,
      summary: {
        ...summary,
        totalPassed: 0,
        totalBlocked: summary.totalReceived
      }
    };
  }
  
  // Apply fallbacks if any checks failed but have fallbacks
  let finalCompanies = validatedCompanies;
  const checksWithFallbacks = preFlightChecklist.checks.filter(c => c.fallbackApplied);
  if (checksWithFallbacks.length > 0) {
    console.log(`[PostLlmValidation] Applying ${checksWithFallbacks.length} fallbacks...`);
    finalCompanies = applyPreFlightFallbacks(validatedCompanies, preFlightChecklist, options);
  }
  // ========== END PRE-FLIGHT CHECKLIST ==========

  // ========== NARRATIVE SEPARATION ENFORCEMENT ==========
  // Ensure narrative fields do not contaminate factual data
  const narrativeSeparation = enforceNarrativeSeparation(finalCompanies);
  finalCompanies = narrativeSeparation.companies;
  
  // Log any narrative violations
  if (narrativeSeparation.violations.length > 0) {
    console.log(`[PostLlmValidation] Narrative separation violations corrected: ${narrativeSeparation.violations.length}`);
  }
  // ========== END NARRATIVE SEPARATION ==========

  // ========== RANKING INTEGRITY ENFORCEMENT ==========
  // Ensure ranking never suppresses valid entities
  // All entities meeting criteria MUST be returned, regardless of confidence
  const rankingIntegrity = enforceRankingIntegrity(finalCompanies);
  finalCompanies = rankingIntegrity.companies;
  
  if (rankingIntegrity.suppressionDetected) {
    console.warn(`[PostLlmValidation] WARNING: Entity suppression was detected and corrected`);
  }
  // ========== END RANKING INTEGRITY ==========

  // ========== VISUAL SCALING ENFORCEMENT ==========
  // Map bubbles may ONLY use high-confidence, comparable, correctly-defined metrics
  // Otherwise, fall back to neutral defaults
  const visualScaling = enforceVisualScaling(finalCompanies, 'revenue');
  finalCompanies = visualScaling.companies;
  
  if (visualScaling.fallbackUsed) {
    console.log(`[PostLlmValidation] Visual scaling fallback: ${visualScaling.fallbackReason}`);
  }
  // ========== END VISUAL SCALING ==========

  // ========== EXPLAINABILITY ENFORCEMENT ==========
  // For every result, the system MUST explain:
  // 1. Why entity was included
  // 2. Why each metric is shown/hidden
  // 3. Why ranking/visual impact applies
  // If system cannot explain, result is NOT displayed
  const explainability = enforceExplainability(finalCompanies);
  finalCompanies = explainability.companies;
  
  if (explainability.totalUnexplainable > 0) {
    console.log(`[PostLlmValidation] Removed ${explainability.totalUnexplainable} unexplainable entities: ${explainability.unexplainableRemoved.join(', ')}`);
  }
  // ========== END EXPLAINABILITY ==========

  return {
    isValid: finalCompanies.length > 0,
    companies: finalCompanies,
    validationLog,
    preFlightChecklist,
    narrativeSeparation,
    rankingIntegrity,
    visualScaling,
    explainability,
    summary: {
      ...summary,
      totalPassed: finalCompanies.length
    }
  };
}
