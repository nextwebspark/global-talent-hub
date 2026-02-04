import OpenAI from "openai";
import { storage } from "../storage";
import { validateLlmResponse } from "./postLlmValidation";
import { validateQuery, validateResults, type QueryValidationResult } from "./queryValidation";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// ========== APPROVED DISCOVERY MODELS ==========
// CRITICAL: Only models that pass structured-output reliability tests are approved.
// These models are proven to return valid JSON with consistent field extraction.
// All other models MUST be disabled for discovery or routed to narrative-only mode.

// Approved models for discovery (structured output extraction)
export const APPROVED_DISCOVERY_MODELS = {
  primary: "google/gemini-2.5-flash-preview",  // Gemini 3 Flash - best structured output
  fallbacks: [
    "anthropic/claude-sonnet-4",               // Claude Sonnet - reliable fallback
    "anthropic/claude-3.5-haiku",              // Claude Haiku - fast fallback
  ]
};

// Default model - Gemini 3 Flash for best structured output reliability
export const DEFAULT_MODEL = APPROVED_DISCOVERY_MODELS.primary;

// Fallback models for discovery - ONLY approved models
export const FALLBACK_MODELS = APPROVED_DISCOVERY_MODELS.fallbacks;

// Check if a model is approved for discovery (structured output extraction)
export function isApprovedForDiscovery(modelId: string): boolean {
  const allApproved = [
    APPROVED_DISCOVERY_MODELS.primary,
    ...APPROVED_DISCOVERY_MODELS.fallbacks
  ];
  return allApproved.includes(modelId);
}

// Get the approved model to use (enforces approved list)
export function getApprovedModel(requestedModel: string): { model: string; wasOverridden: boolean; reason?: string } {
  if (isApprovedForDiscovery(requestedModel)) {
    return { model: requestedModel, wasOverridden: false };
  }
  
  console.warn(`[ModelValidation] Model "${requestedModel}" is NOT approved for discovery. Overriding to ${DEFAULT_MODEL}`);
  return { 
    model: DEFAULT_MODEL, 
    wasOverridden: true,
    reason: `Model "${requestedModel}" failed structured-output reliability test. Using approved model: ${DEFAULT_MODEL}`
  };
}

// Models known to work reliably with web search (:online suffix)
export const RELIABLE_ONLINE_MODELS = [
  "google/gemini-2.5-flash-preview",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku",
];

// Available models for discovery - ONLY approved schema-reliable models shown in UI
// Non-approved models are NOT displayed to users for discovery selection
export const AVAILABLE_MODELS = [
  { id: "google/gemini-2.5-flash-preview", name: "Gemini 3 Flash", provider: "Google", reliableOnline: true, approvedForDiscovery: true },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", reliableOnline: true, approvedForDiscovery: true },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", reliableOnline: true, approvedForDiscovery: true },
];

// Parse OpenRouter error responses for user-friendly messages
export function parseOpenRouterError(error: any): { code: string; message: string; suggestion: string } {
  const errorMessage = error?.message || error?.error?.message || String(error);
  const statusCode = error?.status || error?.response?.status;
  
  // Privacy policy issue
  if (errorMessage.includes("No endpoints found matching your data policy")) {
    return {
      code: "PRIVACY_POLICY",
      message: "This model requires OpenRouter privacy settings to be configured.",
      suggestion: "Visit https://openrouter.ai/settings/privacy and enable 'Paid model training' for this provider."
    };
  }
  
  // Rate limit
  if (statusCode === 429 || errorMessage.includes("429") || errorMessage.includes("rate limit")) {
    return {
      code: "RATE_LIMITED",
      message: "This model has hit rate limits.",
      suggestion: "Try a different model, or wait a few minutes and try again."
    };
  }
  
  // Provider error (400)
  if (statusCode === 400 || errorMessage.includes("400")) {
    return {
      code: "PROVIDER_ERROR",
      message: "The model provider returned an error.",
      suggestion: "The :online web search feature may not be supported. Trying without web search..."
    };
  }
  
  // Model not found
  if (statusCode === 404 || errorMessage.includes("404")) {
    return {
      code: "MODEL_NOT_FOUND",
      message: "This model is not available.",
      suggestion: "Select a different model from the list."
    };
  }
  
  // Insufficient credits
  if (errorMessage.includes("insufficient") || errorMessage.includes("credits") || errorMessage.includes("balance")) {
    return {
      code: "INSUFFICIENT_CREDITS",
      message: "Insufficient OpenRouter credits.",
      suggestion: "Add credits to your OpenRouter account at https://openrouter.ai/credits"
    };
  }
  
  // Generic error
  return {
    code: "UNKNOWN_ERROR",
    message: errorMessage,
    suggestion: "Try a different model or check your OpenRouter API key."
  };
}

// Test if a model is working by sending a simple prompt
export async function testModel(modelId: string, withOnline: boolean = false): Promise<{
  success: boolean;
  model: string;
  withOnline: boolean;
  latencyMs: number;
  responsePreview?: string;
  error?: { code: string; message: string; suggestion: string };
}> {
  const startTime = Date.now();
  const modelName = withOnline ? `${modelId}:online` : modelId;
  
  console.log(`[Model Test] Testing model: ${modelName}`);
  
  try {
    const response = await openrouter.chat.completions.create({
      model: modelName,
      messages: [
        { role: "user", content: "Reply with exactly one word: OK" }
      ],
      max_tokens: 10,
      temperature: 0
    });
    
    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content?.trim() || "";
    
    console.log(`[Model Test] ${modelName} responded in ${latencyMs}ms: "${content}"`);
    
    // Validate that we got a reasonable response (not empty)
    if (!content || content.length === 0) {
      return {
        success: false,
        model: modelId,
        withOnline,
        latencyMs,
        error: {
          code: "EMPTY_RESPONSE",
          message: "Model returned an empty response.",
          suggestion: "This model may not be responding correctly. Try a different model."
        }
      };
    }
    
    return {
      success: true,
      model: modelId,
      withOnline,
      latencyMs,
      responsePreview: content.substring(0, 50)
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const parsedError = parseOpenRouterError(error);
    
    console.log(`[Model Test] ${modelName} failed in ${latencyMs}ms: ${parsedError.code} - ${parsedError.message}`);
    
    return {
      success: false,
      model: modelId,
      withOnline,
      latencyMs,
      error: parsedError
    };
  }
}

// Test a model with both online and offline modes
export async function testModelComprehensive(modelId: string): Promise<{
  model: string;
  baseTest: { success: boolean; latencyMs: number; error?: any };
  onlineTest: { success: boolean; latencyMs: number; error?: any };
  recommendation: string;
}> {
  console.log(`[Model Test] Comprehensive test for: ${modelId}`);
  
  // Test base model first
  const baseResult = await testModel(modelId, false);
  
  // Test with :online suffix
  const onlineResult = await testModel(modelId, true);
  
  let recommendation: string;
  if (onlineResult.success) {
    recommendation = "Full web search support available";
  } else if (baseResult.success) {
    recommendation = "Works without web search (will use model's training data only)";
  } else {
    recommendation = `Model unavailable: ${baseResult.error?.suggestion || "Check OpenRouter settings"}`;
  }
  
  return {
    model: modelId,
    baseTest: { success: baseResult.success, latencyMs: baseResult.latencyMs, error: baseResult.error },
    onlineTest: { success: onlineResult.success, latencyMs: onlineResult.latencyMs, error: onlineResult.error },
    recommendation
  };
}

const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'latin america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'oceania': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 0, lng: 0 }
};

