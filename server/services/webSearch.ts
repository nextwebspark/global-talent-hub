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

export class BingSearchProvider implements SearchProvider {
  name = 'bing';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async search(query: string, numResults = 10): Promise<WebSearchResult[]> {
    const endpoint = 'https://api.bing.microsoft.com/v7.0/search';
    
    const params = new URLSearchParams({
      q: query,
      count: String(numResults),
      mkt: 'en-US',
      safeSearch: 'Moderate',
    });
    
    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[WebSearch] Bing API error:', error);
      throw new Error(`Bing API error: ${response.status}`);
    }
    
    const data = await response.json();
    const webPages = data.webPages?.value || [];
    
    return webPages.map((page: any, index: number) => ({
      url: page.url,
      title: page.name,
      snippet: page.snippet,
      domain: extractDomain(page.url),
      rank: index + 1,
      provider: this.name,
    }));
  }
}

export class GoogleSearchProvider implements SearchProvider {
  name = 'google';
  private apiKey: string;
  private searchEngineId: string;
  
  constructor(apiKey: string, searchEngineId: string) {
    this.apiKey = apiKey;
    this.searchEngineId = searchEngineId;
  }
  
  async search(query: string, numResults = 10): Promise<WebSearchResult[]> {
    const endpoint = 'https://www.googleapis.com/customsearch/v1';
    const results: WebSearchResult[] = [];
    
    const batchSize = 10;
    const batches = Math.ceil(numResults / batchSize);
    
    for (let i = 0; i < batches && results.length < numResults; i++) {
      const startIndex = i * batchSize + 1;
      const params = new URLSearchParams({
        key: this.apiKey,
        cx: this.searchEngineId,
        q: query,
        num: String(Math.min(batchSize, numResults - results.length)),
        start: String(startIndex),
      });
      
      const response = await fetch(`${endpoint}?${params}`);
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[WebSearch] Google API error:', error);
        throw new Error(`Google API error: ${response.status}`);
      }
      
      const data = await response.json();
      const items = data.items || [];
      
      for (const item of items) {
        results.push({
          url: item.link,
          title: item.title,
          snippet: item.snippet || '',
          domain: extractDomain(item.link),
          rank: results.length + 1,
          provider: this.name,
        });
      }
    }
    
    return results.slice(0, numResults);
  }
}

export class WebSearchService {
  private provider: SearchProvider | null = null;
  
  constructor() {
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleSearchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    const bingKey = process.env.BING_API_KEY;
    
    if (googleApiKey && googleSearchEngineId) {
      this.provider = new GoogleSearchProvider(googleApiKey, googleSearchEngineId);
      console.log('[WebSearch] Initialized with Google provider');
    } else if (bingKey) {
      this.provider = new BingSearchProvider(bingKey);
      console.log('[WebSearch] Initialized with Bing provider');
    } else {
      console.warn('[WebSearch] No API key configured - web search disabled');
    }
  }
  
  isConfigured(): boolean {
    return this.provider !== null;
  }
  
  async searchForCompanies(query: string, numResults = 20): Promise<WebSearchResult[]> {
    if (!this.provider) {
      throw new Error('Web search not configured - missing API key');
    }
    
    const enhancedQuery = `${query} company revenue annual report`;
    console.log(`[WebSearch] Searching: ${enhancedQuery}`);
    
    const results = await this.provider.search(enhancedQuery, numResults);
    console.log(`[WebSearch] Found ${results.length} results`);
    
    return results;
  }
  
  async searchForCompanyVerification(companyName: string, year?: number): Promise<WebSearchResult[]> {
    if (!this.provider) {
      throw new Error('Web search not configured - missing API key');
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
