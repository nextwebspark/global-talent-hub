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

export class WebSearchService {
  private provider: SearchProvider | null = null;
  
  constructor() {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    
    if (tavilyApiKey) {
      this.provider = new TavilySearchProvider(tavilyApiKey);
      console.log('[WebSearch] Initialized with Tavily provider');
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
}

export const webSearchService = new WebSearchService();
