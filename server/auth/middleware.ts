import type { Request, Response, NextFunction } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { storage } from "../storage";
import type { OrgRole } from "@shared/schema";

// Authenticated request: populated by requireAuth. orgRole is carried for the
// upcoming role-based edit gating (not enforced yet).
export interface AuthedRequest extends Request {
  user?: User;
  userId?: string;
  orgId?: string;
  orgRole?: OrgRole;
}

// EventSource cannot set headers, so SSE routes pass the token as ?access_token=.
function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const qp = req.query.access_token;
  if (typeof qp === "string" && qp) return qp;
  return undefined;
}

// Verify the Supabase JWT and attach the user (no org required).
export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: "Missing authentication token" });
    return;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
  req.user = data.user;
  req.userId = data.user.id;
  next();
}

// Verify the user AND require an org membership; attach orgId + orgRole.
// Use for all business routes that operate on org-scoped data.
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireUser(req, res, async () => {
    const membership = await storage.getOrgMembershipByUser(req.userId!);
    if (!membership) {
      res.status(403).json({ message: "No organization for this user" });
      return;
    }
    req.orgId = membership.orgId;
    req.orgRole = membership.role as OrgRole;
    next();
  });
}

// Require an org admin (owner|admin). Use for org-mutation + member-management routes.
export async function requireOrgAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireAuth(req, res, () => {
    if (req.orgRole !== "owner" && req.orgRole !== "admin") {
      res.status(403).json({ message: "Admin access required" });
      return;
    }
    next();
  });
}
