import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

const UNREAD_KEY = 'nsp_unread_notifications_v2';

export type NotificationKind = 'image' | 'video' | 'youtube' | 'voice' | 'prayer';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  created_at: string;
  source: 'post' | 'prayer';
}

interface Ctx {
  notifications: AppNotification[];
  count: number;
  markAllRead: () => void;
  current: AppNotification | null;
  dismissCurrent: () => void;
}

const NotificationsContext = createContext<Ctx>({
  notifications: [],
  count: 0,
  markAllRead: () => {},
  current: null,
  dismissCurrent: () => {},
});

export const useRealtimeNotifications = () => useContext(NotificationsContext);

const labelFor = (kind: NotificationKind): { title: string; body: (caption?: string | null) => string } => {
  switch (kind) {
    case 'image':
      return { title: '📸 Admin just posted a new image', body: c => c || 'Tap the bell to view the new image' };
    case 'video':
      return { title: '🎬 Admin just posted a new video', body: c => c || 'A new video is available' };
    case 'youtube':
      return { title: '▶️ Admin just shared a YouTube video', body: c => c || 'Watch the latest YouTube post' };
    case 'voice':
      return { title: '🎙️ Admin just posted a Voice Note', body: c => c || 'Tap to listen to the new voice note' };
    case 'prayer':
      return { title: '🙏 New prayer request', body: c => c || 'A community member shared a prayer request' };
  }
};

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const raw = localStorage.getItem(UNREAD_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [current, setCurrent] = useState<AppNotification | null>(null);

  const persist = useCallback((next: AppNotification[]) => {
    setNotifications(next);
    localStorage.setItem(UNREAD_KEY, JSON.stringify(next));
  }, []);

  const markAllRead = useCallback(() => persist([]), [persist]);
  const dismissCurrent = useCallback(() => setCurrent(null), []);

  const showSystem = (n: AppNotification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { new Notification(n.title, { body: n.body, icon: '/favicon.ico', tag: n.id }); } catch {}
    }
  };

  const pushNotification = useCallback((n: AppNotification) => {
    setCurrent(n); // big 5s overlay
    showSystem(n);
    setNotifications(prev => {
      const next = [n, ...prev.filter(x => x.id !== n.id)].slice(0, 25);
      localStorage.setItem(UNREAD_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel('app-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const p = payload.new as any;
        const kind: NotificationKind = (p.type === 'voice' ? 'voice'
          : p.type === 'youtube' ? 'youtube'
          : p.type === 'video' ? 'video'
          : 'image');
        const meta = labelFor(kind);
        pushNotification({
          id: p.id,
          kind,
          title: meta.title,
          body: meta.body(p.caption),
          created_at: p.created_at,
          source: 'post',
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prayer_requests' }, (payload) => {
        const p = payload.new as any;
        const meta = labelFor('prayer');
        pushNotification({
          id: p.id,
          kind: 'prayer',
          title: meta.title,
          body: meta.body(p.message?.slice(0, 90)),
          created_at: p.created_at,
          source: 'prayer',
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [pushNotification]);

  // Auto-dismiss the big overlay after 5s
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 5000);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <NotificationsContext.Provider value={{ notifications, count: notifications.length, markAllRead, current, dismissCurrent }}>
      {children}
    </NotificationsContext.Provider>
  );
};
