import OpenAI from "openai";
import type { DiscoveredCompany, EnrichedCompany, ExtractedExecutive, FieldValue } from './types';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryAllModels(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  for (const model of FREE_MODELS) {
    try {
      console.log(`[NonDropExtraction] Trying ${model}...`);
      const response = await openrouter.chat.completions.create({
        model,
        messages: messages as any,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.max_tokens ?? 8000,
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) {
        console.log(`[NonDropExtraction] Succeeded with ${model}`);
        return content;
      }
    } catch (error: any) {
      console.warn(`[NonDropExtraction] ${model} failed: ${error.message}`);
    }
  }
  return null;
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const result = await tryAllModels(messages, options);
  if (result) return result;

  console.log(`[NonDropExtraction] All models failed on first pass. Waiting 2s before retry...`);
  await sleep(2000);

  const retryResult = await tryAllModels(messages, options);
  if (retryResult) return retryResult;

  throw new Error('All free LLM models are currently unavailable. Please try again in a minute.');
}

function createEmptyFieldValue<T>(): FieldValue<T> {
  return {
    value: null,
    sourceUrl: null,
    confidence: 0,
    lastUpdated: new Date(),
  };
}

function parseFieldSafely<T>(
  data: any,
  fieldName: string,
  parser: (val: any) => T | null
): FieldValue<T> {
  try {
    const fieldData = data[fieldName];
    if (fieldData === undefined || fieldData === null) {
      return createEmptyFieldValue<T>();
    }
    
    const value = parser(fieldData);
    return {
      value,
      sourceUrl: data[`${fieldName}Source`] || data.sourceUrl || null,
      confidence: typeof data[`${fieldName}Confidence`] === 'number' 
        ? data[`${fieldName}Confidence`] 
        : (data.confidence || 5),
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.warn(`[NonDropExtraction] Failed to parse field ${fieldName}:`, error);
    return createEmptyFieldValue<T>();
  }
}

const EXTRACTION_PROMPT = `You are extracting company data from search results. 

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no explanatory text
2. Extract EVERY company mentioned - do NOT drop companies because of missing data
3. For each field, if data is not found, use null - NEVER skip a company
4. Missing fields are EXPECTED and VALID
5. Only extract what is EXPLICITLY stated in sources - NO hallucination

For each company, extract these fields (all optional except name):
- name: Company name (REQUIRED - only field that MUST exist)
- sector: Industry sector or null
- businessType: Type of business or null
- country: HQ country or null
- city: HQ city or null
- streetAddress: Full address or null
- latitude: Number or null
- longitude: Number or null
- revenue: Number (e.g. 15200000000) or null
- revenueCurrency: 3-letter code like "USD" or null
- revenueFiscalYear: Year as integer or null
- revenueSource: Source description or null
- employees: Integer or null
- employeesSource: Source or null
- website: URL or null
- summary: Brief description or null
- confidence: 1-10 score (default 5 if uncertain)
- relevanceReason: Why this matches the query
- sourceUrls: Array of source URLs
- executives: Array of {name, title, sourceUrl} objects

REVENUE RULES (if extracting revenue):
- Only accept if source explicitly says "revenue"
- Must have currency and fiscal year if value is provided
- Convert text to numbers: "AED 15.2 billion" → 15200000000

OUTPUT FORMAT:
{
  "companies": [
    {
      "name": "Example Corp",
      "sector": "Technology",
      "country": "UAE",
      ... other fields with null if unknown ...
    }
  ]
}`;

export async function extractCompaniesNonDestructive(
  searchContext: string,
  query: string,
  limit: number
): Promise<EnrichedCompany[]> {
  const userPrompt = `QUERY: ${query}

${searchContext}

Extract up to ${limit} companies. Include ALL companies found - missing fields are OK, just use null.
Return JSON only.`;

  try {
    const content = await callLLM(
      [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: userPrompt }
      ],
      { temperature: 0.1, max_tokens: 8000 }
    );

    const parsed = parseJsonResponse(content);
    
    if (!parsed || !Array.isArray(parsed.companies)) {
      console.error('[NonDropExtraction] Invalid response structure');
      return [];
    }

    const companies: EnrichedCompany[] = [];
    
    for (const rawCompany of parsed.companies) {
      try {
        const company = transformToEnrichedCompany(rawCompany);
        if (company) {
          companies.push(company);
        }
      } catch (fieldError) {
        console.warn('[NonDropExtraction] Error transforming company, attempting partial:', fieldError);
        const partialCompany = transformPartialCompany(rawCompany);
        if (partialCompany) {
          companies.push(partialCompany);
        }
      }
    }

    console.log(`[NonDropExtraction] Extracted ${companies.length} companies (no drops)`);
    return companies;

  } catch (error: any) {
    console.warn('[NonDropExtraction] LLM extraction failed:', error.message);
    throw error;
  }
}

function parseJsonResponse(content: string): any {
  let cleanedContent = content.trim();
  
  const jsonMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleanedContent = jsonMatch[1].trim();
  }
  
  const startIndex = cleanedContent.indexOf('{');
  const endIndex = cleanedContent.lastIndexOf('}');
  if (startIndex !== -1 && endIndex !== -1) {
    cleanedContent = cleanedContent.substring(startIndex, endIndex + 1);
  }

  try {
    return JSON.parse(cleanedContent);
  } catch (e) {
    console.error('[NonDropExtraction] JSON parse failed:', e);
    return null;
  }
}

