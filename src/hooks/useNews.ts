import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type NewsItem = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  source: string | null;
  published_at: string | null;
};

type Meme = {
  id: string;
  external_id: string;
  title: string | null;
  image_url: string;
  source: string | null;
};

export const useNews = (category: string = 'world') => {
  return useQuery<NewsItem[]>({
    queryKey: ['news', category],
    queryFn: async () => {
      await supabase.functions.invoke('fetch-news', { body: { category } });
      const { data } = await supabase
        .from('news_cache')
        .select('*')
        .eq('category', category)
        .order('published_at', { ascending: false })
        .limit(30);
      return (data as NewsItem[]) ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useMemes = () => {
  return useQuery<Meme[]>({
    queryKey: ['memes'],
    queryFn: async () => {
      await supabase.functions.invoke('fetch-memes', { body: {} });
      const { data } = await supabase
        .from('memes_cache')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(30);
      return (data as Meme[]) ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });
};
