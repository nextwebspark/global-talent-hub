import type { Express } from "express";
import { storage } from "../../storage";
import { orchestrateEnrichmentMatching, exploreClockworkProjectEndpoints } from "../../services/clockworkEnrichment";

export function registerClockwork(app: Express): void {
  // CLOCKWORK DIAGNOSTICS
  // Test Clockwork connectivity and return detailed diagnostic info
  app.get("/api/clockwork/diagnostics", async (_req, res) => {
    try {
      const { runClockworkDiagnostics } = await import("../../services/clockworkEnrichment");
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
      const { getClockworkProjects } = await import("../../services/clockworkEnrichment");
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

      const { fetchClockworkProjectPeople } = await import("../../services/clockworkEnrichment");
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
  app.patch("/api/search/:searchId/name", async (req, res) => {
    try {
      const searchId = parseInt(req.params.searchId);
      const { name } = req.body;

      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      const updated = await storage.updateSearchQueryName(searchId, name.trim());
      res.json(updated);
    } catch (error) {
      console.error("Error renaming project:", error);
      res.status(500).json({ error: "Failed to rename project" });
    }
  });

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
}
