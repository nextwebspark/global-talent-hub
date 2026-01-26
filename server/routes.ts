import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCompanySchema, insertExecutiveSchema, insertSearchQuerySchema } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const AVAILABLE_MODELS = [
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google" },
  { id: "meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B", provider: "Meta" },
  { id: "mistralai/mixtral-8x22b-instruct", name: "Mixtral 8x22B", provider: "Mistral" },
  { id: "replit", name: "Replit AI (Default)", provider: "Replit" },
];

// Default coordinates by region for fallback
const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'latin america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'oceania': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 0, lng: 0 }
};

// Robust number parsing
function parseNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$\s]/g, '').replace(/[BbMmKk]$/, (m) => {
      const multipliers: Record<string, string> = { 'B': '000000000', 'b': '000000000', 'M': '000000', 'm': '000000', 'K': '000', 'k': '000' };
      return multipliers[m] || '';
    });
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

// Validate and fix coordinates
function validateCoordinates(lat: any, lng: any, region?: string, country?: string): { lat: number; lng: number } {
  const parsedLat = parseNumber(lat);
  const parsedLng = parseNumber(lng);
  
  // Valid latitude range: -90 to 90, longitude: -180 to 180
  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 && 
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  
  // Fallback to region-based coordinates
  const lookupKey = (country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];
  
  // Add small random offset to prevent overlapping markers
  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

// Validate company data from LLM response
function validateCompanyData(data: any): any {
  const name = String(data.name || data.companyName || 'Unknown Company').trim();
  const sector = String(data.sector || data.industry || 'Unknown').trim();
  const region = String(data.region || data.area || 'Unknown').trim();
  const country = String(data.country || data.location || region).trim();
  
  const coords = validateCoordinates(data.latitude || data.lat, data.longitude || data.lng || data.lon, region, country);
  
  const revenue = parseNumber(data.revenue || data.revenue_usd || data.revenueUSD);
  const employees = Math.round(parseNumber(data.employees || data.employeeCount || data.headcount));
  
  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));
  
  const rawExecutives = Array.isArray(data.executives) ? data.executives : [];
  const executives = rawExecutives.map(validateExecutiveData).filter((e: any) => e !== null);
  
  return {
    name,
    sector,
    region,
    country,
    city: String(data.city || data.headquarters || data.hq || '').trim(),
    streetAddress: String(data.streetAddress || data.street_address || data.address || '').trim(),
    latitude: coords.lat,
    longitude: coords.lng,
    revenue,
    revenueSource: String(data.revenueSource || data.revenue_source || 'Unknown').trim(),
    employees,
    employeesSource: String(data.employeesSource || data.employees_source || 'Unknown').trim(),
    confidence,
    executives
  };
}

// Validate executive data from LLM response
function validateExecutiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return null;
  }
  
  const name = String(data.name || data.fullName || data.executive_name || '').trim();
  const title = String(data.title || data.position || data.role || '').trim();
  
  if (!name || name === 'Unknown' || !title) {
    return null;
  }
  
  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));
  
  return {
    name,
    title,
    email: data.email || null,
    linkedin: data.linkedin || data.linkedIn || data.profileUrl || null,
    profileUrl: data.profileUrl || data.profile_url || data.linkedin || null,
    imageUrl: data.imageUrl || data.image_url || data.photo || null,
    source: String(data.source || 'Unknown').trim(),
    confidence
  };
}

