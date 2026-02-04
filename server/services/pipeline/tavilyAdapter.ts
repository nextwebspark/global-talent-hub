import type { ISearchProvider, DiscoveredCompany, SearchIntent } from './types';

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.split('/')[2] || url;
  }
}

export class TavilyAdapter implements ISearchProvider {
  name = 'tavily';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverCompanies(intent: SearchIntent): Promise<DiscoveredCompany[]> {
    const query = this.buildDiscoveryQuery(intent);
    const searchResponse = await this.searchWithAnswer(query, 15);
    
    const companies: DiscoveredCompany[] = [];
    const now = new Date();
    
    for (const result of searchResponse.results) {
      const extractedNames = this.extractCompanyNamesFromResult(result, intent);
      for (const name of extractedNames) {
        if (!companies.some(c => c.companyNameRaw.toLowerCase() === name.toLowerCase())) {
          companies.push({
            companyNameRaw: name,
            sourceUrl: result.url,
            sourceTitle: result.title,
            searchProvider: this.name,
            discoveryTimestamp: now,
          });
        }
      }
    }
    
    return companies.slice(0, intent.limit * 2);
  }

  async searchWithAnswer(query: string, numResults = 15): Promise<{
    results: Array<{
      url: string;
      title: string;
      snippet: string;
      rawContent?: string;
      domain: string;
      rank: number;
      provider: string;
    }>;
    answer?: string;
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
      console.error('[TavilyAdapter] API error:', error);
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    console.log(`[TavilyAdapter] Returned ${results.length} results, answer: ${data.answer ? 'yes' : 'no'}`);

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
    };
  }

  private buildDiscoveryQuery(intent: SearchIntent): string {
    let query = intent.originalQuery;
    if (intent.sector && !query.toLowerCase().includes(intent.sector.toLowerCase())) {
      query = `${intent.sector} ${query}`;
    }
    if (intent.region && !query.toLowerCase().includes(intent.region.toLowerCase())) {
      query = `${query} ${intent.region}`;
    }
    return query;
  }

  private extractCompanyNamesFromResult(
    result: { title: string; snippet: string; rawContent?: string },
    intent: SearchIntent
  ): string[] {
    const names: string[] = [];
    const text = `${result.title} ${result.snippet} ${result.rawContent || ''}`;
    
    const patterns = [
      /(?:^|\n)\d+\.\s*\*?\*?([A-Z][A-Za-z\s&\-']+(?:Inc|Corp|Ltd|LLC|Group|Company|Co|SA|PLC|Holdings|Bank|Insurance)?)\*?\*?/g,
      /\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,3})\s+(?:is|are|was|were|has|have|had)\s+(?:a|the|one of)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 100 && !this.isCommonWord(name)) {
          names.push(name);
        }
      }
    }
    
    return Array.from(new Set(names));
  }

  private isCommonWord(word: string): boolean {
    const common = [
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been',
      'their', 'which', 'when', 'what', 'there', 'about', 'into', 'more',
      'other', 'than', 'then', 'these', 'some', 'would', 'make', 'like',
      'just', 'over', 'such', 'through', 'after', 'first', 'well', 'also',
      'company', 'companies', 'business', 'market', 'industry', 'sector',
    ];
    return common.includes(word.toLowerCase());
  }
}

export function createTavilyAdapter(): TavilyAdapter | null {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[TavilyAdapter] TAVILY_API_KEY not configured');
    return null;
  }
  return new TavilyAdapter(apiKey);
}
