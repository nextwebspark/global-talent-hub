import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { generateMockData } from '@/lib/mock';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Landing() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  
  const { setProject, setCompanies, setExecutives } = useAppStore();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);

    // Simulate AI Processing time
    setTimeout(() => {
      const { companies, executives } = generateMockData(input);
      
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        name: input, // Use search string as temporary name
        search_string: input,
        created_at: new Date()
      });
      
      setCompanies(companies);
      setExecutives(executives);
      
      setLoading(false);
      setLocation('/dashboard');
    }, 2000);
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 w-full max-w-2xl px-6 text-center"
      >
        <div className="mb-8 flex justify-center">
           <div className="h-16 w-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-2xl">
              <Globe className="h-8 w-8" />
           </div>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight text-foreground mb-4">
          Global Talent Map
        </h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
          AI-driven market intelligence for executive search. <br/>
          Identify top companies and leaders in seconds.
        </p>

        <form onSubmit={handleSearch} className="relative max-w-xl mx-auto group">
          <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative flex items-center bg-card shadow-lg rounded-full border border-border/50 overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <Search className="ml-4 h-5 w-5 text-muted-foreground shrink-0" />
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 'Top 10 luxury watch distributors in Switzerland'" 
              className="border-0 shadow-none focus-visible:ring-0 h-14 text-lg bg-transparent px-4"
              disabled={loading}
            />
            <Button 
              type="submit" 
              size="lg" 
              disabled={loading}
              className="h-10 mr-2 rounded-full px-6 font-semibold shadow-none"
            >
              {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Map Market'}
            </Button>
          </div>
          
          <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
             <span>Public Data Only</span>
             <span>•</span>
             <span className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors">
               Connect Clockwork <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
             </span>
          </div>
        </form>
      </motion.div>
      
      <div className="absolute bottom-6 text-xs text-muted-foreground opacity-50">
        &copy; 2026 Executive Search Systems
      </div>
    </div>
  );
}