// Extract JSON from LLM response with multiple strategies
function extractJSON(content: string): any {
  if (!content) return null;
  
  // Strategy 1: Clean markdown and parse directly
  let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Strategy 2: Find JSON object boundaries
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Strategy 3: Try to fix common JSON issues
    const fixed = cleaned
      .replace(/,\s*}/g, '}')  // trailing commas
      .replace(/,\s*]/g, ']')  // trailing commas in arrays
      .replace(/'/g, '"')       // single quotes
      .replace(/\n/g, ' ')      // newlines
      .replace(/\t/g, ' ');     // tabs
    
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      console.error("Failed to parse JSON after cleanup:", e2);
      return null;
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      const companiesWithExecs = await Promise.all(
        companies.map(async (company) => {
          const executives = await storage.getExecutivesByCompany(company.id);
          return { ...company, executives };
        })
      );
      res.json(companiesWithExecs);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      const executives = await storage.getExecutivesByCompany(id);
      res.json({ ...company, executives });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const validated = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(validated);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const company = await storage.updateCompany(id, req.body);
      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteCompany(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  app.get("/api/companies/:companyId/executives", async (req, res) => {
    try {
      const companyId = parseInt(String(req.params.companyId));
      const executives = await storage.getExecutivesByCompany(companyId);
      res.json(executives);
    } catch (error) {
      console.error("Error fetching executives:", error);
      res.status(500).json({ error: "Failed to fetch executives" });
    }
  });

  app.post("/api/executives", async (req, res) => {
    try {
      const validated = insertExecutiveSchema.parse(req.body);
      const executive = await storage.createExecutive(validated);
      res.status(201).json(executive);
    } catch (error) {
      console.error("Error creating executive:", error);
      res.status(400).json({ error: "Invalid executive data" });
    }
  });

  app.patch("/api/executives/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const executive = await storage.updateExecutive(id, req.body);
      res.json(executive);
    } catch (error) {
      console.error("Error updating executive:", error);
      res.status(500).json({ error: "Failed to update executive" });
    }
  });

  app.delete("/api/executives/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteExecutive(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting executive:", error);
      res.status(500).json({ error: "Failed to delete executive" });
    }
  });

  app.get("/api/models", async (req, res) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
      });
      
      if (!response.ok) {
        console.error("Failed to fetch OpenRouter models");
        return res.json(AVAILABLE_MODELS);
      }
      
      const data = await response.json();
      const models = data.data
        ?.filter((model: any) => {
          const id = model.id.toLowerCase();
          const isAudioOnly = id.includes('audio-preview') || 
                              id.includes('tts') || 
                              id.includes('whisper') ||
                              id.includes('speech');
          const isImageOnly = id.includes('dall-e') || id.includes('image');
          return !isAudioOnly && !isImageOnly;
        })
        .map((model: any) => ({
          id: model.id,
          name: model.name || model.id.split('/').pop(),
          provider: model.id.split('/')[0] || 'Unknown',
          contextLength: model.context_length,
          pricing: model.pricing,
        })) || [];
      
      models.unshift({ id: "replit", name: "Replit AI (Default)", provider: "Replit" });
      
      res.json(models);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.json(AVAILABLE_MODELS);
    }
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query, model } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const selectedModel = model || "replit";
      const isOpenRouter = selectedModel !== "replit";
      const client = isOpenRouter ? openrouter : openai;
      const modelName = isOpenRouter ? selectedModel : "gpt-5.1";

      console.log(`Processing search: "${query}" with model: ${modelName}`);

      const messages = [
        {
          role: "system" as const,
          content: `You are an AI assistant for an executive search platform. Parse the user's search query and extract structured criteria. Return ONLY valid JSON with this exact structure (no additional text):
{
  "criteria": {
    "roles": ["array of SPECIFIC executive role titles if explicitly mentioned"],
    "roleFunction": "finance|operations|technology|marketing|sales|hr|legal|general|all",
    "roleLevel": "c-suite|senior|vp|director|all",
    "sectors": ["array of industry sectors"],
    "regions": ["array of geographic regions"],
    "minRevenue": null,
    "maxRevenue": null,
    "minEmployees": null,
    "maxEmployees": null,
    "limit": 20
  },
  "interpretation": "brief summary of what you understood"
}

EXECUTIVE ROLE PARSING RULES:
1. If user mentions SPECIFIC roles (e.g., "CFO", "Chief Financial Officer", "CEO"), add them to "roles" array and set roleFunction/roleLevel accordingly
2. If user mentions a FUNCTION broadly (e.g., "senior finance leaders", "tech executives"), leave roles empty but set roleFunction (e.g., "finance", "technology") and roleLevel (e.g., "senior", "c-suite")
3. If user says "all senior leaders" or similar general request, set roleLevel to "senior" and roleFunction to "all"
4. If NO executive criteria specified, set roleLevel to "all" and roleFunction to "all" (return all executives)

ROLE FUNCTION MAPPINGS:
- finance: CFO, VP Finance, Treasurer, Controller, Chief Accounting Officer
- operations: COO, VP Operations, Chief Supply Chain Officer, Head of Manufacturing
- technology: CTO, CIO, VP Engineering, Chief Digital Officer, Chief Data Officer
- marketing: CMO, VP Marketing, Chief Brand Officer, Head of Marketing
- sales: CSO, Chief Revenue Officer, VP Sales, Head of Sales
- hr: CHRO, VP HR, Chief People Officer, Head of Talent
- legal: General Counsel, CLO, VP Legal, Chief Compliance Officer
- general/all: CEO, President, Chairman, Managing Director, Board Members

Revenue should be in USD (convert if needed). Extract ONLY explicit criteria from the query. IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`
        },
        {
          role: "user" as const,
          content: query
        }
      ];

      const requestOptions: any = {
        model: modelName,
        messages,
        max_tokens: 1000,
        temperature: 0.3
      };
      
      if (!isOpenRouter) {
        requestOptions.response_format = { type: "json_object" };
        requestOptions.max_completion_tokens = 1000;
        delete requestOptions.max_tokens;
      }

      let parsed: any = null;
      let parseError: Error | null = null;
      
      try {
        const response = await client.chat.completions.create(requestOptions);
        console.log("LLM response received:", JSON.stringify(response.choices?.[0]?.message || {}));
        
        const content = response.choices?.[0]?.message?.content;
        if (content) {
          parsed = extractJSON(content);
        }
        
        if (!parsed || !parsed.criteria) {
          throw new Error("Invalid response format from LLM");
        }
      } catch (error: any) {
        console.error("Error parsing LLM response:", error);
        parseError = error;
      }

      if (parseError || !parsed) {
        parsed = {
          criteria: {
            roles: [],
            sectors: [],
            regions: [],
            limit: 20
          },
          interpretation: `Searching for: ${query}`
        };
        console.log("Using fallback criteria due to parse error");
      }

      const criteria = {
        roles: Array.isArray(parsed.criteria?.roles) ? parsed.criteria.roles : [],
        roleFunction: typeof parsed.criteria?.roleFunction === 'string' ? parsed.criteria.roleFunction : 'all',
        roleLevel: typeof parsed.criteria?.roleLevel === 'string' ? parsed.criteria.roleLevel : 'all',
        sectors: Array.isArray(parsed.criteria?.sectors) ? parsed.criteria.sectors : [],
        regions: Array.isArray(parsed.criteria?.regions) ? parsed.criteria.regions : [],
        minRevenue: typeof parsed.criteria?.minRevenue === 'number' ? parsed.criteria.minRevenue : null,
        maxRevenue: typeof parsed.criteria?.maxRevenue === 'number' ? parsed.criteria.maxRevenue : null,
        minEmployees: typeof parsed.criteria?.minEmployees === 'number' ? parsed.criteria.minEmployees : null,
        maxEmployees: typeof parsed.criteria?.maxEmployees === 'number' ? parsed.criteria.maxEmployees : null,
        limit: typeof parsed.criteria?.limit === 'number' ? parsed.criteria.limit : 20
      };

      const searchQuery = await storage.createSearchQuery({
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0
      });

      console.log("Generating search results with criteria:", JSON.stringify(criteria));
      const companies = await generateSearchResults(criteria, searchQuery.id, selectedModel);
      console.log(`Generated ${companies.length} companies`);

      await storage.updateSearchQueryResultCount(searchQuery.id, companies.length);

      res.json({
        searchQueryId: searchQuery.id,
        query,
        interpretation: parsed.interpretation || query,
        criteria,
        results: companies
      });
    } catch (error) {
      console.error("Error processing search:", error);
      res.status(500).json({ error: "Failed to process search. Please try again." });
    }
  });

  app.get("/api/search-history", async (req, res) => {
    try {
      const history = await storage.getSearchHistoryWithResults();
      res.json(history.slice(0, 50));
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ error: "Failed to fetch search history" });
    }
  });

  app.get("/api/search-history/:id/load", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }
      
      const results = await storage.getFullSearchResults(searchId);
      res.json({ results, searchQueryId: searchId });
    } catch (error) {
      console.error("Error loading search history:", error);
      res.status(500).json({ error: "Failed to load search history" });
    }
  });

  app.get("/api/search-results/:id", async (req, res) => {
    try {
      const searchQueryId = parseInt(req.params.id);
      if (isNaN(searchQueryId)) {
        return res.status(400).json({ error: "Invalid search query ID" });
      }
      
      const results = await storage.getFullSearchResults(searchQueryId);
      if (!results) {
        return res.status(404).json({ error: "Search results not found" });
      }
      
      const formattedCompanies = results.companies.map(company => ({
        id: company.id,
        name: company.name,
        sector: company.sector,
        region: company.region,
        country: company.country,
        streetAddress: company.streetAddress,
        latitude: company.latitude,
        longitude: company.longitude,
        revenue: company.revenue,
        revenueSource: company.revenueSource,
        employees: company.employees,
        employeesSource: company.employeesSource,
        confidence: company.confidence,
        color: company.color,
        executives: company.executives.map(exec => ({
          id: exec.id,
          name: exec.name,
          title: exec.title,
          source: exec.source,
          profileUrl: exec.profileUrl,
          imageUrl: exec.imageUrl,
          confidence: exec.confidence
        }))
      }));

      res.json({
        searchQuery: results.searchQuery,
        companies: formattedCompanies
      });
    } catch (error) {
      console.error("Error loading search results:", error);
      res.status(500).json({ error: "Failed to load search results" });
    }
  });

  return httpServer;
}

