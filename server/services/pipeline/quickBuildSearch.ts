import OpenAI from "openai";
import { storage } from "../../storage";
import type { EnrichedCompany, FieldValue, CompanyPersistResult } from './types';
import type { InsertCompany, InsertExecutive } from '@shared/schema';
import { applyCoordinateFallback } from '../coordinateFallback';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const MODELS = [
  "anthropic/claude-opus-4.5",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function callLLM(prompt: string): Promise<string | null> {
  for (const model of MODELS) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [{ role: "user" as const, content: prompt }],
        temperature: 0.2,
        max_tokens: 12000,
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) {
        console.log(`[QuickBuild] Succeeded with ${model}`);
        return content;
      }
    } catch (error: any) {
      console.warn(`[QuickBuild] ${model} failed: ${error.message}`);
    }
  }
  return null;
}

interface ExecutiveIntent {
  requested: boolean;
  roleCode: string | null;
  roleLabel: string | null;
}

function detectExecutiveIntent(query: string): ExecutiveIntent {
  const q = query.toLowerCase();

  const rolePatterns: Array<{ pattern: RegExp; roleCode: string; roleLabel: string }> = [
    { pattern: /\b(?:ceos?|chief executive officers?|managing directors?)\b/, roleCode: 'CEO', roleLabel: 'CEO / Chief Executive Officer' },
    { pattern: /\b(?:cfos?|chief financial officers?|finance directors?|head of finance|vp finance|financial controllers?)\b/, roleCode: 'CFO', roleLabel: 'CFO / Chief Financial Officer' },
    { pattern: /\b(?:chros?|chief (?:human resources|people|talent) officers?|hr directors?|head of (?:hr|human resources|people|talent))\b/, roleCode: 'CHRO', roleLabel: 'CHRO / Chief Human Resources Officer' },
    { pattern: /\b(?:cios?|chief information officers?|head of (?:it|information technology))\b/, roleCode: 'CIO', roleLabel: 'CIO / Chief Information Officer' },
    { pattern: /\b(?:ctos?|chief technology officers?|head of (?:technology|engineering)|vp engineering)\b/, roleCode: 'CTO', roleLabel: 'CTO / Chief Technology Officer' },
    { pattern: /\b(?:coos?|chief operating officers?|head of operations)\b/, roleCode: 'OTHER', roleLabel: 'COO / Chief Operating Officer' },
    { pattern: /\b(?:cmos?|chief marketing officers?|head of marketing|vp marketing)\b/, roleCode: 'OTHER', roleLabel: 'CMO / Chief Marketing Officer' },
    { pattern: /\b(?:chairman|chairmen|chairwoman|chairwomen|chairpersons?|board chairs?)\b/, roleCode: 'OTHER', roleLabel: 'Chairman / Chairperson' },
    { pattern: /\b(?:founders?|co-founders?|cofounders?)\b/, roleCode: 'OTHER', roleLabel: 'Founder / Co-Founder' },
  ];

  for (const { pattern, roleCode, roleLabel } of rolePatterns) {
    if (pattern.test(q)) {
      return { requested: true, roleCode, roleLabel };
    }
  }

  const personSeekingVerbs = /\b(?:find|list|who is|who are|show|identify|get|name)\b/;
  const executiveTerms = /\b(?:executive[s]?|c-suite|senior leader(?:s|ship)?|board member[s]?)\b/;
  if (personSeekingVerbs.test(q) && executiveTerms.test(q)) {
    return { requested: true, roleCode: null, roleLabel: null };
  }

  if (/\b(?:and their|with their|include(?:ing)?)\b/.test(q) && executiveTerms.test(q)) {
    return { requested: true, roleCode: null, roleLabel: null };
  }

  return { requested: false, roleCode: null, roleLabel: null };
}

