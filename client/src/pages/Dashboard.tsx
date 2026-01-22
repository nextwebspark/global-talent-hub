import { useAppStore } from '@/lib/store';
import { useCompanies } from '@/lib/api';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { currentProject, loadFromAPI } = useAppStore();
  const { data: companies, isLoading } = useCompanies();

  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);

  useEffect(() => {
    if (companies && companies.length > 0) {
      loadFromAPI(companies);
    }
  }, [companies, loadFromAPI]);

  if (!currentProject) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden font-sans text-foreground">
      <LeftPanel />
      
      <div className="flex-1 relative z-0">
        <MapComponent />
      </div>
      
      <RightPanel />
    </div>
  );
}