function buildExecutiveRoleInstructions(criteria: any): string {
  const specificRoles = Array.isArray(criteria.roles) && criteria.roles.length > 0 ? criteria.roles : [];
  const roleFunction = criteria.roleFunction || 'all';
  const roleLevel = criteria.roleLevel || 'all';
  
  if (specificRoles.length > 0) {
    return `EXECUTIVE FILTERING RULES (CRITICAL - FOLLOW EXACTLY):
The user has requested SPECIFIC executive roles. Return ONLY executives matching these exact titles:
- Requested roles: ${specificRoles.join(', ')}

DO NOT return any other executives. For example:
- If "CFO" is requested, return ONLY the CFO (Chief Financial Officer) - not CEO, COO, or others
- If "CEO" and "CFO" are requested, return ONLY those two roles
- Match title variations (e.g., "CFO" matches "Chief Financial Officer", "VP Finance" does NOT match)`;
  }
  
  const functionRoleMap: Record<string, string> = {
    'finance': 'CFO, Chief Financial Officer, VP Finance, Treasurer, Controller, Chief Accounting Officer',
    'operations': 'COO, Chief Operating Officer, VP Operations, Chief Supply Chain Officer, Head of Manufacturing',
    'technology': 'CTO, Chief Technology Officer, CIO, Chief Information Officer, VP Engineering, Chief Digital Officer, Chief Data Officer',
    'marketing': 'CMO, Chief Marketing Officer, VP Marketing, Chief Brand Officer, Head of Marketing',
    'sales': 'CSO, Chief Sales Officer, Chief Revenue Officer, VP Sales, Head of Sales, Chief Commercial Officer',
    'hr': 'CHRO, Chief Human Resources Officer, VP HR, Chief People Officer, Head of Talent',
    'legal': 'General Counsel, CLO, Chief Legal Officer, VP Legal, Chief Compliance Officer',
    'general': 'CEO, President, Chairman, Managing Director, Board Members',
    'all': 'All C-suite and senior leadership'
  };
  
  if (roleFunction !== 'all' && roleFunction !== 'general') {
    const functionRoles = functionRoleMap[roleFunction] || functionRoleMap['all'];
    return `EXECUTIVE FILTERING RULES (CRITICAL - FOLLOW EXACTLY):
The user has requested executives in the ${roleFunction.toUpperCase()} function at ${roleLevel} level.
Return ONLY executives matching these roles: ${functionRoles}

DO NOT return executives from other functions. For example:
- If "finance" function is requested, return ONLY finance-related executives (CFO, VP Finance, etc.)
- Do NOT return CEO, COO, CMO, CTO, or other non-finance executives`;
  }
  
  return `EXECUTIVE FILTERING RULES:
No specific role filter was requested. Return ALL senior leadership (C-suite) for each company:
- CEO/President/Managing Director
- CFO/Chief Financial Officer
- COO/Chief Operating Officer
- Chairman (if different from CEO)
- Other C-suite executives (CTO, CMO, CHRO, etc.)`;
}

