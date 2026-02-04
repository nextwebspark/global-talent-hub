import type { InsertSearchResult } from "@shared/schema";

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  rank: number;
  provider: string;
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
}

export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async search(query: string, numResults = 10): Promise<WebSearchResult[]> {
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
    
    return results.map((item: any, index: number) => ({
      url: item.url,
      title: item.title,
      snippet: item.content || '',
      domain: extractDomain(item.url),
      rank: index + 1,
      provider: this.name,
    }));
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
// Uses flexible types to accept various formats from Tavily's AI
const COMPANY_RESEARCH_SCHEMA = {
  properties: {
    companies: {
      type: "array",
      description: "List of companies matching the query",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact company name" },
          sector: { type: "string", description: "Industry sector (e.g., Banking, Technology, Healthcare)" },
          businessType: { type: "string", description: "Type: bank, corporation, distributor, manufacturer, service_provider" },
          description: { type: "string", description: "2-4 sentence description of what the company does, its main business activities and market position" },
          website: { type: "string", description: "Company website URL (e.g., https://www.company.com)" },
          country: { type: "string", description: "Headquarters country" },
          city: { type: "string", description: "Headquarters city" },
          streetAddress: { type: "string", description: "Full street address if available" },
          latitude: { type: "number", description: "GPS latitude of headquarters" },
          longitude: { type: "number", description: "GPS longitude of headquarters" },
          revenue: { type: "string", description: "Annual revenue as a formatted string with currency and year, e.g., 'SAR 75.3bn 2023', 'AED 28.4 billion FY2024', 'USD 15.2B 2023'. Include the exact figure from authoritative sources." },
          revenueCurrency: { type: "string", description: "3-letter currency code (e.g., USD, SAR, AED, EUR, GBP, QAR, OMR). Use the company's local/domiciled currency." },
          revenueFiscalYear: { type: "integer", description: "Fiscal year of the revenue figure (e.g., 2023, 2024)" },
          revenueSource: { type: "string", description: "Source of revenue data (e.g., Annual Report 2023, KPMG Report, Company Website)" },
          employees: { type: "integer", description: "Number of employees" },
          employeesSource: { type: "string", description: "Source of employee count" },
          confidence: { type: "integer", description: "Data quality confidence score 1-10 based on source reliability" },
          relevanceReason: { type: "string", description: "Why this company matches the search query" },
          executives: {
            type: "array",
            description: "Key executives at this company",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Executive's full name" },
                title: { type: "string", description: "Job title (e.g., CEO, CFO, Managing Director)" },
                email: { type: "string", description: "Email address if publicly available" },
                phone: { type: "string", description: "Phone number if publicly available" },
                linkedin: { type: "string", description: "LinkedIn profile URL" },
                source: { type: "string", description: "Source where this executive was found" }
              }
            }
          }
        }
      }
    }
  },
  required: ["companies"]
};

export class TavilyResearchService {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Detect if the query is asking for specific executive roles
   * Returns info about whether to filter executives and how
   */
  private detectExecutiveRole(query: string): { 
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
  
  async research(query: string, limit: number = 10): Promise<TavilyResearchResult> {
    const endpoint = 'https://api.tavily.com/research';
    
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
    
    const enhancedQuery = `Find the top ${limit} ${query}. For each company, provide:

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
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: enhancedQuery,
        model: 'mini', // Use mini for efficiency, can upgrade to 'pro' for complex queries
        output_schema: COMPANY_RESEARCH_SCHEMA,
        stream: false,
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
    return result;
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
        // Tavily Research API returns content in the 'content' field
        const output = data.content || data.output || data.result || data.report || data.data || '';
        let companies: TavilyResearchCompany[] = [];
        
        console.log(`[TavilyResearch] Output type: ${typeof output}`);
        console.log(`[TavilyResearch] Output preview: ${typeof output === 'string' ? output.substring(0, 500) : JSON.stringify(output).substring(0, 500)}`);
        console.log(`[TavilyResearch] Full response keys: ${Object.keys(data).join(', ')}`);
        
        // Try to parse structured output
        if (typeof output === 'string' && output.length > 0) {
          // If output is markdown, try to extract JSON
          try {
            const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) || 
                             output.match(/(\{[\s\S]*"companies"[\s\S]*\})/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[1]);
              companies = parsed.companies || [];
              console.log(`[TavilyResearch] Parsed ${companies.length} companies from JSON`);
            } else {
              console.log(`[TavilyResearch] No JSON match found in output`);
            }
          } catch (e: any) {
            console.warn('[TavilyResearch] Failed to parse structured output:', e.message);
          }
        } else if (typeof output === 'object' && output.companies) {
          companies = output.companies;
          console.log(`[TavilyResearch] Got ${companies.length} companies from object output`);
        }
        
        return {
          companies,
          sources: data.sources || [],
          responseTime: data.response_time,
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
    if (!this.provider) {
      throw new Error('Web search not configured - missing TAVILY_API_KEY');
    }
    
    const enhancedQuery = `${query} company revenue annual report`;
    console.log(`[WebSearch] Searching: ${enhancedQuery}`);
    
    const results = await this.provider.search(enhancedQuery, numResults);
    console.log(`[WebSearch] Found ${results.length} results`);
    
    return results;
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
}

export const webSearchService = new WebSearchService();