export interface SearchCriteria {
  roles: string[];
  roleFunction: string;
  roleLevel: string;
  sectors: string[];
  regions: string[];
  minRevenue: number | null;
  maxRevenue: number | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  limit: number;
}

export interface ParsedSearchResult {
  criteria: SearchCriteria;
  interpretation: string;
}

function parseNumber(value: any, defaultValue: number = 0): number {
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

function validateCoordinates(lat: any, lng: any, region?: string, country?: string, city?: string): { lat: number; lng: number } {
  const parsedLat = parseNumber(lat);
  const parsedLng = parseNumber(lng);
  
  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 && 
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  
  const lookupKey = (city || country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];
  
  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

const VALID_BUSINESS_TYPES = ['distributor', 'retailer', 'manufacturer', 'wholesaler', 'service_provider'];

// Track used coordinates to prevent overlapping map markers
const usedCoordinates: Map<string, number> = new Map();

function getUniqueCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  const count = usedCoordinates.get(key) || 0;
  usedCoordinates.set(key, count + 1);
  
  if (count === 0) {
    return { lat, lng };
  }
  
  // Spiral pattern offset for overlapping coordinates
  const angle = count * (Math.PI / 4); // 45 degrees per step
  const radius = 0.01 + (count * 0.005); // Increasing radius
  const offsetLat = Math.cos(angle) * radius;
  const offsetLng = Math.sin(angle) * radius;
  
  return { 
    lat: lat + offsetLat, 
    lng: lng + offsetLng 
  };
}

function resetCoordinateTracking() {
  usedCoordinates.clear();
}

function normalizeBusinessType(rawType: string): string {
  const normalized = rawType.toLowerCase().trim();
  if (VALID_BUSINESS_TYPES.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes('distribut')) return 'distributor';
  if (normalized.includes('retail')) return 'retailer';
  if (normalized.includes('manufactur') || normalized.includes('producer')) return 'manufacturer';
  if (normalized.includes('wholesale')) return 'wholesaler';
  if (normalized.includes('service') || normalized.includes('provider')) return 'service_provider';
  return normalized || 'unknown';
}

export function validateCompanyData(data: any): any {
  const rawName = String(data.name || data.companyName || '').trim();
  // Filter out Unknown companies
  if (!rawName || rawName.toLowerCase() === 'unknown' || rawName.toLowerCase() === 'unknown company') {
    console.warn('[Discovery] Filtering out Unknown company');
    return null as any;
  }
  const name = rawName;
  const sector = String(data.sector || data.industry || 'Unknown').trim();
  const rawBusinessType = String(data.businessType || data.business_type || data.type || '').trim();
  const businessType = normalizeBusinessType(rawBusinessType);
  const region = String(data.region || data.area || 'Unknown').trim();
  const country = String(data.country || data.location || region).trim();
  const city = String(data.city || data.headquarters || data.hq || '').trim();
  const relevanceReason = String(data.relevanceReason || data.relevance_reason || data.whyIncluded || '').trim();
  
  const coords = validateCoordinates(data.latitude || data.lat, data.longitude || data.lng || data.lon, region, country, city);
  
  const revenueSource = String(data.revenueSource || data.revenue_source || '').trim();
  
  // ============================================================================
  // GOVERNMENT AUTHORITY DETECTION
  // ============================================================================
  // Authorities, ministries, regulators are NOT operating companies unless corporatised
  // They should exist but with revenue = Unknown and isOperatingCompany = false
  // ============================================================================
  
  const GOVERNMENT_AUTHORITY_PATTERNS = [
    /\bauthority\b/i,
    /\bministry\b/i,
    /\bregulator\b/i,
    /\bdepartment of\b/i,
    /\bgovernment of\b/i,
    /\bfederal\b.*\b(agency|commission|board)\b/i,
    /\bpublic authority\b/i,
    /\bregulatory commission\b/i,
    /\bgovernance\b/i,
  ];
  
  // Whitelist: Corporatised entities that ARE operating companies with financial reporting
  const CORPORATISED_ENTITIES = [
    'DEWA', 'Dubai Electricity and Water Authority', // Corporatised utility with audited reports
    'ADNOC', 'Abu Dhabi National Oil Company',
    'Emirates NBD', // Bank with public financials
    'ENOC', 'Emirates National Oil Company',
    'Masdar',
    'Mubadala',
    'ADDC', 'Abu Dhabi Distribution Company',
    'TRANSCO', 'Abu Dhabi Transmission & Despatch Company',
  ];
  
  const isGovernmentAuthority = GOVERNMENT_AUTHORITY_PATTERNS.some(pattern => pattern.test(name));
  const isCorporatisedEntity = CORPORATISED_ENTITIES.some(entity => 
    name.toLowerCase().includes(entity.toLowerCase())
  );
  
  let entityType = 'operating_company';
  let isOperatingCompany = true;
  
  if (isGovernmentAuthority && !isCorporatisedEntity) {
    entityType = 'government_authority';
    isOperatingCompany = false;
    console.log(`[Discovery] ${name}: Detected as government authority - revenue will be Unknown, not an operating company`);
  } else if (isCorporatisedEntity) {
    entityType = 'corporatised_entity';
    isOperatingCompany = true;
    console.log(`[Discovery] ${name}: Corporatised entity - treated as operating company with financial reporting`);
  }
  
  // ============================================================================
  // STRICT REVENUE RULES: Currency + Year REQUIRED
  // ============================================================================
  // If the source does not explicitly include (Revenue, Year, Currency):
  // → store revenue as NULL/Unknown
  // Never show a USD number unless you also store the original currency and year
  // ============================================================================
  
  // Extract currency and fiscal year from LLM response
  const rawCurrency = String(data.revenueCurrency || data.currency || '').trim().toUpperCase();
  const rawFiscalYear = parseNumber(data.revenueFiscalYear || data.fiscalYear || data.revenueYear);
  
  // Tier 1: Official audited sources (highest authority)
  const isTier1Source = revenueSource && 
    /annual report|10-k|sec filing|quarterly report|regulatory filing|audited|official disclosure|company financials|investor relations/i.test(revenueSource);
  
  // Tier 2: Trusted aggregators OR industry estimates
  const isTier2Source = revenueSource && (
    (/forbes|fortune|bloomberg|reuters|financial times|kpmg|pwc|deloitte|ey|ernst|s&p|moody|fitch|zawya|argaam/i.test(revenueSource) &&
     /revenue|sales|turnover|results|report|financial/i.test(revenueSource)) ||
    /industry estimate|market estimate|estimated based on|analyst estimate/i.test(revenueSource)
  );
  
  // Reject: Bad proxies (AUM, project value, etc.) - but NOT industry estimates
  // Industry estimates are acceptable in Tier 2 when clearly labeled
  const isRejectedSource = !revenueSource || 
    /aum|assets under management|project value|contract value|gmv|valuation|funding|investment|pipeline|backlog/i.test(revenueSource);
  
  let revenue: number | null = parseNumber(data.revenue || data.revenue_usd || data.revenueUSD);
  let revenueCurrency: string | null = null;
  let revenueFiscalYear: number | null = null;
  let revenueConvertedFromCurrency: string | null = null;
  let revenueFxRate: number | null = null;
  let revenueFxPolicy: string | null = null;
  let revenueConfidenceReduction = 0;
  
  // ============================================================================
  // FX RATES LOOKUP (used for both conversion and sanity checks)
  // ============================================================================
  const FX_RATES: Record<string, { rate: number; policy: string }> = {
    'AED': { rate: 0.2723, policy: 'Fixed peg: 1 USD = 3.6725 AED' },
    'SAR': { rate: 0.2667, policy: 'Fixed peg: 1 USD = 3.75 SAR' },
    'QAR': { rate: 0.2747, policy: 'Fixed peg: 1 USD = 3.64 QAR' },
    'BHD': { rate: 2.6526, policy: 'Fixed peg: 1 USD = 0.377 BHD' },
    'OMR': { rate: 2.5974, policy: 'Fixed peg: 1 USD = 0.385 OMR' },
    'KWD': { rate: 3.2573, policy: 'Fixed peg: 1 USD = 0.307 KWD' },
    'EUR': { rate: 1.08, policy: 'Floating rate as of 2024-01' },
    'GBP': { rate: 1.27, policy: 'Floating rate as of 2024-01' },
    'USD': { rate: 1.0, policy: 'Base currency' },
  };
  
  // Government authorities: Force revenue to null unless corporatised
  if (!isOperatingCompany) {
    console.log(`[Discovery] ${name}: Government authority - forcing revenue to null`);
    revenue = null;
  }
  // Apply strict revenue validation - NO REVENUE IS BETTER THAN WRONG REVENUE
  else if (revenue === 0 || revenue === null || !revenueSource) {
    console.log(`[Discovery] ${name}: No revenue data - setting to null`);
    revenue = null;
  } else if (isRejectedSource) {
    console.log(`[Discovery] ${name}: Revenue source "${revenueSource}" is not authoritative (estimate/inferred) - setting to null`);
    revenue = null;
  } else if (!isTier1Source && !isTier2Source) {
    console.log(`[Discovery] ${name}: Revenue source "${revenueSource}" is unverified (not Tier 1 or Tier 2) - setting to null`);
    revenue = null;
  } else {
    // ============================================================================
    // CURRENCY + YEAR HANDLING: Accept revenue with defaults if missing
    // ============================================================================
    // CHANGED: Previously rejected revenue entirely if currency/year missing.
    // NEW APPROACH: Accept revenue but apply confidence reduction and use defaults.
    // This ensures users see approximate revenue rather than "Unknown" for all results.
    // ============================================================================
    const hasCurrency = rawCurrency && rawCurrency.length >= 2 && rawCurrency.length <= 4;
    const hasFiscalYear = rawFiscalYear && rawFiscalYear >= 2015 && rawFiscalYear <= 2030;
    
    if (!hasCurrency || !hasFiscalYear) {
      // ACCEPT revenue with defaults instead of rejecting
      console.log(`[Discovery] ${name}: Revenue ACCEPTED with defaults - currency (${rawCurrency || 'none'} -> USD) or year (${rawFiscalYear || 'none'} -> estimated)`);
      revenueCurrency = hasCurrency ? rawCurrency : 'USD'; // Default to USD if not specified
      revenueFiscalYear = hasFiscalYear ? rawFiscalYear : null; // Keep null to indicate estimated
      
      // Apply confidence reduction for missing metadata
      if (!hasCurrency) revenueConfidenceReduction += 1;
      if (!hasFiscalYear) revenueConfidenceReduction += 1;
    } else {
      revenueCurrency = rawCurrency;
      revenueFiscalYear = rawFiscalYear;
    }
    
    // FX CONVERSION: Convert non-USD currencies to USD using FX_RATES lookup
    if (revenueCurrency && revenueCurrency !== 'USD' && FX_RATES[revenueCurrency]) {
      const fx = FX_RATES[revenueCurrency];
      const originalRevenue = revenue;
      revenue = Math.round(revenue! * fx.rate);
      revenueConvertedFromCurrency = revenueCurrency;
      revenueFxRate = fx.rate;
      revenueFxPolicy = fx.policy;
      revenueCurrency = 'USD'; // Store in USD after conversion
      console.log(`[Discovery] ${name}: Converted revenue from ${revenueConvertedFromCurrency} to USD (rate: ${fx.rate}, original: ${originalRevenue})`);
    }
    
    // Tier 2 sources get minor confidence reduction
    if (isTier2Source && !isTier1Source) {
      revenueConfidenceReduction += 1;
    }
  }
  
  // ============================================================================
  // REVENUE SANITY CHECKS FOR KNOWN LISTED UTILITIES
  // ============================================================================
  // For listed utilities where audited revenue is available, verify LLM output
  // If it deviates wildly from known reported revenue → mark as Unknown
  // Uses the same FX_RATES from above for consistent currency conversion
  // ============================================================================
  
  const KNOWN_UTILITY_REVENUES: Record<string, { min: number; max: number; currency: string; year: number; source: string }> = {
    'DEWA': { min: 20000000000, max: 30000000000, currency: 'AED', year: 2023, source: 'Dubai Electricity and Water Authority Annual Report 2023 (~AED 25.5B)' },
    'Dubai Electricity and Water Authority': { min: 20000000000, max: 30000000000, currency: 'AED', year: 2023, source: 'DEWA Annual Report 2023 (~AED 25.5B)' },
    'TAQA': { min: 45000000000, max: 60000000000, currency: 'AED', year: 2023, source: 'Abu Dhabi National Energy Company Annual Report 2023 (~AED 52B)' },
    'Abu Dhabi National Energy Company': { min: 45000000000, max: 60000000000, currency: 'AED', year: 2023, source: 'TAQA Annual Report 2023' },
    'SEC': { min: 60000000000, max: 85000000000, currency: 'SAR', year: 2023, source: 'Saudi Electricity Company Annual Report 2023 (~SAR 72B)' },
    'Saudi Electricity Company': { min: 60000000000, max: 85000000000, currency: 'SAR', year: 2023, source: 'SEC Annual Report 2023' },
    'QEWC': { min: 4000000000, max: 6000000000, currency: 'QAR', year: 2023, source: 'Qatar Electricity and Water Company Annual Report 2023 (~QAR 5B)' },
    'Qatar Electricity and Water Company': { min: 4000000000, max: 6000000000, currency: 'QAR', year: 2023, source: 'QEWC Annual Report 2023' },
  };
  
  if (revenue !== null && revenue > 0) {
    const knownRevenue = Object.entries(KNOWN_UTILITY_REVENUES).find(([key]) => 
      name.toLowerCase().includes(key.toLowerCase())
    );
    
    if (knownRevenue) {
      const [utilityName, bounds] = knownRevenue;
      // Use the same FX_RATES lookup for consistent conversion
      const fxRate = FX_RATES[bounds.currency]?.rate || 0.27; // Fallback to approximate rate
      const minUSD = bounds.min * fxRate;
      const maxUSD = bounds.max * fxRate;
      
      // Allow 50% below min and 200% above max to account for currency/year variations
      if (revenue < minUSD * 0.5 || revenue > maxUSD * 2) {
        console.warn(`[Discovery] ${name}: Revenue ${revenue} USD deviates wildly from known ${utilityName} range (${Math.round(minUSD)}-${Math.round(maxUSD)} USD, from ${bounds.currency} using rate ${fxRate}) - setting to null`);
        revenue = null;
        revenueCurrency = null;
        revenueFiscalYear = null;
      } else {
        console.log(`[Discovery] ${name}: Revenue ${revenue} USD within acceptable range for known utility ${utilityName} (${Math.round(minUSD)}-${Math.round(maxUSD)} USD)`);
      }
    }
  }
  
  // EMPLOYEES: Do not auto-set defaults - missing/unreliable data stays Unknown
  const rawEmployees = parseNumber(data.employees || data.employeeCount || data.headcount);
  let employees: number | null = rawEmployees > 0 ? Math.round(rawEmployees) : null;
  
  if (employees === null || employees === 0) {
    console.log(`[Discovery] ${name}: No employee data available - keeping as Unknown (no false precision)`);
  }
  
  // ============================================================================
  // CONFIDENCE SEMANTICS (DO NOT CONFLATE THESE TWO CASES)
  // ============================================================================
  // 
  // CASE 1: MISSING CONFIDENCE (undefined, null, or not provided)
  //   - Meaning: "Unknown confidence due to missing justification"
  //   - Action: Assign confidence = 3, allow entity to proceed
  //   - This is NOT explicit unreliability - just unknown
  //
  // CASE 2: EXPLICIT LOW CONFIDENCE (LLM returned 0 or 1)
  //   - Meaning: "Explicitly unreliable as signaled by the model"
  //   - Action: PRESERVE the returned value (do not upgrade)
  //   - This IS explicit unreliability - the model is signaling distrust
  //
  // CRITICAL: Missing confidence must NEVER be treated as explicit unreliability
  //           Explicit unreliability must NEVER be auto-upgraded
  // ============================================================================
  
  const providedConfidence = data.confidence ?? data.score;
  const isConfidenceMissing = providedConfidence === undefined || providedConfidence === null;
  let confidence: number;
  
  if (isConfidenceMissing) {
    // CASE 1: Missing confidence - unknown, not unreliable
    // confidence = 3 → "unknown due to missing justification"
    confidence = 3;
    console.log(`[Discovery] ${name}: No confidence score provided - defaulting to 3 (unknown, not unreliable)`);
  } else {
    const parsedConfidence = parseNumber(providedConfidence, 3);
    
    if (parsedConfidence <= 1) {
      // CASE 2: Explicit low confidence - preserve, do not upgrade
      // confidence = 0/1 → "explicitly unreliable as signaled by the model"
      confidence = parsedConfidence;
      console.log(`[Discovery] ${name}: LLM explicitly signaled low confidence (${confidence}) - preserving as unreliable`);
    } else {
      // Normal case: confidence 2-10, clamp to valid range
      confidence = Math.max(1, Math.min(10, parsedConfidence));
    }
  }
  
  // Apply confidence reduction for non-authoritative revenue sources
  if (revenueConfidenceReduction > 0) {
    confidence = Math.max(1, confidence - revenueConfidenceReduction);
  }
  
  // Revenue sanity checks (only if both revenue and employees exist)
  if (revenue !== null && revenue > 0 && employees !== null && employees > 0) {
    const revenuePerEmployee = revenue / employees;
    const MAX_REASONABLE_RATIO = 3000000;
    
    if (revenuePerEmployee > MAX_REASONABLE_RATIO) {
      console.warn(`[Discovery] Warning: ${name} has unusually high revenue/employee ratio`);
      confidence = Math.min(confidence, 3);
    }
  }
  
  const MAX_PRIVATE_COMPANY_REVENUE = 30000000000;
  if (revenue !== null && revenue > MAX_PRIVATE_COMPANY_REVENUE && !isTier1Source) {
    console.warn(`[Discovery] Warning: Private company ${name} has very high revenue without Tier 1 source`);
    confidence = Math.min(confidence, 4);
  }
  
  const rawExecutives = Array.isArray(data.executives) ? data.executives : [];
  const executives = rawExecutives.map(validateExecutiveData).filter((e: any) => e !== null);
  
  return {
    name,
    sector,
    businessType,
    entityType,
    isOperatingCompany,
    region,
    country,
    city,
    streetAddress: String(data.streetAddress || data.street_address || data.address || '').trim(),
    latitude: coords.lat,
    longitude: coords.lng,
    revenue,
    revenueSource,
    revenueCurrency,
    revenueFiscalYear,
    revenueConvertedFromCurrency,
    revenueFxRate,
    revenueFxPolicy,
    employees,
    employeesSource: String(data.employeesSource || data.employees_source || 'Unknown').trim(),
    confidence,
    relevanceReason,
    executives
  };
}

function validateExecutiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return null;
  }
  
  const name = String(data.name || data.fullName || data.executive_name || '').trim();
  const title = String(data.title || data.position || data.role || '').trim();
  
  if (!name || name === 'Unknown' || !title) {
    return null;
  }
  
  // Filter out placeholder names (titles without real names)
  const placeholderPatterns = ['Managing Director', 'CEO', 'CFO', 'COO', 'CTO', 'Director', 'Manager', 'Founder', 'Owner', 'President', 'Chairman'];
  const isPlaceholder = placeholderPatterns.some(p => 
    name.toLowerCase() === p.toLowerCase() || 
    name.toLowerCase().replace(/\s+/g, '') === p.toLowerCase().replace(/\s+/g, '')
  );
  if (isPlaceholder) {
    console.warn(`[Discovery] Filtering out placeholder executive name: "${name}"`);
    return null;
  }
  
  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));
  
  // Only return high-confidence executives (confidence >= 6)
  const MIN_CONFIDENCE = 6;
  if (confidence < MIN_CONFIDENCE) {
    console.warn(`[Discovery] Filtering out low-confidence executive: "${name}" (confidence: ${confidence})`);
    return null;
  }
  
  return {
    name,
    title,
    email: data.email || null,
    linkedin: data.linkedin || data.linkedIn || null,
    profileUrl: data.profileUrl || data.profile_url || data.linkedin || null,
    imageUrl: data.imageUrl || data.image_url || null,
    source: data.source || 'discovery',
    confidence
  };
}

