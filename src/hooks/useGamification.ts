import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export const useUserStats = (userId?: string) => {
  return useQuery({
    queryKey: ['user_stats', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });
};

export const useUserBadges = (userId?: string) => {
  return useQuery({
    queryKey: ['user_badges', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase.from('user_badges').select('*').eq('user_id', userId).order('awarded_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!userId,
  });
};

export const useDailyLogin = (userId?: string) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const key = `last_login_${userId}`;
    const today = new Date().toDateString();
    if (localStorage.getItem(key) === today) return;

    (async () => {
      const { data, error } = await supabase.rpc('record_daily_login', { _user_id: userId });
      if (!error && data && data.length > 0) {
        const result = data[0];
        localStorage.setItem(key, today);
        qc.invalidateQueries({ queryKey: ['user_stats', userId] });
        qc.invalidateQueries({ queryKey: ['user_badges', userId] });
        if (result.streak > 1) {
          toast.success(`🔥 ${result.streak}-day streak! +10 points`);
        }
        if (result.awarded_badge) {
          toast.success(`🏆 New badge: ${result.awarded_badge.replace('_', ' ')}!`);
        }
      }
    })();
  }, [userId, qc]);
};

export const BADGE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  streak_master: { label: 'Streak Master', emoji: '🔥', color: 'bg-destructive' },
  streak_legend: { label: 'Streak Legend', emoji: '👑', color: 'bg-primary' },
  top_contributor: { label: 'Top Contributor', emoji: '⭐', color: 'bg-primary' },
  prayer_warrior: { label: 'Prayer Warrior', emoji: '🙏', color: 'bg-accent text-accent-foreground' },
  first_post: { label: 'First Post', emoji: '✍️', color: 'bg-primary' },
};
