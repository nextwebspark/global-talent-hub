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
  country?: string | null;
  city?: string | null;
  streetAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  revenue?: number | null;
  revenueCurrency?: string | null;
  revenueFiscalYear?: number | null;
  revenueSource?: string | null;
  employees?: number | null;
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

// The output schema for Tavily Research API - must match JSON Schema format
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
          country: { type: "string", description: "Headquarters country" },
          city: { type: "string", description: "Headquarters city" },
          streetAddress: { type: "string", description: "Full street address if available" },
          latitude: { type: "number", description: "GPS latitude of headquarters" },
          longitude: { type: "number", description: "GPS longitude of headquarters" },
          revenue: { type: "number", description: "Annual revenue as a number (e.g., 15200000000 for 15.2 billion). Only include if explicitly stated as 'revenue' from authoritative source." },
          revenueCurrency: { type: "string", description: "3-letter currency code (USD, AED, EUR, SAR, etc.)" },
          revenueFiscalYear: { type: "integer", description: "Fiscal year for the revenue figure (e.g., 2023, 2024)" },
          revenueSource: { type: "string", description: "Source of revenue data (e.g., Annual Report 2023, KPMG Report)" },
          employees: { type: "integer", description: "Number of employees" },
          employeesSource: { type: "string", description: "Source of employee count" },
          confidence: { type: "integer", description: "Data quality confidence score 1-10" },
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
  
  async research(query: string, limit: number = 10): Promise<TavilyResearchResult> {
    const endpoint = 'https://api.tavily.com/research';
    
    const enhancedQuery = `Find the top ${limit} ${query}. For each company, find:
- Official company name and headquarters location (country, city, street address)
- Annual revenue (only if explicitly stated as "revenue" with currency and fiscal year)
- Number of employees
- Key executives (CEO, CFO, COO, Managing Director, etc.) with their titles
- LinkedIn profiles of executives if available

IMPORTANT: Only include revenue if you find it explicitly stated as "revenue" from annual reports, regulatory filings, or reputable business news. Do not estimate or calculate revenue.`;

    console.log(`[TavilyResearch] Starting research: ${query}`);
    
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
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      
      const response = await fetch(statusEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
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