async function generateSearchResults(criteria: any, searchQueryId: number, selectedModel: string = "replit") {
  const limit = criteria.limit || 10;
  
  const isOpenRouter = selectedModel !== "replit";
  const client = isOpenRouter ? openrouter : openai;
  const modelName = isOpenRouter ? selectedModel : "gpt-5.1";
  
  const roleInstructions = buildExecutiveRoleInstructions(criteria);
  
  const messages = [
    {
      role: "system" as const,
      content: `You are an expert executive search analyst and market researcher with deep knowledge of global companies, their leadership teams, and organizational structures. Your task is to identify REAL companies and their executives based on specific criteria.

IMPORTANT: Only return REAL companies and REAL executives that actually exist.

Return a JSON object with this EXACT structure:
{
  "companies": [
    {
      "name": "Actual Company Name",
      "sector": "Industry Sector",
      "region": "Geographic Region", 
      "country": "Country Name",
      "city": "Headquarters City",
      "streetAddress": "123 Main Street, Suite 100",
      "latitude": 25.2048,
      "longitude": 55.2708,
      "revenue": 5000000000,
      "revenueSource": "Annual Report 2024",
      "employees": 2500,
      "employeesSource": "Company Website",
      "confidence": 8,
      "executives": [
        {
          "name": "Real Executive Name",
          "title": "Exact Title",
          "source": "Company Website",
          "profileUrl": "https://linkedin.com/in/executive-name",
          "imageUrl": "https://example.com/photo.jpg",
          "confidence": 9
        }
      ]
    }
  ]
}

${roleInstructions}

PRIMARY SOURCES OF TRUTH FOR EXECUTIVES (use in this order):
1. Company Website - Official leadership/about pages (MOST AUTHORITATIVE)
2. Annual Report - Official filings, executive sections
3. LinkedIn - Professional profiles with current positions

Cross-check all executive data across at least 2 sources when possible.
If sources conflict, prefer: Company Website > Annual Report > LinkedIn

DATA SOURCES FOR COMPANY DATA:
1. Annual Reports - Official financial statements
2. Company Websites - Official corporate information
3. Bloomberg, Reuters, Crunchbase
4. News Sources - Business coverage

STRICT REQUIREMENTS:
1. Return ONLY real, existing companies - NO fictional companies
2. Return ONLY executives that match the EXECUTIVE FILTERING RULES above - this is CRITICAL
3. HEADQUARTERS LOCATION (CRITICAL): 
   - streetAddress: The EXACT physical street address of the company's MAIN OFFICE/HEADQUARTERS in that country
   - latitude/longitude: The PRECISE GPS coordinates of the street address (not city center)
   - Example: "One Apple Park Way, Cupertino" with lat: 37.3346, lng: -122.0090 (exact building location)
4. For each data point, provide a source and confidence score (1-10)
5. DO NOT INFER OR ESTIMATE - if you don't have accurate data, use 0 or "Unknown"
6. Cross-reference multiple sources when possible
7. Match the specified sectors: ${criteria.sectors?.join(', ') || 'any sector'}
8. Match the specified regions: ${criteria.regions?.join(', ') || 'any region'}
9. Generate exactly ${limit} companies

CONFIDENCE SCORING:
- 9-10: Data verified from Company Website + Annual Report (multiple primary sources)
- 7-8: Data from Company Website OR Annual Report (one primary source)
- 5-6: Data from LinkedIn only
- 3-4: Data from aggregators (Bloomberg, Reuters, Crunchbase)
- 1-2: Data from news or general search only

For executives, include:
- Full legal name as appears on official records
- Exact current title
- Source: Company Website, Annual Report, or LinkedIn
- profileUrl: Direct link to LinkedIn or company leadership page
- imageUrl: URL to professional headshot
- Confidence score (1-10) for this specific executive`
      },
      {
        role: "user" as const,
        content: `Find ${limit} REAL companies matching these criteria: ${JSON.stringify(criteria)}

Remember: Only return actual, existing companies with accurate information. Return ONLY the JSON object.`
      }
    ];

  const requestOptions: any = {
    model: modelName,
    messages,
    max_tokens: 8000
  };
  
  if (!isOpenRouter) {
    requestOptions.response_format = { type: "json_object" };
    requestOptions.max_completion_tokens = 8000;
    delete requestOptions.max_tokens;
  }

  let response;
  try {
    response = await client.chat.completions.create(requestOptions);
  } catch (apiError: any) {
    console.error("LLM API error:", apiError.message);
    throw new Error(`Failed to get response from AI model: ${apiError.message}`);
  }

  const content = response.choices[0]?.message?.content || "{}";
  console.log("LLM response length:", content.length, "First 500 chars:", content.substring(0, 500));
  
  // Use robust JSON extraction
  const data = extractJSON(content);
  if (!data) {
    console.error("Failed to parse LLM response as JSON");
    throw new Error("Failed to parse AI response. Please try again.");
  }
  
  // Handle various response formats from different LLMs
  let companiesData: any[] = [];
  if (Array.isArray(data)) {
    companiesData = data;
  } else if (data.companies && Array.isArray(data.companies)) {
    companiesData = data.companies;
  } else if (data.results && Array.isArray(data.results)) {
    companiesData = data.results;
  } else if (data.data && Array.isArray(data.data)) {
    companiesData = data.data;
  } else {
    // Try to find any array property
    const arrayProp = Object.values(data).find(v => Array.isArray(v));
    if (arrayProp) {
      companiesData = arrayProp as any[];
    }
  }
  
  if (companiesData.length === 0) {
    console.warn("No companies found in LLM response");
    return [];
  }

  console.log(`Processing ${companiesData.length} companies from LLM response`);
  const companies = [];
  
  for (const rawCompanyData of companiesData) {
    try {
      // Validate and sanitize company data
      const validatedData = validateCompanyData(rawCompanyData);
      
      if (!validatedData.name || validatedData.name === 'Unknown Company') {
        console.warn("Skipping company with invalid name");
        continue;
      }
      
      const company = await storage.createCompany({
        name: validatedData.name,
        sector: validatedData.sector,
        region: validatedData.region,
        country: validatedData.country,
        streetAddress: validatedData.streetAddress || null,
        latitude: String(validatedData.latitude),
        longitude: String(validatedData.longitude),
        revenue: String(validatedData.revenue),
        revenueSource: validatedData.revenueSource,
        employees: validatedData.employees,
        employeesSource: validatedData.employeesSource,
        confidence: validatedData.confidence,
        color: "#1e3a8a",
        searchQueryId
      });

      // Use validated executives and filter based on criteria
      const validatedExecs = validatedData.executives.filter((e: any) => e !== null);
      const filteredExecs = filterExecutivesByRole(validatedExecs, criteria);
      
      const executives = [];
      for (const rawExec of filteredExecs) {
        try {
          const validatedExec = validateExecutiveData(rawExec);
          if (!validatedExec) continue;
          
          const executive = await storage.createExecutive({
            companyId: company.id,
            name: validatedExec.name,
            title: validatedExec.title,
            email: validatedExec.email,
            linkedin: validatedExec.linkedin,
            profileUrl: validatedExec.profileUrl,
            imageUrl: validatedExec.imageUrl,
            source: validatedExec.source,
            confidence: validatedExec.confidence
          });
          executives.push(executive);
        } catch (execError: any) {
          console.warn("Failed to create executive:", execError.message);
        }
      }

      companies.push({ ...company, executives });
    } catch (companyError: any) {
      console.warn("Failed to create company:", companyError.message);
    }
  }

  console.log(`Successfully created ${companies.length} companies with executives`);
  return companies;
}

