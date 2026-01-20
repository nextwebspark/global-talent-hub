import { useAppStore } from '@/lib/store';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { useEffect } from 'react';

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { currentProject, scalingMetric, setScalingMetric } = useAppStore();

  // Redirect if no project exists (simple protection)
  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);

  if (!currentProject) return null;

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
