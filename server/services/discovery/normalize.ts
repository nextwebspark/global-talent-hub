import { parseNumber, validateCoordinates, normalizeBusinessType, getUniqueCoordinates } from "./geo";
import { validateExecutiveData } from "./validate";

// ============================================================================
// SIMPLIFIED NORMALIZATION FOR RESEARCH DATA
// ============================================================================
// This function normalizes research data WITHOUT strict validation.
// Minimal requirements: name + country. Everything else is optional.
// ============================================================================

// FX rates for currency conversion (kept simple)
export const FX_RATES_SIMPLE: Record<string, { rate: number; policy: string }> = {
  'AED': { rate: 0.2723, policy: 'Fixed peg: 1 USD = 3.6725 AED' },
  'SAR': { rate: 0.2667, policy: 'Fixed peg: 1 USD = 3.75 SAR' },
  'QAR': { rate: 0.2747, policy: 'Fixed peg: 1 USD = 3.64 QAR' },
  'BHD': { rate: 2.6526, policy: 'Fixed peg: 1 USD = 0.377 BHD' },
  'OMR': { rate: 2.5974, policy: 'Fixed peg: 1 USD = 0.385 OMR' },
  'KWD': { rate: 3.2573, policy: 'Fixed peg: 1 USD = 0.307 KWD' },
  'EUR': { rate: 1.08, policy: 'Floating rate as of 2024-01' },
  'GBP': { rate: 1.27, policy: 'Floating rate as of 2024-01' },
  'INR': { rate: 0.012, policy: 'Floating rate as of 2024-01' },
  'USD': { rate: 1.0, policy: 'Base currency' },
};

export interface NormalizedCompanyData {
  name: string;
  sector: string;
  businessType: string;
  entityType: string;
  isOperatingCompany: boolean;
  region: string;
  country: string;
  city: string | null;
  streetAddress: string | null;
  latitude: string | null;
  longitude: string | null;
  locationPrecision: string;
  revenue: string | null;
  revenueSource: string | null;
  revenueCurrency: string | null;
  revenueFiscalYear: number | null;
  revenueConvertedFromCurrency: string | null;
  revenueFxRate: string | null;
  revenueFxPolicy: string | null;
  employees: number | null;
  employeesSource: string | null;
  summary: string | null;
  website: string | null;
  confidence: number;
  relevanceReason: string;
}

export function normalizeCompanyDataSimple(data: {
  name: string;
  country: string;
  sector?: string;
  businessType?: string;
  city?: string;
  streetAddress?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: string;
  revenue?: number | null;
  revenueCurrency?: string | null;
  revenueFiscalYear?: number | null;
  revenueSource?: string | null;
  employees?: number | null;
  employeesSource?: string | null;
  summary?: string;
  website?: string;
  confidence?: number;
  relevanceReason?: string;
}): NormalizedCompanyData | null {
  // Minimal existence check: name + country required
  const name = String(data.name || '').trim();
  const country = String(data.country || '').trim();

  if (!name || name.toLowerCase() === 'unknown') {
    console.log(`[Normalize] Rejected: missing or unknown name`);
    return null;
  }

  if (!country || country.toLowerCase() === 'unknown') {
    console.log(`[Normalize] Rejected ${name}: missing country`);
    return null;
  }

  // Normalize basic fields
  const sector = String(data.sector || 'Unknown').trim();
  const businessType = normalizeBusinessType(data.businessType || '');
  const city = data.city ? String(data.city).trim() : null;
  const streetAddress = data.streetAddress ? String(data.streetAddress).trim() : null;

  // Coordinates - use provided or null, convert to strings for database storage
  let latNum = data.latitude ?? null;
  let lngNum = data.longitude ?? null;
  const locationPrecision = data.locationPrecision || (latNum && lngNum ? 'exact' : 'unknown');

  // Apply unique coordinate offsets if we have coords
  if (latNum !== null && lngNum !== null) {
    const unique = getUniqueCoordinates(latNum, lngNum);
    latNum = unique.lat;
    lngNum = unique.lng;
  }

  // Convert to strings for database storage
  const latitude: string | null = latNum !== null ? String(latNum) : null;
  const longitude: string | null = lngNum !== null ? String(lngNum) : null;

  // Revenue handling - convert to USD if currency provided
  let revenueNum = data.revenue ?? null;
  let revenueCurrency = data.revenueCurrency ? String(data.revenueCurrency).toUpperCase() : null;
  let revenueFiscalYear = data.revenueFiscalYear ?? null;
  let revenueSource = data.revenueSource ?? null;
  let revenueConvertedFromCurrency: string | null = null;
  let revenueFxRate: string | null = null;
  let revenueFxPolicy: string | null = null;

  // Convert non-USD revenue to USD
  if (revenueNum && revenueCurrency && revenueCurrency !== 'USD' && FX_RATES_SIMPLE[revenueCurrency]) {
    const fx = FX_RATES_SIMPLE[revenueCurrency];
    revenueConvertedFromCurrency = revenueCurrency;
    revenueFxRate = String(fx.rate);
    revenueFxPolicy = fx.policy;
    revenueNum = Math.round(revenueNum * fx.rate);
    revenueCurrency = 'USD';
    console.log(`[Normalize] ${name}: Converted revenue from ${revenueConvertedFromCurrency} to USD (rate: ${fx.rate})`);
  }

  // Convert revenue to string for database storage
  const revenue: string | null = revenueNum !== null ? String(revenueNum) : null;

  // Employees - just pass through
  const employees = data.employees ?? null;
  const employeesSource = data.employeesSource ?? null;

  // Other fields
  const summary = data.summary ? String(data.summary).trim() : null;
  const website = data.website ? String(data.website).trim() : null;
  const confidence = Math.min(10, Math.max(1, data.confidence ?? 5));
  const relevanceReason = data.relevanceReason || 'Found via research';

  // Detect entity type (simplified)
  let entityType = 'operating_company';
  let isOperatingCompany = true;

  const GOVT_PATTERNS = [/\bauthority\b/i, /\bministry\b/i, /\bregulator\b/i, /\bdepartment of\b/i];
  const CORPORATISED = ['DEWA', 'ADNOC', 'TAQA', 'Masdar', 'Mubadala', 'TRANSCO', 'ADDC', 'ENOC'];

  const isGovt = GOVT_PATTERNS.some(p => p.test(name));
  const isCorp = CORPORATISED.some(e => name.toLowerCase().includes(e.toLowerCase()));

  if (isGovt && !isCorp) {
    entityType = 'government_authority';
    isOperatingCompany = false;
  } else if (isCorp) {
    entityType = 'corporatised_entity';
  }

  console.log(`[Normalize] ${name}: sector=${sector}, revenue=${revenueNum ? `${revenueCurrency} ${revenueNum}` : 'null'}, employees=${employees}`);

  return {
    name,
    sector,
    businessType,
    entityType,
    isOperatingCompany,
    region: 'Unknown',
    country,
    city,
    streetAddress,
    latitude,
    longitude,
    locationPrecision,
    revenue,
    revenueSource,
    revenueCurrency,
    revenueFiscalYear,
    revenueConvertedFromCurrency,
    revenueFxRate,
    revenueFxPolicy,
    employees,
    employeesSource,
    summary,
    website,
    confidence,
    relevanceReason,
  };
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

  // Extract summary/description and website
  const summary = String(data.summary || data.description || '').trim() || null;
  const website = String(data.website || data.url || '').trim() || null;

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
    summary,
    website,
    confidence,
    relevanceReason,
    executives
  };
}
