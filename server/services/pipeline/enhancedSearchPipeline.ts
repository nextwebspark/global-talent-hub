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

// ─── Geographic validation ─────────────────────────────────────────────────

const REGION_COUNTRIES: Record<string, string[]> = {
  "middle east": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman", "jordan", "lebanon", "iraq", "iran", "syria", "palestine", "yemen", "israel", "turkey"],
  "gcc": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman"],
  "mena": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman", "egypt", "morocco", "tunisia", "algeria", "libya", "jordan", "lebanon", "iraq", "iran", "syria", "palestine", "yemen", "israel", "turkey"],
  "north africa": ["egypt", "morocco", "tunisia", "algeria", "libya"],
  "europe": ["united kingdom", "uk", "germany", "france", "italy", "spain", "netherlands", "switzerland", "sweden", "norway", "denmark", "finland", "poland", "austria", "belgium", "ireland", "portugal", "greece", "czech republic", "luxembourg", "hungary", "romania", "bulgaria", "croatia", "slovakia", "slovenia", "latvia", "lithuania", "estonia", "malta", "cyprus", "iceland", "serbia", "ukraine", "russia"],
  "north america": ["united states", "usa", "canada", "mexico"],
  "americas": ["united states", "usa", "canada", "mexico", "brazil", "argentina", "chile", "colombia", "peru", "venezuela", "ecuador", "bolivia", "uruguay", "paraguay", "costa rica", "panama", "guatemala", "dominican republic"],
  "latin america": ["mexico", "brazil", "argentina", "chile", "colombia", "peru", "venezuela", "ecuador", "bolivia"],
  "asia pacific": ["china", "japan", "south korea", "india", "australia", "new zealand", "singapore", "hong kong", "taiwan", "malaysia", "thailand", "indonesia", "philippines", "vietnam", "bangladesh", "pakistan", "sri lanka"],
  "southeast asia": ["singapore", "malaysia", "thailand", "indonesia", "philippines", "vietnam", "cambodia", "myanmar", "laos", "brunei"],
  "south asia": ["india", "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan", "maldives"],
  "africa": ["south africa", "nigeria", "kenya", "ghana", "ethiopia", "egypt", "morocco", "algeria", "tanzania", "uganda", "rwanda", "angola", "mozambique", "zimbabwe", "zambia"],
  "sub-saharan africa": ["south africa", "nigeria", "kenya", "ghana", "ethiopia", "tanzania", "uganda", "rwanda", "angola", "mozambique", "zimbabwe", "zambia", "senegal", "cameroon"],
};

/** Expand target geographies (which may be region names or country names) into a
 *  flat normalised set of country names. */
function resolveGeoSet(targetGeographies: string[]): Set<string> {
  const resolved = new Set<string>();
  for (const geo of targetGeographies) {
    const norm = geo.toLowerCase().trim();
    if (REGION_COUNTRIES[norm]) {
      for (const c of REGION_COUNTRIES[norm]) resolved.add(c);
    } else {
      resolved.add(norm);
    }
  }
  return resolved;
}

/** Return true if the enriched country is within the target geography set.
 *  Returns true (don't filter) when targetGeographies is empty or country is unknown. */
