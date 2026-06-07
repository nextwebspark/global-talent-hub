import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { UserProfile } from "@shared/schema";
import { supabase } from "./supabase";

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
}

interface MeResponse {
  org: AuthOrg | null;
  role: string | null;
  profile: UserProfile | null;
  lastLoginAt: string | null;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  org: AuthOrg | null;
  role: string | null;
  profile: UserProfile | null;
  lastLoginAt: string | null;
  // True once we know whether the signed-in user has an org (post-bootstrap).
  orgChecked: boolean;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ hasSession: boolean }>;
  signInOAuth: (provider: "google" | "azure") => Promise<void>;
  signOut: () => Promise<void>;
  refreshOrg: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Fetch the current user's org + profile context. Token is passed in (from the
// session we already hold) to avoid a nested supabase.auth.getSession() call
// during bootstrap, which can contend on Supabase's navigator lock and stall the
// app on "Loading…".
async function fetchMe(token: string): Promise<MeResponse> {
  const empty: MeResponse = { org: null, role: null, profile: null, lastLoginAt: null };
  const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return empty;
  const data = await res.json();
  return {
    org: data.org ?? null,
    role: data.role ?? null,
    profile: data.profile ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<AuthOrg | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);
  // Record a login event at most once per mount, after a real SIGNED_IN.
  const loggedRef = useRef(false);

  // Always resolves orgChecked, even if fetchMe throws — otherwise the Gate
  // is stuck on "Loading…" forever (e.g. on refresh when /api/auth/me errors).
  const loadOrg = async (activeSession: Session) => {
    try {
      const me = await fetchMe(activeSession.access_token);
      setOrg(me.org);
      setRole(me.role);
      setProfile(me.profile);
      setLastLoginAt(me.lastLoginAt);
    } catch {
      setOrg(null);
      setRole(null);
    } finally {
      setOrgChecked(true);
    }
  };

  useEffect(() => {
    // Single source of truth for session: onAuthStateChange fires once on mount
    // with INITIAL_SESSION (the restored session) and again on every change.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setOrgChecked(false);
        await loadOrg(newSession);
        // Log the sign-in once (not for INITIAL_SESSION / token refresh).
        if (event === "SIGNED_IN" && !loggedRef.current) {
          loggedRef.current = true;
          fetch("/api/auth/login-event", {
            method: "POST",
            headers: { Authorization: `Bearer ${newSession.access_token}` },
          }).catch(() => {});
        }
      } else {
        loggedRef.current = false;
        setOrg(null);
        setRole(null);
        setProfile(null);
        setLastLoginAt(null);
        setOrgChecked(true);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Returns hasSession=false when Supabase requires email confirmation (no token yet).
  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: fullName ? { full_name: fullName } : undefined },
    });
    if (error) throw error;
    return { hasSession: !!data.session };
  };

  const signInOAuth = async (provider: "google" | "azure") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const me = await fetchMe(data.session.access_token);
    setProfile(me.profile);
    setOrg(me.org);
    setRole(me.role);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        org,
        role,
        profile,
        lastLoginAt,
        orgChecked,
        signInPassword,
        signUp,
        signInOAuth,
        signOut,
        refreshOrg: async () => { if (session) await loadOrg(session); },
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
