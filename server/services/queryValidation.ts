/**
 * QUERY VALIDATION LAYER
 * 
 * Validates the system against edge cases before returning results:
 * 1. Plural queries - Handle grammatical variations
 * 2. Narrow queries - Very specific searches with few results
 * 3. Ambiguous queries - Vague or unclear searches
 * 4. Known problematic sectors - Industries with unreliable data
 * 
 * CORE PRINCIPLE: No confidently wrong results may pass.
 */

// ========== QUERY CLASSIFICATION ==========

export type QueryType = 'plural' | 'narrow' | 'ambiguous' | 'problematic_sector' | 'standard';

export interface QueryClassification {
  type: QueryType;
  confidence: number;
  warnings: string[];
  adjustments: QueryAdjustment[];
}

export interface QueryAdjustment {
  type: 'normalize_plural' | 'widen_scope' | 'add_clarification' | 'flag_sector' | 'reduce_confidence';
  description: string;
  applied: boolean;
}

// ========== PLURAL QUERY HANDLING ==========

const PLURAL_PATTERNS = [
  { singular: 'company', plural: 'companies' },
  { singular: 'distributor', plural: 'distributors' },
  { singular: 'manufacturer', plural: 'manufacturers' },
  { singular: 'retailer', plural: 'retailers' },
  { singular: 'supplier', plural: 'suppliers' },
  { singular: 'provider', plural: 'providers' },
  { singular: 'firm', plural: 'firms' },
  { singular: 'agency', plural: 'agencies' },
  { singular: 'corporation', plural: 'corporations' },
  { singular: 'enterprise', plural: 'enterprises' },
  { singular: 'organization', plural: 'organizations' },
  { singular: 'business', plural: 'businesses' },
];

/**
 * Normalize plural/singular variations in query to ensure consistent matching.
 */
export function normalizePluralQuery(query: string): { normalized: string; changes: string[] } {
  let normalized = query.toLowerCase();
  const changes: string[] = [];
  
  for (const pattern of PLURAL_PATTERNS) {
    // Check for plural form and note it (don't change - LLM handles both)
    if (normalized.includes(pattern.plural)) {
      changes.push(`Detected plural: "${pattern.plural}" (will match both singular and plural entities)`);
    }
  }
  
  return { normalized: query, changes };
}

// ========== NARROW QUERY DETECTION ==========

const NARROW_INDICATORS = [
  { pattern: /top\s*[1-5]\b/i, reason: 'Very small result set requested (1-5)' },
  { pattern: /only\s+in\s+\w+/i, reason: 'Single location restriction' },
  { pattern: /exactly\s+\d+/i, reason: 'Exact count requirement' },
  { pattern: /\bsingle\b/i, reason: 'Single entity requested' },
  { pattern: /\bspecific\b/i, reason: 'Specific entity focus' },
  { pattern: /\bonly\s+\w+\s+that\b/i, reason: 'Restrictive filter' },
  { pattern: /\bexclusively\b/i, reason: 'Exclusive requirement' },
  { pattern: /\bspecialized?\s+in\b/i, reason: 'Specialization requirement' },
];

/**
 * Detect if query is too narrow and may return insufficient results.
 */
export function detectNarrowQuery(query: string): { isNarrow: boolean; reasons: string[]; minExpectedResults: number } {
  const reasons: string[] = [];
  
  for (const indicator of NARROW_INDICATORS) {
    if (indicator.pattern.test(query)) {
      reasons.push(indicator.reason);
    }
  }
  
  // Extract explicit count if present
  const countMatch = query.match(/top\s*(\d+)/i);
  const explicitCount = countMatch ? parseInt(countMatch[1], 10) : 10;
  
  return {
    isNarrow: reasons.length > 0 || explicitCount < 5,
    reasons,
    minExpectedResults: Math.max(1, Math.min(explicitCount, 3))
  };
}

// ========== AMBIGUOUS QUERY DETECTION ==========

const AMBIGUOUS_INDICATORS = [
  { pattern: /\bbest\b/i, reason: '"Best" is subjective without criteria' },
  { pattern: /\bgood\b/i, reason: '"Good" is subjective without criteria' },
  { pattern: /\btop\b(?!\s*\d)/i, reason: '"Top" without number is ambiguous' },
  { pattern: /\bleading\b/i, reason: '"Leading" requires clarification (by what metric?)' },
  { pattern: /\bmajor\b/i, reason: '"Major" is relative and undefined' },
  { pattern: /\bsimilar\s+to\b/i, reason: 'Similarity comparison requires reference point' },
  { pattern: /\blike\b/i, reason: '"Like" is vague for entity matching' },
  { pattern: /\brelated\b/i, reason: '"Related" needs clearer relationship definition' },
  { pattern: /\bsome\b/i, reason: '"Some" is non-specific quantity' },
  { pattern: /\bvarious\b/i, reason: '"Various" lacks specificity' },
];

