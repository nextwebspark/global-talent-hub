import { Switch, Route, Redirect, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import CommandPalette from '@/components/layout/CommandPalette';
import Login from '@/features/auth/Login';
import Signup from '@/features/auth/Signup';
import { AppRouter } from './AppRouter';

export function Gate() {
  const { session, loading, org, orgChecked } = useAuth();
  const [location] = useLocation();

  if (loading || (session && !orgChecked)) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))' }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <Switch>
        <Route path="/signup">{() => <Signup />}</Route>
        <Route path="/login" component={Login} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  if (!org) {
    return <Signup startStep={1} />;
  }

  if (location === '/login' || location === '/signup') {
    return <Redirect to="/" />;
  }

  return (
    <>
      <AppRouter />
      <CommandPalette />
    </>
  );
}
