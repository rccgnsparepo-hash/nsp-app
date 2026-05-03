import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Inbox as InboxIcon, MessageCircle, Heart, MessageSquare, BellRing, ImageIcon, ClipboardList } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const iconForKind = (kind: string) => {
  switch (kind) {
    case 'message': return MessageCircle;
    case 'post_like': return Heart;
    case 'post_comment': return MessageSquare;
    case 'post': return ImageIcon;
    case 'prayer':
    case 'prayer_interaction': return BellRing;
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

  const { data: notifications } = useQuery({
    queryKey: ['inbox', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
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

  const open = async (n: any) => {
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    qc.invalidateQueries({ queryKey: ['inbox', user?.id] });

    const d = n.data ?? {};
    switch (n.kind) {
      case 'message':
        if (d.sender_id) return navigate(`/chat/${d.sender_id}`);
        break;
      case 'post':
      case 'post_like':
      case 'post_comment':
        return navigate(d.post_id ? `/?post=${d.post_id}` : '/');
      case 'prayer':
      case 'prayer_interaction':
        return navigate(d.prayer_id ? `/prayer?id=${d.prayer_id}` : '/prayer');
      case 'attendance_session':
      case 'attendance_review':
      case 'attendance_pending':
        return navigate('/profile?tab=attendance');
    }
    navigate('/');
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    qc.invalidateQueries({ queryKey: ['inbox', user.id] });
  };

  const unreadCount = (notifications ?? []).filter((n: any) => !n.read).length;

  return (
    <AppLayout>
      <AppHeader title="Inbox" />
      <div className="p-4 space-y-2">
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="w-full text-xs text-primary font-medium py-2">
            Mark all as read ({unreadCount})
          </button>
        )}
        {notifications && notifications.length > 0 ? notifications.map((n: any) => {
          const Icon = iconForKind(n.kind);
          return (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={`w-full text-left neumorphic-sm rounded-2xl p-3 bg-card flex items-start gap-3 ${!n.read ? 'border-l-4 border-primary' : ''}`}
            >
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
          );
        }) : (
          <p className="text-sm text-muted-foreground text-center py-10">No notifications yet</p>
        )}
      </div>
    </AppLayout>
  );
};

export default InboxPage;
