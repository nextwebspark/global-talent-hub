import { Switch, Route } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/universe/:searchQueryId" component={Universe} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <CommandPalette />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
