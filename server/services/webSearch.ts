import type { InsertSearchResult } from "@shared/schema";

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  rawContent?: string;
  domain: string;
  rank: number;
  provider: string;
}

export interface TavilySearchResponse {
  results: WebSearchResult[];
  answer?: string;
  rawContents?: string[];
}

export interface SourceTierClassification {
  tier: number;
  reason: string;
  documentType: string;
}

const TIER_1_DOMAINS = [
  'sec.gov',
  'investor.', 
  'investors.',
  'annualreport',
  'annual-report',
  'ir.',
  'dfm.ae',
  'adx.ae',
  'tadawul.com.sa',
  'qe.com.qa',
  'bsebahrain.com',
  'msm.gov.om',
  'boursakuwait.com.kw',
  'londonstockexchange.com',
  'nyse.com',
  'nasdaq.com',
];

const TIER_1_PATTERNS = [
  /annual.?report/i,
  /10-?k/i,
  /20-?f/i,
  /investor.?relation/i,
  /financial.?statement/i,
  /audited.?financ/i,
  /integrated.?report/i,
];

const TIER_2_DOMAINS = [
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'forbes.com',
  'zawya.com',
  'gulfbusiness.com',
  'arabianbusiness.com',
  'thenationalnews.com',
  'khaleejtimes.com',
  'arabnews.com',
  'argaam.com',
  'mubasher.info',
  'crunchbase.com',
  'pitchbook.com',
  'spglobal.com',
  'moodys.com',
  'fitchratings.com',
];

const TIER_2_PATTERNS = [
  /press.?release/i,
  /news.?release/i,
  /earnings.?call/i,
  /quarterly.?report/i,
  /q[1-4].?20\d{2}/i,
];

export function classifySourceTier(url: string, title: string, snippet: string): SourceTierClassification {
  const domain = extractDomain(url).toLowerCase();
  const fullText = `${url} ${title} ${snippet}`.toLowerCase();
  
  for (const tier1Domain of TIER_1_DOMAINS) {
    if (domain.includes(tier1Domain)) {
      return {
        tier: 1,
        reason: `Official filings domain: ${tier1Domain}`,
        documentType: 'regulatory_filing',
      };
    }
  }
  
  for (const pattern of TIER_1_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        tier: 1,
        reason: `Document pattern match: ${pattern.source}`,
        documentType: 'annual_report',
      };
    }
  }
  
  for (const tier2Domain of TIER_2_DOMAINS) {
    if (domain.includes(tier2Domain)) {
      return {
        tier: 2,
        reason: `Reputable business source: ${tier2Domain}`,
        documentType: 'news_article',
      };
    }
  }
  
  for (const pattern of TIER_2_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        tier: 2,
        reason: `Business document pattern: ${pattern.source}`,
        documentType: 'press_release',
      };
    }
  }
  
  return {
    tier: 3,
    reason: 'General web source - name discovery only',
    documentType: 'web_page',
  };
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.split('/')[2] || url;
  }
}

export interface SearchProvider {
  name: string;
  search(query: string, numResults?: number): Promise<WebSearchResult[]>;
  searchWithAnswer(query: string, numResults?: number): Promise<TavilySearchResponse>;
}

export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async search(query: string, numResults = 10): Promise<WebSearchResult[]> {
    const result = await this.searchWithAnswer(query, numResults);
    return result.results;
  }
  
  async searchWithAnswer(query: string, numResults = 15): Promise<{ 
    results: WebSearchResult[]; 
    answer?: string;
    rawContents?: string[];
  }> {
    const endpoint = 'https://api.tavily.com/search';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: query,
        max_results: numResults,
        search_depth: 'advanced',
        include_answer: 'advanced',
        include_raw_content: 'markdown',
        include_domains: [],
        exclude_domains: [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[WebSearch] Tavily API error:', error);
      throw new Error(`Tavily API error: ${response.status}`);
    }
    
    const data = await response.json();
    const results = data.results || [];
    
    console.log(`[WebSearch] Tavily returned ${results.length} results, answer: ${data.answer ? 'yes' : 'no'}`);
    
    return {
      results: results.map((item: any, index: number) => ({
        url: item.url,
        title: item.title,
        snippet: item.content || '',
        rawContent: item.raw_content || '',
        domain: extractDomain(item.url),
        rank: index + 1,
        provider: this.name,
      })),
      answer: data.answer,
      rawContents: results.map((item: any) => item.raw_content).filter(Boolean),
    };
  }
}

// Tavily Research API - replaces LLM extraction layer
export interface TavilyResearchCompany {
  name: string;
  sector?: string | null;
  businessType?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  city?: string | null;
  streetAddress?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  revenue?: string | number | null;
  revenueCurrency?: string | null;
  revenueFiscalYear?: number | null;
  revenueSource?: string | null;
  employees?: number | string | null;
  employeesSource?: string | null;
  confidence?: number;
  relevanceReason?: string;
  executives?: TavilyResearchExecutive[];
}

export interface TavilyResearchExecutive {
  name: string;
  title: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  source?: string | null;
}

export interface TavilyResearchResult {
  companies: TavilyResearchCompany[];
  sources: string[];
  responseTime?: number;
  rawMarkdown?: string;
}

