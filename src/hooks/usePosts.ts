import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const usePosts = (page = 0, pageSize = 10) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['posts', page],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:user_id(full_name, profile_image_url)')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return query;
};
