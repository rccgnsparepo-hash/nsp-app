import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Inbox as InboxIcon, MessageCircle, Heart, MessageSquare, BellRing, ImageIcon,
  ClipboardList, Search, Trash2, CheckCheck, Radio, Users, AtSign, UserPlus,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type TabKey = 'all' | 'mentions' | 'messages' | 'communities' | 'live' | 'system';

const TABS: { key: TabKey; label: string; kinds?: string[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'mentions', label: 'Mentions', kinds: ['mention', 'post_comment', 'reply'] },
  { key: 'messages', label: 'Messages', kinds: ['message', 'call'] },
  { key: 'communities', label: 'Community', kinds: ['community_invite', 'community'] },
  { key: 'live', label: 'Live', kinds: ['live'] },
  { key: 'system', label: 'System', kinds: ['post', 'announcement', 'attendance_session', 'attendance_review'] },
];

const PAGE_SIZE = 30;

const iconForKind = (kind: string) => {
  switch (kind) {
    case 'message': return MessageCircle;
    case 'post_like': return Heart;
    case 'post_comment':
    case 'reply':
    case 'mention': return MessageSquare;
    case 'post':
    case 'repost': return ImageIcon;
    case 'follow': return UserPlus;
    case 'prayer':
    case 'prayer_interaction': return BellRing;
    case 'community_invite':
    case 'community': return Users;
    case 'live': return Radio;
    case 'announcement': return BellRing;
    case 'attendance_session':
    case 'attendance_review':
    case 'attendance_pending': return ClipboardList;
    default: return InboxIcon;
  }
};

const InboxPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['inbox', user?.id, tab],
    initialPageParam: null as string | null,
    enabled: !!user,
    queryFn: async ({ pageParam }) => {
      if (!user) return { rows: [], nextCursor: null as string | null };
      let q = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      const kinds = TABS.find(t => t.key === tab)?.kinds;
      if (kinds) q = q.in('kind', kinds);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      return { rows, nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('inbox-rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => qc.invalidateQueries({ queryKey: ['inbox', user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const allRows = useMemo(
    () => (query.data?.pages.flatMap(p => p.rows) ?? []),
    [query.data],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRows;
    return allRows.filter((n: any) =>
      n.title?.toLowerCase().includes(s) || n.body?.toLowerCase().includes(s),
    );
  }, [allRows, search]);

  // Group by group_key when present
  const grouped = useMemo(() => {
    const seen = new Map<string, { rep: any; count: number; ids: string[] }>();
    const out: any[] = [];
    for (const n of filtered) {
      const key = n.group_key as string | null;
      if (!key) { out.push({ ...n, _ids: [n.id], _count: 1 }); continue; }
      if (seen.has(key)) {
        const g = seen.get(key)!; g.count++; g.ids.push(n.id);
      } else {
        const g = { rep: n, count: 1, ids: [n.id] };
        seen.set(key, g);
        out.push({ __group: key });
      }
    }
    return out.map(item => {
      if (!item.__group) return item;
      const g = seen.get(item.__group)!;
      const title = g.count > 1 ? `${g.count} updates · ${g.rep.title}` : g.rep.title;
      return { ...g.rep, title, _ids: g.ids, _count: g.count };
    });
  }, [filtered]);

  const open = async (n: any) => {
    await supabase.from('notifications')
      .update({ read: true, read_at: new Date().toISOString(), clicked_at: new Date().toISOString() } as any)
      .in('id', n._ids ?? [n.id]);
    qc.invalidateQueries({ queryKey: ['inbox', user?.id] });

    if (n.url) return navigate(n.url);

    const d = n.data ?? {};
    switch (n.kind) {
      case 'message':
      case 'call':
        if (d.sender_id || d.caller_id) return navigate(`/chat/${d.sender_id ?? d.caller_id}`);
        break;
      case 'post':
      case 'post_like':
      case 'post_comment':
      case 'repost':
        return navigate(d.post_id ? `/?post=${d.post_id}` : '/');
      case 'follow':
        return navigate(d.follower_id ? `/u/${d.follower_id}` : '/');
      case 'prayer':
      case 'prayer_interaction':
        return navigate('/prayer');
      case 'live':
        return navigate(d.live_id ? `/live/${d.live_id}` : '/');
      case 'community_invite':
        return navigate(d.community_id ? `/community/${d.community_id}` : '/');
      case 'attendance_session':
      case 'attendance_review':
      case 'attendance_pending':
        return navigate('/profile?tab=attendance');
    }
    navigate('/');
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('read', false);
    qc.invalidateQueries({ queryKey: ['inbox', user.id] });
  };

  const deleteOne = async (n: any) => {
    await supabase.from('notifications').delete().in('id', n._ids ?? [n.id]);
    qc.invalidateQueries({ queryKey: ['inbox', user?.id] });
  };

  const unreadCount = allRows.filter((n: any) => !n.read).length;

  return (
    <AppLayout>
      <AppHeader title="Inbox" />
      <div className="px-3 pt-2 pb-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notifications"
            className="pl-9 h-10 rounded-xl bg-muted/40"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="w-full h-9 text-xs">
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark all read ({unreadCount})
          </Button>
        )}

        <div className="space-y-2">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No notifications</p>
          )}
          {grouped.map((n: any) => {
            const Icon = iconForKind(n.kind);
            return (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative rounded-2xl p-3 bg-card flex items-start gap-3 border ${
                  !n.read ? 'border-primary/40' : 'border-border/40'
                }`}
              >
                <button onClick={() => open(n)} className="flex items-start gap-3 flex-1 text-left min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{n.title}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {format(new Date(n.created_at), 'MMM d · h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 break-words line-clamp-2">{n.body}</p>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteOne(n); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}

          {query.hasNextPage && (
            <Button
              variant="ghost" size="sm"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="w-full h-9 text-xs"
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default InboxPage;
