import OpenAI from "openai";
import { randomUUID } from "crypto";
import { storage } from "../../storage";
import { createSerperAdapter } from "./serperAdapter";
import type { InferredIntent, SearchSessionCompany, ActivityEvent } from "@shared/schema";
import { applyCoordinateFallback } from "../coordinateFallback";

// All LLM calls go through OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

function makeActivity(type: ActivityEvent["type"], message: string, data?: any): ActivityEvent {
  return { id: randomUUID(), type, message, timestamp: new Date(), data };
}

function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch { return null; }
}

async function extractIntent(query: string, pdContent?: string): Promise<InferredIntent> {
  const pdContext = pdContent ? `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENT:\n${pdContent.substring(0, 3000)}` : "";

  const response = await openrouter.chat.completions.create({
    model: "anthropic/claude-sonnet-4",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are a senior research analyst extracting search intent from a business query.

USER QUERY: "${query}"${pdContext}

Analyze this query and return a JSON object with this exact structure:
{
  "primarySectors": ["array of 1-3 primary industry sectors"],
  "adjacentSectors": ["array of 2-4 adjacent/related sectors worth exploring"],
  "inferredSectors": ["array of 1-3 sectors the query doesn't mention but should explore given context"],
  "targetGeographies": ["array of countries or regions mentioned or implied"],
  "commercialRole": "distributor|retailer|manufacturer|operator|any|etc",
  "companySize": "large|mid-market|SME|any (optional)",
  "revenueRange": "e.g. '$100M-$1B' (optional)",
  "searchRationale": "2-3 sentences explaining search strategy",
  "confidenceScore": 0.85,
  "keyInclusions": ["what types of companies to include"],
  "keyExclusions": ["what types to exclude"]
}

Return ONLY the JSON, no other text.`
    }]
  });

  const parsed = parseJsonSafe(response.choices[0].message.content || "");
  if (!parsed) throw new Error("Failed to parse intent JSON");

  return {
    primarySectors: parsed.primarySectors || [],
    adjacentSectors: parsed.adjacentSectors || [],
    inferredSectors: parsed.inferredSectors || [],
    targetGeographies: parsed.targetGeographies || [],
    commercialRole: parsed.commercialRole || "any",
    companySize: parsed.companySize,
    revenueRange: parsed.revenueRange,
    searchRationale: parsed.searchRationale || "",
    confidenceScore: parsed.confidenceScore || 0.7,
    keyInclusions: parsed.keyInclusions || [],
    keyExclusions: parsed.keyExclusions || [],
    refinementSummary: parsed.refinementSummary,
  };
}

async function searchCompaniesForSector(
  sector: string,
  geographies: string[],
  query: string
): Promise<Array<{ name: string; website?: string; snippet?: string; url?: string }>> {
  const serper = createSerperAdapter();
  if (!serper) return [];

  const geoStr = geographies.slice(0, 3).join(", ");
  const searchQuery = `top ${sector} companies ${geoStr} list 2024 2025`;

  try {
    const result = await serper.searchWithAnswer(searchQuery, 10);
    const companies: Array<{ name: string; website?: string; snippet?: string; url?: string }> = [];

    for (const r of result.results.slice(0, 8)) {
      const names = extractCompanyNamesFromResult(r.title, r.snippet, r.url);
      for (const name of names) {
        companies.push({ name, website: r.url, snippet: r.snippet, url: r.url });
      }
    }

    return companies.slice(0, 12);
  } catch (err) {
    console.warn(`[EnhancedPipeline] Serper search failed for ${sector}:`, err);
    return [];
  }
}

function extractCompanyNamesFromResult(title: string, snippet: string, url: string): string[] {
  const names: string[] = [];

  const listPattern = /(?:\d+[\.\)]\s+)([A-Z][A-Za-z0-9\s&\-'\.,:()]{2,60}?)(?=\s*(?:\d+[\.\)]|$|\n|·|•|–|--))/g;
  const bulletPattern = /(?:^|\n)\s*[-•*]\s*([A-Z][A-Za-z0-9\s&\-'\.]{2,60}?)(?=\s*(?:[-•*]|$|\n))/gm;

  const titleName = title
    .replace(/\s*[-–—|:]\s*(?:Wikipedia|Forbes|Bloomberg|Reuters|Company Profile|Overview|About|Review|Careers|Jobs|News|Home|Official|Top \d+|List of|Best .+).*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .trim();

  const COMPANY_SUFFIXES = /\b(?:group|corp|inc|ltd|co|holdings|company|llc|sa|saog|international|trading|distribution|retail|enterprises|plc|ag|gmbh|spa|nv|bv|industries|partners|capital|investments|bank|logistics|solutions|services|ventures|associates|consulting)\b/i;
  
  if (titleName.length > 2 && titleName.length < 80 && COMPANY_SUFFIXES.test(titleName)) {
    names.push(titleName);
  }

  const text = `${title} ${snippet}`;
  let match;
  while ((match = listPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n)) names.push(n);
  }
  while ((match = bulletPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n)) names.push(n);
  }

  return Array.from(new Set(names)).slice(0, 5);
}

function isGenericPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const bad = ["top", "best", "largest", "leading", "biggest", "major", "list", "company", "companies", "business", "market", "industry", "you", "we", "here", "click", "read"];
  return bad.some(p => lower === p || lower.startsWith(p + " ") || lower.endsWith(" " + p));
}

function normalizeCompanyKey(name: string, website?: string): string {
  // Deduplicate by name slug + optional domain
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (website) {
    try {
      const domain = new URL(website).hostname.replace(/^www\./, "");
      return `${slug}::${domain}`;
    } catch (_urlErr) {
      // Invalid URL — fall back to slug-only key
    }
  }
  return slug;
}

async function enrichCompanyWithGPT4o(
  companyName: string,
  sector: string,
  geographies: string[],
  intent: InferredIntent,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred"
): Promise<Partial<SearchSessionCompany>> {
  const geoStr = geographies.join(", ");
  const prompt = `Research the company "${companyName}" in the ${sector} sector, operating in ${geoStr}.

Return JSON with this structure:
{
  "sector": "specific sector",
  "country": "headquarters country",
  "geography": "e.g. 'UAE', 'Middle East', 'GCC' — primary market geography",
  "revenue": "e.g. '$500M' or null",
  "employees": 5000,
  "website": "https://example.com or null",
  "summary": "2-3 sentence company overview",
  "relevanceRationale": "one sentence why this company is relevant to the search",
  "confidenceScore": 75
}

Return ONLY the JSON.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = parseJsonSafe(content);

    if (!parsed) return { relevanceType, relevanceRationale: `Relevant to ${sector} in ${geoStr}`, confidenceScore: 50 };

    return {
      sector: parsed.sector || sector,
      country: parsed.country || null,
      geography: parsed.geography || null,
      revenue: parsed.revenue || null,
      employees: parsed.employees || null,
      website: parsed.website || null,
      summary: parsed.summary || null,
      relevanceType,
      relevanceRationale: parsed.relevanceRationale || `Relevant to ${sector}`,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 60)),
    };
  } catch {
    return {
      relevanceType,
      relevanceRationale: `Relevant to ${sector} in ${geoStr}`,
      confidenceScore: 40,
    };
  }
}