function transformToEnrichedCompany(raw: any): EnrichedCompany | null {
  if (!raw.name || typeof raw.name !== 'string') {
    console.warn('[NonDropExtraction] Skipping company with no name');
    return null;
  }

  const now = new Date();
  const sourceUrls = Array.isArray(raw.sourceUrls) ? raw.sourceUrls : 
    (raw.sourceUrl ? [raw.sourceUrl] : []);

  return {
    canonicalName: raw.name.trim(),
    aliases: [],
    sector: parseFieldSafely(raw, 'sector', (v) => String(v)),
    businessType: parseFieldSafely(raw, 'businessType', (v) => String(v)),
    country: parseFieldSafely(raw, 'country', (v) => String(v)),
    city: parseFieldSafely(raw, 'city', (v) => String(v)),
    streetAddress: parseFieldSafely(raw, 'streetAddress', (v) => String(v)),
    latitude: parseFieldSafely(raw, 'latitude', (v) => {
      const num = parseFloat(v);
      return isNaN(num) ? null : num;
    }),
    longitude: parseFieldSafely(raw, 'longitude', (v) => {
      const num = parseFloat(v);
      return isNaN(num) ? null : num;
    }),
    revenue: {
      ...parseFieldSafely(raw, 'revenue', (v) => {
        if (typeof v === 'number') return v;
        const num = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? null : num;
      }),
      currency: raw.revenueCurrency || null,
      fiscalYear: raw.revenueFiscalYear ? parseInt(raw.revenueFiscalYear) : null,
    },
    employees: parseFieldSafely(raw, 'employees', (v) => {
      const num = parseInt(String(v).replace(/[^0-9]/g, ''));
      return isNaN(num) ? null : num;
    }),
    website: parseFieldSafely(raw, 'website', (v) => String(v)),
    summary: parseFieldSafely(raw, 'summary', (v) => String(v)),
    sourceUrls,
    searchProvider: 'tavily',
    overallConfidence: typeof raw.confidence === 'number' ? raw.confidence : 5,
  };
}

function transformPartialCompany(raw: any): EnrichedCompany | null {
  if (!raw.name) return null;

  const now = new Date();
  const emptyField = <T>(): FieldValue<T> => ({
    value: null,
    sourceUrl: null,
    confidence: 0,
    lastUpdated: now,
  });

  return {
    canonicalName: String(raw.name).trim(),
    aliases: [],
    sector: emptyField(),
    businessType: emptyField(),
    country: emptyField(),
    city: emptyField(),
    streetAddress: emptyField(),
    latitude: emptyField(),
    longitude: emptyField(),
    revenue: { ...emptyField(), currency: null, fiscalYear: null },
    employees: emptyField(),
    website: emptyField(),
    summary: emptyField(),
    sourceUrls: [],
    searchProvider: 'tavily',
    overallConfidence: 3,
  };
}

