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
        
        {/* Floating Controls / Legend */}
        <div className="absolute top-4 right-4 z-[400] bg-background/90 backdrop-blur border border-border p-3 rounded shadow-lg text-xs pointer-events-auto">
             <div className="font-semibold mb-2 flex items-center justify-between gap-4">
                <span>{scalingMetric === 'revenue' ? 'Revenue Scale' : 'Employee Scale'}</span>
                
                {/* Mini Toggle for accessibility if panel is closed */}
                <div className="flex bg-muted rounded p-0.5">
                  <button 
                    onClick={() => setScalingMetric('revenue')}
                    className={`px-1.5 py-0.5 rounded-sm transition-colors ${scalingMetric === 'revenue' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    $
                  </button>
                  <button 
                    onClick={() => setScalingMetric('employees')}
                    className={`px-1.5 py-0.5 rounded-sm transition-colors ${scalingMetric === 'employees' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <span className="sr-only">Employees</span>
                    👥
                  </button>
                </div>
             </div>
             
             {scalingMetric === 'revenue' ? (
               <>
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
               </>
             ) : (
                <>
                 <div className="flex items-center gap-2 mb-1">
                   <div className="w-2 h-2 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
                   <span>&lt; 1,000</span>
                 </div>
                 <div className="flex items-center gap-2 mb-1">
                   <div className="w-3 h-3 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
                   <span>1k - 10k</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="w-4 h-4 rounded-full bg-primary opacity-40" style={{ transform: 'scale(0.8)' }}></div>
                   <span>10k+</span>
                 </div>
               </>
             )}
        </div>
      </div>
      
      <RightPanel />
    </div>
  );
}
