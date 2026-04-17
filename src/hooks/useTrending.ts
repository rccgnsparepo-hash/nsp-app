import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Engagement-ranked posts: count likes + comments, weight by recency
export const useTrendingPosts = (limit = 5) => {
  return useQuery({
    queryKey: ['trending-posts', limit],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: posts } = await supabase
        .from('posts')
        .select('*, profiles:user_id(full_name, profile_image_url)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!posts || posts.length === 0) return [];

      const ids = posts.map(p => p.id);
      const [likesRes, commentsRes] = await Promise.all([
        supabase.from('post_likes').select('post_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
      ]);

      const likeCount: Record<string, number> = {};
      const commentCount: Record<string, number> = {};
      (likesRes.data ?? []).forEach((l: any) => { likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1; });
      (commentsRes.data ?? []).forEach((c: any) => { commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1; });

      const now = Date.now();
      const scored = posts.map(p => {
        const ageHours = (now - new Date(p.created_at!).getTime()) / 36e5;
        const likes = likeCount[p.id] || 0;
        const comments = commentCount[p.id] || 0;
        const engagement = likes + comments * 2;
        // Hacker News-style decay
        const score = (engagement + 1) / Math.pow(ageHours + 2, 1.5);
        return { ...p, _likes: likes, _comments: comments, _score: score };
      });
      scored.sort((a, b) => b._score - a._score);
      return scored.slice(0, limit);
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useTrendingPrayer = () => {
  return useQuery({
    queryKey: ['trending-prayer'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: prayers } = await supabase
        .from('prayer_requests')
        .select('*, profiles:user_id(full_name, profile_image_url)')
        .gte('created_at', since)
        .limit(30);
      if (!prayers || prayers.length === 0) return null;

      const ids = prayers.map(p => p.id);
      const { data: amens } = await supabase
        .from('prayer_interactions')
        .select('prayer_request_id')
        .in('prayer_request_id', ids);
      const counts: Record<string, number> = {};
      (amens ?? []).forEach((a: any) => { counts[a.prayer_request_id] = (counts[a.prayer_request_id] || 0) + 1; });

      const ranked = prayers
        .map(p => ({ ...p, _amens: counts[p.id] || 0 }))
        .sort((a, b) => b._amens - a._amens);
      return ranked[0];
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useMemeOfTheDay = () => {
  return useQuery({
    queryKey: ['meme-of-day'],
    queryFn: async () => {
      await supabase.functions.invoke('fetch-memes', { body: {} });
      const { data } = await supabase
        .from('memes_cache')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
    staleTime: 60 * 60 * 1000,
  });
};
