import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Server-truth notification center.
 * - Live `unread` count sourced from public.notifications for the current user.
 * - `markRead(filter)` marks matching rows read + updates the badge.
 * - Handles cold-start deep-links: consumes `nsp_pending_route` (native taps)
 *   and `?nid=` query params (web SW taps) on mount.
 */

export type ReadFilter = {
  ids?: string[];
  kinds?: string[];
  entity_type?: string;
  entity_id?: string;
  group_key?: string;
  dedupe_id?: string;
  senderId?: string; // matches data->>sender_id
};

interface Ctx {
  unread: number;
  refresh: () => Promise<void>;
  markRead: (filter: ReadFilter) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationCenterContext = createContext<Ctx>({
  unread: 0,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

export const useNotificationCenter = () => useContext(NotificationCenterContext);

const PENDING_ROUTE_KEY = 'nsp_pending_route';
const PENDING_NID_KEY = 'nsp_pending_nid';

/** Called from native click handler while app is booting. */
export const stashPendingRoute = (path: string, nid?: string | null) => {
  try {
    if (path) localStorage.setItem(PENDING_ROUTE_KEY, path);
    if (nid) localStorage.setItem(PENDING_NID_KEY, nid);
  } catch {}
};

export const NotificationCenterProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const consumedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) { setUnread(0); return; }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setUnread(count ?? 0);
  }, [user?.id]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`notif-center:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  const markRead = useCallback(async (filter: ReadFilter) => {
    if (!user) return;
    let q = supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString(), clicked_at: new Date().toISOString() } as any)
      .eq('user_id', user.id)
      .eq('read', false);
    if (filter.ids?.length) q = q.in('id', filter.ids);
    if (filter.kinds?.length) q = q.in('kind', filter.kinds);
    if (filter.entity_type) q = q.eq('entity_type', filter.entity_type);
    if (filter.entity_id) q = q.eq('entity_id', filter.entity_id);
    if (filter.group_key) q = q.eq('group_key', filter.group_key);
    if (filter.dedupe_id) q = q.eq('dedupe_id', filter.dedupe_id);
    if (filter.senderId) q = q.filter('data->>sender_id', 'eq', filter.senderId);
    await q;
    refresh();
  }, [user?.id, refresh]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() } as any)
      .eq('user_id', user.id)
      .eq('read', false);
    setUnread(0);
    refresh();
  }, [user?.id, refresh]);

  // Cold-start deep-link consumer (native OneSignal tap + web SW openWindow fallback).
  useEffect(() => {
    if (!user || consumedRef.current) return;
    consumedRef.current = true;
    try {
      const pending = localStorage.getItem(PENDING_ROUTE_KEY);
      const nid = localStorage.getItem(PENDING_NID_KEY);
      if (nid) {
        localStorage.removeItem(PENDING_NID_KEY);
        markRead({ dedupe_id: nid });
      }
      if (pending) {
        localStorage.removeItem(PENDING_ROUTE_KEY);
        // slight defer so router is mounted
        setTimeout(() => { try { navigate(pending); } catch {} }, 0);
      }
      // Web SW may open a URL with ?nid= for the tapped notification
      const url = new URL(window.location.href);
      const qNid = url.searchParams.get('nid');
      if (qNid) {
        markRead({ dedupe_id: qNid });
        url.searchParams.delete('nid');
        window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
      }
    } catch {}
  }, [user?.id, navigate, markRead]);

  // Listen for in-session SW notification taps (existing window focused).
  useEffect(() => {
    if (!user) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMsg = (event: MessageEvent) => {
      const d: any = event.data;
      if (!d || d.type !== 'push:navigate') return;
      if (d.nid) markRead({ dedupe_id: String(d.nid) });
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [user?.id, markRead]);

  return (
    <NotificationCenterContext.Provider value={{ unread, refresh, markRead, markAllRead }}>
      {children}
    </NotificationCenterContext.Provider>
  );
};

/** Auto-mark matching notifications as read while a destination screen is mounted. */
export const useMarkNotificationsRead = (filter: ReadFilter, enabled: boolean = true) => {
  const { markRead } = useNotificationCenter();
  const key = JSON.stringify(filter);
  useEffect(() => {
    if (!enabled) return;
    markRead(filter);
    // Re-mark on window focus in case new ones arrived while screen was open
    const onFocus = () => markRead(filter);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
};