function isCountryInScope(country: string | null | undefined, geoSet: Set<string>): boolean {
  if (geoSet.size === 0) return true;
  if (!country) return true; // unknown — allow through (low confidence)
  return geoSet.has(country.toLowerCase().trim());
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
  commercialRole?: string
): Promise<Array<{ name: string; website?: string; snippet?: string; url?: string }>> {
  const serper = createSerperAdapter();
  if (!serper) return [];

  // Use the primary geography only — more geographies increases listicle noise
  const mainGeo = geographies[0] || "";

  // Include commercial role (e.g. "distributor", "manufacturer") when it is specific.
  // Omit when it is "any" or empty so the query stays clean.
  const roleStr = commercialRole && commercialRole !== "any" ? ` ${commercialRole}` : "";

  // Avoid "list" / years — they attract listicle articles that mix all sectors.
  // Avoid "top" — it attracts ranking pages. Use focused query with role.
  const searchQuery = `${sector}${roleStr} companies in ${mainGeo}`;

  try {
    const result = await serper.searchWithAnswer(searchQuery, 10);
    const companies: Array<{ name: string; website?: string; snippet?: string; url?: string }> = [];

    for (const r of result.results.slice(0, 8)) {
      // Skip results whose title looks like a listicle/ranking article entirely.
      // These snippets contain mixed-sector company lists that can't be trusted.
      if (ARTICLE_TITLE_RE.test(r.title || "")) continue;

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

// Patterns that indicate an article/listicle title rather than a company name.
// E.g. "Top 20 Logistics Companies In Dubai", "Top FMCG Companies in UAE",
// "Best FMCG Companies 2025", "List of distributors in UAE",
// "10 Leading companies in GCC", "The Biggest Pharma Companies",
// "Leading Distributors in KSA", "Key Players in FMCG"
const ARTICLE_TITLE_RE = /^(?:top\s+|best\s+|leading\s+|biggest\s+|major\s+|key\s+|the\s+(?:top|best|biggest|leading|major)\s+|list\s+of\s+|\d+\s+|the\s+\d+)/i;

function extractCompanyNamesFromResult(title: string, snippet: string, url: string): string[] {
  const names: string[] = [];

  const listPattern = /(?:\d+[\.\)]\s+)([A-Z][A-Za-z0-9\s&\-'\.,:()]{2,60}?)(?=\s*(?:\d+[\.\)]|$|\n|·|•|–|--))/g;
  const bulletPattern = /(?:^|\n)\s*[-•*]\s*([A-Z][A-Za-z0-9\s&\-'\.]{2,60}?)(?=\s*(?:[-•*]|$|\n))/gm;

  const titleName = title
    .replace(/\s*[-–—|:]\s*(?:Wikipedia|Forbes|Bloomberg|Reuters|Company Profile|Overview|About|Review|Careers|Jobs|News|Home|Official|Top \d+|List of|Best .+).*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*\(\d{4}(?:\s+List)?\)\s*$/i, "")  // strip "(2024)" / "(2025 List)"
    .trim();

  const COMPANY_SUFFIXES = /\b(?:group|corp|inc|ltd|co|holdings|company|llc|sa|saog|international|trading|distribution|retail|enterprises|plc|ag|gmbh|spa|nv|bv|industries|partners|capital|investments|bank|logistics|solutions|services|ventures|associates|consulting)\b/i;
  
  // Only add a title-derived name if it looks like an actual company (not an article headline)
  if (
    titleName.length > 2 &&
    titleName.length < 80 &&
    COMPANY_SUFFIXES.test(titleName) &&
    !ARTICLE_TITLE_RE.test(titleName)
  ) {
    names.push(titleName);
  }

  const text = `${title} ${snippet}`;
  let match;
  while ((match = listPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n) && !ARTICLE_TITLE_RE.test(n)) names.push(n);
  }
  while ((match = bulletPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n) && !ARTICLE_TITLE_RE.test(n)) names.push(n);
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

async function enrichCompany(
  companyName: string,
  sector: string,
  geographies: string[],
  intent: InferredIntent,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred"
): Promise<Partial<SearchSessionCompany> & { sectorMatch?: boolean }> {
  const geoStr = geographies.join(", ");
  const primarySectorList = intent.primarySectors.join(", ") || sector;

  const prompt = `Research the company "${companyName}".

You are validating whether this company belongs in a search for: "${primarySectorList}" companies in ${geoStr}.

Return JSON with this EXACT structure:
{
  "sectorMatch": true,
  "sector": "specific sector this company actually operates in",
  "country": "headquarters country (e.g. 'Saudi Arabia', 'UAE')",
  "geography": "primary market geography (e.g. 'GCC', 'Middle East')",
  "revenue": "$500M or null",
  "employees": 5000,
  "website": "https://example.com or null",
  "summary": "2-3 sentence factual company overview",
  "relevanceRationale": "one sentence: why this company is or is not relevant",
  "confidenceScore": 75
}

CRITICAL for sectorMatch:
- Set "sectorMatch": true ONLY if this company's PRIMARY business is in the target sector ("${primarySectorList}").
- Set "sectorMatch": false if it is primarily a bank, insurer, telco, energy producer, government entity, or any sector NOT matching the target.
- Be strict. Adjacent sector companies (e.g., a logistics company in an FMCG distributor search) should return false.

Return ONLY the JSON.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = parseJsonSafe(content);

    if (!parsed) return { sectorMatch: undefined, relevanceType, relevanceRationale: `Relevant to ${sector} in ${geoStr}`, confidenceScore: 25 };

    return {
      sectorMatch: typeof parsed.sectorMatch === "boolean" ? parsed.sectorMatch : undefined, // undefined = unknown
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
      sectorMatch: undefined, // unknown — will be penalised downstream
      relevanceType,
      relevanceRationale: `Relevant to ${sector} in ${geoStr}`,
      confidenceScore: 25,
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

  // Pre-resolve target geographies to a flat country set for fast O(1) membership checks
  const geoSet = resolveGeoSet(intent.targetGeographies);

  const searchAndEmit = async function* (
    sector: string,
    relevanceType: "Direct" | "Adjacent" | "AI Inferred"
  ): AsyncGenerator<ActivityEvent> {
    if (signal?.aborted) return;

    yield emit("status", `Searching ${sector}...`);

    const rawCompanies = await searchCompaniesForSector(sector, intent.targetGeographies, intent.commercialRole);
    for (const raw of rawCompanies) {
      if (signal?.aborted) return;
      
      // Deduplicate by name+domain key
      const key = normalizeCompanyKey(raw.name, raw.website);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      yield emit("company_found", `Found: ${raw.name}`, { companyName: raw.name, name: raw.name, sector, relevanceType });

      if (companyCounter >= 40) continue;

      const enriched = await enrichCompany(raw.name, sector, intent.targetGeographies, intent, relevanceType);

      // ── Sector validation ──────────────────────────────────────────────────
      // Reject companies whose primary business doesn't match the target sector.
      if (enriched.sectorMatch === false) {
        yield emit("status", `Filtered (sector mismatch): ${raw.name} — ${enriched.sector || "wrong sector"}`);
        continue;
      }
      if (enriched.sectorMatch === undefined) {
        // Enrichment failed or returned ambiguous result — penalise heavily so
        // these sort at the bottom and don't pollute high-confidence results.
        enriched.confidenceScore = Math.min(enriched.confidenceScore ?? 25, 25);
      }

      // ── Geographic validation ──────────────────────────────────────────────
      // If target geographies are specified, only accept companies whose enriched
      // country falls within the resolved country set. Unknown/null country is
      // provisionally allowed but marked with reduced confidence.
      if (!isCountryInScope(enriched.country, geoSet)) {
        yield emit("status", `Filtered (out of region): ${raw.name} — ${enriched.country || "unknown country"}`);
        continue;
      }
      if (!enriched.country && geoSet.size > 0) {
        // Unknown country — penalise confidence so these sort below verified results
        enriched.confidenceScore = Math.min(enriched.confidenceScore ?? 50, 35);
      }

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

  // ── Primary sector passes ────────────────────────────────────────────────
  let primaryValid = 0;
  if (runSectors || runGeographies || runFilters) {
    for (const sector of intent.primarySectors) {
      if (signal?.aborted) return;
      const before = companies.length;
      for await (const ev of searchAndEmit(sector, "Direct")) yield ev;
      primaryValid += companies.length - before;
    }
  }

  // ── Adjacent sector passes (only if primary returned < 5 valid companies) ─
  let adjacentValid = 0;
  const MIN_BEFORE_ADJACENT = 5;
  if (runSectors && primaryValid < MIN_BEFORE_ADJACENT) {
    for (const sector of intent.adjacentSectors) {
      if (signal?.aborted) return;
      yield emit("adjacent_sector_found", `Expanding to adjacent sector: ${sector}`, { sector });
      const before = companies.length;
      for await (const ev of searchAndEmit(sector, "Adjacent")) yield ev;
      adjacentValid += companies.length - before;
    }
  }

  // ── Inferred sector passes (only if primary+adjacent still < 5 valid) ───
  if (runSectors && (primaryValid + adjacentValid) < MIN_BEFORE_ADJACENT) {
    for (const sector of (intent.inferredSectors || [])) {
      if (signal?.aborted) return;
      yield emit("adjacent_sector_found", `AI-inferred sector: ${sector}`, { sector });
      for await (const ev of searchAndEmit(sector, "AI Inferred")) yield ev;
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