const COUNTRY_KEYWORDS: Record<string, string> = {
  'united arab emirates': 'United Arab Emirates', 'uae': 'United Arab Emirates', 'emirates': 'United Arab Emirates', 'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', 'sharjah': 'United Arab Emirates',
  'saudi arabia': 'Saudi Arabia', 'saudi': 'Saudi Arabia', 'ksa': 'Saudi Arabia', 'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'dammam': 'Saudi Arabia',
  'qatar': 'Qatar', 'qatari': 'Qatar', 'doha': 'Qatar',
  'kuwait': 'Kuwait', 'kuwaiti': 'Kuwait',
  'bahrain': 'Bahrain', 'bahraini': 'Bahrain', 'manama': 'Bahrain',
  'oman': 'Oman', 'omani': 'Oman', 'muscat': 'Oman',
  'jordan': 'Jordan', 'amman': 'Jordan',
  'egypt': 'Egypt', 'cairo': 'Egypt',
  'iraq': 'Iraq', 'baghdad': 'Iraq',
  'iran': 'Iran', 'tehran': 'Iran',
  'lebanon': 'Lebanon', 'beirut': 'Lebanon',
  'united kingdom': 'United Kingdom', 'uk': 'United Kingdom', 'london': 'United Kingdom', 'britain': 'United Kingdom',
  'united states': 'United States', 'usa': 'United States', 'america': 'United States',
  'germany': 'Germany', 'france': 'France', 'india': 'India', 'china': 'China',
  'japan': 'Japan', 'singapore': 'Singapore', 'south korea': 'South Korea',
  'australia': 'Australia', 'canada': 'Canada', 'switzerland': 'Switzerland',
  'hong kong': 'Hong Kong', 'italy': 'Italy', 'spain': 'Spain', 'brazil': 'Brazil',
  'mexico': 'Mexico', 'south africa': 'South Africa', 'nigeria': 'Nigeria',
  'turkey': 'Turkey', 'indonesia': 'Indonesia', 'malaysia': 'Malaysia',
  'kenya': 'Kenya', 'algeria': 'Algeria', 'morocco': 'Morocco',
};

function detectCountryFromText(text: string, query: string): string | null {
  const snippetLower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, country] of sorted) {
    if (snippetLower.includes(keyword)) return country;
  }
  const queryLower = query.toLowerCase();
  for (const [keyword, country] of sorted) {
    if (queryLower.includes(keyword)) return country;
  }
  return null;
}

function extractRevenueFromSnippet(snippet: string): { value: number; currency: string } | null {
  const patterns = [
    /(?:revenue|sales|turnover)[^\d]*?(?:of\s+)?(?:(?:USD|US\$|\$)\s*)(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
    /(?:USD|US\$|\$)\s*(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)(?:\s+(?:in\s+)?revenue)?/i,
    /(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)\s*(?:USD|US\$|\$|dollars)/i,
    /(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|GBP|EUR|€|£)\s*(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
    /revenue[^\d]*?(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
  ];

  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      if (isNaN(num)) continue;

      const unit = match[2].toLowerCase();
      let multiplier = 1;
      if (unit === 'billion' || unit === 'bn' || unit === 'b') multiplier = 1e9;
      else if (unit === 'million' || unit === 'mn' || unit === 'm') multiplier = 1e6;

      const currencyMatch = snippet.match(/(USD|AED|SAR|QAR|KWD|BHD|OMR|EGP|GBP|EUR|US\$|\$|€|£)/i);
      let currency = 'USD';
      if (currencyMatch) {
        const c = currencyMatch[1].toUpperCase();
        if (c === '$' || c === 'US$') currency = 'USD';
        else if (c === '€') currency = 'EUR';
        else if (c === '£') currency = 'GBP';
        else currency = c;
      }

      return { value: num * multiplier, currency };
    }
  }
  return null;
}

function extractEmployeesFromSnippet(snippet: string): number | null {
  const patterns = [
    /(\d[\d,]*)\s*(?:\+\s*)?employees/i,
    /(?:employs?|workforce|staff|headcount)[^\d]*?(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:\+\s*)?(?:workers|people|team\s*members)/i,
  ];
  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 10 && num < 10000000) return num;
    }
  }
  return null;
}

function extractCompanyNameFromTitle(title: string): string {
  let name = title
    .replace(/\s*[-–—|:]\s*(?:Wikipedia|Forbes|Bloomberg|Reuters|Company Profile|Overview|About|Review|Careers|Jobs|News|Home|Official).*$/i, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/^(?:About|Profile|Company)\s*[-–—:]\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 2 || name.length > 100) return title.split(/[-–—|]/)[0].trim();
  return name;
}

