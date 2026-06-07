import type { Express } from "express";
import { storage } from "../../storage";
import { insertRemunerationSchema } from "@shared/schema";
import type { AuthedRequest } from "../../auth/middleware";
import { assertExecutiveInOrg, assertRemunerationInOrg, NotInOrgError } from "../../auth/orgGuard";

export function registerRemuneration(app: Express): void {
  app.get("/api/executives/:id/remuneration", async (req: AuthedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await assertExecutiveInOrg(id, req.orgId!);
      const remunerationData = await storage.getRemuneration(id);
      res.json(remunerationData);
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error fetching remuneration:", error);
      res.status(500).json({ error: "Failed to fetch remuneration" });
    }
  });

  app.post("/api/executives/:id/remuneration", async (req: AuthedRequest, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      await assertExecutiveInOrg(executiveId, req.orgId!);
      const validated = insertRemunerationSchema.parse({ ...req.body, executiveId });
      const entry = await storage.createRemuneration(validated);
      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error creating remuneration:", error);
      res.status(400).json({ error: "Invalid remuneration data" });
    }
  });

  app.patch("/api/remuneration/:id", async (req: AuthedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await assertRemunerationInOrg(id, req.orgId!);
      const entry = await storage.updateRemuneration(id, req.body);
      res.json(entry);
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error updating remuneration:", error);
      res.status(500).json({ error: "Failed to update remuneration" });
    }
  });

  app.delete("/api/remuneration/:id", async (req: AuthedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await assertRemunerationInOrg(id, req.orgId!);
      await storage.deleteRemuneration(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error deleting remuneration:", error);
      res.status(500).json({ error: "Failed to delete remuneration" });
    }
  });

  app.post("/api/executives/:id/remuneration/parse", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const executiveId = parseInt(String(req.params.id));
      const exec = await storage.getExecutive(executiveId, orgId);
      if (!exec) return res.status(404).json({ error: "Executive not found" });

      const text = req.body?.text || exec.remunerationNotes;
      if (!text || text.trim().length < 5) {
        return res.status(400).json({ error: "No remuneration text to parse" });
      }

      const { parseRemunerationText } = await import("../../services/remunerationParser");
      const parsed = await parseRemunerationText(text);
      if (!parsed) {
        return res.status(422).json({ error: "Could not extract structured remuneration data from the provided text" });
      }

      await storage.deleteRemunerationByExecutive(executiveId);
      const entry = await storage.createRemuneration({
        executiveId,
        baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
        housingAllowance: parsed.housingAllowance != null ? String(parsed.housingAllowance) : null,
        transportAllowance: parsed.transportAllowance != null ? String(parsed.transportAllowance) : null,
        schoolingAllowance: parsed.schoolingAllowance != null ? String(parsed.schoolingAllowance) : null,
        totalAllowances: parsed.totalAllowances != null ? String(parsed.totalAllowances) : null,
        bonus: parsed.bonus != null ? String(parsed.bonus) : null,
        longTermIncentives: parsed.longTermIncentives != null ? String(parsed.longTermIncentives) : null,
        currency: parsed.currency,
        year: parsed.year,
        notes: parsed.notes,
      });

      res.status(201).json({ parsed, entry });
    } catch (error) {
      console.error("Error parsing remuneration:", error);
      res.status(500).json({ error: "Failed to parse remuneration data" });
    }
  });
}