function buildQuickBuildPrompt(query: string, limit: number): string {
  const execIntent = detectExecutiveIntent(query);

  let executiveInstructions: string;
  let executiveJsonBlock: string;

  if (!execIntent.requested) {
    executiveInstructions = `- Do NOT include any executives. Set "executives" to an empty array [].
- The user has not asked for executive/people data — only return company information.`;
    executiveJsonBlock = `      "executives": []`;
  } else if (execIntent.roleLabel) {
    executiveInstructions = `- The user is specifically looking for: ${execIntent.roleLabel}
- For each company, include ONLY the person who holds the ${execIntent.roleLabel} role or the closest equivalent.
  - For example, if looking for CFO, acceptable titles include: Chief Financial Officer, Finance Director, Head of Finance, VP Finance, Group CFO, etc.
  - Do NOT include other C-suite roles (no CEO if looking for CFO, etc.)
- Include at most 1 executive per company — the best match for "${execIntent.roleLabel}"
- If you cannot identify the ${execIntent.roleLabel} for a company, set "executives" to an empty array []`;
    executiveJsonBlock = `      "executives": [
        {
          "name": "Full Name",
          "title": "Actual Title (e.g. Chief Financial Officer)",
          "role": "${execIntent.roleCode}",
          "linkedinUrl": null,
          "gender": "male",
          "ethnicity": "Arab"
        }
      ]`;
  } else {
    executiveInstructions = `- The user wants executive/leadership data.
- For each company, include the top 3-5 C-suite or senior leaders you are confident about.
- Include LinkedIn URLs for executives only if you are confident they are correct.`;
    executiveJsonBlock = `      "executives": [
        {
          "name": "Full Name",
          "title": "Chief Executive Officer",
          "role": "CEO",
          "linkedinUrl": null,
          "gender": "male",
          "ethnicity": "Arab"
        }
      ]`;
  }

  return `You are an expert business research analyst. A user needs structured data about companies.

USER QUERY: "${query}"

Return up to ${limit} companies that best match this query. For each company, provide as much data as you can from your training knowledge.

IMPORTANT GUIDELINES:
- Only include companies you are confident actually exist
- Provide accurate revenue figures (in USD) where known — use the most recent available data
- Provide employee counts where known
- Provide the correct HQ country
- Provide accurate latitude/longitude for the company headquarters
${executiveInstructions}
- Classify the sector accurately
- The "businessType" should describe their commercial role (e.g., "distributor", "manufacturer", "retailer", "operator", "conglomerate")

Return ONLY valid JSON in this exact format:
{
  "companies": [
    {
      "name": "Company Name",
      "country": "Full Country Name",
      "sector": "Industry Sector",
      "businessType": "commercial role",
      "city": "HQ City",
      "latitude": 25.2048,
      "longitude": 55.2708,
      "revenue": 5000000000,
      "revenueCurrency": "USD",
      "revenueFiscalYear": 2024,
      "employees": 15000,
      "website": "https://example.com",
      "summary": "Brief 1-2 sentence description of the company and what they do",
      "confidence": 8,
${executiveJsonBlock}
    }
  ]
}

Revenue should be a number in raw USD (e.g., 5000000000 for $5B, 500000000 for $500M).
Confidence should be 1-10 (10 = very confident the data is accurate).
Role must be one of: CEO, CFO, CHRO, CIO, CTO, OTHER.
Gender should be one of: male, female, or null if unknown.`;
}

function makeField<T>(value: T | null | undefined, confidence: number = 5): FieldValue<T> {
  return {
    value: value ?? null,
    sourceUrl: null,
    confidence,
    lastUpdated: new Date(),
  };
}

function transformLLMCompany(raw: any): EnrichedCompany | null {
  if (!raw.name || typeof raw.name !== 'string') return null;

  const confidence = Math.min(10, Math.max(1, raw.confidence ?? 6));

  return {
    canonicalName: raw.name.trim(),
    aliases: [],
    sector: makeField(raw.sector || null, confidence),
    businessType: makeField(raw.businessType || null, confidence),
    country: makeField(raw.country || null, confidence),
    city: makeField(raw.city || null, confidence),
    streetAddress: makeField<string>(null, 0),
    latitude: makeField(typeof raw.latitude === 'number' ? raw.latitude : null, confidence),
    longitude: makeField(typeof raw.longitude === 'number' ? raw.longitude : null, confidence),
    revenue: {
      value: typeof raw.revenue === 'number' ? raw.revenue : null,
      sourceUrl: null,
      confidence,
      lastUpdated: new Date(),
      currency: raw.revenueCurrency || 'USD',
      fiscalYear: raw.revenueFiscalYear || null,
    },
    employees: makeField(typeof raw.employees === 'number' ? raw.employees : null, confidence),
    website: makeField(raw.website || null, confidence),
    summary: makeField(raw.summary || null, confidence),
    sourceUrls: [],
    searchProvider: 'llm-quick-build',
    overallConfidence: confidence,
  };
}

function transformToInsertCompany(enriched: EnrichedCompany): InsertCompany {
  let latitude = enriched.latitude.value;
  let longitude = enriched.longitude.value;
  let locationPrecision = 'unknown';

  if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
    locationPrecision = 'exact';
  } else {
    const fallback = applyCoordinateFallback({
      city: enriched.city.value || undefined,
      country: enriched.country.value || undefined,
    });
    latitude = fallback.latitude || null;
    longitude = fallback.longitude || null;
    locationPrecision = fallback.locationPrecision;
  }

  const safeInt = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v));
    return isNaN(n) || !isFinite(n) ? null : n;
  };

  return {
    name: enriched.canonicalName,
    sector: enriched.sector.value,
    businessType: enriched.businessType.value,
    country: enriched.country.value,
    streetAddress: enriched.streetAddress.value,
    latitude: latitude?.toString() || null,
    longitude: longitude?.toString() || null,
    locationPrecision,
    revenue: enriched.revenue.value?.toString() || null,
    revenueCurrency: enriched.revenue.currency,
    revenueFiscalYear: safeInt(enriched.revenue.fiscalYear),
    employees: safeInt(enriched.employees.value),
    website: enriched.website.value,
    summary: enriched.summary.value,
    confidence: safeInt(enriched.overallConfidence) ?? 5,
  };
}

