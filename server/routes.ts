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
3. If user says "all senior leaders" or similar general request, set roleLevel to "c-suite" and roleFunction to "all"
4. If NO executive criteria specified, set roleLevel to "c-suite" and roleFunction to "all" (return all C-suite)

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
        
        let content = response.choices?.[0]?.message?.content;
        if (content) {
          content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          if (content.startsWith('{')) {
            parsed = JSON.parse(content);
          }
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
        roleLevel: typeof parsed.criteria?.roleLevel === 'string' ? parsed.criteria.roleLevel : 'c-suite',
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
      const history = await storage.getUniqueSearchQueries();
      res.json(history.slice(0, 20));
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ error: "Failed to fetch search history" });
    }
  });

  return httpServer;
}

function buildExecutiveRoleInstructions(criteria: any): string {
  const specificRoles = Array.isArray(criteria.roles) && criteria.roles.length > 0 ? criteria.roles : [];
  const roleFunction = criteria.roleFunction || 'all';
  const roleLevel = criteria.roleLevel || 'c-suite';
  
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
3. Use the MAIN OFFICE/HEADQUARTERS ADDRESS coordinates - actual street address of head office
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

  const response = await client.chat.completions.create(requestOptions);

  let content = response.choices[0]?.message?.content || "{}";
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  console.log("OpenAI response:", content.substring(0, 500));
  
  const data = JSON.parse(content);
  const companiesData = Array.isArray(data) ? data : (data.companies || []);

  const companies = [];
  for (const companyData of companiesData) {
    const company = await storage.createCompany({
      name: companyData.name,
      sector: companyData.sector,
      region: companyData.region,
      country: companyData.country,
      latitude: String(companyData.latitude),
      longitude: String(companyData.longitude),
      revenue: String(companyData.revenue || 0),
      revenueSource: companyData.revenueSource || 'Unknown',
      employees: companyData.employees || 0,
      employeesSource: companyData.employeesSource || 'Unknown',
      confidence: companyData.confidence || 5,
      color: "#1e3a8a",
      searchQueryId
    });

    const filteredExecs = filterExecutivesByRole(companyData.executives || [], criteria);
    
    const executives = [];
    for (const execData of filteredExecs) {
      const executive = await storage.createExecutive({
        companyId: company.id,
        name: execData.name,
        title: execData.title,
        email: execData.email,
        linkedin: execData.linkedin || execData.profileUrl,
        profileUrl: execData.profileUrl,
        imageUrl: execData.imageUrl,
        source: execData.source || 'Unknown',
        confidence: execData.confidence || 5
      });
      executives.push(executive);
    }

    companies.push({ ...company, executives });
  }

  return companies;
}

function filterExecutivesByRole(executives: any[], criteria: any): any[] {
  const specificRoles = Array.isArray(criteria.roles) && criteria.roles.length > 0 ? criteria.roles : [];
  const roleFunction = criteria.roleFunction || 'all';
  const roleLevel = criteria.roleLevel || 'c-suite';
  
  if (specificRoles.length === 0 && (roleFunction === 'all' || roleFunction === 'general')) {
    if (roleLevel === 'c-suite' || roleLevel === 'all') {
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
  
  const excludePatterns = ['chief of staff', 'assistant to', 'deputy to', 'intern', 'analyst', 'associate', 'coordinator'];
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