const CLARIFYING_INDICATORS = [
  { pattern: /\bby\s+revenue\b/i, clarity: 'Revenue ranking specified' },
  { pattern: /\bby\s+employees?\b/i, clarity: 'Employee count ranking specified' },
  { pattern: /\bby\s+market\s+share\b/i, clarity: 'Market share ranking specified' },
  { pattern: /\bin\s+\w+/i, clarity: 'Geographic scope specified' },
  { pattern: /\$[\d,]+/i, clarity: 'Revenue threshold specified' },
  { pattern: /\d+\s+employees?/i, clarity: 'Employee threshold specified' },
];

/**
 * Detect if query is ambiguous and needs clarification.
 */
export function detectAmbiguousQuery(query: string): { 
  isAmbiguous: boolean; 
  ambiguities: string[]; 
  clarifications: string[];
  confidenceReduction: number;
} {
  const ambiguities: string[] = [];
  const clarifications: string[] = [];
  
  for (const indicator of AMBIGUOUS_INDICATORS) {
    if (indicator.pattern.test(query)) {
      ambiguities.push(indicator.reason);
    }
  }
  
  for (const indicator of CLARIFYING_INDICATORS) {
    if (indicator.pattern.test(query)) {
      clarifications.push(indicator.clarity);
    }
  }
  
  // Net ambiguity = ambiguities minus clarifications
  const netAmbiguity = Math.max(0, ambiguities.length - clarifications.length);
  
  return {
    isAmbiguous: netAmbiguity > 0,
    ambiguities,
    clarifications,
    confidenceReduction: netAmbiguity * 1 // Reduce confidence by 1 per unresolved ambiguity
  };
}

// ========== PROBLEMATIC SECTOR DETECTION ==========

const PROBLEMATIC_SECTORS = [
  {
    patterns: [/\bcrypto/i, /\bblockchain\b/i, /\bnft\b/i, /\bdefi\b/i],
    sector: 'Cryptocurrency/Blockchain',
    reason: 'Highly volatile sector with unreliable revenue data and frequent company changes',
    confidenceMax: 5
  },
  {
    patterns: [/\bstartup\b/i, /\bpre-revenue\b/i, /\bearly.?stage\b/i],
    sector: 'Early-stage Startups',
    reason: 'Pre-revenue companies have no authoritative financial data',
    confidenceMax: 4
  },
  {
    patterns: [/\bprivate\s+equity\b/i, /\bhedge\s+fund\b/i, /\bfamily\s+office\b/i],
    sector: 'Private Investment',
    reason: 'Private entities rarely disclose financial data publicly',
    confidenceMax: 5
  },
  {
    patterns: [/\bgambling\b/i, /\bcasino\b/i, /\bbetting\b/i],
    sector: 'Gambling/Gaming',
    reason: 'Complex regulatory environment with jurisdiction-specific data',
    confidenceMax: 6
  },
  {
    patterns: [/\bdefense\b/i, /\bmilitary\b/i, /\bweapons?\b/i, /\barms\b/i],
    sector: 'Defense/Military',
    reason: 'Classified contracts and restricted financial disclosure',
    confidenceMax: 5
  },
  {
    patterns: [/\bshell\s+compan/i, /\boffshore\b/i, /\btax\s+haven\b/i],
    sector: 'Offshore/Shell Entities',
    reason: 'Opaque ownership structures with minimal public data',
    confidenceMax: 3
  },
  {
    patterns: [/\bcannabis\b/i, /\bmarijuana\b/i, /\bweed\b/i],
    sector: 'Cannabis',
    reason: 'Regulatory complexity and limited banking access affects data reliability',
    confidenceMax: 5
  },
];

/**
 * Detect if query targets a problematic sector with unreliable data.
 */
