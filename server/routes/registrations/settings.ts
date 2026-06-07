import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, requireOrgAdmin, type AuthedRequest } from "../../auth/middleware";

const PROFILE_FIELDS = ["fullName", "jobTitle", "phone", "avatarUrl", "timezone", "language", "preferences"] as const;
const ORG_FIELDS = ["name", "region", "teamSize", "logoUrl", "defaultRole", "require2fa"] as const;
const ROLES = ["owner", "admin", "member", "viewer"];

function pick<T extends object>(src: any, keys: readonly string[]): Partial<T> {
  const out: any = {};
  for (const k of keys) if (src?.[k] !== undefined) out[k] = src[k];
  return out;
}

export function registerSettings(app: Express): void {
  // ── Profile (own) ────────────────────────────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const profile = await storage.getUserProfile(req.userId!);
      res.json({ profile: profile ?? null });
    } catch (error) {
      console.error("Error loading profile:", error);
      res.status(500).json({ message: "Failed to load profile" });
    }
  });

  app.put("/api/profile", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const fields = pick(req.body, PROFILE_FIELDS);
      const profile = await storage.upsertUserProfile(req.userId!, fields);
      res.json({ profile });
    } catch (error) {
      console.error("Error saving profile:", error);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  // ── Login activity ───────────────────────────────────────────────────────────
  app.post("/api/auth/login-event", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
      await storage.recordLoginEvent({
        userId: req.userId!,
        orgId: req.orgId ?? null,
        ip,
        userAgent: req.headers["user-agent"] ?? null,
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error recording login event:", error);
      res.status(500).json({ message: "Failed to record login" });
    }
  });

  app.get("/api/auth/login-events", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const events = await storage.getLoginEvents(req.userId!, 10);
      res.json({ events });
    } catch (error) {
      console.error("Error loading login events:", error);
      res.status(500).json({ message: "Failed to load login events" });
    }
  });

  // ── Organization (read any member; write admin only) ──────────────────────────
  app.get("/api/org", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const org = await storage.getOrganization(req.orgId!);
      res.json({ org: org ?? null });
    } catch (error) {
      console.error("Error loading org:", error);
      res.status(500).json({ message: "Failed to load organization" });
    }
  });

  app.put("/api/org", requireOrgAdmin, async (req: AuthedRequest, res) => {
    try {
      const fields = pick(req.body, ORG_FIELDS);
      const org = await storage.updateOrganization(req.orgId!, fields);
      res.json({ org });
    } catch (error) {
      console.error("Error saving org:", error);
      res.status(500).json({ message: "Failed to save organization" });
    }
  });

  // ── Members ──────────────────────────────────────────────────────────────────
  app.get("/api/org/members", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const members = await storage.getOrgMembers(req.orgId!);
      res.json({ members });
    } catch (error) {
      console.error("Error loading members:", error);
      res.status(500).json({ message: "Failed to load members" });
    }
  });

  app.patch("/api/org/members/:id", requireOrgAdmin, async (req: AuthedRequest, res) => {
    try {
      const memberId = String(req.params.id);
      const role = String(req.body?.role ?? "");
      if (!ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const member = await storage.getOrgMemberById(memberId, req.orgId!);
      if (!member) return res.status(404).json({ message: "Member not found" });
      // Don't demote the last owner.
      if (member.role === "owner" && role !== "owner" && (await storage.countOrgOwners(req.orgId!)) <= 1) {
        return res.status(409).json({ message: "Cannot demote the only owner" });
      }
      const updated = await storage.updateOrgMemberRole(memberId, req.orgId!, role);
      res.json({ member: updated });
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  });

  app.delete("/api/org/members/:id", requireOrgAdmin, async (req: AuthedRequest, res) => {
    try {
      const memberId = String(req.params.id);
      const member = await storage.getOrgMemberById(memberId, req.orgId!);
      if (!member) return res.status(404).json({ message: "Member not found" });
      // Don't remove the last owner.
      if (member.role === "owner" && (await storage.countOrgOwners(req.orgId!)) <= 1) {
        return res.status(409).json({ message: "Cannot remove the only owner" });
      }
      await storage.deleteOrgMember(memberId, req.orgId!);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });
}
