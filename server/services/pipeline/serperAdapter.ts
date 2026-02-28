import type { ISearchProvider, DiscoveredCompany, SearchIntent } from './types';

const NOISE_DOMAINS = new Set([
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com',
  'x.com', 'youtube.com', 'glassdoor.com', 'indeed.com',
  'tiktok.com', 'pinterest.com', 'reddit.com',
]);

const LIST_KEYWORDS = /\b(top|best|largest|leading|biggest|major|fastest|most)\b/i;
const NUMBER_IN_TITLE = /\b\d+\b/;

const COUNTRY_TO_GL: Record<string, string> = {
  'united arab emirates': 'ae', 'uae': 'ae', 'dubai': 'ae', 'abu dhabi': 'ae',
  'saudi arabia': 'sa', 'ksa': 'sa', 'riyadh': 'sa', 'jeddah': 'sa',
  'qatar': 'qa', 'doha': 'qa',
  'kuwait': 'kw',
  'bahrain': 'bh', 'manama': 'bh',
  'oman': 'om', 'muscat': 'om',
  'jordan': 'jo', 'amman': 'jo',
  'egypt': 'eg', 'cairo': 'eg',
  'united kingdom': 'gb', 'uk': 'gb', 'london': 'gb', 'britain': 'gb',
  'united states': 'us', 'usa': 'us', 'america': 'us',
  'germany': 'de', 'berlin': 'de', 'frankfurt': 'de',
  'france': 'fr', 'paris': 'fr',
  'india': 'in', 'mumbai': 'in', 'delhi': 'in', 'bangalore': 'in',
  'china': 'cn', 'beijing': 'cn', 'shanghai': 'cn',
  'japan': 'jp', 'tokyo': 'jp',
  'singapore': 'sg',
  'south korea': 'kr', 'korea': 'kr', 'seoul': 'kr',
  'australia': 'au', 'sydney': 'au',
  'canada': 'ca', 'toronto': 'ca',
  'switzerland': 'ch', 'zurich': 'ch',
  'hong kong': 'hk',
  'italy': 'it', 'milan': 'it', 'rome': 'it',
  'spain': 'es', 'madrid': 'es',
  'brazil': 'br', 'sao paulo': 'br',
  'mexico': 'mx',
  'south africa': 'za',
  'nigeria': 'ng',
  'turkey': 'tr', 'istanbul': 'tr',
  'indonesia': 'id', 'jakarta': 'id',
  'malaysia': 'my', 'kuala lumpur': 'my',
  'thailand': 'th', 'bangkok': 'th',
  'vietnam': 'vn',
  'philippines': 'ph',
  'pakistan': 'pk',
  'lebanon': 'lb', 'beirut': 'lb',
  'iraq': 'iq',
  'iran': 'ir',
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[2] || url;
  }
}

function isNoiseDomain(url: string): boolean {
  const domain = extractDomain(url);
  for (const noise of NOISE_DOMAINS) {
    if (domain === noise || domain.endsWith('.' + noise)) return true;
  }
  return false;
}

function scoreResult(url: string, title: string): number {
  if (isNoiseDomain(url)) return 0;
  if (LIST_KEYWORDS.test(title) || NUMBER_IN_TITLE.test(title)) return 2;
  return 1;
}

function detectGl(query: string): string {
  const lower = query.toLowerCase();
  for (const [keyword, code] of Object.entries(COUNTRY_TO_GL)) {
    if (lower.includes(keyword)) return code;
  }
  return 'us';
}

