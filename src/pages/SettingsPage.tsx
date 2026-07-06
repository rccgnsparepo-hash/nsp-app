import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon, Sun, Send, Users, Inbox, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import NativePushSettings from '@/components/NativePushSettings';
import AppHeader from '@/components/AppHeader';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const STORAGE_KEY = 'nsp-theme';

const SettingsPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isDark, setIsDark] = useState(false);

  // Theme
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

  // Members
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

  // Inbox - from notifications table (logs every push)
  const { data: notifications } = useQuery({
    queryKey: ['notifications-inbox', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('notif-inbox')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => qc.invalidateQueries({ queryKey: ['notifications-inbox', user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const sayHi = async (recipient: any) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        recipient_id: recipient.id,
        content: 'Hi 👋',
      });
      if (error) throw error;
      toast.success(`Hi sent to ${recipient.full_name?.split(' ')[0]}`);
      navigate(`/chat/${recipient.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openChatFromNotif = async (n: any) => {
    // Mark read
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    qc.invalidateQueries({ queryKey: ['notifications-inbox', user?.id] });

    if (n.kind === 'message' && n.data?.sender_id) {
      navigate(`/chat/${n.data.sender_id}`);
    } else if (n.kind === 'prayer') {
      navigate('/prayer');
    } else if (n.kind === 'attendance_session' || n.kind === 'attendance_review' || n.kind === 'attendance_pending') {
      navigate('/profile?tab=attendance');
    } else {
      navigate('/');
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    qc.invalidateQueries({ queryKey: ['notifications-inbox', user.id] });
  };

  const unreadCount = (notifications ?? []).filter((n: any) => !n.read).length;

  return (
    <AppLayout>
      <AppHeader title="Settings" />
      <div className="p-4 space-y-4">
        <NativePushSettings />
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

        <Tabs defaultValue="inbox" className="w-full">
          <TabsList className="w-full bg-muted rounded-xl grid grid-cols-2 h-10">
            <TabsTrigger value="inbox" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <Inbox className="w-3.5 h-3.5 mr-1" />Inbox
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5 mr-1" />Members
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4 space-y-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="w-full text-xs text-primary font-medium py-2">Mark all as read</button>
            )}
            {notifications && notifications.length > 0 ? notifications.map((n: any) => (
              <button
                key={n.id}
                onClick={() => openChatFromNotif(n)}
                className={`w-full text-left neumorphic-sm rounded-2xl p-3 bg-card flex items-start gap-3 ${!n.read ? 'border-l-4 border-primary' : ''}`}
              >
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
            )) : (
              <p className="text-sm text-muted-foreground text-center py-10">No notifications yet</p>
            )}
          </TabsContent>

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
                  <>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => navigate(`/chat/${u.id}`)}
                      className="rounded-full h-8 px-3 text-xs"
                    >
                      <MessageCircle className="w-3 h-3 mr-1" />Chat
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => sayHi(u)}
                      className="bg-primary text-primary-foreground rounded-full h-8 px-3 text-xs"
                    >
                      <Send className="w-3 h-3 mr-1" />Hi
                    </Button>
                  </>
                )}
              </div>
            ))}
            {users && users.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No registered users yet</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