async function persistCompany(
  name: string,
  enriched: Partial<SearchSessionCompany>,
  intent: InferredIntent,
  searchQueryId: number,
  sessionId: string
): Promise<number | null> {
  try {
    const countryStr = enriched.country || intent.targetGeographies[0] || null;
    let lat: string | null = null;
    let lng: string | null = null;

    if (countryStr) {
      const fallback = applyCoordinateFallback({ latitude: null, longitude: null, country: countryStr });
      if (fallback.latitude) lat = String(fallback.latitude);
      if (fallback.longitude) lng = String(fallback.longitude);
    }

    const revenueNumeric = enriched.revenue
      ? parseFloat(enriched.revenue.replace(/[^0-9.]/g, "") || "0") * (enriched.revenue.includes("B") ? 1e9 : enriched.revenue.includes("M") ? 1e6 : 1)
      : null;

    const companyData = {
      name,
      sector: enriched.sector || intent.primarySectors[0] || null,
      country: countryStr,
      latitude: lat,
      longitude: lng,
      revenue: revenueNumeric ? String(revenueNumeric) : null,
      employees: enriched.employees || null,
      website: enriched.website || null,
      summary: enriched.summary || null,
      confidence: Math.round((enriched.confidenceScore || 60) / 10),
      relevanceReason: enriched.relevanceRationale || null,
      searchQueryId,
      relevanceType: enriched.relevanceType || null,
      relevanceRationale: enriched.relevanceRationale || null,
      confidenceScore: enriched.confidenceScore || null,
      searchSessionId: sessionId,
    };

    const { company } = await storage.upsertCompanyNonDestructive(companyData as Parameters<typeof storage.upsertCompanyNonDestructive>[0], searchQueryId, {});

    return company.id;
  } catch (err) {
    console.error(`[EnhancedPipeline] Failed to persist ${name}:`, err);
    return null;
  }
}