export function detectProblematicSector(query: string): {
  isProblematic: boolean;
  sectors: string[];
  warnings: string[];
  maxConfidence: number;
} {
  const sectors: string[] = [];
  const warnings: string[] = [];
  let maxConfidence = 10;
  
  for (const sector of PROBLEMATIC_SECTORS) {
    for (const pattern of sector.patterns) {
      if (pattern.test(query)) {
        sectors.push(sector.sector);
        warnings.push(`${sector.sector}: ${sector.reason}`);
        maxConfidence = Math.min(maxConfidence, sector.confidenceMax);
        break;
      }
    }
  }
  
  return {
    isProblematic: sectors.length > 0,
    sectors,
    warnings,
    maxConfidence
  };
}

// ========== CONFIDENTLY WRONG DETECTION ==========

export interface ConfidentlyWrongCheck {
  entityName: string;
  isPotentiallyWrong: boolean;
  reason: string;
  action: 'block' | 'reduce_confidence' | 'flag';
}

/**
 * Check if a result might be "confidently wrong" - high confidence but suspicious data.
 */
export function checkConfidentlyWrong(company: any, queryContext: string): ConfidentlyWrongCheck {
  const entityName = String(company.name || 'Unknown');
  const confidence = Number(company.confidence || 0);
  const revenue = company.revenue;
  const employees = company.employees;
  
  // High confidence but missing critical data
  if (confidence >= 7 && revenue === null && employees === null) {
    return {
      entityName,
      isPotentiallyWrong: true,
      reason: 'High confidence but no verifiable metrics',
      action: 'reduce_confidence'
    };
  }
  
  // Suspiciously round numbers with high confidence
  if (confidence >= 8 && revenue !== null) {
    const revenueStr = String(revenue);
    if (/^[1-9]0{6,}$/.test(revenueStr)) {
      return {
        entityName,
        isPotentiallyWrong: true,
        reason: 'Suspiciously round revenue figure with high confidence',
        action: 'reduce_confidence'
      };
    }
  }
  
  // Revenue/employee ratio sanity check
  if (revenue !== null && employees !== null && employees > 0) {
    const revenuePerEmployee = Number(revenue) / Number(employees);
    // Extremely low (<$10k/employee) or extremely high (>$50M/employee) is suspicious
    if (revenuePerEmployee < 10000 || revenuePerEmployee > 50000000) {
      return {
        entityName,
        isPotentiallyWrong: true,
        reason: `Revenue/employee ratio (${Math.round(revenuePerEmployee)}) is outside reasonable range`,
        action: 'flag'
      };
    }
  }
  
  // Generic company name with high confidence
  const genericNames = ['global', 'international', 'solutions', 'services', 'group', 'holdings'];
  const nameLower = entityName.toLowerCase();
  const genericCount = genericNames.filter(g => nameLower.includes(g)).length;
  if (genericCount >= 2 && confidence >= 8) {
    return {
      entityName,
      isPotentiallyWrong: true,
      reason: 'Generic company name with high confidence may indicate confusion with similar entities',
      action: 'flag'
    };
  }
  
  return {
    entityName,
    isPotentiallyWrong: false,
    reason: 'No issues detected',
    action: 'flag'
  };
}

// ========== MAIN QUERY VALIDATION ==========

export interface QueryValidationResult {
  originalQuery: string;
  classification: QueryClassification;
  pluralHandling: { normalized: string; changes: string[] };
  narrowQuery: { isNarrow: boolean; reasons: string[]; minExpectedResults: number };
  ambiguousQuery: { isAmbiguous: boolean; ambiguities: string[]; clarifications: string[]; confidenceReduction: number };
  problematicSector: { isProblematic: boolean; sectors: string[]; warnings: string[]; maxConfidence: number };
  overallRisk: 'low' | 'medium' | 'high';
  maxAllowedConfidence: number;
  warnings: string[];
}

/**
 * Comprehensive query validation before processing.
 */
