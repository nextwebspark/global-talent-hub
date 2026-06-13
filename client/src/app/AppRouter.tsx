/**
 * Application routes (authenticated).
 *
 * User journey:
 *   Landing (search) → Universe (review results) → Dashboard (map / table / export)
 */
import { Switch, Route } from 'wouter';
import LandingPage from '@/features/landing/LandingPage';
import UniversePage from '@/features/universe/UniversePage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ProjectsPage from '@/features/projects/ProjectsPage';
import SettingsPage from '@/features/settings';
import NotFound from '@/app/NotFound';

export function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/universe/:searchQueryId" component={UniversePage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}