export async function* runEnhancedSearchPipeline(
  query: string,
  sessionId: string,
  searchQueryId: number,
  pdContent?: string,
  signal?: AbortSignal,
  precomputedIntent?: InferredIntent,
  changedCriteria?: string[]  // If set, only run passes for these changed dimensions
): AsyncGenerator<ActivityEvent> {

  const emit = (type: ActivityEvent["type"], message: string, data?: any): ActivityEvent => {
    return makeActivity(type, message, data);
  };

  // Update session to searching
  try {
    await storage.updateSearchSession(sessionId, { status: "searching", searchQueryId });
  } catch (sessionErr) {
    console.warn("[Pipeline] Could not update session status to searching:", sessionErr);
  }

  let intent: InferredIntent;
  if (precomputedIntent) {
    // Use the already-computed intent (e.g. from refinement path) — skip extraction
    intent = precomputedIntent;
    yield emit("status", "Using refined search intent...");
    yield emit("intent_extracted", "Refined intent applied", { intent });
  } else {
    yield emit("status", "Extracting search intent...");
    try {
      intent = await extractIntent(query, pdContent);
      
      // Persist intent to session
      try {
        await storage.updateSearchSession(sessionId, { inferredIntent: intent });
      } catch (intentErr) {
        console.warn("[Pipeline] Could not persist inferred intent:", intentErr);
      }
      
      yield emit("intent_extracted", "Intent understood", { intent });
    } catch (err: any) {
      await storage.updateSearchSession(sessionId, { status: "error" }).catch(() => {});
      yield emit("error", `Failed to extract intent: ${err.message}`);
      return;
    }
  }

  if (signal?.aborted) return;

  const seenKeys = new Set<string>();
  const companies: SearchSessionCompany[] = [];
  let companyCounter = 0;

  const searchAndEmit = async function* (
    sector: string,
    relevanceType: "Direct" | "Adjacent" | "AI Inferred"
  ): AsyncGenerator<ActivityEvent> {
    if (signal?.aborted) return;

    yield emit("status", `Searching ${sector}...`);

    const rawCompanies = await searchCompaniesForSector(sector, intent.targetGeographies, query);

    for (const raw of rawCompanies) {
      if (signal?.aborted) return;
      
      // Deduplicate by name+domain key
      const key = normalizeCompanyKey(raw.name, raw.website);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      yield emit("company_found", `Found: ${raw.name}`, { companyName: raw.name, name: raw.name, sector, relevanceType });

      if (companyCounter >= 40) continue;

      const enriched = await enrichCompanyWithGPT4o(raw.name, sector, intent.targetGeographies, intent, relevanceType);
      const companyId = await persistCompany(raw.name, enriched, intent, searchQueryId, sessionId);

      const company: SearchSessionCompany = {
        id: companyId ?? companyCounter,
        name: raw.name,
        sector: enriched.sector || sector,
        country: enriched.country || null,
        geography: enriched.geography || null,
        revenue: enriched.revenue || null,
        employees: enriched.employees || null,
        website: enriched.website || null,
        summary: enriched.summary || null,
        latitude: null,
        longitude: null,
        relevanceType,
        relevanceRationale: enriched.relevanceRationale || `Relevant to ${sector}`,
        confidenceScore: enriched.confidenceScore || 50,
        isUserAccepted: false,
        isUserRejected: false,
      };

      companies.push(company);
      companyCounter++;

      yield emit("company_enriched", `Enriched: ${raw.name}`, { company });
    }
  };

  // If changedCriteria is specified (refinement mode), determine which passes to run.
  // Any non-sector/geo criteria (commercialRole, revenue, employees, titleFocus, etc.)
  // maps to the "filters" dimension — which triggers a fresh primary-sector search pass
  // with the updated intent/filters applied. This ensures no refinement can ever be a no-op.
  const SECTOR_CRITERIA = ["sectors", "primarySectors", "adjacentSectors", "inferredSectors"];
  const GEO_CRITERIA = ["geographies", "targetGeographies", "geography"];
  const FILTER_CRITERIA = ["filters", "commercialRole", "revenue", "employees", "titleFocus", "companySize", "other"];

  let runSectors = true;
  let runGeographies = true;
  let runFilters = true;

  if (changedCriteria && changedCriteria.length > 0 && !changedCriteria.includes("all")) {
    runSectors = changedCriteria.some(c => SECTOR_CRITERIA.includes(c));
    runGeographies = changedCriteria.some(c => GEO_CRITERIA.includes(c));
    // Any non-sector, non-geo criteria triggers a "filters" pass on primary sectors
    const hasFilterCriteria = changedCriteria.some(c => FILTER_CRITERIA.includes(c) || (!SECTOR_CRITERIA.includes(c) && !GEO_CRITERIA.includes(c)));
    runFilters = hasFilterCriteria;
    // Safety: if nothing is set to run, fall back to running all primary sector passes
    if (!runSectors && !runGeographies && !runFilters) {
      runSectors = true;
      runGeographies = true;
      runFilters = true;
    }
  }

  // Primary sectors always run unless ONLY adjacent/inferred sectors changed
  if (runSectors || runGeographies || runFilters) {
    for (const sector of intent.primarySectors) {
      if (signal?.aborted) return;
      for await (const ev of searchAndEmit(sector, "Direct")) yield ev;
    }
  }

  if (runSectors) {
    for (const sector of intent.adjacentSectors) {
      if (signal?.aborted) return;
      yield emit("adjacent_sector_found", `Exploring adjacent sector: ${sector}`, { sector });
      for await (const ev of searchAndEmit(sector, "Adjacent")) yield ev;
    }

    for (const sector of (intent.inferredSectors || [])) {
      if (signal?.aborted) return;
      yield emit("adjacent_sector_found", `AI-inferred sector: ${sector}`, { sector });
      for await (const ev of searchAndEmit(sector, "AI Inferred")) yield ev;
    }
  }

  if (!signal?.aborted) {
    const topCompanies = companies
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 20);

    for (const company of topCompanies) {
      if (signal?.aborted) break;
      try {
        const serper = createSerperAdapter();
        if (!serper) continue;
        const execQuery = `"${company.name}" CEO CFO leadership team ${company.country || ""}`;
        const execResult = await serper.searchWithAnswer(execQuery, 3);
        
        if (execResult.results.length > 0) {
          const snippet = execResult.results[0].snippet || "";
          const execMatches = snippet.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?),?\s+(?:CEO|CFO|President|Chairman|Managing Director|Chief Executive)/g);
          
          if (execMatches) {
            for (const match of execMatches.slice(0, 2)) {
              const parts = match.split(/,\s+/);
              const name = parts[0].trim();
              const title = (parts[1] || "Executive").trim();
              
              if (name && name.split(" ").length >= 2) {
                yield emit("executive_found", `Found executive: ${name} at ${company.name}`, {
                  executive: { name, title },
                  companyId: company.id,
                  companyName: company.name,
                });

                try {
                  if (typeof company.id === "number" && company.id > 0) {
                    await storage.createExecutiveFromDiscovery({
                      companyId: company.id,
                      name,
                      title,
                      source: "AI Search",
                      confidence: 5,
                    });
                  }
                } catch (execErr) {
                  console.warn("[Pipeline] Could not persist executive:", execErr);
                }
              }
            }
          }
        }
      } catch (execFetchErr) {
        console.warn("[Pipeline] Executive enrichment failed:", execFetchErr);
      }
    }
  }

  // Mark session complete
  try {
    await storage.updateSearchSession(sessionId, { status: "complete" });
  } catch (completionErr) {
    console.warn("[Pipeline] Could not mark session complete:", completionErr);
  }

  yield emit("search_complete", `Search complete: ${companies.length} companies found`, {
    totalCompanies: companies.length,
    searchQueryId,
    sessionId,
  });
}