function filterExecutivesByRole(executives: any[], criteria: any): any[] {
  const specificRoles = Array.isArray(criteria.roles) && criteria.roles.length > 0 ? criteria.roles : [];
  const roleFunction = criteria.roleFunction || 'all';
  const roleLevel = criteria.roleLevel || 'all';
  
  if (specificRoles.length === 0 && (roleFunction === 'all' || roleFunction === 'general')) {
    if (roleLevel === 'all') {
      return executives;
    }
    if (roleLevel === 'c-suite') {
      return executives.filter(exec => isCsuiteLevel(exec.title));
    }
    return executives.filter(exec => matchesLevel(exec.title, roleLevel));
  }
  
  const roleMappings: Record<string, string[]> = {
    'finance': ['cfo', 'chief financial', 'vp finance', 'svp finance', 'evp finance', 'treasurer', 'controller', 'chief accounting', 'finance director', 'head of finance'],
    'operations': ['coo', 'chief operating', 'vp operations', 'svp operations', 'evp operations', 'supply chain', 'head of manufacturing', 'operations director', 'head of operations'],
    'technology': ['cto', 'chief technology', 'cio', 'chief information', 'vp engineering', 'svp engineering', 'evp engineering', 'chief digital', 'chief data', 'technology director', 'head of technology', 'head of engineering'],
    'marketing': ['cmo', 'chief marketing', 'vp marketing', 'svp marketing', 'evp marketing', 'chief brand', 'head of marketing', 'marketing director', 'chief growth'],
    'sales': ['cso', 'chief sales', 'chief revenue', 'chief commercial', 'vp sales', 'svp sales', 'evp sales', 'head of sales', 'sales director'],
    'hr': ['chro', 'chief human', 'chief people', 'vp hr', 'svp hr', 'evp hr', 'head of talent', 'hr director', 'head of hr', 'head of people'],
    'legal': ['general counsel', 'clo', 'chief legal', 'vp legal', 'svp legal', 'evp legal', 'chief compliance', 'legal director', 'head of legal']
  };
  
  return executives.filter(exec => {
    const title = (exec.title || '').toLowerCase();
    
    if (specificRoles.length > 0) {
      const matchesRole = specificRoles.some((role: string) => {
        const roleL = role.toLowerCase();
        return title.includes(roleL) || 
          (roleL === 'cfo' && title.includes('chief financial')) ||
          (roleL === 'ceo' && (title.includes('chief executive') || title.includes('president') || title.includes('managing director'))) ||
          (roleL === 'coo' && title.includes('chief operating')) ||
          (roleL === 'cto' && title.includes('chief technology')) ||
          (roleL === 'cmo' && title.includes('chief marketing')) ||
          (roleL === 'cio' && title.includes('chief information')) ||
          (roleL === 'chro' && (title.includes('chief human') || title.includes('chief people'))) ||
          (roleL === 'vp finance' && (title.includes('vp finance') || title.includes('vice president') && title.includes('finance'))) ||
          (roleL === 'vp' && title.includes('vice president'));
      });
      if (!matchesRole) return false;
      return matchesLevel(title, roleLevel);
    }
    
    if (roleFunction !== 'all' && roleFunction !== 'general' && roleMappings[roleFunction]) {
      const keywords = roleMappings[roleFunction];
      const matchesFunc = keywords.some(kw => title.includes(kw));
      if (!matchesFunc) return false;
      return matchesLevel(title, roleLevel);
    }
    
    return matchesLevel(title, roleLevel);
  });
}