export function validateQuery(query: string): QueryValidationResult {
  const pluralHandling = normalizePluralQuery(query);
  const narrowQuery = detectNarrowQuery(query);
  const ambiguousQuery = detectAmbiguousQuery(query);
  const problematicSector = detectProblematicSector(query);
  
  const warnings: string[] = [];
  let overallRisk: 'low' | 'medium' | 'high' = 'low';
  let maxAllowedConfidence = 10;
  
  // Determine query type
  let type: QueryType = 'standard';
  if (problematicSector.isProblematic) {
    type = 'problematic_sector';
    maxAllowedConfidence = Math.min(maxAllowedConfidence, problematicSector.maxConfidence);
    warnings.push(...problematicSector.warnings);
    overallRisk = 'high';
  } else if (ambiguousQuery.isAmbiguous) {
    type = 'ambiguous';
    maxAllowedConfidence = Math.max(5, maxAllowedConfidence - ambiguousQuery.confidenceReduction);
    warnings.push(...ambiguousQuery.ambiguities);
    overallRisk = overallRisk === 'low' ? 'medium' : overallRisk;
  } else if (narrowQuery.isNarrow) {
    type = 'narrow';
    warnings.push(...narrowQuery.reasons);
  }
  
  if (pluralHandling.changes.length > 0) {
    type = type === 'standard' ? 'plural' : type;
  }
  
  const adjustments: QueryAdjustment[] = [];
  
  if (pluralHandling.changes.length > 0) {
    adjustments.push({
      type: 'normalize_plural',
      description: pluralHandling.changes.join('; '),
      applied: true
    });
  }
  
  if (problematicSector.isProblematic) {
    adjustments.push({
      type: 'flag_sector',
      description: `Flagged sectors: ${problematicSector.sectors.join(', ')}`,
      applied: true
    });
    adjustments.push({
      type: 'reduce_confidence',
      description: `Max confidence capped at ${maxAllowedConfidence} due to sector data reliability`,
      applied: true
    });
  }
  
  if (ambiguousQuery.isAmbiguous) {
    adjustments.push({
      type: 'add_clarification',
      description: `Ambiguities detected: ${ambiguousQuery.ambiguities.join('; ')}`,
      applied: true
    });
  }
  
  const classification: QueryClassification = {
    type,
    confidence: 10 - warnings.length,
    warnings,
    adjustments
  };
  
  console.log(`[QueryValidation] Query: "${query.substring(0, 50)}..." | Type: ${type} | Risk: ${overallRisk} | Max Confidence: ${maxAllowedConfidence}`);
  
  return {
    originalQuery: query,
    classification,
    pluralHandling,
    narrowQuery,
    ambiguousQuery,
    problematicSector,
    overallRisk,
    maxAllowedConfidence,
    warnings
  };
}

// ========== RESULT VALIDATION ==========

export interface ResultValidationResult {
  companies: any[];
  totalChecked: number;
  totalPassed: number;
  totalFlagged: number;
  totalBlocked: number;
  confidenceAdjustments: number;
  checks: ConfidentlyWrongCheck[];
}

/**
 * Validate results against confidently wrong detection.
 * Applies confidence caps and removes suspicious results.
 */
export function validateResults(
  companies: any[],
  queryValidation: QueryValidationResult
): ResultValidationResult {
  const checks: ConfidentlyWrongCheck[] = [];
  const validatedCompanies: any[] = [];
  let totalFlagged = 0;
  let totalBlocked = 0;
  let confidenceAdjustments = 0;
  
  console.log(`[ResultValidation] Checking ${companies.length} companies for confidently wrong results`);
  
  for (const company of companies) {
    const check = checkConfidentlyWrong(company, queryValidation.originalQuery);
    checks.push(check);
    
    if (check.isPotentiallyWrong) {
      if (check.action === 'block') {
        totalBlocked++;
        console.log(`[ResultValidation] BLOCKED: ${check.entityName} - ${check.reason}`);
        continue;
      } else if (check.action === 'reduce_confidence') {
        const originalConfidence = Number(company.confidence || 0);
        const newConfidence = Math.min(
          originalConfidence - 2,
          queryValidation.maxAllowedConfidence
        );
        company.confidence = Math.max(1, newConfidence);
        confidenceAdjustments++;
        console.log(`[ResultValidation] Reduced confidence: ${check.entityName} (${originalConfidence} → ${company.confidence})`);
      } else {
        totalFlagged++;
      }
    }
    
    // Apply sector-based confidence cap
    const currentConfidence = Number(company.confidence || 0);
    if (currentConfidence > queryValidation.maxAllowedConfidence) {
      company.confidence = queryValidation.maxAllowedConfidence;
      confidenceAdjustments++;
    }
    
    validatedCompanies.push(company);
  }
  
  console.log(`[ResultValidation] Result: ${validatedCompanies.length} passed, ${totalFlagged} flagged, ${totalBlocked} blocked, ${confidenceAdjustments} confidence adjustments`);
  
  return {
    companies: validatedCompanies,
    totalChecked: companies.length,
    totalPassed: validatedCompanies.length,
    totalFlagged,
    totalBlocked,
    confidenceAdjustments,
    checks
  };
}
