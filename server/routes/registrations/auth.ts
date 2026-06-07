import type { Express } from "express";
import { storage } from "../../storage";
import { requireUser, requireAuth, type AuthedRequest } from "../../auth/middleware";

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function registerAuth(app: Express): void {
  // Create an organization for the authenticated user and make them owner.
  // The Supabase user is created client-side (signUp); this only sets up the org.
  app.post("/api/auth/signup-org", requireUser, async (req: AuthedRequest, res) => {
    try {
      const { org, name: fullName } = req.body ?? {};
      const name: string | undefined = org?.name?.trim();
      if (!name) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      // Reject if the user already belongs to an org.
      const existing = await storage.getOrgMembershipByUser(req.userId!);
      if (existing) {
        return res.status(409).json({ message: "User already has an organization" });
      }

      let slug = slugify(org?.slug || name);
      if (await storage.getOrgBySlug(slug)) {
        slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const organization = await storage.createOrganization({
        name,
        slug,
        teamSize: org?.teamSize ?? null,
        region: org?.region ?? null,
        createdBy: req.userId!,
      });

      await storage.createOrgMember({
        orgId: organization.id,
        userId: req.userId!,
        email: req.user?.email ?? null,
        role: "owner",
      });

      // Seed the profile with the name captured at signup (typed, or from the
      // SSO identity) so it shows in Settings/Members without a manual edit.
      const trimmedName = typeof fullName === "string" ? fullName.trim() : "";
      if (trimmedName) {
        await storage.upsertUserProfile(req.userId!, { fullName: trimmedName });
      }

      res.status(201).json({ org: organization, role: "owner" });
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  // Bootstrap endpoint: current user + their org + role. 200 even without an org
  // (org === null) so the client can route a new SSO user into org setup.
  app.get("/api/auth/me", requireUser, async (req: AuthedRequest, res) => {
    try {
      const membership = await storage.getOrgMembershipByUser(req.userId!);
      const org = membership ? await storage.getOrganization(membership.orgId) : null;
      const profile = await storage.getUserProfile(req.userId!);
      res.json({
        user: { id: req.userId, email: req.user?.email ?? null },
        org: org ?? null,
        role: membership?.role ?? null,
        profile: profile ?? null,
        lastLoginAt: membership?.lastLoginAt ?? null,
      });
    } catch (error) {
      console.error("Error loading auth context:", error);
      res.status(500).json({ message: "Failed to load auth context" });
    }
  });
}

// Re-export the gate so routes/index.ts can mount it without a second import path.
export { requireAuth };
