import type { Express } from "express";
import { storage } from "../../storage";
import { orchestrateEnrichmentMatching, researchCompanyDetails } from "../../services/clockworkEnrichment";
import { normalizeOrInferSector } from "../../services/sectorInference";

export function registerEnrichment(app: Express): void {
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
          const { sector: resolvedSector, category: resolvedCategory } = await normalizeOrInferSector(researchedData.name, researchedData.sector);
          // Create a new company with researched data
          targetCompany = await storage.createCompanyManual({
            name: researchedData.name,
            sector: resolvedSector || researchedData.sector,
            sectorCategory: resolvedCategory || null,
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
        const { fetchClockworkCareerHistory } = await import('../../services/clockworkEnrichment');
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
}
