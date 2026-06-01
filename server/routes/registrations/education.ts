import type { Express } from "express";
import { storage } from "../../storage";
import { insertEducationSchema } from "@shared/schema";

export function registerEducation(app: Express): void {
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
}