export async function* runQuickBuildSearch(
  query: string,
  limit: number,
  searchQueryId: number
): AsyncGenerator<any> {
  yield { type: 'status', data: { message: 'Generating results...', progress: 10 } };

  const prompt = buildQuickBuildPrompt(query, limit);

  let response: string | null;
  try {
    response = await callLLM(prompt);
  } catch (error: any) {
    yield { type: 'error', data: { message: `LLM call failed: ${error.message}`, code: 'LLM_FAILED' } };
    return;
  }

  if (!response) {
    yield { type: 'error', data: { message: 'No response from AI model. Please try again.', code: 'LLM_EMPTY' } };
    return;
  }

  yield { type: 'status', data: { message: 'Processing results...', progress: 50 } };

  const parsed = parseJsonSafe(response);
  if (!parsed || !Array.isArray(parsed.companies)) {
    yield { type: 'error', data: { message: 'Failed to parse AI response. Please try again.', code: 'PARSE_FAILED' } };
    return;
  }

  const rawCompanies = parsed.companies.slice(0, limit);
  console.log(`[QuickBuild] LLM returned ${rawCompanies.length} companies`);

  yield { type: 'status', data: { message: 'Saving results...', progress: 60 } };

  let persistedCount = 0;
  let newCount = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < rawCompanies.length; i += BATCH_SIZE) {
    const batch = rawCompanies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (rawCompany: any) => {
        const enriched = transformLLMCompany(rawCompany);
        if (!enriched) return null;

        try {
          const companyData = transformToInsertCompany(enriched);

          const fieldConfidences: Record<string, number> = {};
          if (enriched.revenue.confidence > 0) fieldConfidences['revenue'] = enriched.revenue.confidence;
          if (enriched.employees.confidence > 0) fieldConfidences['employees'] = enriched.employees.confidence;
          if (enriched.country.confidence > 0) fieldConfidences['country'] = enriched.country.confidence;
          if (enriched.sector.confidence > 0) fieldConfidences['sector'] = enriched.sector.confidence;

          const { company, isNew } = await storage.upsertCompanyNonDestructive(
            companyData,
            searchQueryId,
            fieldConfidences
          );

          const executives = Array.isArray(rawCompany.executives) ? rawCompany.executives : [];
          const persistedExecs: any[] = [];
          for (const exec of executives) {
            if (!exec.name || exec.name.length < 2) continue;
            const execData: InsertExecutive = {
              companyId: company.id,
              name: exec.name,
              title: exec.title || 'Unknown',
              linkedin: exec.linkedinUrl || null,
              source: 'quick-build',
              confidence: enriched.overallConfidence,
              gender: exec.gender || null,
              genderConfidence: exec.gender ? 6 : null,
              ethnicity: exec.ethnicity || null,
              ethnicityConfidence: exec.ethnicity ? 5 : null,
            };
            try {
              const newExec = await storage.createExecutiveFromDiscovery(execData);
              persistedExecs.push(newExec);
            } catch (execErr: any) {
              console.warn(`[QuickBuild] Failed to persist executive "${exec.name}":`, execErr?.message || execErr);
            }
          }

          return { company, isNew, enriched, execCount: persistedExecs.length };
        } catch (error: any) {
          console.error(`[QuickBuild] Failed to persist "${enriched.canonicalName}":`, error);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (!result) continue;
      const { company, isNew, execCount } = result;

      persistedCount++;
      if (isNew) newCount++;

      yield {
        type: 'company',
        data: {
          id: company.id, name: company.name, country: company.country,
          sector: company.sector, revenue: company.revenue, employees: company.employees,
          latitude: company.latitude, longitude: company.longitude, isNew,
        }
      };

      if (execCount > 0) {
        yield { type: 'executives', data: { companyId: company.id, count: execCount } };
      }
    }
  }

  await storage.updateSearchQueryResultCount(searchQueryId, persistedCount);

  yield { type: 'status', data: { message: 'Search complete', progress: 100 } };
  yield {
    type: 'complete',
    data: {
      status: 'complete',
      companiesFound: rawCompanies.length,
      companiesPersisted: persistedCount,
      newCompanies: newCount,
      searchQueryId,
    }
  };
}
