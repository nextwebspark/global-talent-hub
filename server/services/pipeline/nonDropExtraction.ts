import OpenAI from "openai";
import type { DiscoveredCompany, EnrichedCompany, ExtractedExecutive, FieldValue } from './types';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DEFAULT_MODEL = "google/gemini-2.5-flash-preview";

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
    const response = await openrouter.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });

    const content = response.choices[0]?.message?.content || '';
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

  } catch (error) {
    console.error('[NonDropExtraction] LLM extraction failed:', error);
    return [];
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
    const response = await openrouter.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
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
