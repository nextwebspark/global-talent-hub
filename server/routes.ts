import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCompanySchema, insertExecutiveSchema, insertSearchQuerySchema, insertCareerHistorySchema, insertEducationSchema, insertRemunerationSchema } from "@shared/schema";
import { 
  parseSearchQuery, 
  discoverCompaniesAndExecutives, 
  discoverCompaniesStreaming,
  fetchAvailableModels,
  generateSearchUniqueKey,
  AVAILABLE_MODELS,
  testModel,
  testModelComprehensive,
  RELIABLE_ONLINE_MODELS
} from "./services/discovery";
import { 
  discoverCompaniesWithRetrieval,
  discoverCompaniesWithRetrievalSync 
} from "./services/retrievalDiscovery";
import { webSearchService } from "./services/webSearch";
import { 
  enrichExecutive, 
  enrichCompany, 
  getAvailableSources,
  orchestrateEnrichmentMatching,
  researchCompanyDetails,
  exploreClockworkProjectEndpoints
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
      
      const isEnriched = Boolean(details.executive.enrichmentSource || details.executive.clockworkId);
      res.json({
        executive: {
          id: details.executive.id,
          name: details.executive.name,
          title: details.executive.title,
          companyId: details.executive.companyId,
          confidence: details.executive.confidence,
          linkedin: details.executive.linkedin,
          profileUrl: details.executive.profileUrl,
          imageUrl: details.executive.imageUrl,
          email: details.executive.email,
          phone: details.executive.phone,
          enrichmentSource: details.executive.enrichmentSource,
          enrichmentConfidence: details.executive.enrichmentConfidence,
          enrichmentTimestamp: details.executive.enrichmentTimestamp,
          isEnriched
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

  // Company Notes endpoints
  app.get("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getCompanyNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching company notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertCompanyNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating company notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  app.post("/api/companies/:id/enrich-deepseek", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { companyName, country } = req.body;
      
      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }

      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openrouterApiKey) {
        return res.status(400).json({ 
          error: "OpenRouter API key not configured", 
          message: "Please add OPENROUTER_API_KEY to your secrets"
        });
      }

      console.log(`[DeepSeek Enrich] Researching company: ${companyName} (${country || 'Unknown'})`);

      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://replit.com',
          'X-Title': 'Global Talent Map'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are a business research analyst with deep knowledge of global companies. Research and provide accurate, factual information about companies.

Return ONLY valid JSON with these fields:
- summary: A 2-4 sentence description of the company including what they do, their market position, and key facts
- coreActivity: What the company primarily does (1-2 sentences describing their main business)
- operatingModel: How the company operates - B2B, B2C, franchise, direct sales, etc. (1-2 sentences)
- revenueDrivers: Main sources of revenue - products, services, subscriptions, etc. (1-2 sentences)

Be accurate and factual. If you're not confident about specific information, provide what you know and note any uncertainty. Do not make up information.`
            },
            {
              role: 'user',
              content: `Research this company and provide business profile information:

Company Name: ${companyName}
Country/Region: ${country || 'Unknown'}

Please provide a comprehensive business profile as JSON.`
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[DeepSeek API] Error:', errorText);
        return res.status(500).json({ error: "DeepSeek API request failed", message: errorText });
      }

      const aiData = await aiResponse.json();
      
      let enrichedInfo;
      try {
        enrichedInfo = JSON.parse(aiData.choices[0].message.content);
      } catch (parseError) {
        console.error('[DeepSeek] Failed to parse response:', aiData.choices[0].message.content);
        return res.status(500).json({ error: "Failed to parse AI response" });
      }
      
      await storage.updateCompanyManual(id, {
        summary: enrichedInfo.summary || null,
        coreActivity: enrichedInfo.coreActivity || null,
        operatingModel: enrichedInfo.operatingModel || null,
        revenueDrivers: enrichedInfo.revenueDrivers || null
      });

      console.log(`[DeepSeek Enrich] Successfully enriched: ${companyName}`);
      res.json(enrichedInfo);
    } catch (error) {
      console.error("Error enriching with DeepSeek:", error);
      res.status(500).json({ error: "Failed to enrich with DeepSeek", message: String(error) });
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

  // Discovery Layer: Return only approved discovery models
  // UI must only show models that will actually be used (no silent overrides)
  app.get("/api/models", async (req, res) => {
    // Return the curated list of approved models directly
    // Do NOT fetch from OpenRouter as that returns all models including non-approved ones
    res.json(AVAILABLE_MODELS);
  });

  // Model health check - test if a model is working
  app.post("/api/models/test", async (req, res) => {
    try {
      const { modelId, comprehensive } = req.body;
      
      if (!modelId) {
        return res.status(400).json({ error: "Model ID is required" });
      }

      console.log(`[Routes] Testing model: ${modelId}, comprehensive: ${comprehensive}`);
      
      if (comprehensive) {
        const result = await testModelComprehensive(modelId);
        res.json(result);
      } else {
        // Quick test with :online suffix (default search behavior)
        const isReliable = RELIABLE_ONLINE_MODELS.some(m => modelId.includes(m) || m.includes(modelId));
        const result = await testModel(modelId, isReliable);
        res.json({
          ...result,
          isReliableOnline: isReliable,
          recommendation: result.success 
            ? (isReliable ? "Full web search support" : "Works without web search")
            : result.error?.suggestion
        });
      }
    } catch (error: any) {
      console.error("[Routes] Error testing model:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "TEST_FAILED", message: error.message, suggestion: "Check your OpenRouter API key" }
      });
    }
  });

  // Get list of reliable models known to work with web search
  app.get("/api/models/reliable", async (req, res) => {
    try {
      const reliableModels = AVAILABLE_MODELS.filter(m => 
        RELIABLE_ONLINE_MODELS.some(r => m.id.includes(r) || r.includes(m.id))
      );
      res.json({
        reliableModels,
        allModels: AVAILABLE_MODELS,
        reliableIds: RELIABLE_ONLINE_MODELS
      });
    } catch (error: any) {
      console.error("[Routes] Error fetching reliable models:", error);
      res.status(500).json({ error: "Failed to fetch reliable models" });
    }
  });

  // Discovery Layer: Search endpoint - runs LLM once per search
  app.post("/api/search", async (req, res) => {
    try {
      const { query, model } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const selectedModel = model || "deepseek/deepseek-chat";
      console.log(`[Routes] Processing search: "${query}" with model: ${selectedModel}`);

      // Step 1: Parse the search query using Discovery Layer
      const { criteria, interpretation } = await parseSearchQuery(query, selectedModel);

      // Step 2: Generate unique key to prevent duplicate searches
      const uniqueKey = generateSearchUniqueKey(query);
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

      // Step 5: Run Discovery Layer to find companies and executives (pass original query for accuracy)
      console.log("[Routes] Running discovery with original query:", query);
      const companies = await discoverCompaniesAndExecutives(criteria, searchQuery.id, selectedModel, query);
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

  // Streaming search endpoint using Server-Sent Events
  app.get("/api/search/stream", async (req, res) => {
    const query = req.query.query as string;
    const model = (req.query.model as string) || "anthropic/claude-sonnet-4";
    
    if (!query) {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      console.log(`[Routes SSE] Starting streaming search: "${query}" with model: ${model}`);
      
      sendEvent('status', { message: 'Starting search...', progress: 0 });
      
      // Step 1: Parse the search query
      const { criteria, interpretation } = await parseSearchQuery(query, model);
      sendEvent('status', { message: 'Criteria parsed', progress: 10, interpretation });

      // Step 2: Generate unique key
      const uniqueKey = generateSearchUniqueKey(query);

      // Step 3: Persist search query
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0
      });
      
      sendEvent('search_created', { 
        searchQueryId: searchQuery.id, 
        query, 
        interpretation, 
        criteria 
      });

      // Step 4: Clear previous results
      await storage.deleteCompaniesBySearchQuery(searchQuery.id);

      // Step 5: Stream companies as they're discovered
      // Use retrieval-first if web search is configured, otherwise fall back to LLM-only
      let companyCount = 0;
      const useRetrieval = webSearchService.isConfigured();
      console.log(`[Routes SSE] Using ${useRetrieval ? 'retrieval-first' : 'LLM-only'} discovery`);
      
      const discoveryStream = useRetrieval 
        ? discoverCompaniesWithRetrieval(criteria, searchQuery.id, model, query)
        : discoverCompaniesStreaming(criteria, searchQuery.id, model, query);
      
      for await (const event of discoveryStream) {
        if (event.type === 'company') {
          companyCount++;
          sendEvent('company', event.data);
        } else if (event.type === 'source') {
          sendEvent('source', event.data);
        } else if (event.type === 'verification') {
          sendEvent('verification', event.data);
        } else if (event.type === 'status') {
          sendEvent('status', event.data);
        } else if (event.type === 'error') {
          sendEvent('error', event.data);
        } else if (event.type === 'complete') {
          // Update result count
          await storage.updateSearchQueryResultCount(searchQuery.id, companyCount);
          sendEvent('complete', { 
            ...event.data,
            searchQueryId: searchQuery.id 
          });
        }
      }

      console.log(`[Routes SSE] Streaming complete: ${companyCount} companies`);
      res.end();
      
    } catch (error: any) {
      console.error("[Routes SSE] Error:", error);
      sendEvent('error', { message: error.message || 'Search failed' });
      res.end();
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

  // CLOCKWORK DIAGNOSTICS
  // Test Clockwork connectivity and return detailed diagnostic info
  app.get("/api/clockwork/diagnostics", async (_req, res) => {
    try {
      const { runClockworkDiagnostics } = await import("./services/enrichment");
      const diagnostics = await runClockworkDiagnostics();
      res.json(diagnostics);
    } catch (error) {
      console.error("Error running Clockwork diagnostics:", error);
      res.status(500).json({ 
        ok: false,
        error: "Failed to run Clockwork diagnostics",
        details: String(error)
      });
    }
  });

  // CLOCKWORK PROJECT MANAGEMENT
  // Fetch available Clockwork projects (READ-ONLY)
  app.get("/api/clockwork/projects", async (_req, res) => {
    try {
      const { getClockworkProjects } = await import("./services/enrichment");
      const projects = await getClockworkProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching Clockwork projects:", error);
      res.status(500).json({ error: "Failed to fetch Clockwork projects" });
    }
  });

  // Fetch people from a specific Clockwork project (READ-ONLY)
  // Returns detailed results with endpoint verification and warnings
  app.get("/api/clockwork/projects/:projectId/people", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      
      const { fetchClockworkProjectPeople } = await import("./services/enrichment");
      const result = await fetchClockworkProjectPeople(projectId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching Clockwork project people:", error);
      res.status(500).json({ 
        error: "Failed to fetch Clockwork project people",
        details: String(error)
      });
    }
  });

  // Update the Clockwork project selection for a search
  app.patch("/api/search/:searchId/clockwork-project", async (req, res) => {
    try {
      const searchId = parseInt(req.params.searchId);
      const { clockworkProjectId } = req.body;
      
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }
      
      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }
      
      const updated = await storage.updateSearchQueryClockworkProject(searchId, clockworkProjectId);
      console.log(`[Clockwork] Updated search ${searchId} to use project ${clockworkProjectId}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating Clockwork project:", error);
      res.status(500).json({ error: "Failed to update Clockwork project" });
    }
  });

  // DIAGNOSTIC ENDPOINT: Test Clockwork project candidate fetch
  // Returns detailed info about what would be fetched without persisting anything
  app.get("/api/clockwork/diagnostics/project/:clockworkProjectId", async (req, res) => {
    try {
      const { clockworkProjectId } = req.params;
      
      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }
      
      // Run orchestration with a dummy search ID to test fetch
      const matchResult = await orchestrateEnrichmentMatching(0, clockworkProjectId);
      
      // Build diagnostic response
      const diagnostics = {
        ok: matchResult.fetchStatus === 'success',
        status: matchResult.fetchError?.status || null,
        fetchedCount: matchResult.totalClockworkExecutives,
        fetchStatus: matchResult.fetchStatus,
        sampleFieldsPresent: matchResult.clockworkCandidates.length > 0 
          ? Object.keys(matchResult.clockworkCandidates[0]).filter(k => 
              matchResult.clockworkCandidates[0][k as keyof typeof matchResult.clockworkCandidates[0]]
            )
          : [],
        paginationUsed: matchResult.paginationUsed,
        pagesFetched: matchResult.pagesFetched,
        totalRawCandidates: matchResult.totalRawCandidates,
        errorMessage: matchResult.fetchError?.message || null,
        endpoint: matchResult.fetchError?.endpoint || null,
        enrichmentRunId: matchResult.enrichmentRunId,
        firmSlug: matchResult.clockworkFirmSlug,
        sampleCandidates: matchResult.clockworkCandidates.slice(0, 3).map(c => ({
          id: c.id,
          name: c.name,
          title: c.title,
          company: c.company
        }))
      };
      
      res.json(diagnostics);
    } catch (error) {
      console.error("Error in Clockwork diagnostics:", error);
      res.status(500).json({ 
        ok: false,
        error: "Failed to run diagnostics",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // EXPLORATION ENDPOINT: Find the correct Clockwork API endpoint for project candidates
  // Tests multiple endpoint patterns and reports which ones work
  app.get("/api/clockwork/explore/:clockworkProjectId", async (req, res) => {
    try {
      const { clockworkProjectId } = req.params;
      
      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }
      
      console.log(`[API] Exploring Clockwork endpoints for project: ${clockworkProjectId}`);
      const result = await exploreClockworkProjectEndpoints(clockworkProjectId);
      
      res.json(result);
    } catch (error) {
      console.error("Error exploring Clockwork endpoints:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to explore endpoints",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
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
      const { executiveId, clockworkData, confidence, clockworkId, clockworkProjectId } = req.body;
      
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
      // This is IDEMPOTENT: re-confirming same clockworkId returns existing state
      const { updated, enrichedFields, alreadyEnriched } = await storage.enrichExecutiveEmptyFields(
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
          clockworkId: clockworkId,
          clockworkProjectId: clockworkProjectId
        }
      );

      res.json({
        success: true,
        executive: updated,
        enrichedFields,
        alreadyEnriched,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          clockworkProjectId,
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
  // IDEMPOTENT: If executive with same clockworkId already exists, returns existing
  app.post("/api/enrichment/create-from-clockwork", async (req, res) => {
    try {
      const { companyId, clockworkData, confidence, clockworkId, clockworkProjectId } = req.body;
      
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
      // This is IDEMPOTENT: if clockworkId already exists, returns existing executive
      const { executive: newExecutive, alreadyExists } = await storage.createExecutiveFromClockwork(
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
          clockworkId,
          clockworkProjectId
        }
      );

      res.json({
        success: true,
        executive: newExecutive,
        alreadyExists,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          clockworkProjectId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error creating executive from Clockwork:", error);
      res.status(500).json({ error: "Failed to create executive from Clockwork" });
    }
  });

  // ENRICHMENT LAYER: Import a Clockwork candidate into search results
  // Creates both company (if needed) and executive from Clockwork project candidate
  app.post("/api/enrichment/import-candidate", async (req, res) => {
    try {
      const { 
        searchId, 
        clockworkId, 
        name, 
        title, 
        company: companyName, 
        email, 
        linkedin, 
        imageUrl,
        clockworkProjectId 
      } = req.body;
      
      if (!searchId || !clockworkId || !name) {
        return res.status(400).json({ 
          error: "searchId, clockworkId, and name are required" 
        });
      }

      const searchIdNum = parseInt(String(searchId));
      if (isNaN(searchIdNum)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      // Check if search exists
      const search = await storage.getSearchQuery(searchIdNum);
      if (!search) {
        return res.status(404).json({ error: "Search not found" });
      }

      // Find or create company for this candidate
      // First, check if we already have a company with this name in this search
      const companiesInSearch = await storage.getCompaniesBySearchQuery(searchIdNum);
      let targetCompany = companiesInSearch.find(
        c => c.name.toLowerCase() === (companyName || '').toLowerCase()
      );

      if (!targetCompany && companyName) {
        // Research company details using AI before creating
        console.log(`[Import] Researching company details for: ${companyName}`);
        const researchedData = await researchCompanyDetails(companyName);
        
        // Check if research was successful (null means validation failed, e.g., Unknown company)
        if (researchedData) {
          // Create a new company with researched data
          targetCompany = await storage.createCompanyManual({
            name: researchedData.name,
            sector: researchedData.sector,
            region: researchedData.region,
            country: researchedData.country,
            streetAddress: researchedData.streetAddress || null,
            latitude: String(researchedData.latitude),
            longitude: String(researchedData.longitude),
            revenue: String(researchedData.revenue),
            revenueSource: researchedData.revenueSource,
            employees: researchedData.employees,
            employeesSource: researchedData.employeesSource,
            confidence: researchedData.confidence,
            color: '#6366f1',
            searchQueryId: searchIdNum
          });
          console.log(`[Import] Created researched company: ${researchedData.name} (ID: ${targetCompany.id}, Revenue: $${researchedData.revenue}, Location: ${researchedData.country})`);
        } else {
          console.log(`[Import] Company research failed for "${companyName}" - using fallback`);
        }
      }
      
      // If no company found (research failed or no company name), use fallback
      if (!targetCompany) {
        targetCompany = companiesInSearch[0];
        if (!targetCompany) {
          return res.status(400).json({ 
            error: "No company available to attach executive. Run a search first." 
          });
        }
        console.log(`[Import] Using fallback company: ${targetCompany.name}`);
      }

      // Check if executive with this clockworkId already exists ANYWHERE in the search
      // This ensures idempotency across all companies in the search
      let existingExec = null;
      for (const comp of companiesInSearch) {
        const execs = await storage.getExecutivesByCompany(comp.id);
        const found = execs.find(e => e.clockworkId === clockworkId);
        if (found) {
          existingExec = found;
          break;
        }
      }
      
      if (existingExec) {
        console.log(`[Import] Executive with clockworkId ${clockworkId} already exists (ID: ${existingExec.id})`);
        return res.json({
          success: true,
          executive: existingExec,
          company: targetCompany,
          alreadyExists: true
        });
      }

      // Create new executive from Clockwork data
      const newExecutive = await storage.createExecutiveManual({
        companyId: targetCompany.id,
        name,
        title: title || 'Executive',
        email: email || null,
        phone: null,
        linkedin: linkedin || null,
        profileUrl: null,
        imageUrl: imageUrl || null,
        source: 'clockwork',
        confidence: 5,
        enrichmentSource: 'clockwork',
        enrichmentConfidence: 100,
        enrichmentTimestamp: new Date(),
        clockworkId,
        clockworkProjectId
      });

      console.log(`[Import] Created executive from Clockwork: ${name} (ID: ${newExecutive.id})`);

      // Fetch and store career history from Clockwork
      try {
        const { fetchClockworkCareerHistory } = await import('./services/enrichment');
        const careerPositions = await fetchClockworkCareerHistory(clockworkId);
        
        if (careerPositions.length > 0) {
          console.log(`[Import] Adding ${careerPositions.length} career history entries for ${name}`);
          
          for (let i = 0; i < careerPositions.length; i++) {
            const pos = careerPositions[i];
            await storage.createCareerHistory({
              executiveId: newExecutive.id,
              company: pos.company,
              title: pos.title,
              startDate: pos.startDate,
              endDate: pos.endDate,
              description: pos.isCurrent ? 'Current position' : null,
              sortOrder: i
            });
          }
          console.log(`[Import] Successfully added career history for ${name}`);
        } else {
          console.log(`[Import] No career history found in Clockwork for ${name}`);
        }
      } catch (careerError) {
        console.warn(`[Import] Failed to fetch career history for ${name}:`, careerError);
      }

      res.json({
        success: true,
        executive: newExecutive,
        company: targetCompany,
        alreadyExists: false
      });
    } catch (error) {
      console.error("Error importing Clockwork candidate:", error);
      res.status(500).json({ error: "Failed to import Clockwork candidate" });
    }
  });

  return httpServer;
}
