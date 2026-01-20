import { useAppStore } from '@/lib/store';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import { useLocation } from 'wouter';
import { useEffect } from 'react';

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { currentProject } = useAppStore();

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
        
        {/* Floating Controls / Legend could go here */}
        <div className="absolute top-4 right-4 z-[400] bg-background/90 backdrop-blur border border-border p-3 rounded shadow-lg text-xs pointer-events-none">
             <div className="font-semibold mb-2">Revenue Scale</div>
             <div className="flex items-center gap-2 mb-1">
               <div className="w-2 h-2 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
               <span>$100M - $1B</span>
             </div>
             <div className="flex items-center gap-2 mb-1">
               <div className="w-3 h-3 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
               <span>$1B - $10B</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-4 h-4 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
               <span>$10B+</span>
             </div>
        </div>
      </div>
      
      <RightPanel />
    </div>
  );
}
