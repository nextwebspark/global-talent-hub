import { getLLMClient, DEFAULT_MODEL, FAST_MODEL } from "../llmClient";
import { storage } from "../../storage";
import type { Company } from "@shared/schema";
import { createGeminiSearchAdapter } from './geminiSearchAdapter';

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
  gender?: string | null;
  genderConfidence?: number | null;
  ethnicity?: string | null;
  ethnicityConfidence?: number | null;
}

async function callLlm(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    const llm = await getLLMClient();
    const response = await llm.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 1000,
    });
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.log(`[Enrichment] Primary model failed, trying fallback...`);
    const llm = await getLLMClient();
    const response = await llm.chat.completions.create({
      model: FAST_MODEL,
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
  const searchProvider = createGeminiSearchAdapter();

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
  const searchProvider = createGeminiSearchAdapter();

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

interface CompanyProfileEnrichment {
  summary: string | null;
  coreActivity: string | null;
  operatingModel: string | null;
  revenueDrivers: string | null;
  found: boolean;
}

async function enrichCompanyProfile(
  companyName: string,
  country: string | null
): Promise<CompanyProfileEnrichment> {
  try {
    const prompt = `You are a business research analyst. Research and provide accurate, factual information about "${companyName}"${country ? ` (${country})` : ''}.

Return ONLY valid JSON with these fields:
- summary: A 2-4 sentence description of the company including what they do, their market position, and key facts
- coreActivity: What the company primarily does (1-2 sentences describing their main business)
- operatingModel: How the company operates - B2B, B2C, franchise, direct sales, etc. (1-2 sentences)
- revenueDrivers: Main sources of revenue - products, services, subscriptions, etc. (1-2 sentences)

Be accurate and factual. If you're not confident about specific information, provide what you know. Do not make up information.

Return: {"found":true,"summary":"...","coreActivity":"...","operatingModel":"...","revenueDrivers":"..."} or {"found":false}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found) {
      console.log(`[Enrichment] Got company profile for ${companyName}`);
      return {
        summary: parsed.summary || null,
        coreActivity: parsed.coreActivity || null,
        operatingModel: parsed.operatingModel || null,
        revenueDrivers: parsed.revenueDrivers || null,
        found: true,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] Company profile failed for ${companyName}:`, error);
  }
  return { summary: null, coreActivity: null, operatingModel: null, revenueDrivers: null, found: false };
}

async function inferTargetRoles(searchQueryText: string): Promise<string[]> {
  try {
    const prompt = `You are an executive search consultant. Given this search query or project title, determine what executive role(s) the user is mapping/searching for.

Search query: "${searchQueryText}"

If the query explicitly mentions or strongly implies specific roles (e.g., "CFO search", "Head of Digital", "CTO mapping", "VP Sales"), return those roles.
If the query is about a general industry/sector mapping with no specific role, return ["CEO", "CFO"] as defaults.

Return ONLY valid JSON: {"roles": ["Role1", "Role2"]}

Examples:
- "CFO search Middle East construction" → {"roles": ["CFO"]}
- "Head of Digital Transformation GCC" → {"roles": ["Chief Digital Officer", "Head of Digital Transformation"]}
- "VP Sales FMCG companies in UAE" → {"roles": ["VP Sales", "Head of Sales"]}
- "Top real estate companies Saudi Arabia" → {"roles": ["CEO", "CFO"]}
- "CTO mapping fintech London" → {"roles": ["CTO", "Chief Technology Officer"]}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && Array.isArray(parsed.roles) && parsed.roles.length > 0) {
      console.log(`[Enrichment] Inferred target roles from query "${searchQueryText}": ${parsed.roles.join(', ')}`);
      return parsed.roles.slice(0, 3);
    }
  } catch (error) {
    console.error(`[Enrichment] Role inference failed:`, error);
  }
  return ['CEO', 'CFO'];
}

async function enrichSingleExecutive(
  companyName: string,
  country: string | null,
  role: string
): Promise<ExecutiveEnrichment | null> {
  const searchProvider = createGeminiSearchAdapter();

  const query = `"${companyName}" ${role} ${country || ''} 2024`;
  
  try {
    const searchResults = await searchProvider.searchWithAnswer(query, 3);
    if (searchResults.results.length === 0) return null;

    let context = searchResults.answer || '';
    context += '\n' + searchResults.results.slice(0, 2).map(r => r.snippet).join('\n');

    const prompt = `Find the ${role} of "${companyName}". 
Infer gender and ethnicity if possible with high confidence.

Gender values: Male, Female, Non-Binary.
Ethnicity values: free-text (e.g., "South Asian", "Middle Eastern", "East Asian", "European", "African", "Latin American", "Mixed/Other").

Only provide gender/ethnicity if confidence is 8/10 or higher.

Return JSON: 
{
  "found": bool,
  "name": "Full Name",
  "title": "Title",
  "gender": "Male" | "Female" | "Non-Binary" | null,
  "genderConfidence": number (1-10) | null,
  "ethnicity": "Ethnicity Name" | null,
  "ethnicityConfidence": number (1-10) | null
} 
or {"found":false}

${context}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromResponse(response);

    if (parsed && parsed.found && parsed.name) {
      console.log(`[Enrichment] Found ${role} for ${companyName}: ${parsed.name}`);
      return {
        name: parsed.name,
        title: parsed.title || role,
        role: role as any,
        sourceUrl: null,
        confidence: 6,
        gender: parsed.gender,
        genderConfidence: parsed.genderConfidence,
        ethnicity: parsed.ethnicity,
        ethnicityConfidence: parsed.ethnicityConfidence,
      };
    }
  } catch (error) {
    console.error(`[Enrichment] ${role} search failed for ${companyName}:`, error);
  }
  return null;
}

export async function enrichExecutives(
  companyName: string,
  country: string | null,
  targetRoles?: string[]
): Promise<ExecutiveEnrichment[]> {
  const roles = targetRoles && targetRoles.length > 0 ? targetRoles : ['CEO', 'CFO'];
  const results = await Promise.all(
    roles.map(role => enrichSingleExecutive(companyName, country, role))
  );
  
  return results.filter((e): e is ExecutiveEnrichment => e !== null);
}

export async function runMultiPassEnrichment(
  companyId: number,
  options: { revenue?: boolean; employees?: boolean; executives?: boolean; profile?: boolean } = { revenue: true, employees: true, executives: true, profile: true },
  targetRoles?: string[]
): Promise<{
  revenueUpdated: boolean;
  employeesUpdated: boolean;
  executivesAdded: number;
  profileUpdated: boolean;
}> {
  const company = await storage.getCompany(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const result = { revenueUpdated: false, employeesUpdated: false, executivesAdded: 0, profileUpdated: false };
  
  const needsRevenue = options.revenue && !company.revenue;
  const needsEmployees = options.employees && !company.employees;
  const existingExecs = await storage.getExecutivesByCompany(companyId);
  const needsExecutives = options.executives && existingExecs.length === 0;
  const needsProfile = (options.profile !== false) && !company.summary;

  console.log(`[MultiPass] Enriching ${company.name} (rev:${needsRevenue}, emp:${needsEmployees}, exec:${needsExecutives}, profile:${needsProfile})...`);

  const [revenueData, employeesData, executives, profileData] = await Promise.all([
    needsRevenue ? enrichRevenue(company.name, company.country) : Promise.resolve(null),
    needsEmployees ? enrichEmployees(company.name, company.country) : Promise.resolve(null),
    needsExecutives ? enrichExecutives(company.name, company.country, targetRoles) : Promise.resolve([]),
    needsProfile ? enrichCompanyProfile(company.name, company.country) : Promise.resolve(null),
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

  if (profileData?.found) {
    await storage.updateCompany(companyId, {
      summary: profileData.summary,
      coreActivity: profileData.coreActivity,
      operatingModel: profileData.operatingModel,
      revenueDrivers: profileData.revenueDrivers,
    });
    result.profileUpdated = true;
  }

  for (const exec of executives) {
    try {
      await storage.createExecutiveFromDiscovery({
        companyId,
        name: exec.name,
        title: exec.title,
        source: 'Enrichment',
        confidence: exec.confidence,
        gender: exec.gender,
        genderConfidence: exec.genderConfidence,
        ethnicity: exec.ethnicity,
        ethnicityConfidence: exec.ethnicityConfidence,
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
  profilesEnriched: number;
}> {
  const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
  const searchQuery = await storage.getSearchQuery(searchQueryId);
  
  const result = {
    companiesProcessed: 0,
    revenueEnriched: 0,
    employeesEnriched: 0,
    executivesAdded: 0,
    profilesEnriched: 0,
  };

  let targetRoles: string[] | undefined;
  if (searchQuery?.query) {
    console.log(`[MultiPass] Inferring target roles from search query: "${searchQuery.query}"`);
    targetRoles = await inferTargetRoles(searchQuery.query);
  }

  console.log(`[MultiPass] Starting batch enrichment for ${companies.length} companies (roles: ${targetRoles?.join(', ') || 'CEO, CFO'})...`);

  const BATCH_SIZE = 3;
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(company => 
        runMultiPassEnrichment(company.id, { revenue: true, employees: true, executives: true, profile: true }, targetRoles).catch(err => {
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
        if (enrichmentResult.profileUpdated) result.profilesEnriched++;
        result.executivesAdded += enrichmentResult.executivesAdded;
      }
    }
  }

  console.log(`[MultiPass] Batch complete:`, result);
  return result;
}