function extractSectorFromSnippet(snippet: string, query: string): string | null {
  const sectorPatterns: [RegExp, string][] = [
    [/\b(?:power\s*generation|electricity|energy|utilities?)\b/i, 'Energy & Utilities'],
    [/\b(?:oil\s*(?:and|&)\s*gas|petroleum|hydrocarbon)\b/i, 'Oil & Gas'],
    [/\b(?:fashion|apparel|clothing|retail(?:er|ing)?)\b/i, 'Retail & Fashion'],
    [/\b(?:fmcg|consumer\s*goods|fast\s*moving)\b/i, 'FMCG'],
    [/\b(?:bank(?:ing)?|financ(?:e|ial)|insurance)\b/i, 'Financial Services'],
    [/\b(?:technolog|software|digital|IT\b|SaaS)\b/i, 'Technology'],
    [/\b(?:telecom|communications)\b/i, 'Telecommunications'],
    [/\b(?:real\s*estate|property|construction)\b/i, 'Real Estate & Construction'],
    [/\b(?:healthcare|pharma|medical|hospital)\b/i, 'Healthcare'],
    [/\b(?:luxury|watch|jewel)/i, 'Luxury Goods'],
    [/\b(?:distribut(?:or|ion)|logistics|supply\s*chain)\b/i, 'Distribution & Logistics'],
    [/\b(?:manufacturing|industrial)\b/i, 'Manufacturing'],
    [/\b(?:food|beverage|restaurant|hospitality)\b/i, 'Food & Beverage'],
    [/\b(?:mining|metals|steel)\b/i, 'Mining & Metals'],
    [/\b(?:transport|aviation|airline|shipping)\b/i, 'Transportation'],
    [/\b(?:education|university|school)\b/i, 'Education'],
    [/\b(?:media|entertainment|broadcasting)\b/i, 'Media & Entertainment'],
  ];

  const combined = (snippet + ' ' + query).toLowerCase();
  for (const [pattern, sector] of sectorPatterns) {
    if (pattern.test(combined)) return sector;
  }
  return null;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  rawContent?: string;
  domain: string;
  rank: number;
  provider: string;
}

function isGenericTitle(name: string): boolean {
  const n = name.trim();
  if (/^(?:top\s+\d+|best\s+\d+|largest|leading|list\s+of|companies?\s+in|highlights?\s+of|here\s+are|the\s+power|key\s+(?:companies|players)|driving|redefining|market)/i.test(n)) return true;
  if (/(?:deep\s+dive|major\s+(?:energy|power|companies)|arab\s+world|power\s+50|energy\s+frontier|utilities?\s+sector|redefining\s+the)/i.test(n)) return true;
  if (/(?:top\s+(?:companies|players|firms)|key\s+companies|power\s+(?:companies|market)|energy\s+(?:companies|startups?)\s+(?:of|in))/i.test(n)) return true;
  if (/\.{2,}$/.test(n)) return true;
  if (n.split(/\s+/).length > 8) return true;
  return false;
}

function extractNamesFromDotSeparatedList(text: string): string[] {
  const names: string[] = [];
  const segments = text.split(/\s*[·•]\s*/);
  for (const seg of segments) {
    const cleaned = seg.replace(/^\d+[\.\)]\s*/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (cleaned.length > 2 && cleaned.length < 80 && /[A-Z]/.test(cleaned) && !isGenericTitle(cleaned)) {
      const name = cleaned.replace(/\s+/g, ' ').replace(/[,.]$/, '').trim();
      if (name.length > 2) names.push(name);
    }
  }
  return names;
}