// Revenue parsing utility - handles formats like "SAR 75.3bn 2023", "$15.2B", "AED 28.4 billion"
export function parseRevenueString(revenueStr: string | null | undefined): {
  value: number | null;
  currency: string | null;
  fiscalYear: number | null;
  original: string | null;
} {
  if (!revenueStr || typeof revenueStr !== 'string') {
    return { value: null, currency: null, fiscalYear: null, original: null };
  }
  
  const original = revenueStr.trim();
  
  // Currency patterns - common 3-letter codes and symbols
  const currencyPatterns: { pattern: RegExp; code: string }[] = [
    { pattern: /\bUSD\b|\$|US\$/i, code: 'USD' },
    { pattern: /\bSAR\b/i, code: 'SAR' },
    { pattern: /\bAED\b/i, code: 'AED' },
    { pattern: /\bEUR\b|€/i, code: 'EUR' },
    { pattern: /\bGBP\b|£/i, code: 'GBP' },
    { pattern: /\bQAR\b/i, code: 'QAR' },
    { pattern: /\bOMR\b/i, code: 'OMR' },
    { pattern: /\bKWD\b/i, code: 'KWD' },
    { pattern: /\bBHD\b/i, code: 'BHD' },
    { pattern: /\bINR\b|₹/i, code: 'INR' },
    { pattern: /\bCHF\b/i, code: 'CHF' },
    { pattern: /\bJPY\b|¥/i, code: 'JPY' },
    { pattern: /\bCNY\b|RMB/i, code: 'CNY' },
  ];
  
  let currency: string | null = null;
  for (const { pattern, code } of currencyPatterns) {
    if (pattern.test(original)) {
      currency = code;
      break;
    }
  }
  
  // Extract year (4 digits, typically 2020-2030 range)
  const yearMatch = original.match(/\b(20[1-3]\d)\b/);
  const fiscalYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  
  // Extract numeric value with multiplier
  let value: number | null = null;
  
  // Match patterns like "75.3bn", "15.2 billion", "$28.4B", "1,500,000,000"
  const valuePatterns = [
    // "75.3bn", "15.2B", "28.4 billion"
    /(\d+(?:[.,]\d+)?)\s*(?:bn|billion|b)\b/i,
    // "500mn", "750M", "800 million"
    /(\d+(?:[.,]\d+)?)\s*(?:mn|million|m)\b/i,
    // "1.5tn", "1.2 trillion"
    /(\d+(?:[.,]\d+)?)\s*(?:tn|trillion|t)\b/i,
    // "150k", "200 thousand"
    /(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/i,
    // Raw number with commas: "1,500,000,000"
    /(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/,
    // Simple decimal: "15200000000"
    /(\d+(?:\.\d+)?)/,
  ];
  
  const multipliers: { [key: string]: number } = {
    'bn': 1e9, 'billion': 1e9, 'b': 1e9,
    'mn': 1e6, 'million': 1e6, 'm': 1e6,
    'tn': 1e12, 'trillion': 1e12, 't': 1e12,
    'k': 1e3, 'thousand': 1e3,
  };
  
  for (const pattern of valuePatterns) {
    const match = original.match(pattern);
    if (match) {
      // Clean the number (remove commas, handle European decimals)
      let numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      
      if (!isNaN(num)) {
        // Check for multiplier suffix
        const multiplierMatch = original.toLowerCase().match(/(billion|million|trillion|thousand|bn|mn|tn|b|m|t|k)/);
        if (multiplierMatch) {
          const mult = multipliers[multiplierMatch[1].toLowerCase()] || 1;
          value = num * mult;
        } else {
          value = num;
        }
        break;
      }
    }
  }
  
  return { value, currency, fiscalYear, original };
}

// Coordinate validation - checks if coordinates are valid (not near-zero, within bounds)
export function isValidCoordinate(lat: number | string | null | undefined, lng: number | string | null | undefined): boolean {
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
  
  if (latNum === null || latNum === undefined || lngNum === null || lngNum === undefined) return false;
  if (isNaN(latNum) || isNaN(lngNum)) return false;
  
  // Check if near-zero (likely invalid)
  if (Math.abs(latNum) < 1 && Math.abs(lngNum) < 1) return false;
  
  // Check valid ranges
  if (latNum < -90 || latNum > 90) return false;
  if (lngNum < -180 || lngNum > 180) return false;
  
  return true;
}

// Parse coordinate that might be string or number
export function parseCoordinate(coord: number | string | null | undefined): number | null {
  if (coord === null || coord === undefined) return null;
  const num = typeof coord === 'string' ? parseFloat(coord) : coord;
  return isNaN(num) ? null : num;
}

// Parse employee count that might have commas or text like "10,000+" or "~5000"
export function parseEmployeeCount(employees: number | string | null | undefined): number | null {
  if (employees === null || employees === undefined) return null;
  if (typeof employees === 'number') return Math.round(employees);
  
  const str = String(employees).replace(/[,\s+~]/g, '');
  const num = parseInt(str, 10);
  return isNaN(num) ? null : num;
}

// The output schema for Tavily Research API - must match JSON Schema format
// Uses detailed 1-3 sentence descriptions per field as recommended by Tavily best practices
const COMPANY_RESEARCH_SCHEMA = {
  properties: {
    companies: {
      type: "array",
      description: "List of companies matching the search query. Only include companies that are HEADQUARTERED in the specified region/country. Do not include companies that merely do business in the region but are headquartered elsewhere.",
      items: {
        type: "object",
        properties: {
          name: { 
            type: "string", 
            description: "The exact legal or trading name of the company as it appears in official filings or their website. Do not abbreviate or modify the name." 
          },
          sector: { 
            type: "string", 
            description: "The primary industry sector this company operates in, such as Banking, Technology, Healthcare, Energy, Real Estate, or Manufacturing. Use standard industry classification terms." 
          },
          businessType: { 
            type: "string", 
            description: "The type of business entity. Must be one of: bank, corporation, distributor, manufacturer, service_provider, holding_company, or government_entity." 
          },
          description: { 
            type: "string", 
            description: "A 2-4 sentence description explaining what the company does, its main products or services, target markets, and competitive position. Include any notable achievements or market leadership." 
          },
          website: { 
            type: "string", 
            description: "The company's official website URL including https://. Find this from the company's official sources, not third-party directories." 
          },
          country: { 
            type: "string", 
            description: "The country where the company's headquarters is physically located. This is where the company is legally domiciled, not where they have operations. Use full country name (e.g., 'United Arab Emirates' not 'UAE')." 
          },
          city: { 
            type: "string", 
            description: "The city where the company's headquarters is located. Use the proper city name (e.g., 'Abu Dhabi', 'Riyadh', 'Dubai')." 
          },
          streetAddress: { 
            type: "string", 
            description: "The full street address of the headquarters if publicly available, including building name, street, and area. Leave empty if not found." 
          },
          latitude: { 
            type: "number", 
            description: "The GPS latitude coordinate of the headquarters location in decimal degrees (e.g., 24.4539 for Abu Dhabi). Find the actual coordinates for the headquarters building if possible." 
          },
          longitude: { 
            type: "number", 
            description: "The GPS longitude coordinate of the headquarters location in decimal degrees (e.g., 54.3773 for Abu Dhabi). Find the actual coordinates for the headquarters building if possible." 
          },
          revenue: { 
            type: "string", 
            description: "The company's annual revenue as a formatted string including currency symbol/code, amount, and fiscal year. Examples: 'SAR 75.3bn 2023', 'AED 28.4 billion FY2024', 'USD 15.2B 2023'. Only include revenue figures from authoritative sources like annual reports, SEC filings, or official company announcements. If revenue is not publicly available, leave empty." 
          },
          revenueCurrency: { 
            type: "string", 
            description: "The 3-letter ISO currency code for the revenue figure (e.g., USD, SAR, AED, EUR, GBP, QAR, OMR, KWD, BHD). Use the currency as reported in the source document, typically the company's local currency." 
          },
          revenueFiscalYear: { 
            type: "integer", 
            description: "The fiscal year the revenue figure corresponds to as a 4-digit year (e.g., 2023, 2024). Use the most recent available year." 
          },
          revenueSource: { 
            type: "string", 
            description: "The specific source document where the revenue figure was found. Examples: 'Annual Report 2023', 'Q4 2024 Earnings Release', 'Company Website Investor Relations', 'Bloomberg', 'Reuters'. Be specific about the source." 
          },
          employees: { 
            type: "integer", 
            description: "The total number of employees working at the company globally. Use the most recent figure available from official sources. Return as a whole number without commas." 
          },
          employeesSource: { 
            type: "string", 
            description: "The source where the employee count was found, such as 'LinkedIn', 'Annual Report 2023', 'Company Website', or 'Forbes'." 
          },
          confidence: { 
            type: "integer", 
            description: "A data quality confidence score from 1-10 indicating how reliable the information is. 9-10: Data from official annual reports or regulatory filings. 7-8: Data from reputable business news (Bloomberg, Reuters, Forbes). 5-6: Data from company website or LinkedIn. 1-4: Data from less reliable sources or estimates." 
          },
          relevanceReason: { 
            type: "string", 
            description: "A 1-2 sentence explanation of why this company matches the search query and why it was included in the results. Reference the specific search criteria." 
          },
          executives: {
            type: "array",
            description: "Key executives and leadership team members at this company. Include the CEO, CFO, COO, other C-suite executives, Managing Directors, and Board Chairman. For each executive, search for their information on the company website, LinkedIn, press releases, and news articles. Aim to find at least 3-5 executives per company.",
            items: {
              type: "object",
              properties: {
                name: { 
                  type: "string", 
                  description: "The executive's full name as it appears on official company sources or LinkedIn. Include first name and last name. Do not include titles or honorifics." 
                },
                title: { 
                  type: "string", 
                  description: "The executive's current job title exactly as listed on the company website or LinkedIn. Examples: 'Chief Executive Officer', 'Group CFO', 'Managing Director', 'Chairman of the Board', 'Chief Operating Officer'." 
                },
                email: { 
                  type: "string", 
                  description: "The executive's professional email address if publicly listed on the company website or official sources. Leave empty if not publicly available." 
                },
                phone: { 
                  type: "string", 
                  description: "The executive's professional phone number if publicly listed on the company website or official sources. Leave empty if not publicly available." 
                },
                linkedin: { 
                  type: "string", 
                  description: "The full LinkedIn profile URL for this executive (e.g., 'https://www.linkedin.com/in/johnsmith'). Search LinkedIn to find their profile. Leave empty if not found." 
                },
                source: { 
                  type: "string", 
                  description: "The source where this executive's information was found. Examples: 'Company Website Leadership Page', 'LinkedIn', 'Annual Report 2023', 'Press Release January 2024'." 
                }
              }
            }
          }
        }
      }
    }
  },
  required: ["companies"]
};

// Region and country mappings for filtering
const REGION_COUNTRIES: Record<string, string[]> = {
  'middle east': [
    'United Arab Emirates', 'UAE', 'Saudi Arabia', 'KSA', 'Qatar', 'Kuwait', 
    'Bahrain', 'Oman', 'Jordan', 'Lebanon', 'Iraq', 'Iran', 'Yemen', 'Syria'
  ],
  'gcc': [
    'United Arab Emirates', 'UAE', 'Saudi Arabia', 'KSA', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'
  ],
  'gulf': [
    'United Arab Emirates', 'UAE', 'Saudi Arabia', 'KSA', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'
  ],
  'mena': [
    'United Arab Emirates', 'UAE', 'Saudi Arabia', 'KSA', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
    'Jordan', 'Lebanon', 'Iraq', 'Iran', 'Yemen', 'Syria', 'Egypt', 'Libya', 'Tunisia', 
    'Algeria', 'Morocco', 'Sudan'
  ],
  'europe': [
    'United Kingdom', 'UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 
    'Switzerland', 'Belgium', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 
    'Ireland', 'Portugal', 'Poland', 'Czech Republic', 'Greece'
  ],
  'asia': [
    'China', 'Japan', 'South Korea', 'India', 'Singapore', 'Hong Kong', 'Taiwan', 
    'Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines'
  ],
  'north america': [
    'United States', 'USA', 'US', 'Canada', 'Mexico'
  ],
  'africa': [
    'South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco', 'Ghana', 'Ethiopia'
  ],
};

// Single country aliases
const COUNTRY_ALIASES: Record<string, string> = {
  'uae': 'United Arab Emirates',
  'ksa': 'Saudi Arabia', 
  'uk': 'United Kingdom',
  'usa': 'United States',
  'us': 'United States',
};

/**
 * Detect region or specific countries mentioned in query
 * Returns list of valid country names for filtering
 */
function detectQueryRegion(query: string): { 
  countries: string[]; 
  regionName: string | null;
  constraintText: string;
} {
  const lowerQuery = query.toLowerCase();
  
  // Check for region mentions first
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    if (lowerQuery.includes(region)) {
      // Normalize country names (remove aliases)
      const normalizedCountries = countries.filter(c => !COUNTRY_ALIASES[c.toLowerCase()]);
      return {
        countries: normalizedCountries,
        regionName: region.toUpperCase(),
        constraintText: `IMPORTANT: Only include companies that are HEADQUARTERED in the ${region.toUpperCase()} region. Valid countries: ${normalizedCountries.join(', ')}. Do NOT include companies headquartered in China, USA, India, Europe, or other regions even if they do business in the ${region.toUpperCase()}.`
      };
    }
  }
  
  // Check for specific country mentions
  const countryPatterns = [
    { pattern: /\b(united arab emirates|uae|dubai|abu dhabi)\b/i, country: 'United Arab Emirates' },
    { pattern: /\b(saudi arabia|ksa|riyadh|jeddah)\b/i, country: 'Saudi Arabia' },
    { pattern: /\b(qatar|doha)\b/i, country: 'Qatar' },
    { pattern: /\b(kuwait)\b/i, country: 'Kuwait' },
    { pattern: /\b(bahrain|manama)\b/i, country: 'Bahrain' },
    { pattern: /\b(oman|muscat)\b/i, country: 'Oman' },
    { pattern: /\b(jordan|amman)\b/i, country: 'Jordan' },
    { pattern: /\b(egypt|cairo)\b/i, country: 'Egypt' },
    { pattern: /\b(united kingdom|uk|london|britain)\b/i, country: 'United Kingdom' },
    { pattern: /\b(united states|usa|us|america)\b/i, country: 'United States' },
    { pattern: /\b(germany|berlin|frankfurt)\b/i, country: 'Germany' },
    { pattern: /\b(france|paris)\b/i, country: 'France' },
    { pattern: /\b(india|mumbai|delhi|bangalore)\b/i, country: 'India' },
    { pattern: /\b(china|beijing|shanghai)\b/i, country: 'China' },
    { pattern: /\b(japan|tokyo)\b/i, country: 'Japan' },
    { pattern: /\b(singapore)\b/i, country: 'Singapore' },
  ];
  
  const foundCountries: string[] = [];
  for (const { pattern, country } of countryPatterns) {
    if (pattern.test(query)) {
      foundCountries.push(country);
    }
  }
  
  if (foundCountries.length > 0) {
    return {
      countries: foundCountries,
      regionName: null,
      constraintText: `IMPORTANT: Only include companies that are HEADQUARTERED in ${foundCountries.join(' or ')}. Do NOT include companies that merely do business there but are headquartered elsewhere.`
    };
  }
  
  // No region or country detected
  return {
    countries: [],
    regionName: null,
    constraintText: ''
  };
}

/**
 * Filter companies to only those headquartered in the target countries
 */
export function filterCompaniesByRegion(
  companies: any[], 
  targetCountries: string[]
): { filtered: any[]; excluded: string[] } {
  if (targetCountries.length === 0) {
    return { filtered: companies, excluded: [] };
  }
  
  const normalizedTargets = targetCountries.map(c => c.toLowerCase());
  const excluded: string[] = [];
  
  const filtered = companies.filter(company => {
    const companyCountry = (company.country || '').toLowerCase();
    
    // Check if company country matches any target country (including aliases)
    const isMatch = normalizedTargets.some(target => {
      if (companyCountry.includes(target) || target.includes(companyCountry)) return true;
      // Check aliases
      const alias = COUNTRY_ALIASES[companyCountry];
      if (alias && normalizedTargets.includes(alias.toLowerCase())) return true;
      return false;
    });
    
    if (!isMatch) {
      excluded.push(`${company.name} (${company.country})`);
    }
    
    return isMatch;
  });
  
  return { filtered, excluded };
}

export class TavilyResearchService {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Detect if the query is asking for specific executive roles
   * Returns info about whether to filter executives and how
   */
  public detectExecutiveRole(query: string): { 
    specificRole: string | null; 
    roleDescription: string; 
    allInFunction: boolean 
  } {
    const lowerQuery = query.toLowerCase();
    
    // Only apply role filtering if the query clearly indicates executive search intent
    // This covers various patterns:
    // - "CEOs of top 5 banks" (role before)
    // - "top 5 banks CFOs" (role after)
    // - "banks' CEOs" (possessive)
    // - "top banks CEO list" (role as part of noun phrase)
    const executiveIntentPatterns = [
      // Role at start: "CEOs of top 5 banks", "CFO at top companies"
      /^(ceo|cfo|coo|cto|cmo|cio|chro|clo|chairman|managing director|general counsel)s?\s+(of|at|from)/i,
      // Role with "of": "the CEOs of major banks"
      /\b(ceo|cfo|coo|cto|cmo|cio|chro|clo|chairman|managing director|general counsel)s?\s+of\s+/i,
      // Role at end: "top 5 banks CFOs", "leading companies CEOs"
      /\b(companies|banks|firms|hotels|corporations|organizations)\s+(ceo|cfo|coo|cto|cmo|cio|chro|clo|chairman|managing director)s?\b/i,
      // Possessive: "banks' CFOs", "companies' CEOs"
      /\b(companies|banks|firms)'?\s*(ceo|cfo|coo|cto|cmo|cio|chro|clo|chairman|managing director)s?\b/i,
      // Generic patterns with role terms
      /\b(find|list|show|get)\s+(the\s+)?(ceo|cfo|coo|cto|cmo|cio|chro)s?\b/i,
      // Senior/chief patterns
      /\b(senior|chief|head|lead)\s+(finance|hr|technology|marketing|operations|sales)\s+(leader|executive|officer)/i,
      // Function leaders at/of
      /\bfinance\s+(leader|team|executive)s?\s+(at|of|from)/i,
      /\b(hr|human resource|people)\s+(leader|team|executive)s?\s+(at|of|from)/i,
    ];
    
    const hasExecutiveIntent = executiveIntentPatterns.some(p => p.test(query));
    
    if (!hasExecutiveIntent) {
      // No clear executive search intent - return all executives by default
      return { specificRole: null, roleDescription: 'all key executives', allInFunction: false };
    }
    
    // Single specific role patterns - return just this role
    const singleRolePatterns: Array<{ pattern: RegExp; role: string; description: string }> = [
      { pattern: /\bceos?\b|chief executive officer/i, role: 'CEO', description: 'Chief Executive Officer (CEO)' },
      { pattern: /\bcfos?\b|chief financial officer/i, role: 'CFO', description: 'Chief Financial Officer (CFO)' },
      { pattern: /\bcoos?\b|chief operating officer/i, role: 'COO', description: 'Chief Operating Officer (COO)' },
      { pattern: /\bctos?\b|chief technology officer/i, role: 'CTO', description: 'Chief Technology Officer (CTO)' },
      { pattern: /\bcmos?\b|chief marketing officer/i, role: 'CMO', description: 'Chief Marketing Officer (CMO)' },
      { pattern: /\bchros?\b|chief (human resources|hr|people) officer/i, role: 'CHRO', description: 'Chief HR Officer (CHRO)' },
      { pattern: /\bcios?\b|chief information officer/i, role: 'CIO', description: 'Chief Information Officer (CIO)' },
      { pattern: /\bgeneral counsel|chief legal officer|clos?\b/i, role: 'CLO', description: 'General Counsel / Chief Legal Officer' },
      { pattern: /\bmanaging directors?\b/i, role: 'MD', description: 'Managing Director' },
      { pattern: /\bchairm(a|e)n\b|\bchair\b/i, role: 'Chairman', description: 'Chairman' },
    ];
    
    // Function-wide patterns - return all people in this function
    const functionPatterns: Array<{ pattern: RegExp; role: string; description: string }> = [
      { pattern: /\b(senior\s+)?finance\s+(leader|team|executive)/i, role: 'finance', description: 'finance' },
      { pattern: /\b(hr|human resource|people)\s+(leader|team|executive)/i, role: 'hr', description: 'HR/People' },
      { pattern: /\b(technology|tech|it)\s+(leader|team|executive)/i, role: 'technology', description: 'technology/IT' },
      { pattern: /\bmarketing\s+(leader|team|executive)/i, role: 'marketing', description: 'marketing' },
      { pattern: /\boperations\s+(leader|team|executive)/i, role: 'operations', description: 'operations' },
      { pattern: /\bsales\s+(leader|team|executive)/i, role: 'sales', description: 'sales' },
    ];
    
    // Check for single role first
    for (const { pattern, role, description } of singleRolePatterns) {
      if (pattern.test(lowerQuery)) {
        return { specificRole: role, roleDescription: description, allInFunction: false };
      }
    }
    
    // Check for function-wide patterns
    for (const { pattern, role, description } of functionPatterns) {
      if (pattern.test(lowerQuery)) {
        return { specificRole: role, roleDescription: description, allInFunction: true };
      }
    }
    
    // Has executive intent but no specific role matched - return all executives
    return { specificRole: null, roleDescription: 'all key executives', allInFunction: false };
  }
  
  /**
   * Check if an executive title matches a specific role filter
   */
  public matchesRoleFilter(execTitle: string, roleFilter: { specificRole: string | null; allInFunction: boolean }): boolean {
    if (!roleFilter.specificRole) {
      return true; // No filter, include all
    }
    
    const title = execTitle.toLowerCase();
    const role = roleFilter.specificRole.toLowerCase();
    
    // Specific role matching
    const roleMatchers: Record<string, (t: string) => boolean> = {
      'ceo': (t) => /\b(ceo|chief executive officer|managing director|president)\b/.test(t),
      'cfo': (t) => /\b(cfo|chief financial officer|finance director)\b/.test(t),
      'coo': (t) => /\b(coo|chief operating officer|operations director)\b/.test(t),
      'cto': (t) => /\b(cto|chief technology officer|tech director)\b/.test(t),
      'cmo': (t) => /\b(cmo|chief marketing officer|marketing director)\b/.test(t),
      'chro': (t) => /\b(chro|chief (human resources|hr|people) officer|hr director|people director)\b/.test(t),
      'cio': (t) => /\b(cio|chief information officer|it director|chief investment officer)\b/.test(t),
      'clo': (t) => /\b(clo|chief legal officer|general counsel|legal director)\b/.test(t),
      'md': (t) => /\bmanaging director\b/.test(t),
      'chairman': (t) => /\b(chairman|chairwoman|chair)\b/.test(t),
      // Function-based matching (allInFunction = true)
      'finance': (t) => /\b(finance|financial|treasury|controller|accounting)\b/.test(t),
      'hr': (t) => /\b(hr|human resource|people|talent|recruitment)\b/.test(t),
      'technology': (t) => /\b(technology|tech|it|information|digital|engineering)\b/.test(t),
      'marketing': (t) => /\b(marketing|brand|communications|pr|public relations)\b/.test(t),
      'operations': (t) => /\b(operations|operational|supply chain|logistics)\b/.test(t),
      'sales': (t) => /\b(sales|commercial|business development|revenue)\b/.test(t),
    };
    
    const matcher = roleMatchers[role];
    if (matcher) {
      return matcher(title);
    }
    
    // Fallback: check if role is contained in title
    return title.includes(role);
  }
  
  /**
   * Parse markdown content from Tavily Research into structured company data.
   * Handles markdown tables in the format:
   * | # | Company | Revenue | Employees | Executives |
   */
  private parseMarkdownToCompanies(markdown: string): TavilyResearchCompany[] {
    const companies: TavilyResearchCompany[] = [];
    
    console.log(`[TavilyResearch] Parsing markdown, length: ${markdown.length}`);
    
    // Find markdown tables - they start with | and have header separator |---|
    const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n((?:\|[^\n]+\|\n?)+)/g;
    const tableMatches = markdown.match(tableRegex);
    
    if (!tableMatches || tableMatches.length === 0) {
      console.log('[TavilyResearch] No markdown tables found, trying to parse sections');
      // Try parsing from sections/headers instead
      return this.parseMarkdownSections(markdown);
    }
    
    console.log(`[TavilyResearch] Found ${tableMatches.length} tables`);
    
    for (const table of tableMatches) {
      const lines = table.trim().split('\n');
      if (lines.length < 3) continue; // Need header, separator, and at least one row
      
      // Parse header to understand column positions
      const headerCells = lines[0].split('|').map(c => c.trim().toLowerCase()).filter(c => c);
      const colMap: Record<string, number> = {};
      headerCells.forEach((cell, idx) => {
        if (cell.includes('#') || cell.includes('no') || cell === 'rank') colMap['rank'] = idx;
        else if (cell.includes('company') || cell.includes('name')) colMap['company'] = idx;
        else if (cell.includes('revenue')) colMap['revenue'] = idx;
        else if (cell.includes('employee')) colMap['employees'] = idx;
        else if (cell.includes('executive') || cell.includes('leadership') || cell.includes('ceo') || cell.includes('management')) colMap['executives'] = idx;
        else if (cell.includes('country')) colMap['country'] = idx;
      });
      
      console.log(`[TavilyResearch] Table columns: ${JSON.stringify(colMap)}`);
      
      // Parse data rows (skip header and separator)
      for (let i = 2; i < lines.length; i++) {
        const row = lines[i];
        if (!row.trim() || row.trim() === '|') continue;
        
        const cells = row.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length < 2) continue;
        
        // Extract company name and country
        let companyName = '';
        let country = '';
        const companyCell = cells[colMap['company'] ?? 1] || cells[1] || '';
        
        // Parse company name - might be "**Company Name** - Country" or just "Company Name"
        const companyMatch = companyCell.match(/\*\*([^*]+)\*\*/);
        if (companyMatch) {
          companyName = companyMatch[1].trim();
          // Extract country from format "Company - Country" or "(Country)"
          const countryMatch = companyCell.match(/[-–]\s*([A-Za-z\s]+)$/) || 
                               companyCell.match(/\(([A-Za-z\s]+)\)/);
          if (countryMatch) {
            country = countryMatch[1].trim();
          }
        } else {
          companyName = companyCell.replace(/\*\*/g, '').trim();
          const countryMatch = companyCell.match(/[-–]\s*([A-Za-z\s]+)$/) || 
                               companyCell.match(/\(([A-Za-z\s]+)\)/);
          if (countryMatch) {
            country = countryMatch[1].trim();
            companyName = companyName.replace(/[-–]\s*[A-Za-z\s]+$/, '').trim();
          }
        }
        
        if (!companyName || companyName.length < 2) continue;
        
        // Use explicit country column if available
        if (colMap['country'] !== undefined && cells[colMap['country']]) {
          country = cells[colMap['country']].replace(/\*\*/g, '').trim();
        }
        
        // Extract revenue
        let revenue: string | undefined;
        let revenueValue: number | undefined;
        let revenueCurrency: string | undefined;
        let revenueFiscalYear: number | undefined;
        
        if (colMap['revenue'] !== undefined && cells[colMap['revenue']]) {
          const revenueCell = cells[colMap['revenue']];
          if (revenueCell && !revenueCell.includes('-') && revenueCell.toLowerCase() !== 'unknown') {
            revenue = revenueCell.replace(/\*\*/g, '').replace(/【[^】]*】/g, '').trim();
            
            // Parse revenue value from strings like "US $139.95 M" or "SAR 217.9 M (2026)"
            const parsed = parseRevenueString(revenue);
            if (parsed.value) {
              revenueValue = parsed.value;
              revenueCurrency = parsed.currency || undefined;
              revenueFiscalYear = parsed.fiscalYear || undefined;
            }
          }
        }
        
        // Extract employees
        let employees: number | undefined;
        if (colMap['employees'] !== undefined && cells[colMap['employees']]) {
          const empCell = cells[colMap['employees']].replace(/【[^】]*】/g, '').replace(/\*\*/g, '').trim();
          const empMatch = empCell.match(/(\d[\d,]*)/);
          if (empMatch) {
            employees = parseInt(empMatch[1].replace(/,/g, ''), 10);
          }
        }
        
        // Extract executives - handle various formats
        const executives: TavilyResearchExecutive[] = [];
        if (colMap['executives'] !== undefined && cells[colMap['executives']]) {
          const execCell = cells[colMap['executives']];
          // Parse executives - formats: "Name - Title <br> Name2 - Title2", bullet points, or newline separated
          const execParts = execCell.split(/<br\s*\/?>|•|[\n\r]+|(?:,\s*(?=[A-Z][a-z]))/).filter(p => p.trim());
          
          for (const part of execParts) {
            // Clean up the part first
            const cleanPart = part.replace(/\*\*/g, '').replace(/【[^】]*】/g, '').replace(/\[\d+\]/g, '').trim();
            if (!cleanPart || cleanPart.length < 5) continue;
            
            // Match patterns:
            // "John Smith - CEO" or "John Smith, CEO" or "John Smith – CFO"
            // Also handle: "Sunny Leonkutty - Chief Executive Officer"
            const execMatch = cleanPart.match(/^([A-Za-z\s.'''-]+?)\s*[-–,]\s*(.+)$/);
            if (execMatch) {
              const name = execMatch[1].trim();
              const title = execMatch[2].replace(/\s*<br.*$/i, '').trim();
              // Validate name looks like a person name (at least 2 words or has vowels)
              if (name && name.length > 2 && title && title.length > 2 && 
                  (/[aeiouAEIOU]/.test(name)) && 
                  !title.toLowerCase().includes('unknown')) {
                executives.push({ name, title, source: 'Tavily Research' });
              }
            }
          }
        }
        
        console.log(`[TavilyResearch] Executives parsed for ${companyName}: ${executives.map(e => `${e.name} (${e.title})`).join(', ') || 'none'}`);
        
        console.log(`[TavilyResearch] Parsed company: ${companyName}, country: ${country}, revenue: ${revenue}, employees: ${employees}, executives: ${executives.length}`);
        
        // Use parsed numeric revenue if available, otherwise keep raw string
        // This ensures downstream normalization can handle the value
        companies.push({
          name: companyName,
          country: country || 'Unknown',
          sector: undefined,
          businessType: undefined,
          description: undefined,
          website: undefined,
          city: undefined,
          streetAddress: undefined,
          latitude: undefined,
          longitude: undefined,
          // Store numeric value if parsed, or raw string for downstream parsing
          revenue: revenueValue ?? revenue,
          revenueCurrency: revenueCurrency ?? undefined,
          revenueFiscalYear: revenueFiscalYear ?? undefined,
          revenueSource: revenue ? 'Tavily Research' : undefined,
          employees,
          employeesSource: employees ? 'Tavily Research' : undefined,
          confidence: 7,
          relevanceReason: 'Found via Tavily Research',
          executives,
        });
      }
    }
    
    return companies;
  }
  
  /**
   * Parse markdown content that uses section headers instead of tables
   */
  private parseMarkdownSections(markdown: string): TavilyResearchCompany[] {
    const companies: TavilyResearchCompany[] = [];
    
    // Look for company mentions with bold formatting
    const companyMentions = markdown.match(/\*\*([^*]+)\*\*[^|]*([\s\S]*?)(?=\*\*[^*]+\*\*|\n#|\n---|\Z)/g);
    
    if (!companyMentions) {
      console.log('[TavilyResearch] No structured company data found');
      return companies;
    }
    
    for (const mention of companyMentions) {
      // Extract company name
      const nameMatch = mention.match(/\*\*([^*]+)\*\*/);
      if (!nameMatch) continue;
      
      const companyName = nameMatch[1].trim();
      if (companyName.length < 3 || companyName.toLowerCase().includes('note') || 
          companyName.toLowerCase().includes('source')) continue;
      
      // Try to extract country
      const countryMatch = mention.match(/[-–]\s*(UAE|Saudi Arabia|United Arab Emirates|Qatar|Kuwait|Bahrain|Oman)/i);
      const country = countryMatch ? countryMatch[1] : 'Unknown';
      
      // Try to extract executives from surrounding text
      const executives: TavilyResearchExecutive[] = [];
      const execMatches = mention.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–,]\s*(CEO|CFO|COO|CTO|Managing Director|Chairman|President|General Manager|Founder)[^,\n]*/gi);
      
      if (execMatches) {
        for (const exec of execMatches) {
          const parts = exec.match(/([A-Za-z\s.''-]+)\s*[-–,]\s*([A-Za-z\s.,'()-]+)/);
          if (parts) {
            executives.push({
              name: parts[1].trim(),
              title: parts[2].trim(),
              source: 'Tavily Research'
            });
          }
        }
      }
      
      companies.push({
        name: companyName,
        country,
        executives,
        confidence: 6,
        relevanceReason: 'Found via Tavily Research',
      });
    }
    
    return companies;
  }
  
  async research(query: string, limit: number = 10): Promise<TavilyResearchResult & { detectedRegion?: { countries: string[]; regionName: string | null }; rawMarkdown?: string }> {
    const endpoint = 'https://api.tavily.com/research';
    
    // Detect region/country constraints from the query
    const regionInfo = detectQueryRegion(query);
    
    // Detect specific executive role requests from the query
    const executiveRoleInfo = this.detectExecutiveRole(query);
    
    // Build executive-specific instructions based on query analysis
    let executiveInstructions: string;
    if (executiveRoleInfo.specificRole) {
      if (executiveRoleInfo.allInFunction) {
        // "Finance leaders" or "HR team" - all people in that function
        executiveInstructions = `- All ${executiveRoleInfo.roleDescription} executives (find everyone in this function, not just the head)`;
      } else {
        // "CEO" or "CFO" - just the specific role
        executiveInstructions = `- The ${executiveRoleInfo.roleDescription} with their title and LinkedIn profile`;
      }
    } else {
      // No specific role - return all key executives
      executiveInstructions = `- Key executives (CEO, CFO, COO, Managing Director, etc.) with their titles and LinkedIn profiles`;
    }
    
    // Build region constraint section
    const regionConstraint = regionInfo.constraintText ? `\n\nGEOGRAPHIC CONSTRAINT:\n${regionInfo.constraintText}\n` : '';
    
    const enhancedQuery = `Find the top ${limit} ${query}. For each company, provide:${regionConstraint}

COMPANY DETAILS:
- Official company name
- Headquarters location (country, city, full street address if available)
- Company website URL (e.g., https://www.company.com)
- 2-4 sentence description of what the company does and its market position

FINANCIAL DATA (IMPORTANT - use local currency):
- Annual revenue in the format: "[CURRENCY] [AMOUNT] [YEAR]" (e.g., "SAR 75.3bn 2023", "AED 28.4 billion FY2024", "USD 15.2B 2023")
- Use the company's local/domiciled currency (SAR, AED, QAR, EUR, GBP, USD, etc.)
- Only include if explicitly stated as "revenue" from annual reports, financial statements, or reputable business news
- Include the source (e.g., "Annual Report 2023", "KPMG Report")
- Number of employees with source

EXECUTIVES (CRITICAL - find and include):
${executiveInstructions}
- For each executive: full name, exact title, LinkedIn profile URL if available
- Source where each executive was found (e.g., "LinkedIn", "Company Website", "Annual Report")

RANKING:
- Rank companies by revenue (highest first)
- Include confidence score 1-10 based on source reliability`;

    console.log(`[TavilyResearch] Starting research: ${query} (executive filter: ${executiveRoleInfo.specificRole || 'all'})`);
    console.log(`[TavilyResearch] Executive instructions: ${executiveInstructions}`);
    console.log(`[TavilyResearch] Region constraint: ${regionInfo.regionName || 'none'} (${regionInfo.countries.length} countries)`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: enhancedQuery,
        model: 'pro', // Use pro for comprehensive research with better executive coverage
        stream: false,
        // NO output_schema - let Tavily return natural markdown tables which are richer
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[TavilyResearch] API error:', error);
      throw new Error(`Tavily Research API error: ${response.status} - ${error}`);
    }
    
    // Research API returns a task that needs polling
    const taskData = await response.json();
    console.log(`[TavilyResearch] Task created: ${taskData.request_id}, status: ${taskData.status}`);
    
    // Poll for completion
    const result = await this.pollForResult(taskData.request_id);
    
    // Attach detected region info for post-filtering
    return {
      ...result,
      detectedRegion: {
        countries: regionInfo.countries,
        regionName: regionInfo.regionName,
      }
    };
  }
  
  private async pollForResult(requestId: string, maxAttempts = 60, intervalMs = 2000): Promise<TavilyResearchResult> {
    const statusEndpoint = `https://api.tavily.com/research/${requestId}`;
    let consecutiveRateLimits = 0;
    const maxRateLimitRetries = 5;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Skip delay on first attempt
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      
      const response = await fetch(statusEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (response.status === 429) {
        consecutiveRateLimits++;
        if (consecutiveRateLimits >= maxRateLimitRetries) {
          const error = new Error('The research service is temporarily busy. Please wait a minute and try again.');
          (error as any).code = 'RATE_LIMIT';
          throw error;
        }
        const backoffMs = Math.min(intervalMs * Math.pow(2, consecutiveRateLimits), 30000);
        console.log(`[TavilyResearch] Rate limited (attempt ${consecutiveRateLimits}/${maxRateLimitRetries}), backing off for ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      consecutiveRateLimits = 0;
      
      if (!response.ok) {
        throw new Error(`Failed to poll research status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[TavilyResearch] Poll attempt ${attempt + 1}: status = ${data.status}`);
      
      if (data.status === 'completed') {
        // Extract companies from the research output
        // Tavily Research API returns content in the 'content' field as markdown
        const output = data.content || data.output || data.result || data.report || data.data || '';
        let companies: TavilyResearchCompany[] = [];
        
        console.log(`[TavilyResearch] Output type: ${typeof output}`);
        console.log(`[TavilyResearch] Output preview: ${typeof output === 'string' ? output.substring(0, 1000) : JSON.stringify(output).substring(0, 1000)}`);
        console.log(`[TavilyResearch] Full response keys: ${Object.keys(data).join(', ')}`);
        
        // Parse markdown content - Tavily returns rich markdown tables
        if (typeof output === 'string' && output.length > 0) {
          companies = this.parseMarkdownToCompanies(output);
          console.log(`[TavilyResearch] Parsed ${companies.length} companies from markdown`);
        } else if (typeof output === 'object' && output.companies) {
          companies = output.companies;
          console.log(`[TavilyResearch] Got ${companies.length} companies from object output`);
        }
        
        return {
          companies,
          sources: data.sources || [],
          responseTime: data.response_time,
          rawMarkdown: typeof output === 'string' ? output : undefined,
        };
      }
      
      if (data.status === 'failed') {
        throw new Error(`Research task failed: ${data.error || 'Unknown error'}`);
      }
    }
    
    throw new Error('Research task timed out');
  }
}

export class WebSearchService {
  private provider: SearchProvider | null = null;
  private researchService: TavilyResearchService | null = null;
  
  constructor() {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    
    if (tavilyApiKey) {
      this.provider = new TavilySearchProvider(tavilyApiKey);
      this.researchService = new TavilyResearchService(tavilyApiKey);
      console.log('[WebSearch] Initialized with Tavily provider + Research API');
    } else {
      console.warn('[WebSearch] No TAVILY_API_KEY configured - web search disabled');
    }
  }
  
  isConfigured(): boolean {
    return this.provider !== null;
  }
  
  async searchForCompanies(query: string, numResults = 20): Promise<WebSearchResult[]> {
    const response = await this.searchForCompaniesWithAnswer(query, numResults);
    return response.results;
  }
  
  async searchForCompaniesWithAnswer(query: string, numResults = 15): Promise<TavilySearchResponse> {
    if (!this.provider) {
      throw new Error('Web search not configured - missing TAVILY_API_KEY');
    }
    
    console.log(`[WebSearch] Searching with advanced answer: ${query}`);
    
    const response = await this.provider.searchWithAnswer(query, numResults);
    console.log(`[WebSearch] Found ${response.results.length} results, has answer: ${!!response.answer}`);
    
    return response;
  }
  
  async searchForCompanyVerification(companyName: string, year?: number): Promise<WebSearchResult[]> {
    if (!this.provider) {
      throw new Error('Web search not configured - missing TAVILY_API_KEY');
    }
    
    const yearStr = year || new Date().getFullYear() - 1;
    const verificationQuery = `"${companyName}" revenue ${yearStr} annual report OR financial statements`;
    console.log(`[WebSearch] Verification search: ${verificationQuery}`);
    
    const results = await this.provider.search(verificationQuery, 5);
    console.log(`[WebSearch] Found ${results.length} verification results for ${companyName}`);
    
    return results;
  }
  
  classifyResults(results: WebSearchResult[]): Array<WebSearchResult & SourceTierClassification> {
    return results.map(result => ({
      ...result,
      ...classifySourceTier(result.url, result.title, result.snippet),
    }));
  }
  
  toInsertFormat(
    result: WebSearchResult & SourceTierClassification,
    searchQueryId: number,
    companyId?: number,
    isVerification = false,
  ): InsertSearchResult {
    return {
      searchQueryId,
      companyId: companyId || null,
      url: result.url,
      title: result.title,
      snippet: result.snippet,
      domain: result.domain,
      rank: result.rank,
      provider: result.provider,
      sourceTier: result.tier,
      tierReason: result.reason,
      documentType: result.documentType,
      isVerificationSource: isVerification,
      extractedData: null,
    };
  }
  
  // New: Use Tavily Research API for structured extraction (replaces LLM layer)
  isResearchConfigured(): boolean {
    return this.researchService !== null;
  }
  
  async researchCompanies(query: string, limit: number = 10): Promise<TavilyResearchResult> {
    if (!this.researchService) {
      throw new Error('Tavily Research not configured - missing TAVILY_API_KEY');
    }
    
    return this.researchService.research(query, limit);
  }
  
  // Detect if query is asking for specific executive roles
  detectExecutiveRole(query: string): { specificRole: string | null; roleDescription: string; allInFunction: boolean } {
    if (!this.researchService) {
      return { specificRole: null, roleDescription: 'all key executives', allInFunction: false };
    }
    return this.researchService.detectExecutiveRole(query);
  }
  
  // Check if an executive title matches a role filter
  matchesRoleFilter(execTitle: string, roleFilter: { specificRole: string | null; allInFunction: boolean }): boolean {
    if (!this.researchService) {
      return true;
    }
    return this.researchService.matchesRoleFilter(execTitle, roleFilter);
  }
}

export const webSearchService = new WebSearchService();
