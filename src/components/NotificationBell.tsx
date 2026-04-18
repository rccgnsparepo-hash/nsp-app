import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRealtimeNotifications, NotificationKind } from '@/hooks/useRealtimeNotifications';

const iconFor: Record<NotificationKind, string> = {
  image: '📸',
  video: '🎬',
  youtube: '▶️',
  voice: '🎙️',
  prayer: '🙏',
};

const NotificationBell = () => {
  const { notifications, count, markAllRead } = useRealtimeNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-foreground" />
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
          >
            {count > 9 ? '9+' : count}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[90] bg-foreground/40"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-[92vw] max-w-md bg-card rounded-2xl neumorphic p-4 max-h-[70vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">Notifications</h3>
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No new notifications</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => { markAllRead(); setOpen(false); navigate(n.source === 'prayer' ? '/prayer' : '/'); }}
                        className="w-full text-left p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">
                          <span className="mr-1">{iconFor[n.kind]}</span>{n.title}
                        </p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(n.created_at), 'MMM d · h:mm a')}
                        </p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { markAllRead(); setOpen(false); }}
                    className="w-full mt-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
                  >
                    Mark all as read
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default NotificationBell;
