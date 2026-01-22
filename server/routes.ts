import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCompanySchema, insertExecutiveSchema, insertSearchQuerySchema } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant for an executive search platform. Parse the user's search query and extract structured criteria. Return ONLY valid JSON with this exact structure:
{
  "criteria": {
    "roles": ["array of executive role titles"],
    "sectors": ["array of industry sectors"],
    "regions": ["array of geographic regions"],
    "minRevenue": number or null,
    "maxRevenue": number or null,
    "minEmployees": number or null,
    "maxEmployees": number or null,
    "limit": number (default 20)
  },
  "interpretation": "brief summary of what you understood"
}

Revenue should be in USD (convert if needed). Extract ONLY explicit criteria from the query.`
          },
          {
            role: "user",
            content: query
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      
      const searchQuery = await storage.createSearchQuery({
        query,
        parsedCriteria: JSON.stringify(parsed.criteria),
        resultCount: 0
      });

      const companies = await generateSearchResults(parsed.criteria, searchQuery.id);

      await storage.createSearchQuery({
        query,
        parsedCriteria: JSON.stringify(parsed.criteria),
        resultCount: companies.length
      });

      res.json({
        searchQueryId: searchQuery.id,
        query,
        interpretation: parsed.interpretation,
        criteria: parsed.criteria,
        results: companies
      });
    } catch (error) {
      console.error("Error processing search:", error);
      res.status(500).json({ error: "Failed to process search" });
    }
  });

  app.get("/api/search-history", async (req, res) => {
    try {
      const history = await storage.getAllSearchQueries();
      res.json(history);
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ error: "Failed to fetch search history" });
    }
  });

  return httpServer;
}

async function generateSearchResults(criteria: any, searchQueryId: number) {
  const limit = criteria.limit || 10;
  
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are generating realistic company and executive data for an executive search platform. Generate ${limit} companies matching the search criteria.

Return a JSON object with this EXACT structure:
{
  "companies": [
    {
      "name": "Company Name",
      "sector": "Industry Sector",
      "region": "Geographic Region (e.g., Europe, Asia, Middle East)",
      "country": "Country Name",
      "latitude": 48.8566,
      "longitude": 2.3522,
      "revenue": 5000000000,
      "employees": 2500,
      "executives": [
        {
          "name": "Full Name",
          "title": "Executive Title (CEO, CFO, etc.)",
          "email": "email@company.com",
          "linkedin": "https://linkedin.com/in/profile"
        }
      ]
    }
  ]
}

RULES:
1. Generate exactly ${limit} companies matching the criteria
2. Use REAL geographic coordinates for company headquarters
3. Revenue in USD (number, not string)
4. Include 1-3 executives per company
5. Make company names and data realistic
6. Sectors should match: ${criteria.sectors?.join(', ') || 'any sector'}
7. Regions should match: ${criteria.regions?.join(', ') || 'any region'}
8. If specific roles requested, include executives with those titles`
      },
      {
        role: "user",
        content: `Generate ${limit} companies for: ${JSON.stringify(criteria)}`
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000
  });

  const content = response.choices[0]?.message?.content || "{}";
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
      revenue: String(companyData.revenue),
      employees: companyData.employees,
      color: "#1e3a8a",
      searchQueryId
    });

    const executives = [];
    for (const execData of companyData.executives || []) {
      const executive = await storage.createExecutive({
        companyId: company.id,
        name: execData.name,
        title: execData.title,
        email: execData.email,
        linkedin: execData.linkedin
      });
      executives.push(executive);
    }

    companies.push({ ...company, executives });
  }

  return companies;
}
