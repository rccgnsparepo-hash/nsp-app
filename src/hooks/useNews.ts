import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useNews = (category: string = 'world') => {
  return useQuery({
    queryKey: ['news', category],
    queryFn: async () => {
      // Trigger refresh (cached server-side)
      await supabase.functions.invoke('fetch-news', { body: { category } });
      const { data } = await supabase
        .from('news_cache')
        .select('*')
        .eq('category', category)
        .order('published_at', { ascending: false })
        .limit(30);
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useMemes = () => {
  return useQuery({
    queryKey: ['memes'],
    queryFn: async () => {
      await supabase.functions.invoke('fetch-memes', { body: {} });
      const { data } = await supabase
        .from('memes_cache')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(30);
      return data ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });
};