function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }
    
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }
    
    return null;
  }
}

function extractLimitFromQuery(query: string): number {
  const match = query.match(/(?:top|first|leading|biggest|largest|best)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 50) {
      return num;
    }
  }
  return 10;
}

export async function parseSearchQuery(query: string, selectedModel: string = DEFAULT_MODEL): Promise<ParsedSearchResult> {
  const limit = extractLimitFromQuery(query);
  
  const criteria: SearchCriteria = {
    roles: [],
    roleFunction: 'all',
    roleLevel: 'all',
    sectors: [],
    regions: [],
    minRevenue: null,
    maxRevenue: null,
    minEmployees: null,
    maxEmployees: null,
    limit
  };
  
  return {
    criteria,
    interpretation: query
  };
}

export async function fetchAvailableModels(): Promise<any[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      console.error("[Discovery] Failed to fetch models from OpenRouter");
      return AVAILABLE_MODELS;
    }
    
    const data = await response.json();
    const models = data.data?.map((model: any) => ({
      id: model.id,
      name: model.name || model.id,
      provider: model.id.split('/')[0] || 'Unknown',
      contextLength: model.context_length,
      pricing: model.pricing
    })) || [];
    
    const hasDeepseek = models.some((m: any) => m.id === DEFAULT_MODEL);
    const sortedModels = hasDeepseek ? models : [
      { id: DEFAULT_MODEL, name: "DeepSeek V3 (Default)", provider: "DeepSeek" },
      ...models
    ];
    return sortedModels;
  } catch (error) {
    console.error("[Discovery] Error fetching models:", error);
    return AVAILABLE_MODELS;
  }
}

