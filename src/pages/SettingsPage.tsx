import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Moon, Sun, Send, Users, Inbox, Check } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const STORAGE_KEY = 'nsp-theme';

const SettingsPage = () => {
  const { user, profile } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [openUser, setOpenUser] = useState<any | null>(null);
  const [message, setMessage] = useState('Hi 👋');
  const [sending, setSending] = useState(false);

  // Init theme from localStorage / profile
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || profile?.theme_preference;
    const dark = stored === 'dark';
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, [profile]);

  const toggleTheme = async (val: boolean) => {
    setIsDark(val);
    document.documentElement.classList.toggle('dark', val);
    localStorage.setItem(STORAGE_KEY, val ? 'dark' : 'light');
    if (user) {
      await supabase.from('profiles').update({ theme_preference: val ? 'dark' : 'light' }).eq('id', user.id);
    }
  };

  // Registered users list
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['registered-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, profile_image_url, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Inbox
  const { data: inbox, refetch: refetchInbox } = useQuery({
    queryKey: ['direct-messages-inbox', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Realtime subscription for inbox
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('dm-inbox')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => refetchInbox())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refetchInbox]);

  // Fetch sender profiles for inbox messages
  const senderIds = Array.from(new Set((inbox ?? []).map((m: any) => m.sender_id)));
  const { data: senderProfiles } = useQuery({
    queryKey: ['dm-senders', senderIds.join(',')],
    queryFn: async () => {
      if (senderIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, profile_image_url')
        .in('id', senderIds);
      if (error) throw error;
      return data;
    },
    enabled: senderIds.length > 0,
  });
  const senderMap = new Map((senderProfiles ?? []).map((p: any) => [p.id, p]));

  const sendMessage = async () => {
    if (!user || !openUser) return;
    if (!message.trim()) { toast.error('Message cannot be empty'); return; }
    setSending(true);
    try {
      const { error } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        recipient_id: openUser.id,
        content: message.trim(),
      });
      if (error) throw error;
      toast.success(`Message sent to ${openUser.full_name?.split(' ')[0] || 'user'} 👋`);
      setOpenUser(null);
      setMessage('Hi 👋');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const markRead = async (id: string) => {
    await supabase.from('direct_messages').update({ read: true }).eq('id', id);
    refetchInbox();
  };

  const unreadCount = (inbox ?? []).filter((m: any) => !m.read).length;

  return (
    <AppLayout>
      <AppHeader title="Settings" />
      <div className="p-4 space-y-4">
        {/* Theme */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="neumorphic rounded-2xl p-4 bg-card flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isDark ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <p className="font-semibold text-foreground">Dark mode</p>
              <p className="text-xs text-muted-foreground">{isDark ? 'On' : 'Off'}</p>
            </div>
          </div>
          <Switch checked={isDark} onCheckedChange={toggleTheme} />
        </motion.div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full bg-muted rounded-xl grid grid-cols-2 h-10">
            <TabsTrigger value="users" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5 mr-1" />Members
            </TabsTrigger>
            <TabsTrigger value="inbox" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <Inbox className="w-3.5 h-3.5 mr-1" />Inbox
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Members */}
          <TabsContent value="users" className="mt-4 space-y-2">
            {usersLoading && <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>}
            {users?.map((u: any) => (
              <div key={u.id} className="neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {u.profile_image_url ? (
                    <img src={u.profile_image_url} alt={u.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                      {u.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{u.full_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Joined {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                {u.id !== user?.id && (
                  <Button
                    size="sm"
                    onClick={() => { setOpenUser(u); setMessage('Hi 👋'); }}
                    className="bg-primary text-primary-foreground rounded-full h-8 px-3 text-xs"
                  >
                    <Send className="w-3 h-3 mr-1" />Hi
                  </Button>
                )}
              </div>
            ))}
            {users && users.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No registered users yet</p>
            )}
          </TabsContent>

          {/* Inbox */}
          <TabsContent value="inbox" className="mt-4 space-y-2">
            {inbox && inbox.length > 0 ? inbox.map((m: any) => {
              const sender = senderMap.get(m.sender_id);
              return (
                <div
                  key={m.id}
                  className={`neumorphic-sm rounded-2xl p-3 bg-card flex items-start gap-3 ${!m.read ? 'border-l-4 border-primary' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {sender?.profile_image_url ? (
                      <img src={sender.profile_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                        {sender?.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{sender?.full_name || 'Someone'}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {format(new Date(m.created_at), 'MMM d · h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5 break-words">{m.content}</p>
                  </div>
                  {!m.read && (
                    <button onClick={() => markRead(m.id)} className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary" />
                    </button>
                  )}
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground text-center py-10">No messages yet</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Send Hi Dialog */}
      <Dialog open={!!openUser} onOpenChange={(o) => !o && setOpenUser(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Send a message to {openUser?.full_name?.split(' ')[0]}</DialogTitle>
          </DialogHeader>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say hi…"
            className="bg-muted border-0 neumorphic-inset"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUser(null)} className="rounded-xl">Cancel</Button>
            <Button onClick={sendMessage} disabled={sending} className="bg-primary text-primary-foreground rounded-xl">
              <Send className="w-4 h-4 mr-1" />{sending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SettingsPage;
