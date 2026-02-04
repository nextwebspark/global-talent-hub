import OpenAI from "openai";
import { storage } from "../../storage";
import type { Company } from "@shared/schema";
import { TavilyAdapter, createTavilyAdapter } from './tavilyAdapter';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DEFAULT_MODEL = "google/gemini-2.5-flash-preview";
const FALLBACK_MODEL = "anthropic/claude-sonnet-4";

interface EnrichmentResult<T> {
  value: T | null;
  sourceUrl: string | null;
  sourceDescription: string | null;
  confidence: number;
  found: boolean;
}

interface RevenueEnrichment extends EnrichmentResult<number> {
  currency: string | null;
  fiscalYear: number | null;
}

interface ExecutiveEnrichment {
  name: string;
  title: string;
  role: 'CEO' | 'CFO' | 'CHRO' | 'CIO' | 'CTO' | 'OTHER';
  sourceUrl: string | null;
  confidence: number;
}

async function callLlmWithFallback(
  messages: Array<{ role: string; content: string }>,
  model: string = DEFAULT_MODEL
): Promise<string> {
  try {
    const response = await openrouter.chat.completions.create({
      model,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.log(`[Enrichment] ${model} failed, trying fallback...`);
    const response = await openrouter.chat.completions.create({
      model: FALLBACK_MODEL,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content || '';
  }
}

function parseJsonFromResponse(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }
  const startIndex = cleaned.indexOf('{');
  const endIndex = cleaned.lastIndexOf('}');
  if (startIndex !== -1 && endIndex !== -1) {
    cleaned = cleaned.substring(startIndex, endIndex + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function enrichRevenue(
  companyName: string,
  country: string | null
): Promise<RevenueEnrichment> {
  const searchProvider = createTavilyAdapter();
  if (!searchProvider) {
    return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false, currency: null, fiscalYear: null };
  }

  const query = `"${companyName}" revenue annual report ${country || ''} 2024 OR 2023`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 8);
    
    if (searchResults.results.length === 0) {
      return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false, currency: null, fiscalYear: null };
    }

    let context = '';
    if (searchResults.answer) {
      context += `AI Summary: ${searchResults.answer}\n\n`;
    }
    context += searchResults.results.map((r, i) => 
      `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n${r.rawContent?.substring(0, 1500) || ''}`
    ).join('\n\n');

    const prompt = `Extract the ANNUAL REVENUE for "${companyName}" from these search results.

SEARCH RESULTS:
${context}

RULES:
1. Only accept figures explicitly labeled as "revenue", "total revenue", "net revenue", or "operating revenue"
2. Do NOT use: profit, sales, assets under management, market cap, funding, valuation
3. Must have currency (USD, AED, SAR, etc.) and fiscal year
4. Convert text to numbers: "$15.2 billion" → 15200000000
5. Prefer more recent years and higher-tier sources (annual reports > news)

Return JSON ONLY:
{
  "found": true/false,
  "revenue": number or null,
  "currency": "USD" or null,
  "fiscalYear": 2024 or null,
  "sourceUrl": "https://..." or null,
  "sourceDescription": "Annual Report 2024" or null,
  "confidence": 1-10
}`;

    const response = await callLlmWithFallback([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found) {
      console.log(`[Enrichment] Found revenue for ${companyName}: ${parsed.currency} ${parsed.revenue} (FY${parsed.fiscalYear})`);
      return {
        value: parsed.revenue,
        currency: parsed.currency,
        fiscalYear: parsed.fiscalYear,
        sourceUrl: parsed.sourceUrl,
        sourceDescription: parsed.sourceDescription,
        confidence: parsed.confidence || 5,
        found: true,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] Revenue search failed for ${companyName}:`, error);
  }

  return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false, currency: null, fiscalYear: null };
}

export async function enrichEmployees(
  companyName: string,
  country: string | null
): Promise<EnrichmentResult<number>> {
  const searchProvider = createTavilyAdapter();
  if (!searchProvider) {
    return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
  }

  const query = `"${companyName}" employees headcount workforce ${country || ''} 2024 OR 2023`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 5);
    
    if (searchResults.results.length === 0) {
      return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
    }

    let context = '';
    if (searchResults.answer) {
      context += `AI Summary: ${searchResults.answer}\n\n`;
    }
    context += searchResults.results.map((r, i) => 
      `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
    ).join('\n\n');

    const prompt = `Extract the EMPLOYEE COUNT for "${companyName}" from these search results.

SEARCH RESULTS:
${context}

RULES:
1. Look for "employees", "staff", "workforce", "headcount"
2. Use the most recent figure available
3. Return as integer (e.g., 5000 not "5,000")

Return JSON ONLY:
{
  "found": true/false,
  "employees": number or null,
  "sourceUrl": "https://..." or null,
  "sourceDescription": "LinkedIn" or null,
  "confidence": 1-10
}`;

    const response = await callLlmWithFallback([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found && parsed.employees) {
      console.log(`[Enrichment] Found employees for ${companyName}: ${parsed.employees}`);
      return {
        value: parsed.employees,
        sourceUrl: parsed.sourceUrl,
        sourceDescription: parsed.sourceDescription,
        confidence: parsed.confidence || 5,
        found: true,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] Employee search failed for ${companyName}:`, error);
  }

  return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
}

export async function enrichExecutives(
  companyName: string,
  country: string | null
): Promise<ExecutiveEnrichment[]> {
  const searchProvider = createTavilyAdapter();
  if (!searchProvider) {
    return [];
  }

  const roles = ['CEO', 'CFO', 'CHRO', 'CTO', 'CIO'];
  const executives: ExecutiveEnrichment[] = [];

  for (const role of roles) {
    const query = `"${companyName}" ${role} chief executive ${country || ''} 2024`;
    
    try {
      const searchResults = await searchProvider.searchWithAnswer(query, 5);
      
      if (searchResults.results.length === 0) continue;

      let context = '';
      if (searchResults.answer) {
        context += `AI Summary: ${searchResults.answer}\n\n`;
      }
      context += searchResults.results.map((r, i) => 
        `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
      ).join('\n\n');

      const prompt = `Find the ${role} of "${companyName}" from these search results.

SEARCH RESULTS:
${context}

RULES:
1. Only extract if you find a specific person's name
2. The title must match or be equivalent to ${role}
3. If multiple people held the role, use the most recent

Return JSON ONLY:
{
  "found": true/false,
  "name": "John Smith" or null,
  "title": "Chief Executive Officer" or null,
  "sourceUrl": "https://..." or null,
  "confidence": 1-10
}`;

      const response = await callLlmWithFallback([{ role: "user", content: prompt }]);
      const parsed = parseJsonFromResponse(response);

      if (parsed && parsed.found && parsed.name) {
        console.log(`[Enrichment] Found ${role} for ${companyName}: ${parsed.name}`);
        executives.push({
          name: parsed.name,
          title: parsed.title || role,
          role: role as any,
          sourceUrl: parsed.sourceUrl,
          confidence: parsed.confidence || 5,
        });
      }
    } catch (error) {
      console.error(`[Enrichment] ${role} search failed for ${companyName}:`, error);
    }
  }

  return executives;
}

export async function runMultiPassEnrichment(
  companyId: number,
  options: { revenue?: boolean; employees?: boolean; executives?: boolean } = { revenue: true, employees: true, executives: true }
): Promise<{
  revenueUpdated: boolean;
  employeesUpdated: boolean;
  executivesAdded: number;
}> {
  const company = await storage.getCompany(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const result = { revenueUpdated: false, employeesUpdated: false, executivesAdded: 0 };

  if (options.revenue && !company.revenue) {
    console.log(`[MultiPass] Enriching revenue for ${company.name}...`);
    const revenueData = await enrichRevenue(company.name, company.country);
    
    if (revenueData.found && revenueData.value) {
      await storage.updateCompany(companyId, {
        revenue: revenueData.value.toString(),
        revenueCurrency: revenueData.currency,
        revenueFiscalYear: revenueData.fiscalYear,
        revenueSource: revenueData.sourceDescription,
      });
      result.revenueUpdated = true;
    }
  }

  if (options.employees && !company.employees) {
    console.log(`[MultiPass] Enriching employees for ${company.name}...`);
    const employeesData = await enrichEmployees(company.name, company.country);
    
    if (employeesData.found && employeesData.value) {
      await storage.updateCompany(companyId, {
        employees: employeesData.value,
        employeesSource: employeesData.sourceDescription,
      });
      result.employeesUpdated = true;
    }
  }

  if (options.executives) {
    const existingExecs = await storage.getExecutivesByCompany(companyId);
    if (existingExecs.length === 0) {
      console.log(`[MultiPass] Enriching executives for ${company.name}...`);
      const executives = await enrichExecutives(company.name, company.country);
      
      for (const exec of executives) {
        try {
          await storage.createExecutiveFromDiscovery({
            companyId,
            name: exec.name,
            title: exec.title,
            source: exec.sourceUrl || 'Multi-pass enrichment',
            confidence: exec.confidence,
          });
          result.executivesAdded++;
        } catch (error) {
          console.error(`[MultiPass] Failed to add executive ${exec.name}:`, error);
        }
      }
    }
  }

  console.log(`[MultiPass] Enrichment complete for ${company.name}:`, result);
  return result;
}

export async function enrichSearchResults(searchQueryId: number): Promise<{
  companiesProcessed: number;
  revenueEnriched: number;
  employeesEnriched: number;
  executivesAdded: number;
}> {
  const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
  
  const result = {
    companiesProcessed: 0,
    revenueEnriched: 0,
    employeesEnriched: 0,
    executivesAdded: 0,
  };

  for (const company of companies) {
    try {
      const enrichmentResult = await runMultiPassEnrichment(company.id);
      result.companiesProcessed++;
      if (enrichmentResult.revenueUpdated) result.revenueEnriched++;
      if (enrichmentResult.employeesUpdated) result.employeesEnriched++;
      result.executivesAdded += enrichmentResult.executivesAdded;
    } catch (error) {
      console.error(`[MultiPass] Failed to enrich company ${company.id}:`, error);
    }
  }

  console.log(`[MultiPass] Batch enrichment complete:`, result);
  return result;
}