export function generateSearchUniqueKey(query: string): string {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const timestamp = Date.now();
  return `${normalizedQuery}|${timestamp}`;
}

const WORLD_CLASS_SEARCH_PROMPT = `You are an expert market research analyst for an executive search firm. Your job is to find REAL companies that PRECISELY match what the user is looking for.

===== CRITICAL INSTRUCTIONS =====

1. READ THE QUERY CAREFULLY: Pay attention to EVERY word, especially:
   - Business type specifications (distributor, retailer, manufacturer, wholesaler, etc.)
   - Explicit EXCLUSIONS (phrases like "not retailers", "excluding manufacturers", "only distributors")
   - Geographic constraints (specific countries, regions, cities)
   - Industry/sector focus (FMCG, technology, healthcare, etc.)
   - Size requirements (revenue ranges, employee counts)

2. SELF-VERIFICATION: Before including ANY company, you MUST mentally verify:
   - Does this company's PRIMARY business match what was asked for?
   - If the query says "distributors not retailers", is this company PRIMARILY a distributor?
   - Does this company operate in the specified region?
   - Is this a real, established company (not fictional)?

3. BUSINESS TYPE CLASSIFICATION:
   - DISTRIBUTOR: Buys products from manufacturers and sells to retailers/businesses (B2B wholesale)
   - RETAILER: Sells directly to consumers (B2C)
   - MANUFACTURER: Produces/makes the products
   - WHOLESALER: Bulk seller to businesses (similar to distributor)
   - SERVICE_PROVIDER: Provides services rather than physical goods

4. EXCLUSION HANDLING:
   - If query says "not retailers" → EXCLUDE any company whose primary business is retail
   - If query says "only distributors" → INCLUDE ONLY companies whose primary business is distribution
   - Even if a company does some distribution, if they're primarily a retailer, EXCLUDE them

5. EXECUTIVE SEARCH MODES - CRITICAL:
   Analyze the query to determine which executives to research:
   
   MODE A - FULL LEADERSHIP (Default - when NO role/position mentioned):
   - Research and return ALL senior leadership: CEO, CFO, COO, CTO, CMO, CHRO, General Counsel
   - Also include N-1 level: VPs, SVPs, Managing Directors, Regional Directors
   - Example queries: "Top 10 FMCG distributors in UAE", "Luxury watch companies in Switzerland"
   - For each company, aim to find 3-5 senior leaders
   
   MODE B - SPECIFIC POSITION (when exact title mentioned):
   - Return ONLY that specific position
   - Example: "CEOs of top banks" → only return CEO
   - Example: "CFOs of tech companies" → only return CFO
   - Return exactly 1 executive per company matching that position
   
   MODE C - FUNCTION-BASED (when a function/department mentioned):
   - Return ALL senior leaders in that function
   - Example: "senior finance leaders" → CFO, VP Finance, Finance Director, Treasurer, Controller
   - Example: "operations leadership" → COO, VP Operations, Operations Director, Supply Chain Director
   - Example: "technology leaders" → CTO, CIO, VP Engineering, Head of IT
   - For each company, find 2-4 people in that function
   
   CONFIDENCE REQUIREMENT:
   - Only return executives with confidence >= 6 (verified from official sources)
   - Do NOT include executives you're unsure about

===== OUTPUT FORMAT =====

Return a JSON object with this EXACT structure:
{
  "companies": [
    {
      "name": "Exact Legal Company Name",
      "businessType": "distributor|retailer|manufacturer|wholesaler|service_provider",
      "relevanceReason": "Why this company matches the query - be specific about how they fit the criteria",
      "sector": "Industry Sector (e.g., FMCG, Consumer Goods, Food & Beverage)",
      "region": "Geographic Region (e.g., Middle East, GCC)",
      "country": "Country Name",
      "city": "Headquarters City",
      "streetAddress": "Exact street address of headquarters",
      "latitude": 25.2048,
      "longitude": 55.2708,
      "revenue": 500000000,
      "revenueCurrency": "USD",
      "revenueFiscalYear": 2024,
      "revenueSource": "Annual Report 2024 OR Industry estimate based on market position",
      "employees": 3000,
      "employeesSource": "How you determined this (e.g., 'LinkedIn company size indicator')",
      "confidence": 7,
      "executives": [
        {
          "name": "Full Name of Real Person",
          "title": "Exact Current Title (e.g., CEO, CFO, VP Sales)",
          "source": "Where you found this (Company Website, LinkedIn, Press Release)",
          "linkedin": "https://linkedin.com/in/username",
          "confidence": 7
        }
      ],
      "executiveSearchMode": "full_leadership|specific_position|function_based",
      "executiveSearchReason": "Explain why you chose this mode based on the query"
    }
  ]
}

===== DATA QUALITY REQUIREMENTS =====

1. ONLY include companies you are confident are REAL and currently operating

2. REVENUE GUIDELINES:
   DEFINITION: Revenue means TOP-LINE OPERATING REVENUE from normal business activities for a specific financial year.
   
   Revenue DOES NOT include and MUST NOT be confused with:
   - Project value or contract value
   - Capital injections or funding amounts
   - Assets under management (AUM)
   - Assets under development (AUD)
   - Gross merchandise value (GMV)
   - Valuation or enterprise value
   - Pipeline or backlog value
   - Investment size or capex
   
   SOURCE PRIORITY (use the best available):
   1. TIER 1 - Audited annual reports or regulatory filings (highest confidence)
   2. TIER 2 - Official company financial disclosures, Forbes, Fortune, Bloomberg
   3. TIER 3 - Industry estimates from reputable sources (clearly label as "Industry estimate")
   
   APPROACH:
   - For PUBLIC companies: Use official filings when available
   - For PRIVATE companies: Use industry estimates with clear labeling (e.g., "Industry estimate based on market position")
   - For LARGE, WELL-KNOWN companies: Provide your best estimate with source reasoning
   - ALWAYS include revenueCurrency (e.g., "USD", "AED", "EUR") and revenueFiscalYear (e.g., 2023, 2024)
   - revenueSource MUST explain where the figure comes from or why it was estimated
   
   WHAT TO AVOID:
   - Do NOT substitute project value, AUM, GMV, or funding as revenue
   - Do NOT use valuation or enterprise value as revenue

3. GPS Coordinates: MUST be the EXACT coordinates of the company's headquarters street address
   - Each company MUST have UNIQUE coordinates - never use the same coordinates for multiple companies
   - Look up the actual street address and convert to precise GPS coordinates
   - If you cannot find exact address, use the city center but add unique offset
4. EXECUTIVES - CRITICAL REQUIREMENT:
   - You MUST find and return REAL PERSON NAMES - never use placeholders like "Managing Director" or "CEO"
   - Search the web for actual executive names from LinkedIn, company websites, press releases
   - Each executive MUST have: full real name (e.g., "John Smith", not "Managing Director"), their actual title, and source
   - If you cannot find any real executive names for a company, set confidence to 1 and explain in source field
   - Examples of WRONG executive names: "Managing Director", "CEO", "Founder", "General Manager"
   - Examples of CORRECT executive names: "Kamal Vachani", "Mohammad Baker", "Ahmed Al Ghurair"
5. Confidence scoring:
   - 8-10: Verified from official sources (annual reports, company website)
   - 5-7: Industry data, LinkedIn, news articles
   - 1-4: Rough estimates, limited verification

===== RANKING =====

Rank companies by:
1. Relevance to the exact query (most important)
2. Revenue/market position (within relevant companies)
3. Data confidence/reliability`;

