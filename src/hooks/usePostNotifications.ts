import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'nsp_last_seen_post';
const UNREAD_KEY = 'nsp_unread_posts';

interface PostNotification {
  id: string;
  caption: string | null;
  type: string;
  created_at: string;
}

export const usePostNotifications = () => {
  const [unread, setUnread] = useState<PostNotification[]>(() => {
    try {
      const raw = localStorage.getItem(UNREAD_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const persist = (items: PostNotification[]) => {
    setUnread(items);
    localStorage.setItem(UNREAD_KEY, JSON.stringify(items));
  };

  const markAllRead = useCallback(() => {
    if (unread.length > 0) {
      localStorage.setItem(STORAGE_KEY, unread[0].created_at);
    }
    persist([]);
  }, [unread]);

  const showBrowserNotification = (post: PostNotification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification('📢 New post from NSP', {
          body: post.caption || 'A new post has been shared',
          icon: '/favicon.ico',
          tag: post.id,
        });
      } catch {/* ignore */}
    }
  };

  useEffect(() => {
    // Request permission once
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel('posts-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          const post = payload.new as PostNotification;
          // In-app toast (works whether tab focused or not)
          toast.success('📢 New post from Admin', {
            description: post.caption?.slice(0, 80) || 'Tap the bell to view',
            duration: 6000,
          });
          // Browser/system popup (works even if app not focused)
          showBrowserNotification(post);
          // Update unread list
          setUnread((prev) => {
            const next = [post, ...prev.filter(p => p.id !== post.id)].slice(0, 20);
            localStorage.setItem(UNREAD_KEY, JSON.stringify(next));
            return next;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { unread, count: unread.length, markAllRead };
};
