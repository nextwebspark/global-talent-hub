import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import CommandPalette from "@/components/layout/CommandPalette";
import Landing from "@/pages/Landing";
import Universe from "@/pages/Universe";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Auth/Login";
import Signup from "@/pages/Auth/Signup";
import Settings from "@/pages/Settings";
import { AuthProvider, useAuth } from "@/lib/auth";
import { installAuthFetch } from "@/lib/authFetch";

// Attach the Supabase bearer token to all /api fetches (before any render).
installAuthFetch();

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/universe/:searchQueryId" component={Universe} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { session, loading, org, orgChecked } = useAuth();
  const [location] = useLocation();

  if (loading || (session && !orgChecked)) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))" }}>
        Loading…
      </div>
    );
  }

  // Signed out → auth screens only.
  if (!session) {
    return (
      <Switch>
        <Route path="/signup">{() => <Signup />}</Route>
        <Route path="/login" component={Login} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  // Signed in but no org yet (e.g. fresh SSO user) → finish org setup.
  if (!org) {
    return <Signup startStep={1} />;
  }

  // Authed users that are still on an auth route (e.g. just signed in at /login)
  // would hit the app's NotFound — bounce them to home.
  if (location === "/login" || location === "/signup") {
    return <Redirect to="/" />;
  }

  return (
    <>
      <AppRouter />
      <CommandPalette />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Gate />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