export async function* discoverCompaniesStreaming(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): AsyncGenerator<{ type: 'company' | 'status' | 'error' | 'complete', data: any }> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    yield { type: 'error', data: { message: 'Original query is required for accurate search results' } };
    return;
  }
  
  const limit = criteria.limit || 10;
  const query = originalQuery.trim();
  
  // ========== QUERY VALIDATION ==========
  // Validate query against edge cases before processing
  const queryValidation = validateQuery(query);
  
  console.log(`[Discovery] Query validation result: type=${queryValidation.classification.type}, risk=${queryValidation.overallRisk}`);
  
  if (queryValidation.warnings.length > 0) {
    console.log(`[Discovery] Query warnings: ${queryValidation.warnings.join('; ')}`);
  }
  
  // Yield warnings to frontend for user awareness
  if (queryValidation.overallRisk === 'high') {
    yield { 
      type: 'status', 
      data: { 
        message: `High-risk query detected: ${queryValidation.warnings[0] || 'Results may have reduced confidence'}`,
        progress: 2,
        warning: true
      } 
    };
  }
  // ========== END QUERY VALIDATION ==========
  
  const client = openrouter;
  
  // ========== ENFORCE APPROVED MODELS ==========
  // CRITICAL: Only approved models can be used for discovery
  const modelValidation = getApprovedModel(selectedModel || DEFAULT_MODEL);
  const baseModel = modelValidation.model;
  
  // ========== DISCOVERY STATUS TRACKING ==========
  // Track degradation conditions throughout the discovery process
  const degradationReasons: string[] = [];
  let discoveryStatus: 'complete' | 'partial' | 'degraded' = 'complete';
  
  if (modelValidation.wasOverridden) {
    console.warn(`[Discovery Streaming] ${modelValidation.reason}`);
    yield { type: 'status', data: { message: `Using approved model: ${baseModel}`, progress: 2 } };
    degradationReasons.push('Non-approved model overridden');
    discoveryStatus = 'degraded';
  }
  // ========== END MODEL ENFORCEMENT ==========
  
  // Determine if this model supports :online suffix reliably
  const isReliableOnlineModel = RELIABLE_ONLINE_MODELS.some(m => baseModel.includes(m) || m.includes(baseModel));
  
  // Try with :online first if the model is known to support it, otherwise try base model first
  let useOnline = isReliableOnlineModel;
  let modelName = useOnline ? `${baseModel}:online` : baseModel;
  
  console.log(`[Discovery Streaming] Starting for ${limit} companies with model: ${modelName}`);
  console.log(`[Discovery Streaming] Original query: "${query}"`);
  console.log(`[Discovery Streaming] Reliable online model: ${isReliableOnlineModel}, using :online = ${useOnline}`);
  
  yield { type: 'status', data: { message: 'Searching the web for companies...', progress: 5 } };
  
  const messages = [
    {
      role: "system" as const,
      content: WORLD_CLASS_SEARCH_PROMPT
    },
    {
      role: "user" as const,
      content: `USER SEARCH QUERY: "${query}"

Find exactly ${limit} companies that match this query.

IMPORTANT: 
- Search the web for REAL, currently operating companies
- Read the query carefully for any business type specifications or exclusions
- Each company MUST have a "relevanceReason" explaining WHY it matches the query
- Only include companies that PRECISELY match what was asked for
- Verify company information from their official websites or trusted business directories`
    }
  ];

  // Define structured output schema for consistent company data
  const companySchema = {
    type: "object" as const,
    properties: {
      companies: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const, description: "Exact legal company name" },
            businessType: { 
              type: "string" as const, 
              enum: ["distributor", "retailer", "manufacturer", "wholesaler", "service_provider"],
              description: "Primary business type classification"
            },
            relevanceReason: { type: "string" as const, description: "Why this company matches the query" },
            sector: { type: "string" as const, description: "Industry sector" },
            region: { type: "string" as const, description: "Geographic region" },
            country: { type: "string" as const, description: "Country name" },
            city: { type: "string" as const, description: "Headquarters city" },
            streetAddress: { type: "string" as const, description: "Exact street address of headquarters" },
            latitude: { type: "number" as const, description: "GPS latitude of headquarters" },
            longitude: { type: "number" as const, description: "GPS longitude of headquarters" },
            revenue: { type: ["number", "null"] as any, description: "Annual revenue in ORIGINAL CURRENCY. For public companies use official filings; for well-known companies provide industry estimates. ALWAYS provide a number for major banks, utilities, and large corporations. Only set null for truly unknown small/private companies." },
            revenueCurrency: { type: "string" as const, description: "REQUIRED: 3-letter currency code (e.g., 'USD', 'AED', 'SAR', 'EUR'). Use 'USD' if unsure. Must be provided when revenue is provided." },
            revenueFiscalYear: { type: "integer" as const, description: "REQUIRED: Fiscal year of the revenue figure (e.g., 2023, 2024). Use most recent available year." },
            revenueSource: { type: "string" as const, description: "REQUIRED: Source of revenue (e.g., 'Annual Report 2023', 'Industry estimate based on market position'). Explain your reasoning." },
            employees: { type: "integer" as const, description: "Number of employees" },
            employeesSource: { type: "string" as const, description: "Source of employee count" },
            confidence: { type: "integer" as const, minimum: 1, maximum: 10, description: "Data confidence score 1-10" },
            executives: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const, description: "Executive full name (real person, not a title)" },
                  title: { type: "string" as const, description: "Current job title" },
                  source: { type: "string" as const, description: "Where this info was found" },
                  linkedin: { type: "string" as const, description: "LinkedIn profile URL" },
                  confidence: { type: "integer" as const, minimum: 1, maximum: 10 }
                },
                required: ["name", "title", "source", "confidence"]
              }
            },
            executiveSearchMode: {
              type: "string" as const,
              enum: ["full_leadership", "specific_position", "function_based"],
              description: "Which executive search mode was applied based on query analysis"
            },
            executiveSearchReason: {
              type: "string" as const,
              description: "Why this mode was chosen based on the query"
            }
          },
          required: ["name", "businessType", "relevanceReason", "sector", "country", "latitude", "longitude", "revenue", "revenueCurrency", "revenueFiscalYear", "employees", "confidence", "executiveSearchMode", "executiveSearchReason"]
        }
      }
    },
    required: ["companies"]
  };

  const requestOptions: any = {
    model: modelName,
    messages,
    max_tokens: 8000,
    temperature: 0.1,
    // Structured outputs for consistent JSON
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "company_search_results",
        strict: true,
        schema: companySchema
      }
    },
    // Response healing plugin to fix any malformed JSON
    plugins: [
      { id: "response-healing" },
      { id: "web", max_results: 10 }
    ]
  };

  yield { type: 'status', data: { message: useOnline ? 'Searching the web for companies...' : 'Researching companies...', progress: 15 } };

  let response;
  let usedOnline = useOnline;
  
  // Helper function to make the API call
  const makeRequest = async (withOnline: boolean) => {
    const attemptModel = withOnline ? `${baseModel}:online` : baseModel;
    const attemptOptions = {
      ...requestOptions,
      model: attemptModel,
      plugins: withOnline ? [
        { id: "response-healing" },
        { id: "web", max_results: 10 }
      ] : [
        { id: "response-healing" }
      ]
    };
    return client.chat.completions.create(attemptOptions);
  };
  
  // Helper to try a model with both online modes
  let lastFallbackError: { code: string; message: string; suggestion: string } | null = null;
  
  const tryModelWithFallback = async (model: string): Promise<{ response: any; usedOnline: boolean } | null> => {
    const isReliableOnline = RELIABLE_ONLINE_MODELS.includes(model);
    const tryOnlineFirst = isReliableOnline;
    
    try {
      const resp = await client.chat.completions.create({
        ...requestOptions,
        model: tryOnlineFirst ? `${model}:online` : model,
        plugins: tryOnlineFirst ? [{ id: "response-healing" }, { id: "web", max_results: 10 }] : [{ id: "response-healing" }]
      });
      return { response: resp, usedOnline: tryOnlineFirst };
    } catch (e1: any) {
      const err1 = parseOpenRouterError(e1);
      console.log(`[Discovery Streaming] ${model} (online=${tryOnlineFirst}) failed: ${err1.code}`);
      
      // Try opposite online mode
      try {
        const resp = await client.chat.completions.create({
          ...requestOptions,
          model: !tryOnlineFirst ? `${model}:online` : model,
          plugins: !tryOnlineFirst ? [{ id: "response-healing" }, { id: "web", max_results: 10 }] : [{ id: "response-healing" }]
        });
        return { response: resp, usedOnline: !tryOnlineFirst };
      } catch (e2: any) {
        lastFallbackError = parseOpenRouterError(e2);
        console.log(`[Discovery Streaming] ${model} (online=${!tryOnlineFirst}) also failed: ${lastFallbackError.code}`);
        return null;
      }
    }
  };

  try {
    response = await makeRequest(useOnline);
    usedOnline = useOnline;
  } catch (apiError: any) {
    const parsedError = parseOpenRouterError(apiError);
    console.log(`[Discovery Streaming] First attempt failed (online=${useOnline}): ${parsedError.code} - ${parsedError.message}`);
    
    // If online mode failed, try without it (or vice versa)
    const shouldRetry = parsedError.code === 'PROVIDER_ERROR' || parsedError.code === 'PRIVACY_POLICY' || parsedError.code === 'MODEL_NOT_FOUND';
    
    if (shouldRetry) {
      const retryOnline = !useOnline;
      console.log(`[Discovery Streaming] Retrying with online=${retryOnline}...`);
      yield { type: 'status', data: { message: `Web search unavailable for this model. ${retryOnline ? 'Enabling' : 'Using'} model's training data...`, progress: 18 } };
      // Track web search unavailability as degradation
      if (!retryOnline) {
        degradationReasons.push('Web search unavailable - using model training data only');
        if (discoveryStatus === 'complete') discoveryStatus = 'degraded';
      }
      
      try {
        response = await makeRequest(retryOnline);
        usedOnline = retryOnline;
        console.log(`[Discovery Streaming] Retry successful with online=${retryOnline}`);
      } catch (retryError: any) {
        const retryParsedError = parseOpenRouterError(retryError);
        console.log(`[Discovery Streaming] Both attempts failed for ${baseModel}: ${retryParsedError.message}`);
        
        // Try fallback models
        let fallbackSuccess = false;
        for (const fallbackModel of FALLBACK_MODELS) {
          if (fallbackModel === baseModel) continue; // Skip the model we already tried
          
          console.log(`[Discovery Streaming] Trying fallback model: ${fallbackModel}`);
          yield { type: 'status', data: { message: `Trying alternative AI model...`, progress: 20 } };
          
          const fallbackResult = await tryModelWithFallback(fallbackModel);
          if (fallbackResult) {
            response = fallbackResult.response;
            usedOnline = fallbackResult.usedOnline;
            console.log(`[Discovery Streaming] Fallback successful with ${fallbackModel} (online=${usedOnline})`);
            fallbackSuccess = true;
            // Track fallback usage as degradation
            degradationReasons.push(`Fallback model used: ${fallbackModel}`);
            if (discoveryStatus === 'complete') discoveryStatus = 'degraded';
            break;
          }
          console.log(`[Discovery Streaming] Fallback model ${fallbackModel} also failed`);
        }
        
        if (!fallbackSuccess) {
          console.error("[Discovery Streaming] All models failed including fallbacks");
          const lastErr = lastFallbackError as { code: string; message: string; suggestion: string } | null;
          const errorMsg = lastErr 
            ? `All AI models unavailable. Last error: ${lastErr.message}`
            : `All AI models unavailable. Please check your OpenRouter API key and try again.`;
          const suggestion = lastErr?.suggestion || 
            'Ensure your OpenRouter account has credits and privacy settings are configured.';
          yield { type: 'error', data: { 
            message: errorMsg, 
            suggestion,
            code: 'ALL_MODELS_FAILED'
          } };
          return;
        }
      }
    } else {
      // Non-retryable error (rate limit, insufficient credits) - still try fallbacks
      console.error("[Discovery Streaming] LLM API error:", parsedError.message);
      
      if (parsedError.code === 'RATE_LIMITED' || parsedError.code === 'INSUFFICIENT_CREDITS') {
        yield { type: 'error', data: { 
          message: parsedError.message, 
          suggestion: parsedError.suggestion,
          code: parsedError.code
        } };
        return;
      }
      
      // Try fallback models for other errors
      let fallbackSuccess = false;
      for (const fallbackModel of FALLBACK_MODELS) {
        if (fallbackModel === baseModel) continue;
        
        console.log(`[Discovery Streaming] Trying fallback model: ${fallbackModel}`);
        yield { type: 'status', data: { message: `Trying alternative AI model...`, progress: 20 } };
        
        const fallbackResult = await tryModelWithFallback(fallbackModel);
        if (fallbackResult) {
          response = fallbackResult.response;
          usedOnline = fallbackResult.usedOnline;
          console.log(`[Discovery Streaming] Fallback successful with ${fallbackModel}`);
          fallbackSuccess = true;
          // Track fallback usage as degradation
          degradationReasons.push(`Fallback model used: ${fallbackModel}`);
          if (discoveryStatus === 'complete') discoveryStatus = 'degraded';
          break;
        }
      }
      
      if (!fallbackSuccess) {
        yield { type: 'error', data: { 
          message: parsedError.message, 
          suggestion: parsedError.suggestion,
          code: parsedError.code
        } };
        return;
      }
    }
  }
  
  console.log(`[Discovery Streaming] API call successful, used online=${usedOnline}`);

  const content = response.choices[0]?.message?.content || "{}";
  console.log("[Discovery Streaming] LLM response received, length:", content.length);
  
  yield { type: 'status', data: { message: 'Processing results...', progress: 40 } };
  
  const data = extractJSON(content);
  if (!data) {
    console.error("[Discovery Streaming] Failed to parse LLM response as JSON");
    console.error("[Discovery Streaming] Raw content:", content.substring(0, 500));
    yield { type: 'error', data: { message: 'Failed to parse AI response' } };
    return;
  }
  
  let companiesData: any[] = [];
  if (Array.isArray(data)) {
    companiesData = data;
  } else if (data.companies && Array.isArray(data.companies)) {
    companiesData = data.companies;
  } else if (data.results && Array.isArray(data.results)) {
    companiesData = data.results;
  } else if (data.data && Array.isArray(data.data)) {
    companiesData = data.data;
  } else {
    const arrayProp = Object.values(data).find(v => Array.isArray(v));
    if (arrayProp) {
      companiesData = arrayProp as any[];
    }
  }
  
  if (companiesData.length === 0) {
    console.warn("[Discovery Streaming] No companies found in LLM response");
    yield { type: 'complete', data: { total: 0 } };
    return;
  }

  // ========== POST-LLM VALIDATION LAYER ==========
  // Runs AFTER LLM response, BEFORE storage/ranking/display
  // Does NOT generate data - only validates, strips, blocks, or degrades
  yield { type: 'status', data: { message: 'Validating results...', progress: 45 } };
  
  const postLlmValidation = validateLlmResponse(companiesData, {
    originalQuery: query,
    requestedLimit: limit
  });
  
  console.log(`[Discovery Streaming] Post-LLM validation summary:`, postLlmValidation.summary);
  
  // Use validated companies instead of raw data
  let validatedCompaniesData = postLlmValidation.companies;
  
  if (validatedCompaniesData.length === 0) {
    console.warn("[Discovery Streaming] All companies blocked by post-LLM validation");
    yield { type: 'complete', data: { total: 0, validationSummary: postLlmValidation.summary } };
    return;
  }
  // ========== END POST-LLM VALIDATION LAYER ==========
  
  // ========== CONFIDENTLY WRONG DETECTION ==========
  // Validate results against query context to detect and block confidently wrong results
  yield { type: 'status', data: { message: 'Checking for data quality issues...', progress: 50 } };
  
  const resultValidation = validateResults(validatedCompaniesData, queryValidation);
  validatedCompaniesData = resultValidation.companies;
  
  console.log(`[Discovery Streaming] Result validation: ${resultValidation.totalPassed} passed, ${resultValidation.totalBlocked} blocked, ${resultValidation.totalFlagged} flagged`);
  
  if (resultValidation.confidenceAdjustments > 0) {
    console.log(`[Discovery Streaming] Applied ${resultValidation.confidenceAdjustments} confidence adjustments based on query risk profile`);
  }
  
  if (resultValidation.totalBlocked > 0) {
    yield { 
      type: 'status', 
      data: { 
        message: `Removed ${resultValidation.totalBlocked} suspicious results to ensure data quality`,
        progress: 52,
        warning: true
      } 
    };
  }
  // ========== END CONFIDENTLY WRONG DETECTION ==========

  console.log(`[Discovery Streaming] Processing ${validatedCompaniesData.length} validated companies`);
  let processed = 0;
  
  // Reset coordinate tracking for each new search
  resetCoordinateTracking();
  
  for (const rawCompanyData of validatedCompaniesData) {
    try {
      const validatedData = validateCompanyData(rawCompanyData);
      
      // Skip null/invalid companies (including Unknown companies)
      if (!validatedData || !validatedData.name || validatedData.name === 'Unknown Company') {
        console.warn("[Discovery Streaming] Skipping company with invalid or Unknown name");
        continue;
      }
      
      // Get unique coordinates to prevent map marker overlapping
      const uniqueCoords = getUniqueCoordinates(validatedData.latitude, validatedData.longitude);
      
      // Properly handle null values for numeric fields
      // SQL NULL must be passed as actual null, not the string "null"
      const safeRevenue = validatedData.revenue !== null && validatedData.revenue !== undefined 
        ? String(validatedData.revenue) 
        : null;
      const safeEmployees = validatedData.employees !== null && validatedData.employees !== undefined
        ? validatedData.employees
        : null;
      
      // Properly handle null values for FX rate
      const safeFxRate = validatedData.revenueFxRate !== null && validatedData.revenueFxRate !== undefined
        ? String(validatedData.revenueFxRate)
        : null;
      
      const company = await storage.createCompanyFromDiscovery({
        name: validatedData.name,
        sector: validatedData.sector,
        businessType: validatedData.businessType || null,
        entityType: validatedData.entityType || null,
        isOperatingCompany: validatedData.isOperatingCompany ?? true,
        region: validatedData.region,
        country: validatedData.country,
        streetAddress: validatedData.streetAddress || null,
        latitude: String(uniqueCoords.lat),
        longitude: String(uniqueCoords.lng),
        revenue: safeRevenue,
        revenueSource: validatedData.revenueSource,
        revenueCurrency: validatedData.revenueCurrency || null,
        revenueFiscalYear: validatedData.revenueFiscalYear || null,
        revenueConvertedFromCurrency: validatedData.revenueConvertedFromCurrency || null,
        revenueFxRate: safeFxRate,
        revenueFxPolicy: validatedData.revenueFxPolicy || null,
        employees: safeEmployees,
        employeesSource: validatedData.employeesSource,
        confidence: validatedData.confidence,
        relevanceReason: validatedData.relevanceReason || null,
        color: "#1e3a8a",
        searchQueryId
      });

      const executives = [];
      for (const rawExec of validatedData.executives) {
        try {
          const validatedExec = validateExecutiveData(rawExec);
          if (!validatedExec) continue;
          
          const executive = await storage.createExecutiveFromDiscovery({
            companyId: company.id,
            name: validatedExec.name,
            title: validatedExec.title,
            email: validatedExec.email,
            linkedin: validatedExec.linkedin,
            profileUrl: validatedExec.profileUrl,
            imageUrl: validatedExec.imageUrl,
            source: validatedExec.source || 'discovery',
            confidence: validatedExec.confidence
          });
          executives.push(executive);
        } catch (execError: any) {
          console.warn("[Discovery Streaming] Failed to create executive:", execError.message);
        }
      }

      processed++;
      const progress = 40 + Math.round((processed / companiesData.length) * 55);
      
      yield { 
        type: 'company', 
        data: { 
          company: { ...company, executives },
          progress,
          current: processed,
          total: companiesData.length
        } 
      };
      
    } catch (companyError: any) {
      console.warn("[Discovery Streaming] Failed to create company:", companyError.message);
    }
  }

  // Determine final discovery status based on results
  if (processed < limit && processed > 0 && discoveryStatus === 'complete') {
    discoveryStatus = 'partial';
    degradationReasons.push(`Found ${processed} of ${limit} requested companies`);
  }
  
  console.log(`[Discovery Streaming] Complete: ${processed} companies created, status: ${discoveryStatus}`);
  yield { 
    type: 'complete', 
    data: { 
      total: processed,
      discoveryStatus,
      degradationReasons: degradationReasons.length > 0 ? degradationReasons : undefined
    } 
  };
}

