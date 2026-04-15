import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const usePrayerRequests = () => {
  const query = useQuery({
    queryKey: ['prayer_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prayer_requests')
        .select('*, profiles:user_id(full_name, profile_image_url), prayer_interactions(id, user_id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('prayers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prayer_requests' }, () => {
        query.refetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prayer_interactions' }, () => {
        query.refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return query;
};
