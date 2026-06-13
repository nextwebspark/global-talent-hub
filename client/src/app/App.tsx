import { installAuthFetch } from '@/lib/authFetch';
import { AppProviders } from './providers';
import { Gate } from './Gate';

// Attach the Supabase bearer token to all /api fetches (before any render).
installAuthFetch();

export default function App() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}