export async function discoverCompaniesAndExecutives(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): Promise<any[]> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    throw new Error('Original query is required for accurate search results');
  }
  const results: any[] = [];
  
  for await (const event of discoverCompaniesStreaming(criteria, searchQueryId, selectedModel, originalQuery)) {
    if (event.type === 'company') {
      results.push(event.data.company);
    } else if (event.type === 'error') {
      // Include suggestion in error message for user-facing display
      const errorMessage = event.data.suggestion 
        ? `${event.data.message} ${event.data.suggestion}`
        : event.data.message;
      const error = new Error(errorMessage);
      (error as any).code = event.data.code;
      (error as any).suggestion = event.data.suggestion;
      throw error;
    }
  }
  
  return results;
}

export async function researchCompanyDetails(companyName: string, selectedModel: string = DEFAULT_MODEL): Promise<any> {
  console.log(`[Discovery] Researching company details for: ${companyName}`);
  
  const client = openrouter;
  const modelName = selectedModel || DEFAULT_MODEL;
  
  const messages = [
    {
      role: "system" as const,
      content: `You are a company research expert. Given a company name, find accurate details about the company including:
- Exact headquarters location (street address, city, country, GPS coordinates)
- Estimated annual revenue in USD
- Estimated employee count
- Primary industry/sector
- Business type (manufacturer, distributor, retailer, service_provider, etc.)

Return ONLY a JSON object with this structure:
{
  "name": "Official Company Name",
  "sector": "Industry Sector",
  "businessType": "distributor|retailer|manufacturer|wholesaler|service_provider",
  "region": "Geographic Region",
  "country": "Country",
  "city": "Headquarters City",
  "streetAddress": "123 Main Street",
  "latitude": 25.2048,
  "longitude": 55.2708,
  "revenue": 500000000,
  "revenueSource": "Source of revenue estimate",
  "employees": 1000,
  "employeesSource": "Source of employee count"
}`
    },
    {
      role: "user" as const,
      content: `Research and provide details for this company: "${companyName}"`
    }
  ];

  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages,
      max_tokens: 1000,
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    const data = extractJSON(content);
    
    if (data) {
      return validateCompanyData(data);
    }
    
    return null;
  } catch (error: any) {
    console.error("[Discovery] Company research error:", error.message);
    return null;
  }
}