function isCsuiteLevel(title: string): boolean {
  const t = (title || '').toLowerCase();
  
  const excludePatterns = [
    'chief of staff', 'chief of security', 'chief of architecture',
    'assistant to', 'deputy to', 'office of', 'associate'
  ];
  if (excludePatterns.some(p => t.includes(p))) return false;
  
  const exactCsuiteRoles = [
    'ceo', 'cfo', 'coo', 'cto', 'cmo', 'cio', 'chro', 'clo', 'cso', 'cdo', 'cpo', 'cro'
  ];
  if (exactCsuiteRoles.some(role => {
    const regex = new RegExp(`\\b${role}\\b`, 'i');
    return regex.test(t);
  })) return true;
  
  const csuitePatterns = [
    'chief executive officer', 'chief financial officer', 'chief operating officer',
    'chief technology officer', 'chief marketing officer', 'chief information officer',
    'chief human resources', 'chief people officer', 'chief legal officer',
    'chief sales officer', 'chief revenue officer', 'chief commercial officer',
    'chief digital officer', 'chief data officer', 'chief compliance officer',
    'chief strategy officer', 'chief growth officer', 'chief brand officer',
    'chief product officer', 'chief investment officer', 'chief communications officer',
    'president', 'chairman', 'chairwoman', 'chairperson', 'managing director',
    'general counsel', 'board member', 'founder', 'co-founder', 'group ceo'
  ];
  return csuitePatterns.some(p => t.includes(p));
}

function matchesLevel(title: string, level: string): boolean {
  const t = (title || '').toLowerCase();
  
  const excludePatterns = ['chief of staff', 'assistant to', 'deputy to', 'intern'];
  if (excludePatterns.some(p => t.includes(p))) return false;
  
  switch (level) {
    case 'c-suite':
      return isCsuiteLevel(t);
    case 'senior':
      return isCsuiteLevel(t) || 
        /\b(svp|evp)\b/i.test(t) ||
        t.includes('senior vice president') || t.includes('executive vice president') ||
        t.includes('head of') || t.includes('senior director') || t.includes('group director');
    case 'vp':
      if (isCsuiteLevel(t)) return false;
      return (/\b(vp|svp|evp)\b/i.test(t) || t.includes('vice president')) && 
        !t.includes('assistant') && !t.includes('associate');
    case 'director':
      if (isCsuiteLevel(t)) return false;
      if (/\b(vp|svp|evp)\b/i.test(t) || t.includes('vice president')) return false;
      return (t.includes('director') || t.includes('head of')) && 
        !t.includes('assistant') && !t.includes('associate');
    case 'all':
    default:
      return true;
  }
}