function extractCompanyNamesFromHtml(text: string): string[] {
  const names: string[] = [];

  const listPatterns = [
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?(?:Inc|Corp|Ltd|LLC|Group|Company|Co|SA|PLC|Holdings|Bank|AG|GmbH|SpA|NV|BV)\.?)\b/gm,
  ];

  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim()
        .replace(/\*+/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[,:]$/, '')
        .trim();
      if (name.length > 2 && name.length < 120 && !isCommonPhrase(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

function extractCompanyFromDomainOrTitle(url: string, title: string): string | null {
  let name = title
    .replace(/\s*[-–—|:].*/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim();

  if (name.length > 2 && name.length < 80 && /[A-Z]/.test(name) && !isCommonPhrase(name)) {
    return name;
  }

  const domain = extractDomain(url)
    .replace(/\.(com|org|net|co|io|ae|sa|uk|de|fr|jp|sg|hk)$/i, '')
    .replace(/\./g, ' ');

  if (domain.length > 2) {
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return null;
}

function isCommonPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const phrases = [
    'top', 'best', 'largest', 'leading', 'biggest', 'major', 'list of',
    'home', 'about', 'contact', 'login', 'sign up', 'careers', 'news',
    'privacy policy', 'terms', 'cookie', 'subscribe', 'read more',
    'company', 'companies', 'business', 'market', 'industry', 'sector',
    'wikipedia', 'forbes', 'bloomberg', 'reuters',
  ];
  return phrases.some(p => lower === p);
}

function deduplicateNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key) && key.length > 2) {
      seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}

export class SerperAdapter implements ISearchProvider {
  name = 'serper';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverCompanies(intent: SearchIntent): Promise<DiscoveredCompany[]> {
    const query = this.buildDiscoveryQuery(intent);
    const gl = intent.country ? detectGl(intent.country) : detectGl(intent.originalQuery);

    console.log(`[SerperAdapter] Searching: "${query}" (gl=${gl})`);

    const serperResults = await this.callSerper(query, gl, 10);

    const scored = serperResults.map(r => ({
      ...r,
      score: scoreResult(r.link, r.title),
    })).filter(r => r.score > 0);

    console.log(`[SerperAdapter] ${serperResults.length} results, ${scored.length} after noise filter`);

    const allNames: string[] = [];
    const sourceMap = new Map<string, { url: string; title: string }>();

    const highPriority = scored.filter(r => r.score === 2);
    const normalPriority = scored.filter(r => r.score === 1);

    for (const result of highPriority) {
      try {
        const pageContent = await this.fetchPageContent(result.link);
        const extracted = extractCompanyNamesFromHtml(pageContent);
        console.log(`[SerperAdapter] List article "${result.title}" → ${extracted.length} names`);
        for (const name of extracted) {
          allNames.push(name);
          if (!sourceMap.has(name.toLowerCase())) {
            sourceMap.set(name.toLowerCase(), { url: result.link, title: result.title });
          }
        }
      } catch (err) {
        console.warn(`[SerperAdapter] Failed to fetch ${result.link}:`, err);
      }
    }

    for (const result of normalPriority) {
      const name = extractCompanyFromDomainOrTitle(result.link, result.title);
      if (name) {
        allNames.push(name);
        if (!sourceMap.has(name.toLowerCase())) {
          sourceMap.set(name.toLowerCase(), { url: result.link, title: result.title });
        }
      }
    }

    const unique = deduplicateNames(allNames);
    const now = new Date();

    const companies: DiscoveredCompany[] = unique.map(name => {
      const source = sourceMap.get(name.toLowerCase());
      return {
        companyNameRaw: name,
        sourceUrl: source?.url || '',
        sourceTitle: source?.title,
        searchProvider: this.name,
        discoveryTimestamp: now,
      };
    });

    console.log(`[SerperAdapter] Discovered ${companies.length} unique companies`);
    return companies.slice(0, intent.limit * 2);
  }

  async searchWithAnswer(query: string, numResults = 10): Promise<{
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
    const gl = detectGl(query);
    const serperResults = await this.callSerper(query, gl, numResults);

    console.log(`[SerperAdapter] searchWithAnswer: ${serperResults.length} results`);

    const results = serperResults
      .filter(r => !isNoiseDomain(r.link))
      .map((item, index) => ({
        url: item.link,
        title: item.title,
        snippet: item.snippet || '',
        rawContent: '',
        domain: extractDomain(item.link),
        rank: index + 1,
        provider: this.name,
      }));

    let answer: string | undefined;
    if (serperResults.length > 0) {
      const snippets = serperResults
        .slice(0, 3)
        .map(r => r.snippet)
        .filter(Boolean)
        .join(' ');
      if (snippets.length > 50) {
        answer = snippets;
      }
    }

    return { results, answer };
  }

  private async callSerper(query: string, gl: string, num: number): Promise<Array<{
    title: string;
    link: string;
    snippet: string;
  }>> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl, num }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[SerperAdapter] API error:', response.status, error);
      throw new Error(`Serper API error: ${response.status}`);
    }

    const data = await response.json();
    return data.organic || [];
  }

  private async fetchPageContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TalentMapBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } finally {
      clearTimeout(timeout);
    }
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
}

export function createSerperAdapter(): SerperAdapter | null {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn('[SerperAdapter] SERPER_API_KEY not configured');
    return null;
  }
  return new SerperAdapter(apiKey);
}
