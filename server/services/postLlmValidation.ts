/**
 * POST-LLM VALIDATION LAYER
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

export interface PostLlmValidationResult {
  isValid: boolean;
  companies: any[];
  validationLog: ValidationLogEntry[];
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

    // BLOCK: Companies with confidence below minimum threshold
    const confidence = Number(company.confidence || company.score || 0);
    if (confidence < 1) {
      validationLog.push({
        companyName,
        action: 'blocked',
        reason: `Confidence score too low: ${confidence}`
      });
      totalBlocked++;
      continue;
    }

    // Create a validated copy to potentially modify
    const validatedCompany = { ...company };
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

  return {
    isValid: validatedCompanies.length > 0,
    companies: validatedCompanies,
    validationLog,
    summary
  };
}
