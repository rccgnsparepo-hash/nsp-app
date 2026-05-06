import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageCircle, Plus, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Conversation {
  otherId: string;
  lastMessage: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

const ChatListPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const PAGE = 100;
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadByUser, setUnreadByUser] = useState<Map<string, number>>(new Map());

  // Fetch all unread (incoming, unread) for accurate per-conversation counts,
  // independent of the paginated message window.
  const refreshUnread = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('direct_messages')
      .select('sender_id')
      .eq('recipient_id', user.id)
      .eq('read', false);
    const map = new Map<string, number>();
    (data || []).forEach((r: any) => {
      map.set(r.sender_id, (map.get(r.sender_id) || 0) + 1);
    });
    setUnreadByUser(map);
  };

  const loadPage = async (before?: string) => {
    if (!user) return;
    let q = supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (before) q = q.lt('created_at', before);
    const { data } = await q;
    const rows = data || [];
    setHasMore(rows.length === PAGE);
    setMessages(prev => before ? [...prev, ...rows] : rows);
  };

  useEffect(() => { loadPage(); refreshUnread(); }, [user]);

  // Realtime: patch the local list and refresh unread on any change
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('chat-list-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m: any = payload.new;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        setMessages(prev => prev.find(x => x.id === m.id) ? prev : [m, ...prev]);
        if (m.recipient_id === user.id && !m.read) {
          setUnreadByUser(prev => {
            const next = new Map(prev);
            next.set(m.sender_id, (next.get(m.sender_id) || 0) + 1);
            return next;
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m: any = payload.new;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x));
        if (m.recipient_id === user.id) refreshUnread();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (payload) => {
        const id = (payload.old as any).id;
        setMessages(prev => prev.filter(x => x.id !== id));
        refreshUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const conversations = useMemo<Conversation[]>(() => {
    if (!user) return [];
    const map = new Map<string, Conversation>();
    for (const m of messages) {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (map.has(otherId)) continue;
      map.set(otherId, {
        otherId,
        lastMessage: m.content,
        lastAt: m.created_at,
        lastFromMe: m.sender_id === user.id,
        unread: unreadByUser.get(otherId) || 0,
      });
    }
    for (const [otherId, count] of unreadByUser.entries()) {
      if (!map.has(otherId) && count > 0) {
        map.set(otherId, { otherId, lastMessage: '', lastAt: new Date(0).toISOString(), lastFromMe: false, unread: count });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );
  }, [messages, user, unreadByUser]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1].created_at;
    await loadPage(oldest);
    setLoadingMore(false);
  };

  // Fetch profiles for conversation partners
  useEffect(() => {
    const ids = conversations.map(c => c.otherId);
    if (ids.length === 0) return;
    supabase.from('profiles').select('id, full_name, profile_image_url').in('id', ids)
      .then(({ data }) => {
        const m = new Map();
        (data || []).forEach((p: any) => m.set(p.id, p));
        setProfiles(m);
      });
  }, [conversations.length]);

  // Load all users for "new chat"
  useEffect(() => {
    if (!newOpen || !user) return;
    supabase.from('profiles').select('id, full_name, profile_image_url').neq('id', user.id).order('full_name')
      .then(({ data }) => setAllUsers(data || []));
  }, [newOpen, user]);

  const filteredUsers = allUsers.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <AppHeader title="Messages" />
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</p>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full bg-primary text-primary-foreground h-8 px-3 text-xs">
                <Plus className="w-3 h-3 mr-1" />New chat
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-sm max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader><DialogTitle>Start a chat</DialogTitle></DialogHeader>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" className="pl-9 bg-muted border-0 neumorphic-inset" />
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 mt-2">
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setNewOpen(false); navigate(`/chat/${u.id}`); }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                      {u.profile_image_url ? (
                        <img src={u.profile_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">
                          {u.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{u.full_name}</span>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No people found</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {conversations.length === 0 && (
          <div className="neumorphic rounded-2xl p-8 bg-card text-center">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap "New chat" to start one</p>
          </div>
        )}

        {conversations.map((c) => {
          const p = profiles.get(c.otherId);
          return (
            <motion.button
              key={c.otherId}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate(`/chat/${c.otherId}`)}
              className="w-full neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3 text-left"
            >
              <div className="w-11 h-11 rounded-full bg-muted overflow-hidden flex-shrink-0">
                {p?.profile_image_url ? (
                  <img src={p.profile_image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                    {p?.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{p?.full_name || 'User'}</p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {formatDistanceToNow(new Date(c.lastAt), { addSuffix: false })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${c.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {c.lastFromMe && 'You: '}{c.lastMessage}
                  </p>
                  {c.unread > 0 && (
                    <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center flex-shrink-0">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}

        {hasMore && messages.length > 0 && (
          <div className="pt-2 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="rounded-full text-xs">
              {loadingMore ? 'Loading…' : 'Load older messages'}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ChatListPage;
