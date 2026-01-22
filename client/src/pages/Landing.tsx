import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { useSearch, useModels } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Globe, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Landing() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('replit');
  const [, setLocation] = useLocation();
  
  const { setProject, loadFromAPI } = useAppStore();
  const searchMutation = useSearch();
  const { data: models } = useModels();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const result = await searchMutation.mutateAsync({ query: input, model: selectedModel });
      
      setProject({
        id: String(result.searchQueryId),
        name: input,
        search_string: input,
        created_at: new Date()
      });
      
      loadFromAPI(result.results);
      
      toast.success(`Found ${result.results.length} companies matching your criteria`);
      setLocation('/dashboard');
    } catch (error) {
      toast.error('Search failed. Please try again.');
      console.error('Search error:', error);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
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

        <form onSubmit={handleSearch} className="relative max-w-3xl mx-auto group">
          <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative flex items-center gap-2">
            <div className="flex-1 flex items-center bg-card shadow-lg rounded-full border border-border/50 overflow-hidden hover:shadow-xl transition-shadow duration-300">
              <Search className="ml-4 h-5 w-5 text-muted-foreground shrink-0" />
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. 'Top 20 CFOs in luxury watch brands globally'" 
                className="border-0 shadow-none focus-visible:ring-0 h-14 text-lg bg-transparent px-4"
                disabled={searchMutation.isPending}
                data-testid="input-search-query"
              />
              <Button 
                type="submit" 
                size="lg" 
                disabled={searchMutation.isPending}
                className="h-10 mr-2 rounded-full px-6 font-semibold shadow-none"
                data-testid="button-submit-search"
              >
                {searchMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : 'Deep Search'}
              </Button>
            </div>
            
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-48 h-14 text-sm bg-card border-border/50 rounded-full shadow-lg cursor-pointer [&>span]:flex-1 [&>span]:text-left" data-testid="select-model">
                <div className="flex items-center gap-2 px-2">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <SelectValue placeholder="Select model..." />
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {models?.map((model) => (
                  <SelectItem key={model.id} value={model.id} data-testid={`model-${model.id}`}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      <span className="text-[10px] text-muted-foreground">({model.provider})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
      </motion.div>
      
      <div className="absolute bottom-6 text-xs text-muted-foreground opacity-50">
        &copy; 2026 Global Talent Map
      </div>
    </div>
  );
}
