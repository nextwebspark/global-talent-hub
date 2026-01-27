import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCompanySchema, insertExecutiveSchema, insertSearchQuerySchema, insertCareerHistorySchema, insertEducationSchema, insertRemunerationSchema } from "@shared/schema";
import { 
  parseSearchQuery, 
  discoverCompaniesAndExecutives, 
  fetchAvailableModels,
  generateSearchUniqueKey,
  AVAILABLE_MODELS 
} from "./services/discovery";
import { 
  enrichExecutive, 
  enrichCompany, 
  getAvailableSources,
  orchestrateEnrichmentMatching 
} from "./services/enrichment";

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

  // UI/MANUAL LAYER: User-initiated company creation
  app.post("/api/companies", async (req, res) => {
    try {
      const validated = insertCompanySchema.parse(req.body);
      const company = await storage.createCompanyManual(validated);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  // UI/MANUAL LAYER: User-initiated company edits always override imported data
  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const company = await storage.updateCompanyManual(id, req.body);
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

  // UI/MANUAL LAYER: User-initiated executive creation
  app.post("/api/executives", async (req, res) => {
    try {
      const validated = insertExecutiveSchema.parse(req.body);
      const executive = await storage.createExecutiveManual(validated);
      res.status(201).json(executive);
    } catch (error) {
      console.error("Error creating executive:", error);
      res.status(400).json({ error: "Invalid executive data" });
    }
  });

  // UI/MANUAL LAYER: User-initiated executive edits always override imported data
  app.patch("/api/executives/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const executive = await storage.updateExecutiveManual(id, req.body);
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

  // Executive Details API
  app.get("/api/executives/:id/details", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const details = await storage.getExecutiveDetails(id);
      if (!details) {
        return res.status(404).json({ error: "Executive not found" });
      }
      
      res.json({
        executive: {
          id: details.executive.id,
          name: details.executive.name,
          title: details.executive.title,
          companyId: details.executive.companyId,
          confidence: details.executive.confidence,
          linkedin: details.executive.linkedin,
          profileUrl: details.executive.profileUrl,
          imageUrl: details.executive.imageUrl
        },
        company: details.company ? {
          id: details.company.id,
          name: details.company.name,
          country: details.company.country,
          revenue: details.company.revenue,
          employees: details.company.employees
        } : null,
        careerHistory: details.careerHistory.map(ch => ({
          id: ch.id,
          company: ch.company,
          title: ch.title,
          startDate: ch.startDate,
          endDate: ch.endDate,
          description: ch.description,
          sortOrder: ch.sortOrder
        })),
        education: details.education.map(ed => ({
          id: ed.id,
          institution: ed.institution,
          degree: ed.degree,
          fieldOfStudy: ed.fieldOfStudy,
          graduationYear: ed.graduationYear
        })),
        remuneration: details.remuneration.map(rem => ({
          id: rem.id,
          baseSalary: rem.baseSalary,
          bonus: rem.bonus,
          longTermIncentives: rem.longTermIncentives,
          currency: rem.currency,
          year: rem.year,
          notes: rem.notes
        })),
        notes: details.notes ? { id: details.notes.id, content: details.notes.content } : null
      });
    } catch (error) {
      console.error("Error fetching executive details:", error);
      res.status(500).json({ error: "Failed to fetch executive details" });
    }
  });

  // Career History endpoints
  app.get("/api/executives/:id/career-history", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const careerHistory = await storage.getCareerHistory(id);
      res.json(careerHistory);
    } catch (error) {
      console.error("Error fetching career history:", error);
      res.status(500).json({ error: "Failed to fetch career history" });
    }
  });

  app.post("/api/executives/:id/career-history", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertCareerHistorySchema.parse({ ...req.body, executiveId });
      const entry = await storage.createCareerHistory(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating career history:", error);
      res.status(400).json({ error: "Invalid career history data" });
    }
  });

  app.patch("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateCareerHistory(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating career history:", error);
      res.status(500).json({ error: "Failed to update career history" });
    }
  });

  app.delete("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteCareerHistory(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting career history:", error);
      res.status(500).json({ error: "Failed to delete career history" });
    }
  });

  // Education endpoints
  app.get("/api/executives/:id/education", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const educationData = await storage.getEducation(id);
      res.json(educationData);
    } catch (error) {
      console.error("Error fetching education:", error);
      res.status(500).json({ error: "Failed to fetch education" });
    }
  });

  app.post("/api/executives/:id/education", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertEducationSchema.parse({ ...req.body, executiveId });
      const entry = await storage.createEducation(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating education:", error);
      res.status(400).json({ error: "Invalid education data" });
    }
  });

  app.patch("/api/education/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateEducation(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating education:", error);
      res.status(500).json({ error: "Failed to update education" });
    }
  });

  app.delete("/api/education/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteEducation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting education:", error);
      res.status(500).json({ error: "Failed to delete education" });
    }
  });

  // Remuneration endpoints
  app.get("/api/executives/:id/remuneration", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const remunerationData = await storage.getRemuneration(id);
      res.json(remunerationData);
    } catch (error) {
      console.error("Error fetching remuneration:", error);
      res.status(500).json({ error: "Failed to fetch remuneration" });
    }
  });

  app.post("/api/executives/:id/remuneration", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertRemunerationSchema.parse({ ...req.body, executiveId });
      const entry = await storage.createRemuneration(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating remuneration:", error);
      res.status(400).json({ error: "Invalid remuneration data" });
    }
  });

  app.patch("/api/remuneration/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateRemuneration(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating remuneration:", error);
      res.status(500).json({ error: "Failed to update remuneration" });
    }
  });

  app.delete("/api/remuneration/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteRemuneration(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting remuneration:", error);
      res.status(500).json({ error: "Failed to delete remuneration" });
    }
  });

  // Executive Notes endpoint
  app.get("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getExecutiveNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching executive notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertExecutiveNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating executive notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  app.delete("/api/search-queries/:id/results", async (req, res) => {
    try {
      const searchQueryId = parseInt(String(req.params.id));
      const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
      for (const company of companies) {
        await storage.deleteCompany(company.id);
      }
      await storage.deleteSearchQuery(searchQueryId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing search results:", error);
      res.status(500).json({ error: "Failed to clear results" });
    }
  });

  // Discovery Layer: Fetch available AI models
  app.get("/api/models", async (req, res) => {
    try {
      const models = await fetchAvailableModels();
      res.json(models);
    } catch (error) {
      console.error("[Routes] Error fetching models:", error);
      res.json(AVAILABLE_MODELS);
    }
  });

  // Discovery Layer: Search endpoint - runs LLM once per search
  app.post("/api/search", async (req, res) => {
    try {
      const { query, model } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const selectedModel = model || "replit";
      console.log(`[Routes] Processing search: "${query}" with model: ${selectedModel}`);

      // Step 1: Parse the search query using Discovery Layer
      const { criteria, interpretation } = await parseSearchQuery(query, selectedModel);

      // Step 2: Generate unique key to prevent duplicate searches
      const uniqueKey = generateSearchUniqueKey(query, criteria);
      console.log("[Routes] Generated unique search key:", uniqueKey);

      // Step 3: Persist search query (Discovery runs once, results persist)
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0
      });

      // Step 4: Clear previous results for this exact search before new discovery
      await storage.deleteCompaniesBySearchQuery(searchQuery.id);
      console.log("[Routes] Cleared previous results for search ID:", searchQuery.id);

      // Step 5: Run Discovery Layer to find companies and executives
      console.log("[Routes] Running discovery with criteria:", JSON.stringify(criteria));
      const companies = await discoverCompaniesAndExecutives(criteria, searchQuery.id, selectedModel);
      console.log(`[Routes] Discovery complete: ${companies.length} companies found`);

      // Step 6: Update result count in persistence layer
      await storage.updateSearchQueryResultCount(searchQuery.id, companies.length);

      res.json({
        searchQueryId: searchQuery.id,
        query,
        interpretation,
        criteria,
        results: companies
      });
    } catch (error) {
      console.error("[Routes] Error processing search:", error);
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
      
      const data = await storage.getFullSearchResults(searchId);
      if (!data) {
        return res.status(404).json({ error: "Search results not found" });
      }
      
      const formattedCompanies = data.companies.map(company => ({
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
      
      res.json({ results: formattedCompanies, searchQueryId: searchId });
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

  // ENRICHMENT LAYER: Orchestrate matching between local executives and Clockwork project
  // This endpoint is deterministic and side-effect free - it only returns match results
  app.post("/api/enrichment/match", async (req, res) => {
    try {
      const { searchId, clockworkProjectId } = req.body;
      
      if (!searchId || !clockworkProjectId) {
        return res.status(400).json({ 
          error: "Both searchId and clockworkProjectId are required" 
        });
      }

      const searchIdNum = parseInt(String(searchId));
      if (isNaN(searchIdNum)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      // Verify the search exists
      const searchQuery = await storage.getSearchQuery(searchIdNum);
      if (!searchQuery) {
        return res.status(404).json({ error: "Search not found" });
      }

      // Run the orchestration (read-only, no side effects)
      const matchResult = await orchestrateEnrichmentMatching(
        searchIdNum,
        String(clockworkProjectId)
      );

      res.json(matchResult);
    } catch (error) {
      console.error("Error in enrichment matching:", error);
      res.status(500).json({ error: "Failed to orchestrate enrichment matching" });
    }
  });

  // ENRICHMENT LAYER: Confirm and persist enrichment for a single executive
  // User-triggered only - enriches empty fields and stores metadata
  app.post("/api/enrichment/confirm", async (req, res) => {
    try {
      const { executiveId, clockworkData, confidence, clockworkId } = req.body;
      
      if (!executiveId || !clockworkData) {
        return res.status(400).json({ 
          error: "executiveId and clockworkData are required" 
        });
      }

      const execIdNum = parseInt(String(executiveId));
      if (isNaN(execIdNum)) {
        return res.status(400).json({ error: "Invalid executiveId" });
      }

      const executive = await storage.getExecutive(execIdNum);
      if (!executive) {
        return res.status(404).json({ error: "Executive not found" });
      }

      // Enrich empty fields with Clockwork data and store metadata
      const { updated, enrichedFields } = await storage.enrichExecutiveEmptyFields(
        execIdNum,
        {
          email: clockworkData.email,
          phone: clockworkData.phone,
          linkedin: clockworkData.linkedin,
          profileUrl: clockworkData.profileUrl,
          imageUrl: clockworkData.imageUrl
        },
        {
          source: 'clockwork',
          confidence: confidence || 0,
          clockworkId: clockworkId
        }
      );

      res.json({
        success: true,
        executive: updated,
        enrichedFields,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error confirming enrichment:", error);
      res.status(500).json({ error: "Failed to confirm enrichment" });
    }
  });

  // ENRICHMENT LAYER: Create new executive from Clockwork data
  // User-triggered only - creates a new executive when no local match exists
  app.post("/api/enrichment/create-from-clockwork", async (req, res) => {
    try {
      const { companyId, clockworkData, confidence, clockworkId } = req.body;
      
      if (!companyId || !clockworkData || !clockworkId) {
        return res.status(400).json({ 
          error: "companyId, clockworkData, and clockworkId are required" 
        });
      }

      const companyIdNum = parseInt(String(companyId));
      if (isNaN(companyIdNum)) {
        return res.status(400).json({ error: "Invalid companyId" });
      }

      const company = await storage.getCompany(companyIdNum);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Create new executive from Clockwork data
      const newExecutive = await storage.createExecutiveFromClockwork(
        {
          companyId: companyIdNum,
          name: clockworkData.name,
          title: clockworkData.title || 'Executive',
          email: clockworkData.email,
          phone: clockworkData.phone,
          linkedin: clockworkData.linkedin,
          profileUrl: clockworkData.profileUrl,
          imageUrl: clockworkData.imageUrl,
          confidence: confidence || 0
        },
        {
          confidence: confidence || 0,
          clockworkId
        }
      );

      res.json({
        success: true,
        executive: newExecutive,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error creating executive from Clockwork:", error);
      res.status(500).json({ error: "Failed to create executive from Clockwork" });
    }
  });

  return httpServer;
}
