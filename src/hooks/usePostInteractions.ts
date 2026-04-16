import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export const usePostLikes = (postId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['post-likes', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_likes')
        .select('id, user_id')
        .eq('post_id', postId);
      if (error) throw error;
      return data;
    },
  });

  const toggleLike = async () => {
    if (!user) return;
    const isLiked = query.data?.some(l => l.user_id === user.id);
    if (isLiked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ['post-likes', postId] });
  };

  return {
    likes: query.data ?? [],
    isLiked: query.data?.some(l => l.user_id === user?.id) ?? false,
    likeCount: query.data?.length ?? 0,
    toggleLike,
  };
};

export const usePostComments = (postId: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*, profiles:user_id(full_name, profile_image_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`comments-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId]);

  const addComment = async (content: string, userId: string, parentId?: string) => {
    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      content,
      parent_id: parentId || null,
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
  };

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    addComment,
  };
};