function extractNamesFromNumberedList(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /\d+[\.\)]\s*([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?=\s*(?:\d+[\.\)]|$|\n|·|•))/gm,
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim().replace(/\*+/g, '').replace(/\s+/g, ' ').replace(/[,:]$/, '').trim();
      if (name.length > 2 && name.length < 100 && !isGenericTitle(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

export function extractCompaniesFromSearchResults(
  results: SearchResult[],
  query: string,
  limit: number,
  answer?: string
): EnrichedCompany[] {
  const now = new Date();
  const queryCountry = detectCountryFromText('', query);

  const companiesFromLists: Array<{ name: string; sourceUrl: string; snippet: string }> = [];

  for (const result of results) {
    const snippet = result.snippet || '';

    if (snippet.includes('·') || snippet.includes('•')) {
      const dotNames = extractNamesFromDotSeparatedList(snippet);
      for (const name of dotNames) {
        companiesFromLists.push({ name, sourceUrl: result.url, snippet });
      }
    }

    const numberedNames = extractNamesFromNumberedList(result.title + '\n' + snippet);
    for (const name of numberedNames) {
      companiesFromLists.push({ name, sourceUrl: result.url, snippet });
    }
  }

  if (answer) {
    if (answer.includes('·') || answer.includes('•')) {
      for (const name of extractNamesFromDotSeparatedList(answer)) {
        companiesFromLists.push({ name, sourceUrl: '', snippet: answer });
      }
    }
    for (const name of extractNamesFromNumberedList(answer)) {
      companiesFromLists.push({ name, sourceUrl: '', snippet: answer });
    }
  }

  const seen = new Set<string>();
  const companies: EnrichedCompany[] = [];

  const addCompany = (name: string, sourceUrl: string, snippetText: string) => {
    let cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/\.{2,}$/, '').trim();
    if (isGenericTitle(cleanName)) return;

    const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key) || key.length < 3) return;
    seen.add(key);

    const countryFromName = detectCountryFromText(cleanName, '');
    const countryFromUrl = sourceUrl ? detectCountryFromText(sourceUrl.replace(/https?:\/\//g, '').replace(/[.\-\/]/g, ' '), '') : null;
    const countryFromSnippet = detectCountryFromText(snippetText, '');
    const countryFromQuery = detectCountryFromText('', query);
    const country = countryFromName || countryFromUrl || countryFromSnippet || countryFromQuery;
    const revenue = extractRevenueFromSnippet(snippetText);
    const employees = extractEmployeesFromSnippet(snippetText);
    const sector = extractSectorFromSnippet(snippetText, query);

    const makeField = <T>(value: T | null, confidence: number = value ? 5 : 0): FieldValue<T> => ({
      value,
      sourceUrl: sourceUrl || null,
      confidence,
      lastUpdated: now,
    });

    companies.push({
      canonicalName: cleanName,
      aliases: [],
      sector: makeField(sector),
      businessType: makeField<string>(null),
      country: makeField(country),
      city: makeField<string>(null),
      streetAddress: makeField<string>(null),
      latitude: makeField<number>(null),
      longitude: makeField<number>(null),
      revenue: {
        ...makeField(revenue?.value || null),
        currency: revenue?.currency || null,
        fiscalYear: null,
      },
      employees: makeField(employees),
      website: makeField(sourceUrl || null),
      summary: makeField(snippetText.substring(0, 200)),
      sourceUrls: sourceUrl ? [sourceUrl] : [],
      searchProvider: 'serper',
      overallConfidence: 4,
    });
  };

  for (const item of companiesFromLists) {
    if (companies.length >= limit) break;
    addCompany(item.name, item.sourceUrl, item.snippet);
  }

  if (companies.length < limit) {
    for (const result of results) {
      if (companies.length >= limit) break;
      const name = extractCompanyNameFromTitle(result.title);
      const isGeneric = /top\s+\d+|best\s+\d+|largest|leading|list\s+of|companies?\s+in|highlights|here\s+are|key\s+players|top\s+companies|market|redefining|power\s+50/i.test(name);
      if (!isGeneric && !isGenericTitle(name)) {
        addCompany(name, result.url, result.snippet);
      }
    }
  }

  console.log(`[HeuristicExtraction] Extracted ${companies.length} companies from search results`);
  return companies;
}

export async function extractExecutivesForCompany(
  companyName: string,
  searchContext: string
): Promise<ExtractedExecutive[]> {
  const prompt = `Extract executives for "${companyName}" from the search results.

SEARCH CONTEXT:
${searchContext}

Return JSON only:
{
  "executives": [
    {"name": "John Doe", "title": "CEO", "role": "CEO", "sourceUrl": "...", "confidence": 8}
  ]
}

Roles must be one of: CEO, CFO, CHRO, CIO, CTO, OTHER
If no executives found, return {"executives": []}`;

  try {
    const content = await callLLM(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, max_tokens: 2000 }
    );

    const parsed = parseJsonResponse(content);
    
    if (!parsed || !Array.isArray(parsed.executives)) {
      return [];
    }

    return parsed.executives.map((e: any) => ({
      name: String(e.name || ''),
      title: String(e.title || ''),
      role: ['CEO', 'CFO', 'CHRO', 'CIO', 'CTO'].includes(e.role) ? e.role : 'OTHER',
      sourceUrl: e.sourceUrl || null,
      confidence: typeof e.confidence === 'number' ? e.confidence : 5,
    })).filter((e: ExtractedExecutive) => e.name.length > 0);

  } catch (error) {
    console.error('[NonDropExtraction] Executive extraction failed:', error);
    return [];
  }
}
