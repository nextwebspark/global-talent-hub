import OpenAI from "openai";
import { storage } from "../../storage";
import type { Company } from "@shared/schema";
import { SerperAdapter, createSerperAdapter } from './serperAdapter';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";
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
  role: 'CEO' | 'CFO' | 'OTHER';
  sourceUrl: string | null;
  confidence: number;
}

async function callLlm(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    const response = await openrouter.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 1000,
    });
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.log(`[Enrichment] Primary model failed, trying fallback...`);
    const response = await openrouter.chat.completions.create({
      model: FALLBACK_MODEL,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 1000,
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
  const searchProvider = createSerperAdapter();
  if (!searchProvider) {
    return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false, currency: null, fiscalYear: null };
  }

  const query = `"${companyName}" revenue annual report ${country || ''} 2024 OR 2023`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 5);
    
    if (searchResults.results.length === 0) {
      return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false, currency: null, fiscalYear: null };
    }

    let context = '';
    if (searchResults.answer) {
      context += `Summary: ${searchResults.answer}\n\n`;
    }
    context += searchResults.results.slice(0, 4).map((r, i) => 
      `[${i+1}] ${r.title} (${r.url})\n${r.snippet}`
    ).join('\n\n');

    const prompt = `Extract ANNUAL REVENUE for "${companyName}". Only use figures labeled "revenue/total revenue". Return JSON: {"found":bool,"revenue":number,"currency":"USD","fiscalYear":2024,"sourceUrl":"https://...","sourceDescription":"Annual Report"} or {"found":false}

${context}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found && parsed.revenue) {
      console.log(`[Enrichment] Found revenue for ${companyName}: ${parsed.currency} ${parsed.revenue}`);
      return {
        value: parsed.revenue,
        currency: parsed.currency,
        fiscalYear: parsed.fiscalYear,
        sourceUrl: parsed.sourceUrl || null,
        sourceDescription: parsed.sourceDescription,
        confidence: 7,
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
  const searchProvider = createSerperAdapter();
  if (!searchProvider) {
    return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
  }

  const query = `"${companyName}" employees headcount ${country || ''} 2024`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 4);
    
    if (searchResults.results.length === 0) {
      return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
    }

    let context = '';
    if (searchResults.answer) {
      context += `Summary: ${searchResults.answer}\n\n`;
    }
    context += searchResults.results.slice(0, 3).map((r, i) => 
      `[${i+1}] ${r.title} (${r.url})\n${r.snippet}`
    ).join('\n\n');

    const prompt = `Extract employee count for "${companyName}". Return JSON: {"found":bool,"employees":number,"sourceUrl":"https://...","sourceDescription":"LinkedIn"} or {"found":false}

${context}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found && parsed.employees) {
      console.log(`[Enrichment] Found employees for ${companyName}: ${parsed.employees}`);
      return {
        value: parsed.employees,
        sourceUrl: parsed.sourceUrl || null,
        sourceDescription: parsed.sourceDescription,
        confidence: 6,
        found: true,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] Employee search failed for ${companyName}:`, error);
  }

  return { value: null, sourceUrl: null, sourceDescription: null, confidence: 0, found: false };
}

async function enrichSingleExecutive(
  companyName: string,
  country: string | null,
  role: 'CEO' | 'CFO'
): Promise<ExecutiveEnrichment | null> {
  const searchProvider = createSerperAdapter();
  if (!searchProvider) return null;

  const query = `"${companyName}" ${role} ${country || ''} 2024`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 3);
    if (searchResults.results.length === 0) return null;

    let context = searchResults.answer || '';
    context += '\n' + searchResults.results.slice(0, 2).map(r => r.snippet).join('\n');

    const prompt = `Find the ${role} of "${companyName}". Return JSON: {"found":bool,"name":"Full Name","title":"Title"} or {"found":false}

${context}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found && parsed.name) {
      console.log(`[Enrichment] Found ${role} for ${companyName}: ${parsed.name}`);
      return {
        name: parsed.name,
        title: parsed.title || role,
        role,
        sourceUrl: null,
        confidence: 6,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] ${role} search failed for ${companyName}:`, error);
  }
  return null;
}

export async function enrichExecutives(
  companyName: string,
  country: string | null
): Promise<ExecutiveEnrichment[]> {
  const [ceo, cfo] = await Promise.all([
    enrichSingleExecutive(companyName, country, 'CEO'),
    enrichSingleExecutive(companyName, country, 'CFO'),
  ]);
  
  return [ceo, cfo].filter((e): e is ExecutiveEnrichment => e !== null);
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
  
  const needsRevenue = options.revenue && !company.revenue;
  const needsEmployees = options.employees && !company.employees;
  const existingExecs = await storage.getExecutivesByCompany(companyId);
  const needsExecutives = options.executives && existingExecs.length === 0;

  console.log(`[MultiPass] Enriching ${company.name} (rev:${needsRevenue}, emp:${needsEmployees}, exec:${needsExecutives})...`);

  const [revenueData, employeesData, executives] = await Promise.all([
    needsRevenue ? enrichRevenue(company.name, company.country) : Promise.resolve(null),
    needsEmployees ? enrichEmployees(company.name, company.country) : Promise.resolve(null),
    needsExecutives ? enrichExecutives(company.name, company.country) : Promise.resolve([]),
  ]);

  if (revenueData?.found && revenueData.value) {
    await storage.updateCompany(companyId, {
      revenue: revenueData.value.toString(),
      revenueCurrency: revenueData.currency,
      revenueFiscalYear: revenueData.fiscalYear,
      revenueSource: revenueData.sourceDescription,
      revenueSourceUrl: revenueData.sourceUrl,
      revenueConfidence: revenueData.confidence,
    });
    result.revenueUpdated = true;
  }

  if (employeesData?.found && employeesData.value) {
    await storage.updateCompany(companyId, {
      employees: employeesData.value,
      employeesSource: employeesData.sourceDescription,
      employeesSourceUrl: employeesData.sourceUrl,
      employeesConfidence: employeesData.confidence,
    });
    result.employeesUpdated = true;
  }

  for (const exec of executives) {
    try {
      await storage.createExecutiveFromDiscovery({
        companyId,
        name: exec.name,
        title: exec.title,
        source: 'Enrichment',
        confidence: exec.confidence,
      });
      result.executivesAdded++;
    } catch (error) {
      console.error(`[MultiPass] Failed to add executive ${exec.name}:`, error);
    }
  }

  console.log(`[MultiPass] Done ${company.name}:`, result);
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

  console.log(`[MultiPass] Starting batch enrichment for ${companies.length} companies...`);

  const BATCH_SIZE = 3;
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(company => 
        runMultiPassEnrichment(company.id).catch(err => {
          console.error(`[MultiPass] Failed ${company.name}:`, err);
          return null;
        })
      )
    );
    
    for (const enrichmentResult of batchResults) {
      if (enrichmentResult) {
        result.companiesProcessed++;
        if (enrichmentResult.revenueUpdated) result.revenueEnriched++;
        if (enrichmentResult.employeesUpdated) result.employeesEnriched++;
        result.executivesAdded += enrichmentResult.executivesAdded;
      }
    }
  }

  console.log(`[MultiPass] Batch complete:`, result);
  return result;
}
